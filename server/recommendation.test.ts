import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInterestDecayAndDelta,
  buildConditionalSections,
  computeInterestDelta,
  generatePersonalizedRecommendations,
  rankRelatedVideos,
  rankShortsFeed,
  rankTrendingIndia,
  resolveNextVideo,
  type CandidateVideo,
  type UserAiContext,
} from './recommendation';
import { detectInteractionAnomaly, validateContentCandidate, type ValidationContext } from './validation';

function makeCandidate(overrides: Partial<CandidateVideo> = {}): CandidateVideo {
  return {
    id: 'vid_1',
    title: 'Quantum Mechanics Lecture in Hindi',
    description: 'Detailed explanation of wave-particle duality for Indian students.',
    tags: ['physics', 'education', 'jee'],
    category: 'Education',
    language: 'Hindi',
    channelId: 'ch_1',
    channelName: 'Physics Bharat',
    channelHandle: '@physicsbharat',
    channelAvatar: '/api/avatars/ch_1.svg',
    channelVerified: true,
    subscriberCount: 50000,
    views: 12000,
    likes: 850,
    dislikes: 12,
    createdAt: '2026-11-24T12:00:00Z',
    isShort: false,
    isLive: false,
    visibility: 'public',
    status: 'published',
    sourceType: 'native',
    videoUrl: '/api/stream/vid_1',
    hlsUrl: null,
    thumbnailUrl: '/api/thumbnails/vid_1.jpg',
    durationSec: 600,
    ...overrides,
  };
}

function makeValidationCtx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    blockedCreators: new Set<string>(),
    blockedTopics: new Set<string>(),
    notInterestedVideoIds: new Set<string>(),
    moderatedVideoIds: new Set<string>(),
    restrictedMode: false,
    region: 'IN',
    ...overrides,
  };
}

function makeAiContext(overrides: Partial<UserAiContext> = {}): UserAiContext {
  return {
    preferredLanguages: ['Hindi', 'English'],
    preferredCategories: ['Education'],
    selectedInterests: ['Education'],
    interestScores: { Education: 90, Physics: 85 },
    subscribedChannelIds: new Set<string>(),
    creatorWatchCounts: {},
    likedVideoIds: new Set<string>(),
    dislikedVideoIds: new Set<string>(),
    watchedVideoIds: new Set<string>(),
    completedVideoIds: new Set<string>(),
    skippedVideoIds: new Set<string>(),
    recentSearches: [],
    personalizationEnabled: true,
    validation: makeValidationCtx(),
    ...overrides,
  };
}

test('validateContentCandidate rejects private, unpublished, blocked, moderated, and broken streams', () => {
  const ctx = makeValidationCtx({
    viewerUserId: 'u_viewer',
    blockedCreators: new Set(['ch_blocked']),
    blockedTopics: new Set(['crypto']),
    notInterestedVideoIds: new Set(['v_ni']),
    moderatedVideoIds: new Set(['v_mod']),
    restrictedMode: true,
  });

  assert.equal(validateContentCandidate(makeCandidate({ visibility: 'private', ownerUserId: 'u_other' }), ctx).reason, 'not_public');
  assert.equal(validateContentCandidate(makeCandidate({ visibility: 'private', ownerUserId: 'u_viewer' }), ctx).valid, true);
  assert.equal(validateContentCandidate(makeCandidate({ status: 'processing' }), ctx).reason, 'not_published');
  assert.equal(validateContentCandidate(makeCandidate({ thumbnailUrl: '' }), ctx).reason, 'missing_thumbnail');
  assert.equal(validateContentCandidate(makeCandidate({ videoUrl: '', hlsUrl: null }), ctx).reason, 'missing_native_stream');
  assert.equal(
    validateContentCandidate(makeCandidate({ sourceType: 'external', videoUrl: '', externalEmbedUrl: 'http://insecure.test' }), ctx).reason,
    'invalid_external_embed'
  );
  assert.equal(validateContentCandidate(makeCandidate({ channelId: 'ch_blocked' }), ctx).reason, 'blocked_creator');
  assert.equal(validateContentCandidate(makeCandidate({ id: 'v_ni' }), ctx).reason, 'not_interested');
  assert.equal(validateContentCandidate(makeCandidate({ id: 'v_mod' }), ctx).reason, 'moderated');
  assert.equal(validateContentCandidate(makeCandidate({ tags: ['crypto', 'finance'] }), ctx).reason, 'blocked_topic');
  assert.equal(validateContentCandidate(makeCandidate({ title: 'NSFW explicit clip' }), ctx).reason, 'restricted_mode');
  assert.equal(validateContentCandidate(makeCandidate({ regionCode: 'US' }), ctx).reason, 'region_unavailable');

  assert.equal(
    validateContentCandidate(
      makeCandidate({
        id: 'ext_valid',
        sourceType: 'external',
        videoUrl: '',
        externalEmbedUrl: 'https://www.youtube.com/embed/abc123',
      }),
      ctx
    ).valid,
    true
  );
});

