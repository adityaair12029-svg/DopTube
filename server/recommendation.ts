import type { RankableVideo } from './domain.ts';
import { validateContentCandidate, type ValidatableCandidate, type ValidationContext } from './validation.ts';

export interface RankingWeights {
  userInterestMatch: number;
  topicLanguageMatch: number;
  explicitFeedback: number;
  predictedSatisfaction: number;
  contentQualitySafety: number;
  creatorAffinity: number;
  freshnessBoost: number;
  explorationDiversity: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  userInterestMatch: 0.25,
  topicLanguageMatch: 0.15,
  explicitFeedback: 0.15,
  predictedSatisfaction: 0.15,
  contentQualitySafety: 0.10,
  creatorAffinity: 0.08,
  freshnessBoost: 0.07,
  explorationDiversity: 0.05,
};

export interface CandidateVideo extends RankableVideo, ValidatableCandidate {
  channelName: string;
  channelHandle: string;
  channelAvatar: string;
  channelVerified: boolean;
  subscriberCount: number;
  dislikes: number;
}

export interface UserAiContext {
  userId?: string;
  preferredLanguages: string[];
  preferredCategories: string[];
  selectedInterests: string[];
  interestScores: Record<string, number>; // topic -> 0..100
  subscribedChannelIds: Set<string>;
  creatorWatchCounts: Record<string, number>;
  likedVideoIds: Set<string>;
  dislikedVideoIds: Set<string>;
  watchedVideoIds: Set<string>;
  completedVideoIds: Set<string>;
  skippedVideoIds: Set<string>;
  recentSearches: string[];
  personalizationEnabled: boolean;
  validation: ValidationContext;
}

export type BehaviorEventType =
  | 'impression'
  | 'click'
  | 'start'
  | 'progress_10'
  | 'progress_25'
  | 'progress_50'
  | 'progress_75'
  | 'completion'
  | 'replay'
  | 'skip'
  | 'abandoned'
  | 'like'
  | 'dislike'
  | 'comment'
  | 'reply'
  | 'share'
  | 'save'
  | 'playlist_add'
  | 'subscribe'
  | 'unsubscribe'
  | 'search'
  | 'not_interested'
  | 'dont_recommend_creator';

export function computeInterestDelta(eventType: BehaviorEventType): number {
  switch (eventType) {
    case 'completion':
      return 10;
    case 'replay':
      return 12;
    case 'like':
      return 8;
    case 'save':
    case 'playlist_add':
      return 7;
    case 'subscribe':
      return 10;
    case 'share':
    case 'comment':
    case 'reply':
      return 6;
    case 'progress_75':
      return 6;
    case 'progress_50':
      return 4;
    case 'progress_25':
      return 2;
    case 'click':
    case 'start':
      return 1;
    case 'skip':
    case 'abandoned':
      return -5;
    case 'dislike':
      return -9;
    case 'not_interested':
      return -14;
    case 'dont_recommend_creator':
      return -16;
    case 'unsubscribe':
      return -6;
    default:
      return 0;
  }
}

export function applyInterestDecayAndDelta(currentScore: number, delta: number, daysSinceUpdate = 0): number {
  const decayed = currentScore * Math.pow(0.97, Math.max(0, daysSinceUpdate));
  return Math.max(0, Math.min(100, Number((decayed + delta).toFixed(2))));
}

