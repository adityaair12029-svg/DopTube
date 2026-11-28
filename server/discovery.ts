import { AsyncLocalStorage } from 'node:async_hooks';
import { parseIsoDurationToSeconds, type RankableVideo } from './domain.ts';

export interface DiscoveryResult extends RankableVideo {
  channelName: string;
  channelHandle: string;
  channelAvatar: string;
  channelVerified: boolean;
  subscriberCount: number;
  thumbnailUrl: string;
  videoUrl: string;
  hlsUrl: string | null;
  sourceType: 'native' | 'external';
  externalEmbedUrl?: string;
}

export interface DiscoveryChannelDetail {
  id: string;
  userId: string;
  name: string;
  handle: string;
  description: string;
  avatarUrl: string;
  bannerColor: string;
  verified: boolean;
  subscriberCount: number;
  createdAt: string;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const FEED_CACHE_TTL_MS = 20 * 60 * 1000;
const META_CACHE_TTL_MS = 90 * 60 * 1000;
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;

const apiCache = new Map<string, CacheEntry<unknown>>();
const refererStore = new AsyncLocalStorage<string>();
const keyCooldownUntil = new Map<string, number>();

export interface DiscoveryIssue {
  code: string;
  status?: number;
  message: string;
  at: string;
}

let lastDiscoveryIssue: DiscoveryIssue | null = null;

export function runWithDiscoveryReferer<T>(referer: string, fn: () => T): T {
  return refererStore.run(referer, fn);
}

export function getExternalApiKeys(): string[] {
  const combined = [
    process.env.EXTERNAL_VIDEO_API_KEY,
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_DATA_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.VITE_EXTERNAL_VIDEO_API_KEY,
    process.env.VITE_YOUTUBE_API_KEY,
  ]
    .filter(Boolean)
    .join(',');

  return Array.from(
    new Set(
      combined
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

export function getExternalApiKey(): string {
  const keys = getExternalApiKeys();
  if (keys.length === 0) return '';
  const now = Date.now();
  const active = keys.find((k) => (keyCooldownUntil.get(k) ?? 0) <= now);
  return active ?? '';
}

function markKeyQuotaExceeded(apiKey: string) {
  if (!apiKey) return;
  keyCooldownUntil.set(apiKey, Date.now() + QUOTA_COOLDOWN_MS);
}

export function isYouTubeQuotaInCooldown(): boolean {
  const keys = getExternalApiKeys();
  if (keys.length === 0) return false;
  const now = Date.now();
  return keys.every((k) => (keyCooldownUntil.get(k) ?? 0) > now);
}

export function getDiscoveryStatus() {
  const allKeys = getExternalApiKeys();
  const activeKey = getExternalApiKey();
  const inCooldown = allKeys.length > 0 && !activeKey;
  const providers = ['dailymotion', 'youtube-rss', ...(activeKey ? ['youtube-api'] : [])];

  return {
    configured: true,
    providers,
    youtubeConfigured: allKeys.length > 0,
    issue: inCooldown
      ? lastDiscoveryIssue || {
          code: 'quota_exceeded',
          status: 403,
          message: 'YouTube daily quota reached; serving live multi-source Indian feeds.',
          at: new Date().toISOString(),
        }
      : allKeys.length > 0
      ? lastDiscoveryIssue
      : null,
  };
}

function getEffectiveReferer(): string {
  const ctxRef = refererStore.getStore();
  if (ctxRef && ctxRef.startsWith('http')) return ctxRef;
  if (process.env.APP_URL && process.env.APP_URL.startsWith('http')) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/`;
  return 'https://doptube.vercel.app/';
}

async function discoveryFetch(url: string, apiKeyUsed = '', timeoutMs = 6000): Promise<Response> {
  const candidateReferers: Array<string | null> = Array.from(
    new Set([
      getEffectiveReferer(),
      'https://doptube.vercel.app/',
      'https://doobtube.vercel.app/',
      null,
    ])
  );

  let resp = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: candidateReferers[0] ? { Referer: candidateReferers[0] } : undefined,
  });

  if (resp.status === 403) {
    // Do not retry 3x if this is a quota error rather than HTTP referer restriction
    let isRefererIssue = true;
    try {
      const txt = await resp.clone().text();
      if (/quotaExceeded|rateLimitExceeded|dailyLimitExceeded/i.test(txt)) {
        isRefererIssue = false;
      }
    } catch {
      // ignore parse failure
    }

    if (isRefererIssue) {
      for (let i = 1; i < candidateReferers.length; i++) {
        const ref = candidateReferers[i];
        const retryResp = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: ref ? { Referer: ref } : undefined,
        });
        if (retryResp.ok) {
          lastDiscoveryIssue = null;
          return retryResp;
        }
        resp = retryResp;
      }
    }
  }

  if (!resp.ok) {
    let reason = `HTTP ${resp.status}`;
    let apiReason = '';
    try {
      const cloneText = await resp.clone().text();
      const parsed = JSON.parse(cloneText) as { error?: { message?: string; errors?: Array<{ reason?: string }> } };
      const apiMsg = parsed?.error?.message || cloneText.slice(0, 140);
      apiReason = parsed?.error?.errors?.[0]?.reason || '';
      reason = apiReason ? `${apiReason}: ${apiMsg}` : apiMsg;
    } catch {
      // ignore body parse failure
    }
    const isQuota =
      resp.status === 429 ||
      /quota|rateLimitExceeded|dailyLimitExceeded/i.test(apiReason) ||
      /quota|rateLimitExceeded/i.test(reason);

    if (isQuota && apiKeyUsed) {
      markKeyQuotaExceeded(apiKeyUsed);
    }

    lastDiscoveryIssue = {
      code: isQuota ? 'quota_exceeded' : resp.status === 403 ? 'api_forbidden' : 'api_error',
      status: resp.status,
      message: reason,
      at: new Date().toISOString(),
    };
    console.warn(`YouTube API (${resp.status}):`, reason);
  } else {
    lastDiscoveryIssue = null;
  }
  return resp;
}

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs = FEED_CACHE_TTL_MS): T {
  if (Array.isArray(value) && value.length === 0) {
    return value;
  }
  if (apiCache.size > 350) {
    const firstKey = apiCache.keys().next().value;
    if (firstKey) apiCache.delete(firstKey);
  }
  apiCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

// =========================================================================
// YOUTUBE ATOM RSS CURATED ZERO-QUOTA FEED + PARSER
// =========================================================================

const CURATED_RSS_CHANNELS: Array<{
  id: string;
  name: string;
  handle: string;
  category: string;
  language: string;
}> = [
  { id: 'UCOhHO2ICt0ti9KAh-QHvttQ', name: 'Technical Guruji', handle: '@TechnicalGuruji', category: 'Technology', language: 'Hindi' },
  { id: 'UCiGyWN6DEbnj2alu7iapuKQ', name: 'Physics Wallah', handle: '@PhysicsWallah', category: 'Education', language: 'Hindi' },
  { id: 'UCq-Fj5jknLsUf-MWSy4_brA', name: 'T-Series', handle: '@tseries', category: 'Music', language: 'Hindi' },
  { id: 'UCqwUrj10mAEsqezcItqvwEw', name: 'BB Ki Vines', handle: '@BBKiVines', category: 'Comedy', language: 'Hindi' },
  { id: 'UCpEhnqL0y41EpW2TvWAHD7Q', name: 'SET India', handle: '@SETIndia', category: 'Entertainment', language: 'Hindi' },
  { id: 'UCt4t-jeY85JegMlZ-E5UWtA', name: 'Aaj Tak', handle: '@aajtak', category: 'News', language: 'Hindi' },
  { id: 'UCXuqSBlHAE6Xw-yeJA0Tunw', name: 'Linus Tech Tips', handle: '@LinusTechTips', category: 'Technology', language: 'English' },
  { id: 'UCsXVk37bltHxD1rDPwtNM8Q', name: 'Kurzgesagt', handle: '@kurzgesagt', category: 'Science', language: 'English' },
  { id: 'UCBJycsmduvYEL83R_U4JriQ', name: 'Marques Brownlee', handle: '@mkbhd', category: 'Technology', language: 'English' },
];

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

function cleanHtmlText(str: string): string {
  if (!str) return '';
  return decodeXmlEntities(str)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractXmlTag(block: string, tagName: string): string {
  const escaped = tagName.replace(/[:]/g, '\\:');
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i'));
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

export function parseAtomRssFeed(
  xml: string,
  meta: { channelId: string; channelName?: string; channelHandle?: string; category: string; language: string }
): DiscoveryResult[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
  const results: DiscoveryResult[] = [];

  for (const entry of entries) {
    const vid = extractXmlTag(entry, 'yt:videoId');
    if (!vid) continue;

    const rawChId = extractXmlTag(entry, 'yt:channelId') || meta.channelId;
    const title = cleanHtmlText(extractXmlTag(entry, 'title')) || 'Featured Video';
    const authorName = extractXmlTag(entry, 'name') || meta.channelName || 'Creator Channel';
    const published = extractXmlTag(entry, 'published') || new Date().toISOString();
    const description = cleanHtmlText(extractXmlTag(entry, 'media:description') || '');

    const linkMatch = entry.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i);
    const altHref = linkMatch?.[1] || '';

    const thumbMatch = entry.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    const thumbnailUrl = thumbMatch?.[1] || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

    const viewsMatch = entry.match(/<media:statistics[^>]+views=["'](\d+)["']/i);
    const views = viewsMatch ? Number(viewsMatch[1]) : 0;

    const ratingMatch = entry.match(/<media:starRating[^>]+count=["'](\d+)["']/i);
    const likes = ratingMatch ? Number(ratingMatch[1]) : Math.round(views * 0.035);

    const isShort = altHref.includes('/shorts/') || /#shorts?\b/i.test(title) || /#shorts?\b/i.test(description);
    const handle =
      meta.channelHandle || `@${authorName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 22) || 'creator'}`;

    const item: DiscoveryResult = {
      id: `ext_${vid}`,
      title,
      description: description.slice(0, 500),
      tags: [meta.category, meta.language, ...(isShort ? ['shorts'] : [])],
      category: meta.category,
      language: meta.language,
      channelId: `ext_ch_${rawChId}`,
      channelName: authorName,
      channelHandle: handle.startsWith('@') ? handle : `@${handle}`,
      channelAvatar: `/api/avatars/ext_ch_${rawChId}.svg`,
      channelVerified: true,
      subscriberCount: 1_000_000,
      views,
      likes,
      createdAt: published,
      isShort,
      isLive: false,
      visibility: 'public',
      durationSec: isShort ? 45 : 420,
      thumbnailUrl,
      videoUrl: '',
      hlsUrl: null,
      sourceType: 'external',
      externalEmbedUrl: isShort
        ? `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&playsinline=1&loop=1&playlist=${vid}&rel=0&modestbranding=1&iv_load_policy=3`
        : `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`,
    };
    setCached(`vid:${item.id}`, item, META_CACHE_TTL_MS);
    results.push(item);
  }

  return results;
}

async function fetchCuratedYouTubeRss(opts?: {
  category?: string;
  language?: string;
  shortsOnly?: boolean;
}): Promise<DiscoveryResult[]> {
  const cacheKey = `yt_rss_pool:${opts?.category || 'All'}:${opts?.language || 'All'}`;
  let allItems = getCached<DiscoveryResult[]>(cacheKey);

  if (!allItems) {
    const selected = CURATED_RSS_CHANNELS.filter((ch) => {
      if (opts?.category && opts.category !== 'All' && ch.category.toLowerCase() !== opts.category.toLowerCase()) {
        return false;
      }
      if (opts?.language && opts.language !== 'All' && ch.language.toLowerCase() !== opts.language.toLowerCase()) {
        return false;
      }
      return true;
    });
    const targets = selected.length > 0 ? selected : CURATED_RSS_CHANNELS;

    const settled = await Promise.allSettled(
      targets.map(async (ch) => {
        const chCacheKey = `yt_rss_ch:${ch.id}`;
        const cachedCh = getCached<DiscoveryResult[]>(chCacheKey);
        if (cachedCh) return cachedCh;

        const resp = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ch.id)}`, {
          signal: AbortSignal.timeout(4500),
          headers: { 'User-Agent': 'Mozilla/5.0 DopTubeFeed/1.0' },
        });
        if (!resp.ok) return [];
        const xml = await resp.text();
        const parsed = parseAtomRssFeed(xml, {
          channelId: ch.id,
          channelName: ch.name,
          channelHandle: ch.handle,
          category: ch.category,
          language: ch.language,
        });
        if (parsed.length > 0) setCached(chCacheKey, parsed, FEED_CACHE_TTL_MS);
        return parsed;
      })
    );

    const interleaved: DiscoveryResult[] = [];
    const perChannel = settled
      .filter((r): r is PromiseFulfilledResult<DiscoveryResult[]> => r.status === 'fulfilled')
      .map((r) => r.value);

    const maxRows = Math.max(0, ...perChannel.map((arr) => arr.length));
    for (let i = 0; i < maxRows; i++) {
      for (const list of perChannel) {
        if (i < list.length) interleaved.push(list[i]);
      }
    }

    if (interleaved.length > 0) {
      setCached(cacheKey, interleaved, FEED_CACHE_TTL_MS);
    }
    allItems = interleaved;
  }

  if (opts?.shortsOnly === true) {
    return allItems.filter((v) => v.isShort);
  }
  if (opts?.shortsOnly === false) {
    return allItems.filter((v) => !v.isShort);
  }
  return allItems;
}

