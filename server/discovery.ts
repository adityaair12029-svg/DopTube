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

const CACHE_TTL_MS = 5 * 60 * 1000;
const apiCache = new Map<string, CacheEntry<unknown>>();
const refererStore = new AsyncLocalStorage<string>();

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

export function getExternalApiKey(): string {
  return (
    process.env.EXTERNAL_VIDEO_API_KEY ||
    process.env.YOUTUBE_API_KEY ||
    process.env.YOUTUBE_DATA_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_EXTERNAL_VIDEO_API_KEY ||
    process.env.VITE_YOUTUBE_API_KEY ||
    ''
  ).trim();
}

export function getDiscoveryStatus() {
  const configured = Boolean(getExternalApiKey());
  return {
    configured,
    issue: configured
      ? lastDiscoveryIssue
      : {
          code: 'missing_api_key',
          message: 'External video discovery API key is not configured on the server.',
          at: new Date().toISOString(),
        },
  };
}

function getEffectiveReferer(): string {
  const ctxRef = refererStore.getStore();
  if (ctxRef && ctxRef.startsWith('http')) return ctxRef;
  if (process.env.APP_URL && process.env.APP_URL.startsWith('http')) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/`;
  return 'https://doobtube.vercel.app/';
}

async function discoveryFetch(url: string, timeoutMs = 6500): Promise<Response> {
  const candidateReferers: Array<string | null> = Array.from(
    new Set([
      getEffectiveReferer(),
      null,
      'https://doobtube.vercel.app/',
      'https://doptube.vercel.app/',
    ])
  );

  let resp = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: candidateReferers[0] ? { Referer: candidateReferers[0] } : undefined,
  });

  if (resp.status === 403) {
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

  if (!resp.ok) {
    let reason = `HTTP ${resp.status}`;
    try {
      const cloneText = await resp.clone().text();
      const parsed = JSON.parse(cloneText) as { error?: { message?: string; errors?: Array<{ reason?: string }> } };
      const apiMsg = parsed?.error?.message || cloneText.slice(0, 140);
      const apiReason = parsed?.error?.errors?.[0]?.reason;
      reason = apiReason ? `${apiReason}: ${apiMsg}` : apiMsg;
    } catch {
      // ignore body parse failure
    }
    lastDiscoveryIssue = {
      code: resp.status === 403 ? 'api_forbidden' : resp.status === 429 ? 'quota_exceeded' : 'api_error',
      status: resp.status,
      message: reason,
      at: new Date().toISOString(),
    };
    console.warn(`External discovery error (${resp.status}):`, reason);
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

function setCached<T>(key: string, value: T): T {
  if (Array.isArray(value) && value.length === 0) {
    return value;
  }
  if (apiCache.size > 250) {
    const firstKey = apiCache.keys().next().value;
    if (firstKey) apiCache.delete(firstKey);
  }
  apiCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

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
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(missing.join(','))}&key=${encodeURIComponent(apiKey)}`;
    const resp = await discoveryFetch(url, 6000);
    if (!resp.ok) return result;
    const json = (await resp.json()) as { items?: RawChannelItem[] };
    for (const ch of json.items ?? []) {
      if (ch.id) {
        setCached(`ch:${ch.id}`, ch);
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
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${encodeURIComponent(uniqueIds.join(','))}&key=${encodeURIComponent(apiKey)}`;
    const response = await discoveryFetch(url, 7000);
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
        setCached(`vid:${converted.id}`, converted);
        results.push(converted);
      }
    }
    return results;
  } catch (err) {
    console.warn('External discovery enrich failed:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

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

  if (searches.length > 0 && (seed % 2 === 0 || interests.length === 0)) {
    terms.push(searches[seed % searches.length]);
  }
  if (interests.length > 0) {
    const picked = interests[seed % interests.length];
    if (!terms.some((t) => t.toLowerCase() === picked.toLowerCase())) {
      terms.push(picked);
    }
  }
  if (opts.preferredLanguage && opts.preferredLanguage !== 'All' && opts.preferredLanguage !== 'English') {
    terms.push(opts.preferredLanguage);
  }
  if (terms.length === 0) {
    const rotatingDefaults = opts.shorts
      ? ['Cricket highlights', 'Tech tips', 'Standup comedy', 'Indian street food', 'Science facts', 'Bollywood music']
      : ['India latest', 'Tech reviews India', 'Cricket highlights', 'Science documentary', 'Music hits India'];
    terms.push(rotatingDefaults[seed % rotatingDefaults.length]);
  }
  if (opts.shorts) {
    terms.push('#shorts');
  } else if (!terms.some((t) => t.toLowerCase().includes('india'))) {
    terms.push('India');
  }
  return terms.join(' ').trim();
}

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
  const apiKey = getExternalApiKey();
  if (!apiKey) return { items: [], nextPageToken: null };

  const category = params.category || 'All';
  const language = params.language || 'All';
  const pageToken = (params.pageToken || '').trim();
  const hasSignals = (params.interestTopics?.length ?? 0) > 0 || (params.recentSearches?.length ?? 0) > 0;
  const seed = params.refreshSeed ?? 0;
  const personalizedTag = hasSignals
    ? `${(params.interestTopics ?? []).slice(0, 2).join(',')}|${(params.recentSearches ?? []).slice(0, 2).join(',')}|${seed}`
    : `${seed}`;

  const cacheKey = `feed_paged:${category}:${language}:${Boolean(params.trending)}:${Boolean(params.shorts)}:${pageToken}:${personalizedTag}`;
  const cached = getCached<PagedDiscoveryResult>(cacheKey);
  if (cached) return cached;

  try {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';

    if (params.shorts) {
      const dynamicQuery =
        category === 'All' && language === 'All'
          ? buildPersonalizedDiscoveryQuery({
              interestTopics: params.interestTopics,
              recentSearches: params.recentSearches,
              preferredLanguage: params.preferredLanguage,
              shorts: true,
              seed,
            })
          : `India ${language !== 'All' ? language : ''} ${category !== 'All' ? category : ''} #shorts`.trim();

      const orderParam = seed % 2 === 1 && !pageToken ? '&order=date' : '&order=relevance';
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoDuration=short&regionCode=IN&maxResults=20${orderParam}${tokenParam}&q=${encodeURIComponent(dynamicQuery)}&key=${encodeURIComponent(apiKey)}`;
      const resp = await discoveryFetch(url, 6500);
      if (!resp.ok) {
        return { items: [], nextPageToken: null };
      }
      const data = (await resp.json()) as { items?: RawVideoItem[]; nextPageToken?: string };
      const ids = (data.items ?? [])
        .map((it) => (typeof it.id === 'string' ? it.id : it.id?.videoId || ''))
        .filter(Boolean);
      const enriched = await enrichVideoIds(ids, apiKey, { category, language, forceShort: true });
      const payload: PagedDiscoveryResult = {
        items: enriched,
        nextPageToken: data.nextPageToken || null,
      };
      if (payload.items.length > 0) setCached(cacheKey, payload);
      return payload;
    }

    if (category === 'All' && language === 'All') {
      const fetchPopular = async () => {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&chart=mostPopular&regionCode=IN&maxResults=20${tokenParam}&key=${encodeURIComponent(apiKey)}`;
        const resp = await discoveryFetch(url, 6500);
        if (!resp.ok) return { items: [] as DiscoveryResult[], nextPageToken: null as string | null };
        const data = (await resp.json()) as { items?: RawVideoItem[]; nextPageToken?: string };
        const items = (data.items ?? []).filter((i) => i.status?.embeddable !== false);
        const chMap = await fetchChannelsMap(
          items.map((i) => i.snippet?.channelId || '').filter(Boolean),
          apiKey
        );
        const converted = items
          .map((it) => toDiscoveryResult(it, chMap))
          .filter((v): v is DiscoveryResult => Boolean(v && !v.isShort));
        for (const v of converted) setCached(`vid:${v.id}`, v);
        return { items: converted, nextPageToken: data.nextPageToken || null };
      };

      if (params.trending || (!hasSignals && !pageToken && seed === 0)) {
        const pop = await fetchPopular();
        if (pop.items.length > 0) setCached(cacheKey, pop);
        return pop;
      }

      // Personalized dynamic Home feed: blend fresh topic/search discovery with trending
      const personalQuery = buildPersonalizedDiscoveryQuery({
        interestTopics: params.interestTopics,
        recentSearches: params.recentSearches,
        preferredLanguage: params.preferredLanguage,
        shorts: false,
        seed,
      });
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&regionCode=IN&maxResults=20${tokenParam}&q=${encodeURIComponent(personalQuery)}&key=${encodeURIComponent(apiKey)}`;
      const [searchResp, popularRes] = await Promise.all([
        discoveryFetch(searchUrl, 6500),
        !pageToken ? fetchPopular() : Promise.resolve({ items: [] as DiscoveryResult[], nextPageToken: null }),
      ]);

      let personalizedItems: DiscoveryResult[] = [];
      let searchNextToken: string | null = null;
      if (searchResp.ok) {
        const data = (await searchResp.json()) as { items?: RawVideoItem[]; nextPageToken?: string };
        const ids = (data.items ?? [])
          .map((it) => (typeof it.id === 'string' ? it.id : it.id?.videoId || ''))
          .filter(Boolean);
        personalizedItems = (await enrichVideoIds(ids, apiKey)).filter((v) => !v.isShort);
        searchNextToken = data.nextPageToken || null;
      }

      const combined: DiscoveryResult[] = [];
      const seenIds = new Set<string>();
      const maxLen = Math.max(personalizedItems.length, popularRes.items.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < personalizedItems.length && !seenIds.has(personalizedItems[i].id)) {
          seenIds.add(personalizedItems[i].id);
          combined.push(personalizedItems[i]);
        }
        if (i < popularRes.items.length && !seenIds.has(popularRes.items[i].id)) {
          seenIds.add(popularRes.items[i].id);
          combined.push(popularRes.items[i]);
        }
      }

      const payload: PagedDiscoveryResult = {
        items: combined,
        nextPageToken: searchNextToken || popularRes.nextPageToken,
      };
      if (payload.items.length > 0) setCached(cacheKey, payload);
      return payload;
    }

    const mappedQueryCat = category === 'Mixes' ? 'Indian Music Mixes' : category;
    const searchQuery = [
      mappedQueryCat !== 'All' ? mappedQueryCat : '',
      language !== 'All' ? language : '',
      'India',
    ]
      .filter(Boolean)
      .join(' ');
    const eventTypeParam = category === 'Live' ? '&eventType=live' : '';
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&regionCode=IN&maxResults=24${eventTypeParam}${tokenParam}&q=${encodeURIComponent(searchQuery)}&key=${encodeURIComponent(apiKey)}`;
    const resp = await discoveryFetch(url, 6500);
    if (!resp.ok) {
      return { items: [], nextPageToken: null };
    }
    const data = (await resp.json()) as { items?: RawVideoItem[]; nextPageToken?: string };
    const ids = (data.items ?? [])
      .map((it) => (typeof it.id === 'string' ? it.id : it.id?.videoId || ''))
      .filter(Boolean);
    const enriched = await enrichVideoIds(ids, apiKey, { category, language });
    const payload: PagedDiscoveryResult = {
      items: enriched.filter((v) => !v.isShort),
      nextPageToken: data.nextPageToken || null,
    };
    if (payload.items.length > 0) setCached(cacheKey, payload);
    return payload;
  } catch (err) {
    console.warn('External feed fetch failed:', err instanceof Error ? err.message : 'unknown');
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
  const apiKey = getExternalApiKey();
  if (!apiKey || !query.trim()) {
    return { items: [], nextPageToken: null };
  }

  const cleanToken = pageToken.trim();
  const cacheKey = `search_paged:${query.trim().toLowerCase()}:${language || 'All'}:${cleanToken}`;
  const cached = getCached<PagedDiscoveryResult>(cacheKey);
  if (cached) return cached;

  try {
    const q = encodeURIComponent(language && language !== 'All' ? `${query} ${language}` : query);
    const tokenParam = cleanToken ? `&pageToken=${encodeURIComponent(cleanToken)}` : '';
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&regionCode=IN&maxResults=24${tokenParam}&q=${q}&key=${encodeURIComponent(apiKey)}`;
    const response = await discoveryFetch(url, 6500);
    if (!response.ok) return { items: [], nextPageToken: null };
    const data = (await response.json()) as { items?: RawVideoItem[]; nextPageToken?: string };
    const ids = (data.items ?? [])
      .map((it) => (typeof it.id === 'string' ? it.id : it.id?.videoId || ''))
      .filter(Boolean);
    const enriched = await enrichVideoIds(ids, apiKey, { language });
    const payload: PagedDiscoveryResult = {
      items: enriched,
      nextPageToken: data.nextPageToken || null,
    };
    if (payload.items.length > 0) setCached(cacheKey, payload);
    return payload;
  } catch {
    return { items: [], nextPageToken: null };
  }
}

export async function fetchExternalDiscovery(query: string, language?: string): Promise<DiscoveryResult[]> {
  const res = await fetchExternalDiscoveryPaged(query, language);
  return res.items;
}

export async function fetchExternalVideoById(
  extId: string
): Promise<{ video: DiscoveryResult; related: DiscoveryResult[] } | null> {
  const apiKey = getExternalApiKey();
  if (!apiKey) return null;

  const rawId = extId.startsWith('ext_') ? extId.slice(4) : extId;
  if (!rawId) return null;

  let video = getCached<DiscoveryResult>(`vid:ext_${rawId}`);
  if (!video) {
    const list = await enrichVideoIds([rawId], apiKey);
    video = list[0] ?? null;
  }
  if (!video) return null;

  const relKey = `rel:ext_${rawId}`;
  let related = getCached<DiscoveryResult[]>(relKey);
  if (!related) {
    const topicWords = video.title.split(/\s+/).slice(0, 4).join(' ');
    const found = await fetchExternalDiscovery(topicWords || video.category, video.language);
    related = found.filter((r) => r.id !== video!.id && !r.isShort).slice(0, 14);
    setCached(relKey, related);
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
  const apiKey = getExternalApiKey();
  if (!apiKey) return null;

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

  try {
    const chMap = await fetchChannelsMap([rawChannelId], apiKey);
    const ch = chMap.get(rawChannelId);
    if (!ch) return null;

    const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
    const tokenParam = cleanToken ? `&pageToken=${encodeURIComponent(cleanToken)}` : '';

    let ids: string[] = [];
    let nextPageToken: string | null = null;
    let totalResults = Number(ch.statistics?.videoCount || 0);

    if (uploadsPlaylistId) {
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=50${tokenParam}&key=${encodeURIComponent(apiKey)}`;
      const plResp = await discoveryFetch(playlistUrl, 7000);
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
        if (plData.pageInfo?.totalResults) {
          totalResults = plData.pageInfo.totalResults;
        }
      }
    }

    if (ids.length === 0 && !uploadsPlaylistId) {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&channelId=${encodeURIComponent(rawChannelId)}&maxResults=50${tokenParam}&key=${encodeURIComponent(apiKey)}`;
      const resp = await discoveryFetch(searchUrl, 6500);
      const data = resp.ok
        ? ((await resp.json()) as { items?: RawVideoItem[]; nextPageToken?: string; pageInfo?: { totalResults?: number } })
        : { items: [] };
      ids = (data.items ?? [])
        .map((it) => (typeof it.id === 'string' ? it.id : it.id?.videoId || ''))
        .filter(Boolean);
      nextPageToken = data.nextPageToken || null;
      if (data.pageInfo?.totalResults) {
        totalResults = data.pageInfo.totalResults;
      }
    }

    const videos = await enrichVideoIds(ids, apiKey);

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
    return setCached(cacheKey, payload);
  } catch {
    return null;
  }
}