function normalize01(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

export interface ScoredRecommendationResult {
  score: number;
  recommendationReasons: string[];
  recommendationReason?: string;
}

export function scoreCandidateWithReason(
  video: CandidateVideo,
  ctx: UserAiContext,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  nowMs = Date.now()
): ScoredRecommendationResult {
  const haystack = `${video.title} ${video.description} ${video.category} ${video.tags.join(' ')}`.toLowerCase();

  // 1. User Interest Match (0..1)
  let interestSum = 0;
  let interestHits = 0;
  let topMatchedTopic = '';
  let topMatchedScore = -1;
  for (const [topic, score] of Object.entries(ctx.interestScores)) {
    const t = topic.toLowerCase();
    if (video.category.toLowerCase() === t || video.tags.some((tg) => tg.toLowerCase() === t) || haystack.includes(t)) {
      interestSum += score / 100;
      interestHits += 1;
      if (score > topMatchedScore) {
        topMatchedScore = score;
        topMatchedTopic = topic;
      }
    }
  }
  const userInterestMatch = ctx.personalizationEnabled
    ? Math.min(1, interestHits > 0 ? interestSum / Math.min(3, interestHits) : 0.15)
    : 0.2;

  // 2. Topic & Language Match (0..1)
  const matchesLanguage = ctx.preferredLanguages.includes(video.language);
  const matchesPreferredCategory = ctx.preferredCategories.includes(video.category);
  const matchesRecentSearch = ctx.recentSearches.some(
    (term) => term.trim().length >= 2 && haystack.includes(term.trim().toLowerCase())
  );
  let langMatch = matchesLanguage ? 0.6 : 0.15;
  if (matchesPreferredCategory) langMatch += 0.3;
  if (matchesRecentSearch) langMatch += 0.08;
  const topicLanguageMatch = Math.min(1, langMatch);

  // 3. Explicit Feedback Signal (0..1)
  let explicitFeedback = 0.5;
  if (ctx.likedVideoIds.has(video.id)) explicitFeedback += 0.35;
  if (ctx.dislikedVideoIds.has(video.id)) explicitFeedback -= 0.45;
  if (ctx.skippedVideoIds.has(video.id)) explicitFeedback -= 0.3;
  explicitFeedback = Math.max(0, Math.min(1, explicitFeedback));

  // 4. Predicted Watch Completion & Satisfaction (0..1)
  const likeRatio = video.views > 0 ? Math.min(1, (video.likes / Math.max(10, video.views)) * 12) : 0.35;
  const dislikePenalty = video.views > 0 ? Math.min(0.4, (video.dislikes / Math.max(10, video.views)) * 8) : 0;
  const completedBoost = ctx.completedVideoIds.has(video.id) ? -0.15 : 0.1; // slightly demote already-completed videos
  const predictedSatisfaction = Math.max(0, Math.min(1, 0.35 + likeRatio * 0.55 - dislikePenalty + completedBoost));

  // 5. Content Quality & Safety (0..1)
  const verifiedScore = video.channelVerified ? 0.3 : 0.1;
  const popularityScore = normalize01(Math.log10(Math.max(10, video.views)), 7) * 0.55;
  const metadataScore = video.description.length > 20 && video.tags.length > 0 ? 0.15 : 0.05;
  const contentQualitySafety = Math.min(1, verifiedScore + popularityScore + metadataScore);

  // 6. Creator Affinity (0..1)
  const isSubscribed = ctx.subscribedChannelIds.has(video.channelId);
  const subScore = isSubscribed ? 0.75 : 0;
  const creatorWatches = ctx.creatorWatchCounts[video.channelId] ?? 0;
  const creatorAffinity = Math.min(1, subScore + Math.min(0.35, creatorWatches * 0.1));

  // 7. Freshness Boost (0..1)
  const ageHours = Math.max(0.5, (nowMs - new Date(video.createdAt).getTime()) / (1000 * 60 * 60));
  const freshnessBoost = Math.max(0.05, Math.min(1, 1 - Math.log2(ageHours) / 11));

  // 8. Exploration & Diversity Boost (0..1)
  const isUnwatchedTopic = !ctx.watchedVideoIds.has(video.id) && !(video.category in ctx.interestScores);
  const explorationDiversity = isUnwatchedTopic ? 0.85 : 0.3;

  const weighted =
    userInterestMatch * weights.userInterestMatch +
    topicLanguageMatch * weights.topicLanguageMatch +
    explicitFeedback * weights.explicitFeedback +
    predictedSatisfaction * weights.predictedSatisfaction +
    contentQualitySafety * weights.contentQualitySafety +
    creatorAffinity * weights.creatorAffinity +
    freshnessBoost * weights.freshnessBoost +
    explorationDiversity * weights.explorationDiversity;

  let finalScore = weighted * 100;

  // Prevent unrelated low-view native uploads by other creators from jumping to slot #1 of another user's feed
  const isOtherLowViewNative =
    video.sourceType === 'native' &&
    video.views < 25 &&
    (!ctx.userId || video.ownerUserId !== ctx.userId) &&
    !isSubscribed &&
    interestHits === 0 &&
    !matchesPreferredCategory &&
    !matchesRecentSearch;

  if (isOtherLowViewNative) {
    finalScore -= 24;
  }

  const recommendationReasons: string[] = [];
  if (isSubscribed) {
    recommendationReasons.push('Subscribed creator');
  }
  if (creatorWatches > 0 && !isSubscribed) {
    recommendationReasons.push(`Because you watched ${video.channelName}`);
  } else if (ctx.watchedVideoIds.size > 0 && (matchesPreferredCategory || topMatchedTopic)) {
    recommendationReasons.push(`Because you watched ${topMatchedTopic || video.category}`);
  }
  if (ctx.personalizationEnabled && (topMatchedTopic || matchesPreferredCategory)) {
    const topicLabel = topMatchedTopic || video.category;
    recommendationReasons.push(`Recommended based on your interests (${topicLabel})`);
  }
  if (matchesRecentSearch) {
    recommendationReasons.push('Matches your recent search');
  }
  if (matchesLanguage) {
    if (video.views >= 25_000 || video.isLive || ageHours <= 72) {
      recommendationReasons.push(`Trending in your language (${video.language})`);
    } else {
      recommendationReasons.push(`In your preferred language (${video.language})`);
    }
  }
  if (ageHours <= 72) {
    recommendationReasons.push('Fresh upload');
  }
  if (video.views >= 100_000 || video.isLive) {
    recommendationReasons.push('Popular in India');
  }
  if (recommendationReasons.length === 0) {
    recommendationReasons.push(`Featured in ${video.category}`);
  }

  return {
    score: Number(Math.max(0, finalScore).toFixed(3)),
    recommendationReasons,
    recommendationReason: recommendationReasons[0],
  };
}

export function scoreCandidate(
  video: CandidateVideo,
  ctx: UserAiContext,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  nowMs = Date.now()
): number {
  return scoreCandidateWithReason(video, ctx, weights, nowMs).score;
}

function normalizeTitlePrefix(title?: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 4)
    .join(' ');
}

