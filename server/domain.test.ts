import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  rankVideos,
  filterAndSortVideos,
  formatViews,
  formatDuration,
  parseIsoDurationToSeconds,
  formatRelativeTime,
  validateVideoInput,
  validateCommentInput,
  validateCopyrightClaim,
  dedupeById,
  buildUsernameSuggestions,
  type RankableVideo,
} from './domain';
import { computeViewsLast30Days, scoreCandidate, type CandidateVideo, type UserAiContext } from './recommendation';
import { buildPersonalizedDiscoveryQuery } from './discovery';
import { createSqlJsCompatDatabase } from './db';

test('password hashing and verification round-trip', () => {
  const hash = hashPassword('doptube-secret-99');
  assert.equal(verifyPassword('doptube-secret-99', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});

test('HMAC session token signs, verifies, and rejects tampering or expiry', () => {
  const secret = 'test-signing-key-32-chars-minimum';
  const validToken = signSessionToken(
    { userId: 'u_1', role: 'creator', exp: Date.now() + 60_000 },
    secret
  );
  const decoded = verifySessionToken(validToken, secret);
  assert.equal(decoded?.userId, 'u_1');
  assert.equal(decoded?.role, 'creator');

  const tampered = `${validToken.slice(0, -2)}xx`;
  assert.equal(verifySessionToken(tampered, secret), null);

  const expired = signSessionToken(
    { userId: 'u_1', role: 'user', exp: Date.now() - 1000 },
    secret
  );
  assert.equal(verifySessionToken(expired, secret), null);
});

test('recommendation engine boosts subscribed channels and preferred Indian languages', () => {
  const now = new Date('2026-11-25T10:00:00Z').getTime();
  const base: RankableVideo[] = [
    {
      id: 'v1',
      title: 'Generic Vlog',
      description: 'Daily vlog',
      tags: ['vlog'],
      category: 'Lifestyle',
      language: 'English',
      channelId: 'c_other',
      views: 10000,
      likes: 400,
      createdAt: '2026-11-24T10:00:00Z',
      isShort: false,
      isLive: false,
      visibility: 'public',
      durationSec: 600,
    },
    {
      id: 'v2',
      title: 'Electromagnetism JEE Revision',
      description: 'Physics lecture in Hindi',
      tags: ['physics', 'jee'],
      category: 'Education',
      language: 'Hindi',
      channelId: 'c_sub',
      views: 8000,
      likes: 500,
      createdAt: '2026-11-24T10:00:00Z',
      isShort: false,
      isLive: false,
      visibility: 'public',
      durationSec: 1200,
    },
  ];

  const ranked = rankVideos(
    base,
    {
      preferredLanguages: ['Hindi'],
      watchedCategories: { Education: 3 },
      likedCategories: { Education: 2 },
      subscribedChannelIds: new Set(['c_sub']),
      recentSearches: ['physics'],
    },
    now
  );

  assert.equal(ranked[0].id, 'v2');
});

test('search filters by query, category, language, duration, and sorts accurately', () => {
  const items: RankableVideo[] = [
    {
      id: '1',
      title: 'Tamil Cooking: Filter Coffee & Dosa',
      description: 'Traditional recipe',
      tags: ['cooking', 'tamil'],
      category: 'Cooking',
      language: 'Tamil',
      channelId: 'c1',
      views: 5000,
      likes: 200,
      createdAt: '2026-11-20T00:00:00Z',
      isShort: false,
      isLive: false,
      visibility: 'public',
      durationSec: 300,
    },
    {
      id: '2',
      title: 'Hindi Physics: Maxwell Equations',
      description: 'JEE Advanced prep',
      tags: ['jee', 'physics'],
      category: 'Education',
      language: 'Hindi',
      channelId: 'c2',
      views: 150000,
      likes: 9000,
      createdAt: '2026-11-24T00:00:00Z',
      isShort: false,
      isLive: false,
      visibility: 'public',
      durationSec: 1800,
    },
  ];

  const tamilCooking = filterAndSortVideos(items, { language: 'Tamil', category: 'Cooking' });
  assert.equal(tamilCooking.length, 1);
  assert.equal(tamilCooking[0].id, '1');

  const physicsQuery = filterAndSortVideos(items, { query: 'maxwell', duration: 'long' });
  assert.equal(physicsQuery.length, 1);
  assert.equal(physicsQuery[0].id, '2');
});

test('formatting helpers render views, duration, and relative timestamps cleanly', () => {
  assert.equal(formatViews(850), '850');
  assert.equal(formatViews(12400), '12.4K');
  assert.equal(formatViews(1500000), '1.5M');

  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3661), '1:01:01');
  assert.equal(parseIsoDurationToSeconds('PT14M25S'), 865);
  assert.equal(parseIsoDurationToSeconds('PT1H2M5S'), 3725);
  assert.equal(parseIsoDurationToSeconds('PT45S'), 45);
  assert.equal(parseIsoDurationToSeconds('P0D'), 0);

  const baseNow = new Date('2026-11-25T12:00:00Z').getTime();
  assert.equal(formatRelativeTime('2026-11-25T10:00:00Z', baseNow), '2h ago');
  assert.equal(formatRelativeTime('2026-11-22T12:00:00Z', baseNow), '3d ago');
});

