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

export function scoreCandidate(
  video: CandidateVideo,
  ctx: UserAiContext,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  nowMs = Date.now()
): number {
  const haystack = `${video.title} ${video.description} ${video.category} ${video.tags.join(' ')}`.toLowerCase();

  // 1. User Interest Match (0..1)
  let interestSum = 0;
  let interestHits = 0;
  for (const [topic, score] of Object.entries(ctx.interestScores)) {
    const t = topic.toLowerCase();
    if (video.category.toLowerCase() === t || video.tags.some((tg) => tg.toLowerCase() === t) || haystack.includes(t)) {
      interestSum += score / 100;
      interestHits += 1;
    }
  }
  const userInterestMatch = ctx.personalizationEnabled
    ? Math.min(1, interestHits > 0 ? interestSum / Math.min(3, interestHits) : 0.15)
    : 0.2;

  // 2. Topic & Language Match (0..1)
  let langMatch = ctx.preferredLanguages.includes(video.language) ? 0.6 : 0.15;
  if (ctx.preferredCategories.includes(video.category)) langMatch += 0.3;
  for (const term of ctx.recentSearches) {
    if (term.length >= 2 && haystack.includes(term.toLowerCase())) {
      langMatch += 0.2;
      break;
    }
  }
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
  const subScore = ctx.subscribedChannelIds.has(video.channelId) ? 0.75 : 0;
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

  return Number((weighted * 100).toFixed(3));
}

export function diversifyFeed<T extends { channelId: string; category: string }>(items: T[], maxConsecutiveCreator = 1, maxConsecutiveCategory = 2): T[] {
  const remaining = [...items];
  const output: T[] = [];

  while (remaining.length > 0) {
    let pickedIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const recentCreators = output.slice(-maxConsecutiveCreator).map((x) => x.channelId);
      const recentCats = output.slice(-maxConsecutiveCategory).map((x) => x.category);

      const creatorClash = recentCreators.length === maxConsecutiveCreator && recentCreators.every((c) => c === cand.channelId);
      const catClash = recentCats.length === maxConsecutiveCategory && recentCats.every((c) => c === cand.category);

      if (!creatorClash && !catClash) {
        pickedIdx = i;
        break;
      }
    }
    output.push(remaining.splice(pickedIdx, 1)[0]);
  }
  return output;
}

export function generatePersonalizedRecommendations(
  candidates: CandidateVideo[],
  ctx: UserAiContext,
  opts?: { weights?: RankingWeights; nowMs?: number; limit?: number; cursor?: number }
): { items: Array<CandidateVideo & { score: number }>; nextCursor: number | null; hasMore: boolean; total: number } {
  const validCandidates = candidates.filter((c) => validateContentCandidate(c, ctx.validation).valid);

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = validCandidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const scored = unique
    .map((v) => ({
      ...v,
      score: scoreCandidate(v, ctx, opts?.weights ?? DEFAULT_RANKING_WEIGHTS, opts?.nowMs),
    }))
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

export function rankTrendingIndia(candidates: CandidateVideo[], ctx: ValidationContext, nowMs = Date.now()): CandidateVideo[] {
  const valid = candidates.filter((c) => validateContentCandidate(c, ctx).valid);
  return [...valid].sort((a, b) => {
    const score = (v: CandidateVideo) => {
      const ageHours = Math.max(1, (nowMs - new Date(v.createdAt).getTime()) / (1000 * 60 * 60));
      const velocity = v.views / Math.pow(ageHours + 2, 0.75);
      const engagement = (v.likes * 3) / Math.max(50, v.views);
      const spamDampener = v.dislikes > v.likes ? 0.5 : 1;
      return (Math.log10(Math.max(10, v.views)) * 15 + Math.log10(Math.max(1, velocity)) * 20 + engagement * 40) * spamDampener;
    };
    return score(b) - score(a);
  });
}

export function rankRelatedVideos(
  currentVideo: CandidateVideo,
  candidates: CandidateVideo[],
  ctx: UserAiContext
): CandidateVideo[] {
  const valid = candidates.filter(
    (c) => c.id !== currentVideo.id && !c.isShort && validateContentCandidate(c, ctx.validation).valid
  );
  const currentTags = new Set(currentVideo.tags.map((t) => t.toLowerCase()));

  const sorted = [...valid].sort((a, b) => {
    const simScore = (v: CandidateVideo) => {
      let s = scoreCandidate(v, ctx) * 0.4;
      if (v.category === currentVideo.category) s += 35;
      if (v.language === currentVideo.language) s += 18;
      if (v.channelId === currentVideo.channelId) s += 12;
      for (const tag of v.tags) {
        if (currentTags.has(tag.toLowerCase())) s += 12;
      }
      return s;
    };
    return simScore(b) - simScore(a);
  });

  return diversifyFeed(sorted, 2, 3);
}

export function rankShortsFeed(candidates: CandidateVideo[], ctx: UserAiContext, nowMs = Date.now()): CandidateVideo[] {
  const valid = candidates.filter((c) => c.isShort && validateContentCandidate(c, ctx.validation).valid);
  const shortsWeights: RankingWeights = {
    userInterestMatch: 0.25,
    topicLanguageMatch: 0.15,
    explicitFeedback: 0.20,
    predictedSatisfaction: 0.20,
    contentQualitySafety: 0.05,
    creatorAffinity: 0.05,
    freshnessBoost: 0.05,
    explorationDiversity: 0.05,
  };
  return diversifyFeed(
    valid
      .map((v) => ({ ...v, _s: scoreCandidate(v, ctx, shortsWeights, nowMs) }))
      .sort((a, b) => b._s - a._s),
    1,
    2
  );
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
}): HomepageSection[] {
  const sections: HomepageSection[] = [];

  if (params.continueWatching.length > 0) {
    sections.push({
      id: 'continue_watching',
      title: 'Continue watching',
      videos: params.continueWatching.slice(0, 4),
    });
  }

  if (params.subscribedVideos.length > 0) {
    sections.push({
      id: 'from_subscriptions',
      title: 'From creators you follow',
      videos: params.subscribedVideos.slice(0, 4),
    });
  }

  if (params.topInterestTopic) {
    const topicMatches = params.recommended.filter(
      (v) =>
        v.category.toLowerCase() === params.topInterestTopic!.toLowerCase() ||
        v.tags.some((t) => t.toLowerCase() === params.topInterestTopic!.toLowerCase())
    );
    if (topicMatches.length >= 2) {
      sections.push({
        id: 'interest_spotlight',
        title: `Because you follow ${params.topInterestTopic}`,
        videos: topicMatches.slice(0, 4),
      });
    }
  }

  if (params.trending.length > 0) {
    sections.push({
      id: 'trending_india',
      title: 'Trending in India',
      videos: params.trending.slice(0, 4),
    });
  }

  return sections;
}