export function diversifyFeed<T extends { channelId: string; category: string; title?: string }>(
  items: T[],
  maxConsecutiveCreator = 1,
  maxConsecutiveCategory = 2,
  maxPerCreatorInTopWindow = 2,
  topWindowSize = 15
): T[] {
  const remaining = [...items];
  const output: T[] = [];
  const creatorCountInWindow = new Map<string, number>();
  const seenTitlePrefixes = new Set<string>();

  while (remaining.length > 0) {
    let pickedIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const recentCreators = output.slice(-maxConsecutiveCreator).map((x) => x.channelId);
      const recentCats = output.slice(-maxConsecutiveCategory).map((x) => x.category);

      const creatorClash =
        recentCreators.length === maxConsecutiveCreator && recentCreators.every((c) => c === cand.channelId);
      const catClash = recentCats.length === maxConsecutiveCategory && recentCats.every((c) => c === cand.category);
      const windowCreatorCount = creatorCountInWindow.get(cand.channelId) ?? 0;
      const windowCapClash = output.length < topWindowSize && windowCreatorCount >= maxPerCreatorInTopWindow;
      const prefix = normalizeTitlePrefix(cand.title);
      const titleDupClash = prefix.length >= 8 && seenTitlePrefixes.has(prefix);

      if (!creatorClash && !catClash && !windowCapClash && !titleDupClash) {
        pickedIdx = i;
        break;
      }
    }

    // Relax titleDup & category constraints before relaxing strict creator repetition
    if (pickedIdx === -1) {
      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const lastCreator = output[output.length - 1]?.channelId;
        if (lastCreator !== cand.channelId) {
          pickedIdx = i;
          break;
        }
      }
    }
    if (pickedIdx === -1) pickedIdx = 0;

    const chosen = remaining.splice(pickedIdx, 1)[0];
    output.push(chosen);
    if (output.length <= topWindowSize) {
      creatorCountInWindow.set(chosen.channelId, (creatorCountInWindow.get(chosen.channelId) ?? 0) + 1);
    }
    const prefix = normalizeTitlePrefix(chosen.title);
    if (prefix.length >= 8) seenTitlePrefixes.add(prefix);
  }
  return output;
}