// =========================================================================
// DAILYMOTION PUBLIC DATA API INTEGRATION (ZERO KEY, ZERO QUOTA)
// =========================================================================

const DM_FIELDS =
  'id,title,description,thumbnail_720_url,thumbnail_480_url,duration,views_total,likes_total,created_time,language,channel,owner.username,owner.screenname,owner.avatar_120_url,tags';

const DM_CHANNEL_CATEGORY_MAP: Record<string, string> = {
  news: 'News',
  sport: 'Cricket',
  music: 'Music',
  tech: 'Technology',
  videogames: 'Gaming',
  fun: 'Comedy',
  school: 'Education',
  creation: 'Entertainment',
  people: 'Lifestyle',
  lifestyle: 'Lifestyle',
};

const CATEGORY_TO_DM_QUERY: Record<string, string> = {
  Cricket: 'cricket highlights India',
  Education: 'science education study India',
  Gaming: 'gaming esports India',
  Comedy: 'comedy standup India',
  Music: 'hindi music bollywood indie',
  Technology: 'tech smartphone review India',
  Science: 'space science documentary',
  Cooking: 'indian street food recipe',
  News: 'india latest news',
  Entertainment: 'bollywood entertainment india',
  Mixes: 'hindi music mix jukebox',
  Travel: 'india travel vlog',
  Lifestyle: 'lifestyle vlog india',
};