test('validation helpers catch invalid video, comment, and copyright inputs', () => {
  assert.ok(validateVideoInput({ title: 'ab', category: 'Education', language: 'Hindi' }));
  assert.equal(
    validateVideoInput({ title: 'Valid Video Title', category: 'Education', language: 'Hindi', visibility: 'public' }),
    null
  );
  assert.ok(validateCommentInput('   '));
  assert.equal(validateCommentInput('Great explanation!'), null);
  assert.ok(validateCopyrightClaim({ claimantName: 'A', claimantEmail: 'bad', reason: 'short' }));
  assert.equal(
    validateCopyrightClaim({
      claimantName: 'Studio India Pvt Ltd',
      claimantEmail: 'legal@studioindia.in',
      reason: 'Original master audio owned exclusively by Studio India.',
    }),
    null
  );
});

test('cold-start session token preserves extended identity claims for serverless hydration', () => {
  const secret = 'test-signing-key-32-chars-minimum';
  const token = signSessionToken(
    {
      userId: 'u_vercel_99',
      role: 'user',
      exp: Date.now() + 60_000,
      name: 'Aditya Choudhary',
      email: 'aditya@example.com',
      handle: '@XAdityaChoudhary',
      preferredLanguage: 'Hindi',
      birthday: '2001-05-14',
    },
    secret
  );
  const verified = verifySessionToken(token, secret);
  assert.ok(verified);
  assert.equal(verified?.name, 'Aditya Choudhary');
  assert.equal(verified?.email, 'aditya@example.com');
  assert.equal(verified?.handle, '@XAdityaChoudhary');
  assert.equal(verified?.preferredLanguage, 'Hindi');
  assert.equal(verified?.birthday, '2001-05-14');
});

test('dedupeById removes duplicate Shorts/video entries while preserving order', () => {
  const deduped = dedupeById([
    { id: 'v_1', title: 'First' },
    { id: 'v_2', title: 'Second' },
    { id: 'v_1', title: 'Duplicate First' },
    { id: 'v_3', title: 'Third' },
  ]);
  assert.deepEqual(
    deduped.map((item) => item.id),
    ['v_1', 'v_2', 'v_3']
  );
  assert.equal(deduped[0].title, 'First');
});

test('buildUsernameSuggestions generates unique @-prefixed X-style handles', () => {
  const handles = buildUsernameSuggestions('Aditya Choudhary!');
  assert.ok(handles.length >= 4);
  assert.ok(handles.every((h) => /^@[a-z0-9_]+$/.test(h)));
  assert.equal(new Set(handles).size, handles.length);
});

test('computeViewsLast30Days returns 30 ordered points combining events, watch history, and video views', () => {
  const nowMs = new Date('2026-11-25T12:00:00Z').getTime();
  const points = computeViewsLast30Days({
    events: [
      { createdAt: '2026-11-25T08:00:00Z' },
      { createdAt: '2026-11-24T10:00:00Z' },
      { createdAt: '2026-11-24T11:00:00Z' },
    ],
    history: [{ watchedAt: '2026-11-25T09:00:00Z' }],
    videos: [{ createdAt: '2026-11-20T05:00:00Z', views: 14 }],
    nowMs,
  });

  assert.equal(points.length, 30);
  assert.equal(points[29].date, '2026-11-25');
  assert.equal(points[29].views, 2);
  assert.equal(points[28].date, '2026-11-24');
  assert.equal(points[28].views, 2);
  const nov20 = points.find((p) => p.date === '2026-11-20');
  assert.equal(nov20?.views, 10);
});