test('empty candidate pool returns zero items (never invents dummy videos)', () => {
  const result = generatePersonalizedRecommendations([], makeAiContext());
  assert.deepEqual(result.items, []);
  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, null);
  assert.equal(result.total, 0);
});

test('two users with different interest profiles receive personalized distinct rankings', () => {
  const physicsVid = makeCandidate({
    id: 'v_physics',
    title: 'Electromagnetism JEE Physics Revision',
    category: 'Education',
    tags: ['physics', 'jee'],
    channelId: 'ch_edu',
    views: 5000,
    likes: 400,
  });
  const comedyVid = makeCandidate({
    id: 'v_comedy',
    title: 'Standup Comedy Special Mumbai',
    category: 'Comedy',
    tags: ['comedy', 'entertainment'],
    channelId: 'ch_fun',
    views: 5200,
    likes: 410,
  });

  const eduUser = makeAiContext({
    preferredCategories: ['Education'],
    interestScores: { Education: 95, Physics: 90, Comedy: 10 },
  });
  const comedyUser = makeAiContext({
    preferredCategories: ['Comedy'],
    interestScores: { Comedy: 95, Entertainment: 90, Education: 10 },
  });

  const eduRecs = generatePersonalizedRecommendations([physicsVid, comedyVid], eduUser, {
    nowMs: new Date('2026-11-25T10:00:00Z').getTime(),
  });
  const comedyRecs = generatePersonalizedRecommendations([physicsVid, comedyVid], comedyUser, {
    nowMs: new Date('2026-11-25T10:00:00Z').getTime(),
  });

  assert.equal(eduRecs.items[0].id, 'v_physics');
  assert.equal(comedyRecs.items[0].id, 'v_comedy');
});

test('behavior deltas, time decay, trending, related, and shorts ranking work cleanly', () => {
  assert.ok(computeInterestDelta('completion') > computeInterestDelta('progress_25'));
  assert.ok(computeInterestDelta('not_interested') < 0);
  const boosted = applyInterestDecayAndDelta(60, 10, 0);
  assert.equal(boosted, 70);
  const decayed = applyInterestDecayAndDelta(80, 0, 10);
  assert.ok(decayed < 80 && decayed > 50);

  const v1 = makeCandidate({ id: 'v1', views: 500, likes: 10, createdAt: '2026-11-20T00:00:00Z' });
  const v2 = makeCandidate({ id: 'v2', views: 250000, likes: 18000, createdAt: '2026-11-25T08:00:00Z', channelId: 'ch_2' });
  const vShort = makeCandidate({ id: 'vs1', isShort: true, durationSec: 35, channelId: 'ch_3' });

  const trending = rankTrendingIndia([v1, v2], makeValidationCtx(), new Date('2026-11-25T12:00:00Z').getTime());
  assert.equal(trending[0].id, 'v2');

  const related = rankRelatedVideos(v1, [v1, v2, makeCandidate({ id: 'v3', category: 'Education', channelId: 'ch_1' })], makeAiContext());
  assert.ok(related.every((r) => r.id !== 'v1'));

  const shorts = rankShortsFeed([v1, vShort], makeAiContext());
  assert.equal(shorts.length, 1);
  assert.equal(shorts[0].id, 'vs1');
});