export interface RawDailymotionItem {
  id?: string;
  title?: string;
  description?: string;
  thumbnail_720_url?: string;
  thumbnail_480_url?: string;
  duration?: number;
  views_total?: number;
  likes_total?: number;
  created_time?: number;
  language?: string;
  channel?: string;
  tags?: string[];
  'owner.username'?: string;
  'owner.screenname'?: string;
  'owner.avatar_120_url'?: string;
}

export function mapDailymotionItem(
  item: RawDailymotionItem,
  opts?: { category?: string; language?: string; forceShort?: boolean }
): DiscoveryResult | null {
  if (!item.id || !item.title) return null;
  const durationSec = Math.max(0, Math.round(Number(item.duration || 0)));
  const ownerUsername = (item['owner.username'] || 'dailymotion').replace(/[^a-zA-Z0-9_-]/g, '') || 'creator';
  const ownerName = cleanHtmlText(item['owner.screenname'] || ownerUsername);
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 10) : [];
  const isShort =
    Boolean(opts?.forceShort) ||
    (durationSec > 0 && durationSec <= 90) ||
    /#shorts?\b/i.test(item.title) ||
    tags.some((t) => /^shorts?$/i.test(t));

  const mappedCat =
    opts?.category && opts.category !== 'All'
      ? opts.category === 'Mixes'
        ? 'Music'
        : opts.category
      : DM_CHANNEL_CATEGORY_MAP[String(item.channel || '').toLowerCase()] || 'Entertainment';

  const mappedLang =
    opts?.language && opts.language !== 'All'
      ? opts.language
      : mapLanguageCode(item.language, 'Hindi');

  const views = Math.max(0, Number(item.views_total || 0));
  const likes = Math.max(0, Number(item.likes_total || Math.round(views * 0.03)));
  const createdIso = item.created_time
    ? new Date(Number(item.created_time) * 1000).toISOString()
    : new Date().toISOString();

  const videoId = `dm_${item.id}`;
  const result: DiscoveryResult = {
    id: videoId,
    title: cleanHtmlText(item.title),
    description: cleanHtmlText(item.description || '').slice(0, 1000),
    tags: tags.length > 0 ? tags : [mappedCat, mappedLang],
    category: mappedCat,
    language: mappedLang,
    channelId: `dm_ch_${ownerUsername}`,
    channelName: ownerName,
    channelHandle: `@${ownerUsername.toLowerCase()}`,
    channelAvatar: item['owner.avatar_120_url'] || `/api/avatars/dm_ch_${ownerUsername}.svg`,
    channelVerified: views >= 50_000,
    subscriberCount: Math.max(1200, Math.round(views * 0.08)),
    views,
    likes,
    createdAt: createdIso,
    isShort,
    isLive: false,
    visibility: 'public',
    durationSec,
    thumbnailUrl:
      item.thumbnail_720_url ||
      item.thumbnail_480_url ||
      `/api/thumbnails/card/${videoId}.svg`,
    videoUrl: '',
    hlsUrl: null,
    sourceType: 'external',
    externalEmbedUrl: `https://www.dailymotion.com/embed/video/${item.id}?autoplay=1`,
  };
  setCached(`vid:${videoId}`, result, META_CACHE_TTL_MS);
  return result;
}