export function generatePersonalizedRecommendations(
  candidates: CandidateVideo[],
  ctx: UserAiContext,
  opts?: { weights?: RankingWeights; nowMs?: number; limit?: number; cursor?: number }
): {
  items: Array<CandidateVideo & { score: number; recommendationReasons: string[]; recommendationReason?: string }>;
  nextCursor: number | null;
  hasMore: boolean;
  total: number;
} {
  const validCandidates = candidates.filter((c) => validateContentCandidate(c, ctx.validation).valid);

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = validCandidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const scored = unique
    .map((v) => {
      const scoredRes = scoreCandidateWithReason(v, ctx, opts?.weights ?? DEFAULT_RANKING_WEIGHTS, opts?.nowMs);
      return {
        ...v,
        score: scoredRes.score,
        recommendationReasons: scoredRes.recommendationReasons,
        recommendationReason: scoredRes.recommendationReason,
      };
    })
    .sort((a, b) => b.score - a.score);

  const diversified = diversifyFeed(scored, 1, 2);
  const cursor = Math.max(0, opts?.cursor ?? 0);
  const limit = Math.max(1, Math.min(40, opts?.limit ?? 12));
  const slice = diversified.slice(cursor, cursor + limit);
  const nextCursor = cursor + slice.length < diversified.length ? cursor + slice.length : null;

  return {
    items: slice,
    nextCursor,
    hasMore: nextCursor !== null,
    total: diversified.length,
  };
}

const RELATED_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'into', 'about', 'what', 'when',
  'how', 'why', 'who', 'all', 'best', 'top', 'new', 'full', 'video', 'videos', 'official',
  'live', 'hindi', 'english', 'india', 'indian', 'latest', 'episode', 'part', 'shorts',
]);

function extractSignificantTerms(text: string): string[] {
  return Array.from(
    new Set(
      (text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !RELATED_STOP_WORDS.has(w) && !/^\d+$/.test(w))
    )
  );
}

export function rankTrendingIndia(
  candidates: CandidateVideo[],
  ctx: ValidationContext,
  nowMs = Date.now()
): Array<CandidateVideo & { recommendationReasons: string[]; recommendationReason?: string }> {
  const valid = candidates.filter((c) => validateContentCandidate(c, ctx).valid);
  return [...valid]
    .sort((a, b) => {
      const score = (v: CandidateVideo) => {
        const ageHours = Math.max(1, (nowMs - new Date(v.createdAt).getTime()) / (1000 * 60 * 60));
        const velocity = v.views / Math.pow(ageHours + 2, 0.75);
        const engagement = (v.likes * 3) / Math.max(50, v.views);
        const spamDampener = v.dislikes > v.likes ? 0.5 : 1;
        return (Math.log10(Math.max(10, v.views)) * 15 + Math.log10(Math.max(1, velocity)) * 20 + engagement * 40) * spamDampener;
      };
      return score(b) - score(a);
    })
    .map((v) => {
      const reason = `Trending in ${v.language || 'India'}`;
      return {
        ...v,
        recommendationReasons: [reason, `Popular in ${v.category}`],
        recommendationReason: reason,
      };
    });
}

