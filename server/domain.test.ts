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
  type RankableVideo,
} from './domain';

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
