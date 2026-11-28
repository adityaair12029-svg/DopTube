import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const INDIAN_LANGUAGES = [
  'Hindi',
  'English',
  'Tamil',
  'Telugu',
  'Bengali',
  'Marathi',
  'Gujarati',
  'Kannada',
  'Malayalam',
  'Punjabi',
  'Odia',
  'Assamese',
  'Urdu',
] as const;

export const VIDEO_CATEGORIES = [
  'Education',
  'Entertainment',
  'Technology',
  'Gaming',
  'Music',
  'Sports',
  'Cricket',
  'News',
  'Comedy',
  'Movies',
  'Lifestyle',
  'Cooking',
  'Travel',
  'Science',
  'Agriculture',
  'Business',
  'Devotional',
  'Health and Fitness',
] as const;

export interface RankableVideo {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  language: string;
  channelId: string;
  channelName?: string;
  channelVerified?: boolean;
  subscriberCount?: number;
  views: number;
  likes: number;
  dislikes?: number;
  createdAt: string;
  isShort: boolean;
  isLive: boolean;
  visibility: string;
  durationSec: number;
}

export interface RecommendationSignals {
  preferredLanguages: string[];
  watchedCategories: Record<string, number>;
  likedCategories: Record<string, number>;
  subscribedChannelIds: Set<string>;
  recentSearches: string[];
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  const derived = scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return timingSafeEqual(derived, original);
}

export interface SessionPayload {
  userId: string;
  role: 'user' | 'creator' | 'admin';
  exp: number;
  name?: string;
  email?: string;
  handle?: string;
  avatarUrl?: string;
  preferredLanguage?: string;
  birthday?: string;
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function buildUsernameSuggestions(name: string, preferredHandle?: string): string[] {
  const base = (preferredHandle || name || 'creator')
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 14) || 'doptubeuser';
  const year = new Date().getFullYear().toString().slice(-2);
  const candidates = [
    base,
    `${base}${year}`,
    `${base}_in`,
    `real_${base}`,
    `${base}07`,
    `${base}_official`,
  ];
  return Array.from(new Set(candidates)).map((c) => `@${c}`);
}