export function rankRelatedVideos(
  currentVideo: CandidateVideo,
  candidates: CandidateVideo[],
  ctx: UserAiContext
): Array<CandidateVideo & { recommendationReasons: string[]; recommendationReason?: string }> {
  const valid = candidates.filter(
    (c) => c.id !== currentVideo.id && !c.isShort && validateContentCandidate(c, ctx.validation).valid
  );
  const seenIds = new Set<string>();
  const unique = valid.filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  const currentTags = new Set(currentVideo.tags.map((t) => t.toLowerCase()));
  const currentTitleTerms = extractSignificantTerms(currentVideo.title);
  const currentTitleSet = new Set(currentTitleTerms);
  const shortSourceTitle =
    currentVideo.title.length > 42 ? `${currentVideo.title.slice(0, 39).trim()}...` : currentVideo.title;

  const scored = unique
    .map((v) => {
      const base = scoreCandidateWithReason(v, ctx);
      const candTerms = extractSignificantTerms(`${v.title} ${v.tags.join(' ')}`);
      let titleMatchCount = 0;
      for (const term of candTerms) {
        if (currentTitleSet.has(term)) titleMatchCount += 1;
      }
      let tagMatchCount = 0;
      for (const tag of v.tags) {
        if (currentTags.has(tag.toLowerCase())) tagMatchCount += 1;
      }

      const sameCategory = v.category === currentVideo.category;
      const sameLanguage = v.language === currentVideo.language;
      const sameCreator = v.channelId === currentVideo.channelId;

      const engagementRatio = v.views >= 20 ? Math.min(0.18, v.likes / Math.max(20, v.views)) : 0;
      const qualityBonus =
        Math.log10(Math.max(10, v.views)) * 2.4 +
        (v.channelVerified ? 6 : 0) +
        engagementRatio * 45;

      const simScore =
        base.score * 0.45 +
        Math.min(64, titleMatchCount * 20) +
        Math.min(36, tagMatchCount * 12) +
        (sameCategory ? 32 : 0) +
        (sameLanguage ? 16 : 0) +
        (sameCreator ? 14 : 0) +
        qualityBonus;

      const reasons: string[] = [];
      if (titleMatchCount > 0 || tagMatchCount > 0) {
        reasons.push(`Because you watched "${shortSourceTitle}"`);
      }
      if (sameCreator) {
        reasons.push(`More from ${currentVideo.channelName}`);
      }
      if (sameCategory && sameLanguage) {
        reasons.push(`Similar ${v.category} in ${v.language}`);
      } else if (sameCategory) {
        reasons.push(`Similar in ${v.category}`);
      }
      for (const r of base.recommendationReasons) {
        if (!reasons.includes(r)) reasons.push(r);
      }

      return {
        ...v,
        _simScore: simScore,
        recommendationReasons: reasons,
        recommendationReason: reasons[0],
      };
    })
    .sort((a, b) => b._simScore - a._simScore);

  return diversifyFeed(scored, 2, 3).map(({ _simScore: _unused, ...rest }) => rest);
}

export type ShortsFeedMode = 'for_you' | 'following' | 'trending' | 'new_creators';

export function rankShortsFeed(
  candidates: CandidateVideo[],
  ctx: UserAiContext,
  nowMs = Date.now(),
  opts?: { mode?: ShortsFeedMode; category?: string }
): Array<CandidateVideo & { recommendationReasons: string[]; recommendationReason?: string }> {
  const mode = opts?.mode ?? 'for_you';
  const catFilter = (opts?.category ?? 'All').trim();

  let valid = candidates.filter((c) => c.isShort && validateContentCandidate(c, ctx.validation).valid);
  if (catFilter && catFilter !== 'All') {
    const catNorm = catFilter.toLowerCase();
    valid = valid.filter(
      (c) =>
        c.category.toLowerCase() === catNorm ||
        c.tags.some((t) => t.toLowerCase() === catNorm)
    );
  }

  if (mode === 'following') {
    valid = valid.filter((c) => ctx.subscribedChannelIds.has(c.channelId));
  } else if (mode === 'new_creators') {
    valid = valid.filter((c) => c.subscriberCount < 250_000);
  }

  const shortsWeights: RankingWeights =
    mode === 'trending'
      ? {
          userInterestMatch: 0.1,
          topicLanguageMatch: 0.1,
          explicitFeedback: 0.15,
          predictedSatisfaction: 0.25,
          contentQualitySafety: 0.2,
          creatorAffinity: 0.05,
          freshnessBoost: 0.1,
          explorationDiversity: 0.05,
        }
      : mode === 'new_creators'
      ? {
          userInterestMatch: 0.2,
          topicLanguageMatch: 0.15,
          explicitFeedback: 0.15,
          predictedSatisfaction: 0.15,
          contentQualitySafety: 0.05,
          creatorAffinity: 0.05,
          freshnessBoost: 0.15,
          explorationDiversity: 0.1,
        }
      : {
          userInterestMatch: 0.25,
          topicLanguageMatch: 0.15,
          explicitFeedback: 0.2,
          predictedSatisfaction: 0.2,
          contentQualitySafety: 0.05,
          creatorAffinity: 0.05,
          freshnessBoost: 0.05,
          explorationDiversity: 0.05,
        };

  return diversifyFeed(
    valid
      .map((v) => {
        const res = scoreCandidateWithReason(v, ctx, shortsWeights, nowMs);
        return {
          ...v,
          _s:
            mode === 'trending'
              ? res.score + Math.log10(Math.max(10, v.views)) * 12
              : res.score,
          recommendationReasons: res.recommendationReasons,
          recommendationReason: res.recommendationReason,
        };
      })
      .sort((a, b) => b._s - a._s),
    1,
    2
  ).map(({ _s: _unused, ...rest }) => rest);
}