async function fetchDailymotionFeedPaged(params: {
  query?: string;
  category?: string;
  language?: string;
  shorts?: boolean;
  page?: number;
  limit?: number;
  sort?: 'trending' | 'recent' | 'visited' | 'relevance';
}): Promise<{ items: DiscoveryResult[]; nextPage: number | null }> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(35, Math.max(10, params.limit ?? 20));
  const sort = params.sort || (params.query ? 'relevance' : 'trending');
  const query = (params.query || '').trim();

  const cacheKey = `dm_feed:${query.toLowerCase()}:${params.category || 'All'}:${params.language || 'All'}:${Boolean(
    params.shorts
  )}:${sort}:${page}`;
  const cached = getCached<{ items: DiscoveryResult[]; nextPage: number | null }>(cacheKey);
  if (cached) return cached;

  try {
    const qs = new URLSearchParams({
      country: 'in',
      flags: 'no_live',
      limit: String(limit),
      page: String(page),
      sort,
      fields: DM_FIELDS,
    });
    if (query) {
      qs.set('search', query);
    }
    if (params.shorts) {
      qs.set('shorter_than', '2');
    }

    const resp = await fetch(`https://api.dailymotion.com/videos?${qs.toString()}`, {
      signal: AbortSignal.timeout(5500),
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return { items: [], nextPage: null };

    const json = (await resp.json()) as { list?: RawDailymotionItem[]; has_more?: boolean };
    const rawList = json.list ?? [];
    const mapped = rawList
      .map((item) =>
        mapDailymotionItem(item, {
          category: params.category,
          language: params.language,
          forceShort: Boolean(params.shorts && (item.duration ?? 0) <= 95),
        })
      )
      .filter((v): v is DiscoveryResult => Boolean(v))
      .filter((v) => (params.shorts ? v.durationSec > 0 && v.durationSec <= 95 : true));

    const payload = {
      items: mapped,
      nextPage: json.has_more ? page + 1 : null,
    };
    if (mapped.length > 0) setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
    return payload;
  } catch {
    return { items: [], nextPage: null };
  }
}

async function fetchDailymotionVideoById(
  dmId: string
): Promise<{ video: DiscoveryResult; related: DiscoveryResult[] } | null> {
  const rawId = dmId.startsWith('dm_') ? dmId.slice(3) : dmId;
  if (!rawId) return null;

  let video = getCached<DiscoveryResult>(`vid:dm_${rawId}`);
  if (!video) {
    try {
      const resp = await fetch(
        `https://api.dailymotion.com/video/${encodeURIComponent(rawId)}?fields=${encodeURIComponent(DM_FIELDS)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (resp.ok) {
        const raw = (await resp.json()) as RawDailymotionItem;
        video = mapDailymotionItem(raw);
      }
    } catch {
      return null;
    }
  }
  if (!video) return null;

  const relKey = `rel:dm_${rawId}`;
  let related = getCached<DiscoveryResult[]>(relKey);
  if (!related) {
    const keywords = video.title
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 3)
      .join(' ');
    const dmRel = await fetchDailymotionFeedPaged({
      query: keywords || video.category,
      language: video.language,
      limit: 14,
    });
    related = dmRel.items.filter((r) => r.id !== video!.id && !r.isShort).slice(0, 12);
    if (related.length > 0) setCached(relKey, related, FEED_CACHE_TTL_MS);
  }

  return { video, related };
}

async function fetchDailymotionChannelById(
  dmChannelId: string,
  pageToken = ''
): Promise<{
  channel: DiscoveryChannelDetail;
  videos: DiscoveryResult[];
  nextPageToken: string | null;
  hasMore: boolean;
  totalResults: number;
} | null> {
  const username = dmChannelId.startsWith('dm_ch_') ? dmChannelId.slice(6) : dmChannelId;
  if (!username) return null;
  const page = Math.max(1, Number(pageToken.replace(/^dm_p/, '')) || 1);

  const cacheKey = `dm_channel:${username}:${page}`;
  const cached = getCached<{
    channel: DiscoveryChannelDetail;
    videos: DiscoveryResult[];
    nextPageToken: string | null;
    hasMore: boolean;
    totalResults: number;
  }>(cacheKey);
  if (cached) return cached;

  try {
    const [userResp, vidsResp] = await Promise.all([
      fetch(
        `https://api.dailymotion.com/user/${encodeURIComponent(username)}?fields=username,screenname,description,avatar_120_url,followers_total,videos_total,verified`,
        { signal: AbortSignal.timeout(5000) }
      ),
      fetch(
        `https://api.dailymotion.com/user/${encodeURIComponent(username)}/videos?limit=24&page=${page}&fields=${encodeURIComponent(
          DM_FIELDS
        )}`,
        { signal: AbortSignal.timeout(5500) }
      ),
    ]);

    if (!vidsResp.ok && !userResp.ok) return null;

    const userJson = userResp.ok
      ? ((await userResp.json()) as {
          username?: string;
          screenname?: string;
          description?: string;
          avatar_120_url?: string;
          followers_total?: number;
          videos_total?: number;
          verified?: boolean;
        })
      : {};

    const vidsJson = vidsResp.ok
      ? ((await vidsResp.json()) as { list?: RawDailymotionItem[]; has_more?: boolean; total?: number })
      : { list: [] };

    const videos = (vidsJson.list ?? [])
      .map((item) => mapDailymotionItem(item))
      .filter((v): v is DiscoveryResult => Boolean(v));

    const name = userJson.screenname || videos[0]?.channelName || username;
    const handleRaw = (userJson.username || username).toLowerCase();
    const detail: DiscoveryChannelDetail = {
      id: `dm_ch_${username}`,
      userId: `dm_user_${username}`,
      name,
      handle: `@${handleRaw}`,
      description: userJson.description || '',
      avatarUrl: userJson.avatar_120_url || `/api/avatars/dm_ch_${username}.svg`,
      bannerColor: '#111827',
      verified: Boolean(userJson.verified || (userJson.followers_total ?? 0) > 10_000),
      subscriberCount: Number(userJson.followers_total || videos[0]?.subscriberCount || 0),
      createdAt: new Date().toISOString(),
    };

    const nextPageToken = vidsJson.has_more ? `dm_p${page + 1}` : null;
    const payload = {
      channel: detail,
      videos,
      nextPageToken,
      hasMore: Boolean(nextPageToken),
      totalResults: Number(userJson.videos_total || vidsJson.total || videos.length),
    };
    setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
    return payload;
  } catch {
    return null;
  }
}

// =========================================================================
// YOUTUBE DATA API V3 HELPERS
// =========================================================================