test('buildPersonalizedDiscoveryQuery adapts queries using user interests, searches, and language', () => {
  const homeQ = buildPersonalizedDiscoveryQuery({
    interestTopics: ['Physics', 'Space'],
    recentSearches: ['quantum mechanics'],
    preferredLanguage: 'Hindi',
    shorts: false,
    seed: 0,
  });
  assert.ok(homeQ.toLowerCase().includes('quantum mechanics'));
  assert.ok(homeQ.toLowerCase().includes('hindi'));

  const shortsQ = buildPersonalizedDiscoveryQuery({
    interestTopics: ['Cricket'],
    preferredLanguage: 'Tamil',
    shorts: true,
    seed: 1,
  });
  assert.ok(shortsQ.toLowerCase().includes('shorts'));
  assert.ok(shortsQ.toLowerCase().includes('cricket'));
  assert.ok(shortsQ.toLowerCase().includes('tamil'));
});

test('scoreCandidate demotes unrelated low-view native uploads from other creators', () => {
  const nowMs = new Date('2026-11-25T12:00:00Z').getTime();
  const ctx: UserAiContext = {
    userId: 'viewer_1',
    preferredLanguages: ['Hindi'],
    preferredCategories: ['Technology'],
    selectedInterests: ['Technology', 'AI'],
    subscribedChannelIds: new Set(),
    interestScores: { Technology: 90, AI: 75 },
    watchedVideoIds: new Set(),
    completedVideoIds: new Set(),
    skippedVideoIds: new Set(),
    likedVideoIds: new Set(),
    dislikedVideoIds: new Set(),
    creatorWatchCounts: {},
    recentSearches: ['typescript'],
    personalizationEnabled: true,
    validation: {
      viewerUserId: 'viewer_1',
      restrictedMode: false,
      blockedCreators: new Set(),
      blockedTopics: new Set(),
      notInterestedVideoIds: new Set(),
      moderatedVideoIds: new Set(),
      region: 'IN',
    },
  };

  const unrelatedLowViewNative: CandidateVideo = {
    id: 'nat_1',
    title: 'My random room tour',
    description: 'Testing upload',
    tags: ['random'],
    category: 'Lifestyle',
    language: 'English',
    channelId: 'ch_other',
    channelName: 'Other Creator',
    channelHandle: '@othercreator',
    channelAvatar: '/api/avatars/ch_other.svg',
    subscriberCount: 12,
    ownerUserId: 'creator_other',
    views: 5,
    likes: 0,
    dislikes: 0,
    createdAt: '2026-11-25T11:30:00Z',
    isShort: false,
    isLive: false,
    visibility: 'public',
    status: 'published',
    durationSec: 120,
    channelVerified: false,
    sourceType: 'native',
    videoUrl: '/api/media/nat_1.mp4',
    hlsUrl: null,
    thumbnailUrl: '/api/thumbnails/card/nat_1.svg',
  };

  const matchedTechVideo: CandidateVideo = {
    id: 'ext_1',
    title: 'TypeScript & AI Architecture Deep Dive in Hindi',
    description: 'Complete practical tutorial on TypeScript and AI agents',
    tags: ['typescript', 'ai', 'technology'],
    category: 'Technology',
    language: 'Hindi',
    channelId: 'ch_tech',
    channelName: 'Tech India',
    channelHandle: '@techindia',
    channelAvatar: '/api/avatars/ch_tech.svg',
    subscriberCount: 150000,
    views: 45000,
    likes: 3200,
    dislikes: 12,
    createdAt: '2026-11-24T12:00:00Z',
    isShort: false,
    isLive: false,
    visibility: 'public',
    status: 'published',
    durationSec: 950,
    channelVerified: true,
    sourceType: 'external',
    videoUrl: '',
    hlsUrl: null,
    externalEmbedUrl: 'https://www.youtube-nocookie.com/embed/ext_1',
    thumbnailUrl: '/api/thumbnails/card/ext_1.svg',
  };

  const lowScore = scoreCandidate(unrelatedLowViewNative, ctx, undefined, nowMs);
  const techScore = scoreCandidate(matchedTechVideo, ctx, undefined, nowMs);
  assert.ok(techScore > lowScore + 25, `Expected matched tech score (${techScore}) to beat unrelated low-view native (${lowScore})`);
});

test('createSqlJsCompatDatabase initializes schema in pure JS and runs queries without native sqlite', async () => {
  const compatDb = await createSqlJsCompatDatabase();
  compatDb
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, role, preferred_language, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run('u_sqljs_1', 'SqlJs Tester', 'sqljs@example.com', 'hash', 'creator', 'Hindi', '2026-11-25T10:00:00Z');

  const row = compatDb.prepare('SELECT id, name, preferred_language FROM users WHERE id = ?').get('u_sqljs_1') as
    | { id: string; name: string; preferred_language: string }
    | undefined;
  assert.equal(row?.id, 'u_sqljs_1');
  assert.equal(row?.name, 'SqlJs Tester');
  assert.equal(row?.preferred_language, 'Hindi');
});