export interface NextVideoInput {
  currentVideoId: string;
  mode: 'recommended' | 'playlist' | 'queue' | 'repeat';
  queueVideoIds: string[];
  playlistVideoIds: string[];
  recommendedVideos: CandidateVideo[];
  currentVideo?: CandidateVideo | null;
}

export function resolveNextVideo(input: NextVideoInput): { nextVideoId: string | null; source: string } {
  if (input.mode === 'repeat' && input.currentVideo) {
    return { nextVideoId: input.currentVideo.id, source: 'repeat' };
  }

  if (input.queueVideoIds.length > 0) {
    const nextInQueue = input.queueVideoIds.find((id) => id !== input.currentVideoId) ?? input.queueVideoIds[0];
    if (nextInQueue) return { nextVideoId: nextInQueue, source: 'queue' };
  }

  if (input.playlistVideoIds.length > 0) {
    const idx = input.playlistVideoIds.indexOf(input.currentVideoId);
    if (idx >= 0 && idx + 1 < input.playlistVideoIds.length) {
      return { nextVideoId: input.playlistVideoIds[idx + 1], source: 'playlist' };
    }
    if (idx === -1) {
      return { nextVideoId: input.playlistVideoIds[0], source: 'playlist' };
    }
  }

  const nextRec = input.recommendedVideos.find((v) => v.id !== input.currentVideoId);
  if (nextRec) {
    return { nextVideoId: nextRec.id, source: 'recommended' };
  }

  return { nextVideoId: null, source: 'none' };
}

export interface HomepageSection {
  id: string;
  title: string;
  videos: CandidateVideo[];
}