interface RawVideoItem {
  id?: string | { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    categoryId?: string;
    tags?: string[];
    liveBroadcastContent?: string;
    defaultAudioLanguage?: string;
    thumbnails?: {
      maxres?: { url?: string };
      standard?: { url?: string };
      high?: { url?: string };
      medium?: { url?: string };
    };
  };
  contentDetails?: {
    duration?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
  status?: {
    embeddable?: boolean;
  };
}

interface RawChannelItem {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
}

export interface PagedDiscoveryResult {
  items: DiscoveryResult[];
  nextPageToken: string | null;
}

const CATEGORY_ID_MAP: Record<string, string> = {
  '1': 'Entertainment',
  '10': 'Music',
  '17': 'Cricket',
  '20': 'Gaming',
  '22': 'Lifestyle',
  '23': 'Comedy',
  '24': 'Entertainment',
  '25': 'News',
  '27': 'Education',
  '28': 'Science',
};

function mapLanguageCode(code?: string, fallback = 'Hindi'): string {
  if (!code) return fallback;
  const c = code.toLowerCase();
  if (c.startsWith('hi')) return 'Hindi';
  if (c.startsWith('en')) return 'English';
  if (c.startsWith('ta')) return 'Tamil';
  if (c.startsWith('te')) return 'Telugu';
  if (c.startsWith('bn')) return 'Bengali';
  if (c.startsWith('mr')) return 'Marathi';
  if (c.startsWith('gu')) return 'Gujarati';
  if (c.startsWith('kn')) return 'Kannada';
  if (c.startsWith('ml')) return 'Malayalam';
  if (c.startsWith('pa')) return 'Punjabi';
  if (c.startsWith('or')) return 'Odia';
  if (c.startsWith('as')) return 'Assamese';
  if (c.startsWith('ur')) return 'Urdu';
  return fallback;
}

async function fetchChannelsMap(channelIds: string[], apiKey: string): Promise<Map<string, RawChannelItem>> {
  const result = new Map<string, RawChannelItem>();
  const unique = Array.from(new Set(channelIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) return result;

  const missing: string[] = [];
  for (const cid of unique) {
    const cached = getCached<RawChannelItem>(`ch:${cid}`);
    if (cached) result.set(cid, cached);
    else missing.push(cid);
  }

  if (missing.length === 0) return result;

  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(
      missing.join(',')
    )}&key=${encodeURIComponent(apiKey)}`;
    const resp = await discoveryFetch(url, apiKey, 5500);
    if (!resp.ok) return result;
    const json = (await resp.json()) as { items?: RawChannelItem[] };
    for (const ch of json.items ?? []) {
      if (ch.id) {
        setCached(`ch:${ch.id}`, ch, META_CACHE_TTL_MS);
        result.set(ch.id, ch);
      }
    }
  } catch {
    // ignore partial channel enrichment failures
  }
  return result;
}

function toDiscoveryResult(
  item: RawVideoItem,
  chMap: Map<string, RawChannelItem>,
  opts?: { category?: string; language?: string; forceShort?: boolean }
): DiscoveryResult | null {
  const vid = typeof item.id === 'string' ? item.id : item.id?.videoId;
  const sn = item.snippet;
  if (!vid || !sn) return null;

  const chId = sn.channelId || vid;
  const chMeta = chMap.get(chId);
  const channelAvatar =
    chMeta?.snippet?.thumbnails?.medium?.url ||
    chMeta?.snippet?.thumbnails?.default?.url ||
    `/api/avatars/ext_ch_${chId}.svg`;

  const subscriberCount = Number(chMeta?.statistics?.subscriberCount || 0);
  const durationSec = parseIsoDurationToSeconds(item.contentDetails?.duration || '');
  const views = Number(item.statistics?.viewCount || 0);
  const likes = Number(item.statistics?.likeCount || 0);
  const isLive = sn.liveBroadcastContent === 'live';
  const titleText = sn.title ?? 'Video';
  const tags = sn.tags?.slice(0, 10) ?? [];
  const isShort =
    Boolean(opts?.forceShort) ||
    (durationSec > 0 && durationSec <= 62) ||
    /#shorts?\b/i.test(titleText) ||
    tags.some((t) => /^shorts?$/i.test(t));

  const mappedCat =
    opts?.category && opts.category !== 'All'
      ? opts.category === 'Mixes'
        ? 'Music'
        : opts.category
      : CATEGORY_ID_MAP[sn.categoryId || ''] || 'Entertainment';

  const mappedLang =
    opts?.language && opts.language !== 'All'
      ? opts.language
      : mapLanguageCode(sn.defaultAudioLanguage, 'Hindi');

  const handleRaw = chMeta?.snippet?.customUrl
    ? chMeta.snippet.customUrl
    : `@${(sn.channelTitle ?? 'creator').toLowerCase().replace(/[^a-z0-9]/g, '') || 'creator'}`;

  return {
    id: `ext_${vid}`,
    title: titleText,
    description: sn.description ?? '',
    tags: tags.length > 0 ? tags : [mappedLang, mappedCat],
    category: mappedCat,
    language: mappedLang,
    channelId: `ext_ch_${chId}`,
    channelName: sn.channelTitle ?? chMeta?.snippet?.title ?? 'Creator Channel',
    channelHandle: handleRaw.startsWith('@') ? handleRaw : `@${handleRaw}`,
    channelAvatar,
    channelVerified: subscriberCount >= 100_000,
    subscriberCount,
    views,
    likes,
    createdAt: sn.publishedAt ?? new Date().toISOString(),
    isShort,
    isLive,
    visibility: 'public',
    durationSec,
    thumbnailUrl:
      sn.thumbnails?.maxres?.url ||
      sn.thumbnails?.standard?.url ||
      sn.thumbnails?.high?.url ||
      sn.thumbnails?.medium?.url ||
      `/api/thumbnails/card/ext_${vid}.svg`,
    videoUrl: '',
    hlsUrl: null,
    sourceType: 'external',
    externalEmbedUrl: isShort
      ? `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&playsinline=1&loop=1&playlist=${vid}&rel=0&modestbranding=1&iv_load_policy=3`
      : `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`,
  };
}

async function enrichVideoIds(
  videoIds: string[],
  apiKey: string,
  opts?: { category?: string; language?: string; forceShort?: boolean }
): Promise<DiscoveryResult[]> {
  const uniqueIds = Array.from(new Set(videoIds.filter(Boolean))).slice(0, 50);
  if (uniqueIds.length === 0) return [];

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${encodeURIComponent(
      uniqueIds.join(',')
    )}&key=${encodeURIComponent(apiKey)}`;
    const response = await discoveryFetch(url, apiKey, 6500);
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { items?: RawVideoItem[] };
    const items = (data.items ?? []).filter((i) => i.status?.embeddable !== false);
    const chMap = await fetchChannelsMap(
      items.map((i) => i.snippet?.channelId || '').filter(Boolean),
      apiKey
    );

    const results: DiscoveryResult[] = [];
    for (const item of items) {
      const converted = toDiscoveryResult(item, chMap, opts);
      if (converted) {
        setCached(`vid:${converted.id}`, converted, META_CACHE_TTL_MS);
        results.push(converted);
      }
    }
    return results;
  } catch (err) {
    console.warn('External discovery enrich failed:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

// =========================================================================
// ANTI-LOOP PERSONALIZED QUERY BUILDER
// =========================================================================

export function buildPersonalizedDiscoveryQuery(opts: {
  interestTopics?: string[];
  recentSearches?: string[];
  preferredLanguage?: string;
  shorts?: boolean;
  seed?: number;
}): string {
  const terms: string[] = [];
  const searches = (opts.recentSearches ?? []).map((s) => s.trim()).filter((s) => s.length >= 2);
  const interests = (opts.interestTopics ?? []).map((s) => s.trim()).filter((s) => s.length >= 2);
  const seed = Math.abs(Math.floor(opts.seed ?? 0));

  const rotatingDefaults = opts.shorts
    ? ['Cricket highlights', 'Indian standup comedy', 'Tech tips India', 'Street food India', 'Science facts', 'Bollywood music']
    : ['India trending creators', 'Tech reviews India', 'Cricket highlights', 'Science documentary', 'Music hits India', 'Standup comedy India'];

  if (interests.length > 0) {
    terms.push(interests[seed % interests.length]);
  }

  // Only blend a recent search term occasionally (seed % 4 === 1), NEVER locking seed=0 or Shorts onto 1 search term
  if (!opts.shorts && searches.length > 0 && seed % 4 === 1) {
    const pickedSearch = searches[seed % searches.length];
    if (!terms.some((t) => t.toLowerCase() === pickedSearch.toLowerCase())) {
      terms.push(pickedSearch);
    }
  } else if (terms.length === 0) {
    terms.push(rotatingDefaults[seed % rotatingDefaults.length]);
  }

  if (opts.preferredLanguage && opts.preferredLanguage !== 'All' && opts.preferredLanguage !== 'English') {
    terms.push(opts.preferredLanguage);
  }

  if (opts.shorts) {
    terms.push('#shorts');
  } else if (!terms.some((t) => t.toLowerCase().includes('india'))) {
    terms.push('India');
  }

  return terms.join(' ').trim();
}

function interleaveProviders(...lists: DiscoveryResult[][]): DiscoveryResult[] {
  const out: DiscoveryResult[] = [];
  const seenIds = new Set<string>();
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i < list.length && !seenIds.has(list[i].id)) {
        seenIds.add(list[i].id);
        out.push(list[i]);
      }
    }
  }
  return out;
}