test('resolveNextVideo prioritizes repeat > queue > playlist > recommended', () => {
  const rec = [makeCandidate({ id: 'rec_1' }), makeCandidate({ id: 'rec_2' })];
  const current = makeCandidate({ id: 'cur_1' });

  assert.deepEqual(
    resolveNextVideo({
      currentVideoId: 'cur_1',
      mode: 'repeat',
      queueVideoIds: ['q_1'],
      playlistVideoIds: ['pl_1'],
      recommendedVideos: rec,
      currentVideo: current,
    }),
    { nextVideoId: 'cur_1', source: 'repeat' }
  );

  assert.deepEqual(
    resolveNextVideo({
      currentVideoId: 'cur_1',
      mode: 'queue',
      queueVideoIds: ['cur_1', 'q_2'],
      playlistVideoIds: ['pl_1'],
      recommendedVideos: rec,
      currentVideo: current,
    }),
    { nextVideoId: 'q_2', source: 'queue' }
  );

  assert.deepEqual(
    resolveNextVideo({
      currentVideoId: 'pl_1',
      mode: 'playlist',
      queueVideoIds: [],
      playlistVideoIds: ['pl_1', 'pl_2'],
      recommendedVideos: rec,
      currentVideo: current,
    }),
    { nextVideoId: 'pl_2', source: 'playlist' }
  );

  assert.deepEqual(
    resolveNextVideo({
      currentVideoId: 'cur_1',
      mode: 'recommended',
      queueVideoIds: [],
      playlistVideoIds: [],
      recommendedVideos: rec,
      currentVideo: current,
    }),
    { nextVideoId: 'rec_1', source: 'recommended' }
  );
});

test('conditional sections only emit non-empty sections and detectInteractionAnomaly flags rapid bursts', () => {
  const sections = buildConditionalSections({
    recommended: [makeCandidate({ id: 'r1' }), makeCandidate({ id: 'r2', channelId: 'ch_2' })],
    continueWatching: [],
    trending: [makeCandidate({ id: 't1' })],
    subscribedVideos: [],
    topInterestTopic: 'Education',
  });
  assert.equal(sections.some((s) => s.id === 'continue_watching'), false);
  assert.equal(sections.some((s) => s.id === 'interest_spotlight'), true);
  assert.equal(sections.some((s) => s.id === 'trending_india'), true);

  const burst = Array.from({ length: 16 }, (_, i) => 1000 + i * 100);
  assert.equal(detectInteractionAnomaly(burst, 10_000, 16), true);
  assert.equal(detectInteractionAnomaly([1000, 5000, 9000], 10_000, 16), false);
});

test('rankRelatedVideos enforces creator diversity and excludes Shorts; rankShortsFeed excludes full videos', () => {
  const current = makeCandidate({ id: 'cur', channelId: 'ch_main', category: 'Education' });
  const sameCreatorVideos = Array.from({ length: 5 }, (_, i) =>
    makeCandidate({ id: `same_${i}`, channelId: 'ch_main', category: 'Education', views: 50000 - i * 100 })
  );
  const otherCreators = [
    makeCandidate({ id: 'other_1', channelId: 'ch_other_1', category: 'Education', views: 40000 }),
    makeCandidate({ id: 'other_2', channelId: 'ch_other_2', category: 'Education', views: 39000 }),
    makeCandidate({ id: 'other_3', channelId: 'ch_other_3', category: 'Technology', views: 38000 }),
    makeCandidate({ id: 'short_rel', channelId: 'ch_main', isShort: true, durationSec: 25 }),
  ];

  const related = rankRelatedVideos(current, [...sameCreatorVideos, ...otherCreators], makeAiContext());
  assert.equal(related.some((v) => v.id === 'short_rel'), false);
  // Check no more than 2 consecutive items share the same channelId
  for (let i = 2; i < related.length; i++) {
    const allSame = related[i].channelId === related[i - 1].channelId && related[i].channelId === related[i - 2].channelId;
    assert.equal(allSame, false);
  }

  const shortsOnly = rankShortsFeed(
    [
      makeCandidate({ id: 'full_1', isShort: false, durationSec: 400 }),
      makeCandidate({ id: 'short_1', isShort: true, durationSec: 30, channelId: 'ch_a' }),
      makeCandidate({ id: 'short_2', isShort: true, durationSec: 45, channelId: 'ch_b' }),
    ],
    makeAiContext()
  );
  assert.equal(shortsOnly.length, 2);
  assert.ok(shortsOnly.every((v) => v.isShort));
});