export function buildConditionalSections(params: {
  recommended: CandidateVideo[];
  continueWatching: CandidateVideo[];
  trending: CandidateVideo[];
  subscribedVideos: CandidateVideo[];
  topInterestTopic?: string;
  preferredLanguage?: string;
  newCreators?: CandidateVideo[];
}): HomepageSection[] {
  const sections: HomepageSection[] = [];
  const usedIds = new Set<string>();

  const takeUnique = (pool: CandidateVideo[], limit = 4): CandidateVideo[] => {
    const out: CandidateVideo[] = [];
    for (const v of pool) {
      if (!v?.id || usedIds.has(v.id)) continue;
      if (out.some((x) => x.id === v.id)) continue;
      usedIds.add(v.id);
      out.push(v);
      if (out.length >= limit) break;
    }
    return out;
  };

  if (params.continueWatching.length > 0) {
    const items = takeUnique(params.continueWatching, 4);
    if (items.length > 0) {
      sections.push({
        id: 'continue_watching',
        title: 'Continue watching',
        videos: items,
      });
    }
  }

  if (params.subscribedVideos.length > 0) {
    const items = takeUnique(params.subscribedVideos, 4);
    if (items.length > 0) {
      sections.push({
        id: 'from_subscriptions',
        title: 'From creators you follow',
        videos: items,
      });
    }
  }

  if (params.topInterestTopic) {
    const topicNorm = params.topInterestTopic.toLowerCase();
    const topicMatches = params.recommended.filter(
      (v) =>
        !usedIds.has(v.id) &&
        (v.category.toLowerCase() === topicNorm || v.tags.some((t) => t.toLowerCase() === topicNorm))
    );
    if (topicMatches.length >= 2) {
      const items = takeUnique(topicMatches, 4);
      sections.push({
        id: 'interest_spotlight',
        title: `Because you follow ${params.topInterestTopic}`,
        videos: items,
      });
    }
  }

  const newCreatorPool =
    params.newCreators && params.newCreators.length > 0
      ? params.newCreators
      : params.recommended.filter((v) => v.subscriberCount > 0 && v.subscriberCount < 250_000);
  const diversifiedNewCreators = diversifyFeed(
    newCreatorPool.filter((v) => !usedIds.has(v.id)),
    1,
    1
  );
  if (diversifiedNewCreators.length >= 2) {
    const items = takeUnique(diversifiedNewCreators, 4);
    if (items.length >= 2) {
      sections.push({
        id: 'discover_new_creators',
        title: 'Discover new creators',
        videos: items,
      });
    }
  }

  if (params.preferredLanguage && params.preferredLanguage !== 'All') {
    const langNorm = params.preferredLanguage.toLowerCase();
    const langMatches = params.recommended.filter(
      (v) => !usedIds.has(v.id) && v.language.toLowerCase() === langNorm
    );
    if (langMatches.length >= 2) {
      const items = takeUnique(langMatches, 4);
      sections.push({
        id: 'popular_language',
        title: `Popular in ${params.preferredLanguage}`,
        videos: items,
      });
    }
  }

  if (params.trending.length > 0) {
    const freshTrending = takeUnique(params.trending, 4);
    const items = freshTrending.length > 0 ? freshTrending : params.trending.slice(0, 4);
    sections.push({
      id: 'trending_india',
      title: 'Trending in India',
      videos: items,
    });
  }

  return sections;
}

export interface DailyViewPoint {
  date: string;
  label: string;
  views: number;
}

export function computeViewsLast30Days(params: {
  events: Array<{ createdAt: string }>;
  history: Array<{ watchedAt: string }>;
  videos: Array<{ createdAt: string; views: number }>;
  nowMs?: number;
}): DailyViewPoint[] {
  const now = params.nowMs ?? Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const buckets = new Map<string, number>();
  const orderedDates: string[] = [];

  for (let offset = 29; offset >= 0; offset--) {
    const d = new Date(now - offset * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    orderedDates.push(iso);
    buckets.set(iso, 0);
  }

  let trackedCount = 0;
  for (const ev of params.events) {
    const day = (ev.createdAt || '').slice(0, 10);
    if (buckets.has(day)) {
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
      trackedCount += 1;
    }
  }

  for (const h of params.history) {
    const day = (h.watchedAt || '').slice(0, 10);
    if (buckets.has(day)) {
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
      trackedCount += 1;
    }
  }

  const totalVideoViews = params.videos.reduce((acc, v) => acc + Math.max(0, v.views || 0), 0);
  const untrackedViews = Math.max(0, totalVideoViews - trackedCount);
  if (untrackedViews > 0) {
    let remaining = untrackedViews;
    for (const v of params.videos) {
      const day = (v.createdAt || '').slice(0, 10);
      const share = Math.min(remaining, Math.max(0, v.views || 0));
      if (share > 0 && buckets.has(day)) {
        buckets.set(day, (buckets.get(day) ?? 0) + share);
        remaining -= share;
      }
    }
    if (remaining > 0) {
      const todayKey = orderedDates[orderedDates.length - 1];
      buckets.set(todayKey, (buckets.get(todayKey) ?? 0) + remaining);
    }
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return orderedDates.map((iso) => {
    const [, mm, dd] = iso.split('-');
    const monthLabel = monthNames[Math.max(0, Number(mm) - 1)] || mm;
    return {
      date: iso,
      label: `${monthLabel} ${Number(dd)}`,
      views: buckets.get(iso) ?? 0,
    };
  });
}