// =========================================================================
// UNIFIED MULTI-PROVIDER FEED & SEARCH
// =========================================================================

export async function fetchExternalFeedPaged(params: {
  category?: string;
  language?: string;
  trending?: boolean;
  shorts?: boolean;
  pageToken?: string;
  interestTopics?: string[];
  recentSearches?: string[];
  preferredLanguage?: string;
  refreshSeed?: number;
}): Promise<PagedDiscoveryResult> {
  const category = params.category || 'All';
  const language = params.language || 'All';
  const pageToken = (params.pageToken || '').trim();
  const seed = Math.abs(Math.floor(params.refreshSeed ?? 0));

  const dmPageMatch = pageToken.match(/^dm_p(\d+)$/);
  const dmPage = dmPageMatch ? Number(dmPageMatch[1]) : pageToken === '' ? 1 : null;
  const ytToken = pageToken && !pageToken.startsWith('dm_p') ? pageToken.replace(/^yt:/, '') : '';

  const cacheKey = `unified_feed:${category}:${language}:${Boolean(params.trending)}:${Boolean(
    params.shorts
  )}:${pageToken}:${seed}`;
  const cached = getCached<PagedDiscoveryResult>(cacheKey);
  if (cached) return cached;

  const apiKey = getExternalApiKey();

  try {
    // 1. Shorts Feed: blend RSS Shorts + Dailymotion Shorts across varied Indian topics
    if (params.shorts) {
      const dmTopicPool = [
        'cricket',
        'comedy',
        'technology',
        'music',
        'food',
        'science',
      ];
      const topicSeed = (seed + (dmPage ?? 1)) % dmTopicPool.length;
      const dmQuery =
        category !== 'All'
          ? CATEGORY_TO_DM_QUERY[category] || category
          : params.interestTopics && params.interestTopics.length > 0 && topicSeed % 2 === 0
          ? params.interestTopics[topicSeed % params.interestTopics.length]
          : dmTopicPool[topicSeed];

      const [rssShorts, dmShorts] = await Promise.all([
        pageToken === '' ? fetchCuratedYouTubeRss({ category, language, shortsOnly: true }) : Promise.resolve([]),
        dmPage
          ? fetchDailymotionFeedPaged({
              query: dmQuery,
              category,
              language,
              shorts: true,
              page: dmPage,
              limit: 24,
              sort: 'trending',
            })
          : Promise.resolve({ items: [], nextPage: null }),
      ]);

      const combined = interleaveProviders(dmShorts.items, rssShorts);
      const nextToken = dmShorts.nextPage ? `dm_p${dmShorts.nextPage}` : null;
      const payload: PagedDiscoveryResult = { items: combined, nextPageToken: nextToken };
      if (combined.length > 0) setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
      return payload;
    }

    // 2. Home / Trending Feed (Zero YouTube /search burn on All!)
    const dmCategoryQuery =
      category !== 'All'
        ? CATEGORY_TO_DM_QUERY[category] || category
        : params.trending
        ? ''
        : params.interestTopics && params.interestTopics.length > 0 && (seed + (dmPage ?? 1)) % 3 === 1
        ? params.interestTopics[seed % params.interestTopics.length]
        : '';

    const fetchYtPopular = async (): Promise<{ items: DiscoveryResult[]; nextPageToken: string | null }> => {
      if (!apiKey || params.trending === false && ytToken === '' && pageToken.startsWith('dm_p')) {
        return { items: [], nextPageToken: null };
      }
      if (!apiKey || category !== 'All' && category !== 'Live') {
        return { items: [], nextPageToken: null };
      }
      const tokenParam = ytToken ? `&pageToken=${encodeURIComponent(ytToken)}` : '';
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&chart=mostPopular&regionCode=IN&maxResults=20${tokenParam}&key=${encodeURIComponent(
        apiKey
      )}`;
      const resp = await discoveryFetch(url, apiKey, 5500);
      if (!resp.ok) return { items: [], nextPageToken: null };
      const data = (await resp.json()) as { items?: RawVideoItem[]; nextPageToken?: string };
      const items = (data.items ?? []).filter((i) => i.status?.embeddable !== false);
      const chMap = await fetchChannelsMap(
        items.map((i) => i.snippet?.channelId || '').filter(Boolean),
        apiKey
      );
      const converted = items
        .map((it) => toDiscoveryResult(it, chMap, { category, language }))
        .filter((v): v is DiscoveryResult => Boolean(v && !v.isShort));
      for (const v of converted) setCached(`vid:${v.id}`, v, META_CACHE_TTL_MS);
      return { items: converted, nextPageToken: data.nextPageToken || null };
    };

    const [rssItems, dmRes, ytPop] = await Promise.all([
      pageToken === '' ? fetchCuratedYouTubeRss({ category, language, shortsOnly: false }) : Promise.resolve([]),
      dmPage
        ? fetchDailymotionFeedPaged({
            query: dmCategoryQuery,
            category,
            language,
            shorts: false,
            page: dmPage,
            limit: 24,
            sort: params.trending ? 'visited' : 'trending',
          })
        : Promise.resolve({ items: [], nextPage: null }),
      category === 'All' && language === 'All' ? fetchYtPopular() : Promise.resolve({ items: [], nextPageToken: null }),
    ]);

    const combined = interleaveProviders(ytPop.items, dmRes.items, rssItems);
    const nextToken = dmRes.nextPage
      ? `dm_p${dmRes.nextPage}`
      : ytPop.nextPageToken
      ? `yt:${ytPop.nextPageToken}`
      : null;

    const payload: PagedDiscoveryResult = {
      items: combined,
      nextPageToken: nextToken,
    };
    if (combined.length > 0) setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
    return payload;
  } catch (err) {
    console.warn('Unified discovery feed failed:', err instanceof Error ? err.message : 'unknown');
    return { items: [], nextPageToken: null };
  }
}

export async function fetchExternalFeed(params: {
  category?: string;
  language?: string;
  trending?: boolean;
  shorts?: boolean;
}): Promise<DiscoveryResult[]> {
  const res = await fetchExternalFeedPaged(params);
  return res.items;
}

export async function fetchExternalDiscoveryPaged(
  query: string,
  language?: string,
  pageToken = ''
): Promise<PagedDiscoveryResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { items: [], nextPageToken: null };
  }

  const cleanToken = pageToken.trim();
  const cacheKey = `search_unified:${cleanQuery.toLowerCase()}:${language || 'All'}:${cleanToken}`;
  const cached = getCached<PagedDiscoveryResult>(cacheKey);
  if (cached) return cached;

  const dmPageMatch = cleanToken.match(/^dm_p(\d+)$/);
  const dmPage = dmPageMatch ? Number(dmPageMatch[1]) : cleanToken === '' ? 1 : 1;
  const fullQuery = language && language !== 'All' ? `${cleanQuery} ${language}` : cleanQuery;

  const apiKey = getExternalApiKey();

  const fetchYtSearch = async (): Promise<PagedDiscoveryResult> => {
    if (!apiKey || cleanToken.startsWith('dm_p')) return { items: [], nextPageToken: null };
    try {
      const tokenParam = cleanToken ? `&pageToken=${encodeURIComponent(cleanToken)}` : '';
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&regionCode=IN&maxResults=20${tokenParam}&q=${encodeURIComponent(
        fullQuery
      )}&key=${encodeURIComponent(apiKey)}`;
      const response = await discoveryFetch(url, apiKey, 5500);
      if (!response.ok) return { items: [], nextPageToken: null };
      const data = (await response.json()) as { items?: RawVideoItem[]; nextPageToken?: string };
      const ids = (data.items ?? [])
        .map((it) => (typeof it.id === 'string' ? it.id : it.id?.videoId || ''))
        .filter(Boolean);
      const enriched = await enrichVideoIds(ids, apiKey, { language });
      return { items: enriched, nextPageToken: data.nextPageToken || null };
    } catch {
      return { items: [], nextPageToken: null };
    }
  };

  const fetchRssSearch = async (): Promise<DiscoveryResult[]> => {
    if (cleanToken) return [];
    const pool = await fetchCuratedYouTubeRss({ language });
    const qLower = cleanQuery.toLowerCase();
    return pool.filter(
      (v) =>
        v.title.toLowerCase().includes(qLower) ||
        v.channelName.toLowerCase().includes(qLower) ||
        v.tags.some((t) => t.toLowerCase().includes(qLower))
    );
  };

  const [dmRes, ytRes, rssMatches] = await Promise.all([
    fetchDailymotionFeedPaged({
      query: fullQuery,
      language,
      page: dmPage,
      limit: 24,
      sort: 'relevance',
    }),
    fetchYtSearch(),
    fetchRssSearch(),
  ]);

  const combined = interleaveProviders(ytRes.items, dmRes.items, rssMatches);
  const nextPageToken = dmRes.nextPage ? `dm_p${dmRes.nextPage}` : ytRes.nextPageToken || null;
  const payload: PagedDiscoveryResult = { items: combined, nextPageToken };
  if (combined.length > 0) setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
  return payload;
}