export function signSessionToken(payload: SessionPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function scoreVideoForUser(video: RankableVideo, signals: RecommendationSignals, nowMs = Date.now()): number {
  let score = Math.log10(Math.max(10, video.views)) * 12 + Math.log10(Math.max(2, video.likes)) * 8;

  // Recency boost (decays over 30 days)
  const ageHours = Math.max(1, (nowMs - new Date(video.createdAt).getTime()) / (1000 * 60 * 60));
  const recencyBoost = Math.max(0, 28 - Math.log2(ageHours) * 2.5);
  score += recencyBoost;

  if (video.isLive) score += 18;
  if (signals.subscribedChannelIds.has(video.channelId)) score += 35;

  if (signals.preferredLanguages.includes(video.language)) {
    score += 22;
  }

  const catWatchWeight = signals.watchedCategories[video.category] ?? 0;
  const catLikeWeight = signals.likedCategories[video.category] ?? 0;
  score += Math.min(30, catWatchWeight * 6) + Math.min(24, catLikeWeight * 8);

  const haystack = `${video.title} ${video.description} ${video.tags.join(' ')} ${video.category}`.toLowerCase();
  for (const term of signals.recentSearches) {
    const normalized = term.trim().toLowerCase();
    if (normalized.length >= 2 && haystack.includes(normalized)) {
      score += 18;
    }
  }

  return Number(score.toFixed(2));
}

export function rankVideos<T extends RankableVideo>(
  videos: T[],
  signals: RecommendationSignals,
  nowMs = Date.now()
): T[] {
  return [...videos].sort((a, b) => scoreVideoForUser(b, signals, nowMs) - scoreVideoForUser(a, signals, nowMs));
}

export interface SearchUserSignals {
  preferredLanguages?: string[];
  preferredCategories?: string[];
  interestScores?: Record<string, number>;
  subscribedChannelIds?: Set<string>;
}

export interface SearchFilterOptions {
  query?: string;
  category?: string;
  language?: string;
  sort?: 'relevance' | 'date' | 'views';
  duration?: 'all' | 'short' | 'medium' | 'long';
  uploadDate?: 'any' | 'today' | 'week' | 'month';
  suppressLowViewSpam?: boolean;
  minTermMatchRatio?: number;
  nowMs?: number;
  userSignals?: SearchUserSignals;
}

export function filterAndSortVideos<T extends RankableVideo>(videos: T[], opts: SearchFilterOptions): T[] {
  const q = (opts.query ?? '').trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];
  const refNowMs = opts.nowMs ?? Date.now();
  const minMatchRatio = Math.max(0.4, Math.min(1, opts.minTermMatchRatio ?? 1));

  const filtered = videos.filter((v) => {
    if (opts.category && opts.category !== 'All') {
      const catNorm = opts.category.toLowerCase();
      const matchesCat =
        v.category.toLowerCase() === catNorm ||
        v.tags.some((t) => t.toLowerCase() === catNorm) ||
        (catNorm === 'live' && v.isLive) ||
        (catNorm === 'mixes' && v.category === 'Music') ||
        (catNorm === 'jee advanced' && (v.tags.some((t) => t.toLowerCase().includes('jee')) || v.title.toLowerCase().includes('jee'))) ||
        (catNorm === 'board examinations' && (v.tags.some((t) => t.toLowerCase().includes('board') || t.toLowerCase().includes('class 10') || t.toLowerCase().includes('class 12')))) ||
        (catNorm === 'physics' && (v.tags.some((t) => t.toLowerCase().includes('physics')) || v.title.toLowerCase().includes('physics')));
      if (!matchesCat) return false;
    }

    if (opts.language && opts.language !== 'All') {
      if (v.language.toLowerCase() !== opts.language.toLowerCase()) return false;
    }

    if (opts.duration && opts.duration !== 'all') {
      if (opts.duration === 'short' && v.durationSec >= 240) return false;
      if (opts.duration === 'medium' && (v.durationSec < 240 || v.durationSec > 1200)) return false;
      if (opts.duration === 'long' && v.durationSec <= 1200) return false;
    }

    if (opts.uploadDate && opts.uploadDate !== 'any') {
      const createdMs = new Date(v.createdAt).getTime();
      if (!Number.isNaN(createdMs)) {
        const diffMs = Math.max(0, refNowMs - createdMs);
        const dayMs = 24 * 60 * 60 * 1000;
        if (opts.uploadDate === 'today' && diffMs > dayMs) return false;
        if (opts.uploadDate === 'week' && diffMs > 7 * dayMs) return false;
        if (opts.uploadDate === 'month' && diffMs > 30 * dayMs) return false;
      }
    }

    if (terms.length > 0) {
      const text = `${v.title} ${v.description} ${v.category} ${v.language} ${v.tags.join(' ')} ${v.channelName ?? ''}`.toLowerCase();
      if (minMatchRatio >= 1) {
        return terms.every((t) => text.includes(t));
      }
      const matchedCount = terms.filter((t) => text.includes(t)).length;
      return matchedCount >= Math.ceil(terms.length * minMatchRatio);
    }

    return true;
  });

  // Suppress 0-499 view unverified noise whenever real popular/verified results exist for the query
  const shouldSuppressSpam =
    terms.length > 0 &&
    opts.suppressLowViewSpam !== false &&
    opts.sort !== 'date' &&
    opts.uploadDate !== 'today';

  let candidates = filtered;
  if (shouldSuppressSpam) {
    const isPopularOrVerified = (v: T) =>
      v.views >= 1000 || Boolean(v.channelVerified) || (v.subscriberCount ?? 0) >= 50_000;
    const popularCount = filtered.filter(isPopularOrVerified).length;
    if (popularCount >= 3) {
      candidates = filtered.filter(
        (v) => v.views >= 500 || Boolean(v.channelVerified) || (v.subscriberCount ?? 0) >= 50_000
      );
    }
  }

  if (opts.sort === 'date') {
    return candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  if (opts.sort === 'views') {
    return candidates.sort((a, b) => b.views - a.views);
  }

  // Strict relevance ranking: exact query match + engagement-to-view ratio + verified status + trending + user interests
  if (terms.length > 0 || opts.userSignals) {
    const userSignals = opts.userSignals;
    const prefLangs = new Set((userSignals?.preferredLanguages ?? []).map((l) => l.toLowerCase()));
    const prefCats = new Set((userSignals?.preferredCategories ?? []).map((c) => c.toLowerCase()));
    const interestEntries = Object.entries(userSignals?.interestScores ?? {});

    const scoreSearchRelevance = (v: T): number => {
      const titleLower = v.title.toLowerCase();
      const tagsLower = v.tags.join(' ').toLowerCase();
      const catLower = v.category.toLowerCase();
      const channelLower = (v.channelName ?? '').toLowerCase();
      const fullHaystack = `${titleLower} ${tagsLower} ${catLower} ${v.description.toLowerCase()}`;

      let relevanceScore = 0;
      if (terms.length > 0) {
        const exactTitlePhrase = q.length >= 2 && titleLower.includes(q) ? 55 : 0;
        const exactChannelPhrase = q.length >= 2 && channelLower.includes(q) ? 28 : 0;
        const termScore = terms.reduce((acc, t) => {
          if (titleLower.includes(t)) return acc + 28;
          if (tagsLower.includes(t) || catLower.includes(t)) return acc + 12;
          if (channelLower.includes(t)) return acc + 8;
          return acc + 2;
        }, 0);
        const allInTitleBonus = terms.every((t) => titleLower.includes(t)) ? 30 : 0;
        relevanceScore = exactTitlePhrase + exactChannelPhrase + termScore + allInTitleBonus;
      }

      // Popularity & Verified Status
      const viewScore = Math.log10(Math.max(10, v.views)) * 12;
      const verifiedBonus = v.channelVerified ? 28 : 0;
      const subBonus = v.subscriberCount ? Math.min(20, Math.log10(Math.max(10, v.subscriberCount)) * 2.6) : 0;

      // Engagement-to-View Ratio + Dislike Dampening
      const engagementRatio = v.views >= 20 ? Math.min(0.2, v.likes / Math.max(20, v.views)) : 0;
      const engagementBoost = engagementRatio * 240;
      const dislikePenalty = (v.dislikes ?? 0) > Math.max(5, v.likes * 0.45) ? -28 : 0;

      // Trending Velocity Boost
      const createdMs = new Date(v.createdAt).getTime();
      const ageHours = Number.isNaN(createdMs) ? 720 : Math.max(1, (refNowMs - createdMs) / (1000 * 60 * 60));
      const velocity = v.views / Math.pow(ageHours + 2, 0.7);
      const trendingBoost =
        (v.isLive ? 22 : 0) +
        Math.min(18, Math.log10(Math.max(1, velocity)) * 3.2) +
        (v.views >= 100_000 ? 10 : 0);

      // Exact User Interest, Category & Language Boost
      let userBoost = 0;
      if (userSignals) {
        if (userSignals.subscribedChannelIds?.has(v.channelId)) userBoost += 24;
        if (prefLangs.has(v.language.toLowerCase())) userBoost += 14;
        if (prefCats.has(catLower)) userBoost += 14;

        let bestInterestScore = 0;
        for (const [topic, weight] of interestEntries) {
          const topicNorm = topic.toLowerCase().trim();
          if (!topicNorm) continue;
          const exactTopic =
            catLower === topicNorm ||
            v.tags.some((t) => t.toLowerCase() === topicNorm) ||
            titleLower.includes(topicNorm);
          if (exactTopic || fullHaystack.includes(topicNorm)) {
            const candidateBoost = (Math.max(0, Math.min(100, weight)) / 100) * (exactTopic ? 26 : 12);
            if (candidateBoost > bestInterestScore) bestInterestScore = candidateBoost;
          }
        }
        userBoost += bestInterestScore;
      }

      // Suppress low-view / zero-engagement noise
      const lowViewPenalty =
        v.views < 500 && !v.channelVerified
          ? -55
          : v.views < 2000 && !v.channelVerified
          ? -18
          : 0;
      const lowEngagementPenalty = v.views >= 50 && v.likes === 0 && !v.channelVerified ? -12 : 0;

      return (
        relevanceScore +
        viewScore +
        verifiedBonus +
        subBonus +
        engagementBoost +
        dislikePenalty +
        trendingBoost +
        userBoost +
        lowViewPenalty +
        lowEngagementPenalty
      );
    };

    return candidates.sort((a, b) => scoreSearchRelevance(b) - scoreSearchRelevance(a));
  }

  return candidates;
}

export function isLowQualitySearchQuery(rawQuery: string): boolean {
  const q = (rawQuery ?? '').trim();
  if (q.length < 2 || q.length > 80) return true;
  if (/^https?:\/\//i.test(q) || /[<>]/.test(q)) return true;
  // Must contain at least one letter (Latin or Unicode Indic scripts)
  if (!/\p{L}/u.test(q)) return true;
  // Reject repeated character spam (e.g., "aaaa", "zzzzzz", "hahaaaaa")
  if (/(.)\1{3,}/u.test(q)) return true;
  // Reject ultra-repetitive low-entropy queries like "ababab" when >= 4 chars
  const compact = q.replace(/\s+/g, '').toLowerCase();
  if (compact.length < 2 || new Set(compact).size < 2) return true;
  // Reject queries dominated by symbols/punctuation (> 35% non-letter/digit/space)
  const symbolCount = (q.match(/[^\p{L}\p{N}\s'&-]/gu) ?? []).length;
  if (symbolCount / q.length > 0.35) return true;
  // Reject nonsense keyboard-smash tokens (single long token >= 14 chars with no vowels in ASCII)
  const tokens = q.split(/\s+/);
  if (tokens.some((tok) => /^[bcdfghjklmnpqrstvwxyz]{8,}$/i.test(tok))) return true;
  return false;
}

export interface SearchSuggestionCandidate {
  id?: string;
  query: string;
  previewThumb: string;
  searchedAt?: string;
  searchCount?: number;
  views?: number;
}

export function rankSearchSuggestions(
  entries: SearchSuggestionCandidate[],
  opts?: {
    prefixQuery?: string;
    interestTopics?: string[];
    interestScores?: Record<string, number>;
    nowMs?: number;
    limit?: number;
  }
): Array<{ id?: string; query: string; previewThumb: string }> {
  const cleanPrefix = (opts?.prefixQuery ?? '').trim().toLowerCase();
  const nowMs = opts?.nowMs ?? Date.now();
  const limit = Math.max(1, Math.min(20, opts?.limit ?? 6));

  const deduped = new Map<
    string,
    {
      id?: string;
      query: string;
      previewThumb: string;
      searchedAt?: string;
      searchCount: number;
      views: number;
    }
  >();

  for (const entry of entries) {
    const cleanQ = (entry.query ?? '').trim().replace(/\s+/g, ' ');
    if (isLowQualitySearchQuery(cleanQ)) continue;
    const key = cleanQ.toLowerCase();
    if (cleanPrefix && !key.includes(cleanPrefix)) continue;

    const existing = deduped.get(key);
    const count = Math.max(1, entry.searchCount ?? 1);
    const views = Math.max(0, entry.views ?? 0);
    if (!existing) {
      deduped.set(key, {
        id: entry.id,
        query: cleanQ,
        previewThumb: entry.previewThumb || '',
        searchedAt: entry.searchedAt,
        searchCount: count,
        views,
      });
    } else {
      existing.searchCount += count;
      existing.views = Math.max(existing.views, views);
      if (!existing.previewThumb && entry.previewThumb) existing.previewThumb = entry.previewThumb;
      if (entry.searchedAt && (!existing.searchedAt || entry.searchedAt > existing.searchedAt)) {
        existing.searchedAt = entry.searchedAt;
      }
    }
  }

  const interestEntries = Object.entries(opts?.interestScores ?? {});
  const extraTopics = opts?.interestTopics ?? [];

  const scored = Array.from(deduped.values()).map((item) => {
    const qLower = item.query.toLowerCase();
    let score = 0;

    if (cleanPrefix) {
      if (qLower === cleanPrefix) score += 70;
      else if (qLower.startsWith(cleanPrefix)) score += 45;
      else score += 20;
    }

    // Frequency score (most searched terms float up)
    score += Math.log2(item.searchCount + 1) * 20;

    // Recency score (exponential decay with ~7-day half-life)
    if (item.searchedAt) {
      const ts = new Date(item.searchedAt).getTime();
      if (!Number.isNaN(ts)) {
        const ageHours = Math.max(0, (nowMs - ts) / (1000 * 60 * 60));
        score += 34 * Math.exp(-ageHours / (24 * 7));
      }
    }

    // Interest relevance boost
    let maxInterestBoost = 0;
    for (const [topic, weight] of interestEntries) {
      const tNorm = topic.toLowerCase().trim();
      if (tNorm.length >= 2 && qLower.includes(tNorm)) {
        maxInterestBoost = Math.max(maxInterestBoost, (Math.max(0, Math.min(100, weight)) / 100) * 32);
      }
    }
    for (const topic of extraTopics) {
      const tNorm = topic.toLowerCase().trim();
      if (tNorm.length >= 2 && qLower.includes(tNorm)) {
        maxInterestBoost = Math.max(maxInterestBoost, 18);
      }
    }
    score += maxInterestBoost;

    // Global popularity signal (if backed by video views)
    if (item.views > 0) {
      score += Math.min(25, Math.log10(Math.max(10, item.views)) * 3.5);
    }

    return { item, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => ({
      ...(item.id ? { id: item.id } : {}),
      query: item.query,
      previewThumb: item.previewThumb,
    }));
}

export function formatViews(views: number): string {
  if (views < 1000) return `${views}`;
  if (views < 1_000_000) {
    const val = views / 1000;
    return `${val >= 100 ? Math.round(val) : val.toFixed(1).replace(/\.0$/, '')}K`;
  }
  if (views < 1_000_000_000) {
    const val = views / 1_000_000;
    return `${val >= 100 ? Math.round(val) : val.toFixed(1).replace(/\.0$/, '')}M`;
  }
  const val = views / 1_000_000_000;
  return `${val.toFixed(1).replace(/\.0$/, '')}B`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function parseIsoDurationToSeconds(iso: string): number {
  if (!iso || typeof iso !== 'string') return 0;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatRelativeTime(isoDate: string, nowMs = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function validateVideoInput(input: {
  title?: string;
  category?: string;
  language?: string;
  visibility?: string;
}): string | null {
  const title = (input.title ?? '').trim();
  if (title.length < 3 || title.length > 160) {
    return 'Video title must be between 3 and 160 characters.';
  }
  if (!input.category || !VIDEO_CATEGORIES.includes(input.category as (typeof VIDEO_CATEGORIES)[number])) {
    return 'Please select a valid video category.';
  }
  if (!input.language || !INDIAN_LANGUAGES.includes(input.language as (typeof INDIAN_LANGUAGES)[number])) {
    return 'Please select a valid supported language.';
  }
  const vis = input.visibility ?? 'public';
  if (!['public', 'unlisted', 'private'].includes(vis)) {
    return 'Visibility must be public, unlisted, or private.';
  }
  return null;
}

export function validateCommentInput(text?: string): string | null {
  const trimmed = (text ?? '').trim();
  if (trimmed.length < 1 || trimmed.length > 1500) {
    return 'Comment must be between 1 and 1500 characters.';
  }
  return null;
}

export function validateCopyrightClaim(input: {
  claimantName?: string;
  claimantEmail?: string;
  reason?: string;
}): string | null {
  if (!input.claimantName || input.claimantName.trim().length < 2) {
    return 'Claimant or organization name is required.';
  }
  if (!input.claimantEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.claimantEmail.trim())) {
    return 'A valid contact email is required.';
  }
  if (!input.reason || input.reason.trim().length < 15) {
    return 'Please describe the rights ownership claim in at least 15 characters.';
  }
  return null;
}