export async function fetchExternalDiscovery(query: string, language?: string): Promise<DiscoveryResult[]> {
  const res = await fetchExternalDiscoveryPaged(query, language);
  return res.items;
}

export async function fetchExternalVideoById(
  extId: string
): Promise<{ video: DiscoveryResult; related: DiscoveryResult[] } | null> {
  if (extId.startsWith('dm_')) {
    return fetchDailymotionVideoById(extId);
  }

  const rawId = extId.startsWith('ext_') ? extId.slice(4) : extId;
  if (!rawId) return null;

  let video = getCached<DiscoveryResult>(`vid:ext_${rawId}`);
  const apiKey = getExternalApiKey();

  if (!video && apiKey) {
    const list = await enrichVideoIds([rawId], apiKey);
    video = list[0] ?? null;
  }

  // Fallback to YouTube public oEmbed if quota cooldown / missing key
  if (!video) {
    try {
      const oembedResp = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(rawId)}&format=json`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (oembedResp.ok) {
        const meta = (await oembedResp.json()) as {
          title?: string;
          author_name?: string;
          author_url?: string;
          thumbnail_url?: string;
        };
        const title = meta.title || 'Featured Video';
        const isShort = /#shorts?\b/i.test(title);
        const authorName = meta.author_name || 'Creator Channel';
        const syntheticChId = authorName.toLowerCase().replace(/[^a-z0-9]/g, '') || rawId;
        video = {
          id: `ext_${rawId}`,
          title,
          description: '',
          tags: [isShort ? 'Shorts' : 'Featured', 'India'],
          category: 'Entertainment',
          language: 'Hindi',
          channelId: `ext_ch_${syntheticChId}`,
          channelName: authorName,
          channelHandle: `@${syntheticChId}`,
          channelAvatar: `/api/avatars/ext_ch_${syntheticChId}.svg`,
          channelVerified: true,
          subscriberCount: 100_000,
          views: 15000,
          likes: 900,
          createdAt: new Date().toISOString(),
          isShort,
          isLive: false,
          visibility: 'public',
          durationSec: isShort ? 45 : 300,
          thumbnailUrl: meta.thumbnail_url || `https://i.ytimg.com/vi/${rawId}/hqdefault.jpg`,
          videoUrl: '',
          hlsUrl: null,
          sourceType: 'external',
          externalEmbedUrl: isShort
            ? `https://www.youtube-nocookie.com/embed/${rawId}?autoplay=1&playsinline=1&loop=1&playlist=${rawId}&rel=0&modestbranding=1&iv_load_policy=3`
            : `https://www.youtube-nocookie.com/embed/${rawId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`,
        };
        setCached(`vid:ext_${rawId}`, video, META_CACHE_TTL_MS);
      }
    } catch {
      // ignore oembed failure
    }
  }

  if (!video) return null;

  const relKey = `rel:ext_${rawId}`;
  let related = getCached<DiscoveryResult[]>(relKey);
  if (!related) {
    const topicWords = video.title.split(/\s+/).slice(0, 4).join(' ');
    const found = await fetchExternalDiscovery(topicWords || video.category, video.language);
    related = found.filter((r) => r.id !== video!.id && !r.isShort).slice(0, 14);
    if (related.length > 0) setCached(relKey, related, FEED_CACHE_TTL_MS);
  }

  return { video, related };
}

interface RawPlaylistItem {
  contentDetails?: {
    videoId?: string;
  };
  snippet?: {
    resourceId?: {
      videoId?: string;
    };
  };
}

export async function fetchExternalChannelById(
  extChannelId: string,
  pageToken = ''
): Promise<{
  channel: DiscoveryChannelDetail;
  videos: DiscoveryResult[];
  nextPageToken: string | null;
  hasMore: boolean;
  totalResults: number;
} | null> {
  if (extChannelId.startsWith('dm_ch_')) {
    return fetchDailymotionChannelById(extChannelId, pageToken);
  }

  const rawChannelId = extChannelId.startsWith('ext_ch_') ? extChannelId.slice(7) : extChannelId;
  if (!rawChannelId) return null;

  const cleanToken = pageToken.trim();
  const cacheKey = `channel_page:${rawChannelId}:${cleanToken}`;
  const cached = getCached<{
    channel: DiscoveryChannelDetail;
    videos: DiscoveryResult[];
    nextPageToken: string | null;
    hasMore: boolean;
    totalResults: number;
  }>(cacheKey);
  if (cached) return cached;

  const apiKey = getExternalApiKey();

  // Try YouTube Data API first if key is active
  if (apiKey) {
    try {
      const chMap = await fetchChannelsMap([rawChannelId], apiKey);
      const ch = chMap.get(rawChannelId);
      if (ch) {
        const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
        const tokenParam = cleanToken ? `&pageToken=${encodeURIComponent(cleanToken)}` : '';

        let ids: string[] = [];
        let nextPageToken: string | null = null;
        let totalResults = Number(ch.statistics?.videoCount || 0);

        if (uploadsPlaylistId) {
          const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(
            uploadsPlaylistId
          )}&maxResults=50${tokenParam}&key=${encodeURIComponent(apiKey)}`;
          const plResp = await discoveryFetch(playlistUrl, apiKey, 6500);
          if (plResp.ok) {
            const plData = (await plResp.json()) as {
              items?: RawPlaylistItem[];
              nextPageToken?: string;
              pageInfo?: { totalResults?: number };
            };
            ids = (plData.items ?? [])
              .map((it) => it.contentDetails?.videoId || it.snippet?.resourceId?.videoId || '')
              .filter(Boolean);
            nextPageToken = plData.nextPageToken || null;
            if (plData.pageInfo?.totalResults) totalResults = plData.pageInfo.totalResults;
          }
        }

        const videos = await enrichVideoIds(ids, apiKey);
        if (videos.length > 0) {
          const subscriberCount = Number(ch.statistics?.subscriberCount || 0);
          const handle = ch.snippet?.customUrl
            ? ch.snippet.customUrl.startsWith('@')
              ? ch.snippet.customUrl
              : `@${ch.snippet.customUrl}`
            : `@${(ch.snippet?.title || 'creator').toLowerCase().replace(/[^a-z0-9]/g, '')}`;

          const detail: DiscoveryChannelDetail = {
            id: `ext_ch_${rawChannelId}`,
            userId: `ext_user_${rawChannelId}`,
            name: ch.snippet?.title || 'Creator Channel',
            handle,
            description: ch.snippet?.description || '',
            avatarUrl:
              ch.snippet?.thumbnails?.high?.url ||
              ch.snippet?.thumbnails?.medium?.url ||
              `/api/avatars/ext_ch_${rawChannelId}.svg`,
            bannerColor: '#1f1f23',
            verified: subscriberCount >= 100_000,
            subscriberCount,
            createdAt: ch.snippet?.publishedAt || new Date().toISOString(),
          };

          const payload = {
            channel: detail,
            videos,
            nextPageToken,
            hasMore: Boolean(nextPageToken),
            totalResults: Math.max(totalResults, videos.length),
          };
          return setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
        }
      }
    } catch {
      // fall through to Atom RSS fallback
    }
  }

  // Zero-quota YouTube Atom RSS Channel Fallback (returns recent channel uploads cleanly)
  try {
    const resp = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(rawChannelId)}`,
      { signal: AbortSignal.timeout(4500) }
    );
    if (!resp.ok) return null;
    const xml = await resp.text();
    const videos = parseAtomRssFeed(xml, {
      channelId: rawChannelId,
      category: 'Entertainment',
      language: 'Hindi',
    });
    if (videos.length === 0) return null;

    const first = videos[0];
    const detail: DiscoveryChannelDetail = {
      id: `ext_ch_${rawChannelId}`,
      userId: `ext_user_${rawChannelId}`,
      name: first.channelName,
      handle: first.channelHandle,
      description: `Official channel feed of ${first.channelName}`,
      avatarUrl: `/api/avatars/ext_ch_${rawChannelId}.svg`,
      bannerColor: '#1f1f23',
      verified: true,
      subscriberCount: first.subscriberCount,
      createdAt: new Date().toISOString(),
    };
    const payload = {
      channel: detail,
      videos,
      nextPageToken: null,
      hasMore: false,
      totalResults: videos.length,
    };
    return setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
  } catch {
    return null;
  }
}
