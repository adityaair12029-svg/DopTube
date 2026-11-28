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
  isLowQualitySearchQuery,
  rankSearchSuggestions,
  type RankableVideo,
} from './domain';
import { computeViewsLast30Days, diversifyFeed, scoreCandidate, type CandidateVideo, type UserAiContext } from './recommendation';
import { buildPersonalizedDiscoveryQuery, mapDailymotionItem, parseAtomRssFeed, parseYouTubeSearchHtml } from './discovery';
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

test('buildPersonalizedDiscoveryQuery adapts queries without locking Shorts onto a single search term', () => {
  const homeInitial = buildPersonalizedDiscoveryQuery({
    interestTopics: ['Physics', 'Space'],
    recentSearches: ['samay raina'],
    preferredLanguage: 'Hindi',
    shorts: false,
    seed: 0,
  });
  assert.ok(homeInitial.toLowerCase().includes('physics'));
  assert.equal(homeInitial.toLowerCase().includes('samay raina'), false);

  const homeRotated = buildPersonalizedDiscoveryQuery({
    interestTopics: ['Physics', 'Space'],
    recentSearches: ['quantum mechanics'],
    preferredLanguage: 'Hindi',
    shorts: false,
    seed: 1,
  });
  assert.ok(homeRotated.toLowerCase().includes('quantum mechanics'));
  assert.ok(homeRotated.toLowerCase().includes('hindi'));

  const shortsQ = buildPersonalizedDiscoveryQuery({
    interestTopics: ['Cricket'],
    recentSearches: ['samay raina'],
    preferredLanguage: 'Tamil',
    shorts: true,
    seed: 1,
  });
  assert.ok(shortsQ.toLowerCase().includes('shorts'));
  assert.ok(shortsQ.toLowerCase().includes('cricket'));
  assert.equal(shortsQ.toLowerCase().includes('samay raina'), false);
});

test('mapDailymotionItem converts Dailymotion metadata into dm_ playable discovery item', () => {
  const mapped = mapDailymotionItem({
    id: 'x9abc12',
    title: 'Samay Raina Standup Clip #shorts',
    description: 'Comedy special clip in Hindi',
    thumbnail_720_url: 'https://s1.dmcdn.net/v/test/720.jpg',
    duration: 48,
    views_total: 120000,
    likes_total: 5400,
    created_time: 1764000000,
    language: 'hi',
    channel: 'fun',
    'owner.username': 'ComedyClubIN',
    'owner.screenname': 'Comedy Club India',
    tags: ['comedy', 'shorts'],
  });
  assert.ok(mapped);
  assert.equal(mapped.id, 'dm_x9abc12');
  assert.equal(mapped.channelId, 'dm_ch_ComedyClubIN');
  assert.equal(mapped.isShort, true);
  assert.equal(mapped.category, 'Comedy');
  assert.equal(mapped.language, 'Hindi');
  assert.equal(mapped.externalEmbedUrl, 'https://www.dailymotion.com/embed/video/x9abc12?autoplay=1');
});

test('parseAtomRssFeed parses YouTube Atom XML entries and detects Shorts links', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
    <entry>
      <yt:videoId>abcShort123</yt:videoId>
      <yt:channelId>UC_test1</yt:channelId>
      <title>Quick Cricket Yorker &amp; Swing Tip</title>
      <link rel="alternate" href="https://www.youtube.com/shorts/abcShort123"/>
      <author><name>Cricket Lab India</name></author>
      <published>2026-11-25T08:00:00+00:00</published>
      <media:group>
        <media:thumbnail url="https://i1.ytimg.com/vi/abcShort123/hqdefault.jpg"/>
        <media:description>Fast bowling tip</media:description>
        <media:community>
          <media:starRating count="2400"/>
          <media:statistics views="85000"/>
        </media:community>
      </media:group>
    </entry>
  </feed>`;
  const items = parseAtomRssFeed(sampleXml, {
    channelId: 'UC_test1',
    category: 'Cricket',
    language: 'Hindi',
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'ext_abcShort123');
  assert.equal(items[0].isShort, true);
  assert.equal(items[0].views, 85000);
  assert.equal(items[0].title, 'Quick Cricket Yorker & Swing Tip');
});

test('diversifyFeed caps single-creator flooding and duplicate reuploads in top window', () => {
  const candidates = [
    { id: '1', channelId: 'ch_spam', category: 'Comedy', title: 'Samay Raina Best Comedy Moments' },
    { id: '2', channelId: 'ch_spam', category: 'Comedy', title: 'Samay Raina Funny Clip Part 2' },
    { id: '3', channelId: 'ch_spam', category: 'Comedy', title: 'Samay Raina Live Stream Highlights' },
    { id: '4', channelId: 'ch_mirror', category: 'Comedy', title: 'Samay Raina Best Comedy Moments Reupload' },
    { id: '5', channelId: 'ch_tech', category: 'Technology', title: 'AI Smartphone Review India' },
    { id: '6', channelId: 'ch_science', category: 'Science', title: 'ISRO Next Lunar Mission Explained' },
    { id: '7', channelId: 'ch_cricket', category: 'Cricket', title: 'Bumrah Yorkers Compilation' },
  ];
  const diverse = diversifyFeed(candidates, 1, 2, 2, 15);
  const top5Creators = diverse.slice(0, 5).map((v) => v.channelId);
  assert.equal(top5Creators.filter((c) => c === 'ch_spam').length <= 2, true);
  assert.notEqual(diverse[0].channelId, diverse[1].channelId);
  // Ensure normalized duplicate title was pushed back behind unique topics
  const techIndex = diverse.findIndex((v) => v.id === '5');
  const dupIndex = diverse.findIndex((v) => v.id === '4');
  assert.ok(techIndex < dupIndex);
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

test('filterAndSortVideos applies uploadDate window (today, week, month) relative to nowMs', () => {
  const nowMs = new Date('2026-11-28T12:00:00Z').getTime();
  const baseVideo = (id: string, createdAt: string): RankableVideo => ({
    id,
    title: `Video ${id}`,
    description: 'Testing upload date filter',
    tags: ['test'],
    category: 'Education',
    language: 'Hindi',
    channelId: 'ch_test',
    views: 1000,
    likes: 50,
    createdAt,
    isShort: false,
    isLive: false,
    visibility: 'public',
    durationSec: 300,
  });

  const pool = [
    baseVideo('today_v', '2026-11-28T06:00:00Z'),
    baseVideo('week_v', '2026-11-24T12:00:00Z'),
    baseVideo('month_v', '2026-11-05T12:00:00Z'),
    baseVideo('old_v', '2026-09-01T12:00:00Z'),
  ];

  assert.deepEqual(
    filterAndSortVideos(pool, { uploadDate: 'today', nowMs }).map((v) => v.id),
    ['today_v']
  );
  assert.deepEqual(
    filterAndSortVideos(pool, { uploadDate: 'week', nowMs }).map((v) => v.id),
    ['today_v', 'week_v']
  );
  assert.deepEqual(
    filterAndSortVideos(pool, { uploadDate: 'month', nowMs }).map((v) => v.id),
    ['today_v', 'week_v', 'month_v']
  );
  assert.equal(filterAndSortVideos(pool, { uploadDate: 'any', nowMs }).length, 4);
});

test('mapDailymotionItem decodes HTML entities and tags cleanly in metadata', () => {
  const mapped = mapDailymotionItem({
    id: 'x9html1',
    title: 'ISRO &amp; Rocket Science &#39;India&#39; Explained',
    description: '&lt;p&gt;Live launch &amp; orbit mechanics&lt;/p&gt;',
    thumbnail_720_url: 'https://s1.dmcdn.net/v/html/720.jpg',
    duration: 320,
    views_total: 25000,
    likes_total: 900,
    created_time: 1764000000,
    language: 'en',
    channel: 'tech',
    'owner.username': 'SpaceIN',
    'owner.screenname': 'Space &amp; Science IN',
    tags: ['isro', 'space'],
  });
  assert.ok(mapped);
  assert.equal(mapped.title, "ISRO & Rocket Science 'India' Explained");
  assert.equal(mapped.channelName, 'Space & Science IN');
  assert.equal(mapped.description.includes('&amp;'), false);
});

test('createSqlJsCompatDatabase self-heals cleanly when disk snapshot bytes are malformed', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpFile = path.join(os.tmpdir(), `doptube-corrupt-${Date.now()}.sqlite`);
  fs.writeFileSync(tmpFile, Buffer.from('not-a-valid-sqlite-header-or-corrupt-btree-pages'));
  try {
    const recovered = await createSqlJsCompatDatabase(tmpFile);
    const qc = recovered.prepare('PRAGMA quick_check(1)').get() as { quick_check?: string } | undefined;
    assert.equal(qc?.quick_check, 'ok');
    recovered
      .prepare(`INSERT INTO categories (name) VALUES (?)`)
      .run('RecoveredCategory');
    const row = recovered.prepare(`SELECT name FROM categories WHERE name = ?`).get('RecoveredCategory') as
      | { name: string }
      | undefined;
    assert.equal(row?.name, 'RecoveredCategory');
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
});

test('filterAndSortVideos suppresses 10-150 view unverified spam and ranks verified popular creators first', () => {
  const mk = (overrides: Partial<RankableVideo>): RankableVideo => ({
    id: 'v',
    title: 'Physics Lecture',
    description: 'Science explanation',
    tags: ['physics'],
    category: 'Education',
    language: 'Hindi',
    channelId: 'ch1',
    channelName: 'Creator',
    channelVerified: false,
    subscriberCount: 100,
    views: 120,
    likes: 5,
    createdAt: '2026-11-26T10:00:00Z',
    isShort: false,
    isLive: false,
    visibility: 'public',
    durationSec: 600,
    ...overrides,
  });

  const pool: RankableVideo[] = [
    mk({ id: 'spam_120', title: 'Arijit Singh Live Song', views: 120, channelVerified: false, subscriberCount: 40 }),
    mk({ id: 'spam_90', title: 'Arijit Singh Romantic Songs', views: 90, channelVerified: false, subscriberCount: 15 }),
    mk({
      id: 'popular_ver',
      title: 'Arijit Singh Best Songs Jukebox',
      views: 3_499_523,
      channelName: 'Sony Music India',
      channelVerified: true,
      subscriberCount: 55_000_000,
    }),
    mk({
      id: 'popular_unver',
      title: 'Arijit Singh Hit Songs Collection',
      views: 850_000,
      channelName: 'Melodies IN',
      channelVerified: false,
      subscriberCount: 120_000,
    }),
    mk({
      id: 'popular_tseries',
      title: 'Tum Hi Ho - Arijit Singh Full Song',
      views: 45_000_000,
      channelName: 'T-Series',
      channelVerified: true,
      subscriberCount: 270_000_000,
    }),
  ];

  const results = filterAndSortVideos(pool, { query: 'Arijit Singh', sort: 'relevance' });
  assert.equal(results.some((v) => v.id === 'spam_120' || v.id === 'spam_90'), false);
  assert.equal(results[0].channelVerified, true);
  assert.ok(results[0].views >= 3_000_000);
});

test('parseYouTubeSearchHtml parses Indian grouped views, durations, live badges, and channels', () => {
  const nowMs = new Date('2026-11-28T12:00:00Z').getTime();
  const sampleData = {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    {
                      channelRenderer: {
                        channelId: 'UCiGyWN6DEbnj2alu7iapuKQ',
                        title: { simpleText: 'Physics Wallah - Alakh Pandey' },
                        subscriberCountText: { simpleText: '@PhysicsWallah' },
                        videoCountText: { simpleText: '1.44\u00a0crore subscribers' },
                        ownerBadges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_VERIFIED' } }],
                        navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: '/@PhysicsWallah' } },
                        thumbnail: { thumbnails: [{ url: '//yt3.ggpht.com/pw-avatar=s176' }] },
                        descriptionSnippet: { runs: [{ text: 'Physics for JEE & NEET' }] },
                      },
                    },
                    {
                      videoRenderer: {
                        videoId: 'vidReal1234',
                        title: { runs: [{ text: 'Electromagnetism Complete One Shot' }] },
                        ownerText: {
                          runs: [
                            {
                              text: 'Physics Wallah - Alakh Pandey',
                              navigationEndpoint: {
                                browseEndpoint: {
                                  browseId: 'UCiGyWN6DEbnj2alu7iapuKQ',
                                  canonicalBaseUrl: '/@PhysicsWallah',
                                },
                              },
                            },
                          ],
                        },
                        viewCountText: { simpleText: '3,17,46,598 views' },
                        lengthText: { simpleText: '1:02:10' },
                        publishedTimeText: { simpleText: '2 yr ago' },
                        ownerBadges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_VERIFIED' } }],
                        thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/vidReal1234/hq720.jpg' }] },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  };

  const html = `<html><head></head><body><script>var ytInitialData = ${JSON.stringify(sampleData)};</script></body></html>`;
  const parsed = parseYouTubeSearchHtml(html, { nowMs });
  assert.equal(parsed.channels.length, 1);
  assert.equal(parsed.channels[0].id, 'ext_ch_UCiGyWN6DEbnj2alu7iapuKQ');
  assert.equal(parsed.channels[0].handle, '@PhysicsWallah');
  assert.equal(parsed.channels[0].subscriberCount, 14_400_000);
  assert.equal(parsed.channels[0].verified, true);
  assert.equal(parsed.channels[0].avatarUrl, 'https://yt3.ggpht.com/pw-avatar=s176');

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].id, 'ext_vidReal1234');
  assert.equal(parsed.items[0].views, 31_746_598);
  assert.equal(parsed.items[0].durationSec, 3730);
  assert.equal(parsed.items[0].channelVerified, true);
  assert.equal(parsed.items[0].category, 'Education');
});

test('isLowQualitySearchQuery filters junk while rankSearchSuggestions prioritizes frequency, recency, and user interests', () => {
  assert.equal(isLowQualitySearchQuery('a'), true);
  assert.equal(isLowQualitySearchQuery('aaaaaaa'), true);
  assert.equal(isLowQualitySearchQuery('123456'), true);
  assert.equal(isLowQualitySearchQuery('???!!!'), true);
  assert.equal(isLowQualitySearchQuery('https://spam.example/x'), true);
  assert.equal(isLowQualitySearchQuery('qwrtpsdfghjklz'), true);
  assert.equal(isLowQualitySearchQuery('ai'), false);
  assert.equal(isLowQualitySearchQuery('Physics JEE'), false);

  const nowMs = new Date('2026-11-28T12:00:00Z').getTime();
  const ranked = rankSearchSuggestions(
    [
      { id: 'bad1', query: 'a', previewThumb: '', searchedAt: '2026-11-28T11:00:00Z', searchCount: 5 },
      { id: 'bad2', query: 'zzzzzz', previewThumb: '', searchedAt: '2026-11-28T11:00:00Z', searchCount: 5 },
      { id: 'old_misc', query: 'random cooking video', previewThumb: '', searchedAt: '2026-10-01T10:00:00Z', searchCount: 1 },
      { id: 'freq_tech', query: 'TypeScript tutorials', previewThumb: '', searchedAt: '2026-11-27T10:00:00Z', searchCount: 6 },
      { id: 'interest_ai', query: 'AI Agents India', previewThumb: '', searchedAt: '2026-11-28T10:00:00Z', searchCount: 3 },
    ],
    {
      nowMs,
      interestScores: { AI: 95, TypeScript: 60 },
      limit: 5,
    }
  );

  assert.equal(ranked.some((r) => r.id === 'bad1' || r.id === 'bad2'), false);
  assert.ok(['interest_ai', 'freq_tech'].includes(ranked[0].id || ''));
  assert.equal(ranked[ranked.length - 1].id, 'old_misc');
});

test('filterAndSortVideos boosts higher engagement-to-view ratio, verified status, trending velocity, and user interests', () => {
  const nowMs = new Date('2026-11-28T12:00:00Z').getTime();
  const mk = (overrides: Partial<RankableVideo>): RankableVideo => ({
    id: 'v',
    title: 'Python Tutorial for Beginners',
    description: 'Learn python programming step by step',
    tags: ['python', 'coding'],
    category: 'Technology',
    language: 'Hindi',
    channelId: 'ch1',
    channelName: 'Code Channel',
    channelVerified: true,
    subscriberCount: 100_000,
    views: 50_000,
    likes: 500,
    dislikes: 10,
    createdAt: '2026-11-27T12:00:00Z',
    isShort: false,
    isLive: false,
    visibility: 'public',
    durationSec: 900,
    ...overrides,
  });

  const lowEngagement = mk({
    id: 'low_eng',
    views: 50_000,
    likes: 150,
    dislikes: 300,
    channelVerified: false,
    createdAt: '2026-10-01T12:00:00Z',
  });
  const highEngagementInterest = mk({
    id: 'high_eng',
    title: 'Python AI Agents Masterclass',
    tags: ['python', 'ai', 'technology'],
    views: 55_000,
    likes: 5500,
    dislikes: 15,
    channelVerified: true,
    createdAt: '2026-11-28T06:00:00Z',
  });

  const results = filterAndSortVideos([lowEngagement, highEngagementInterest], {
    query: 'Python',
    sort: 'relevance',
    nowMs,
    userSignals: {
      preferredLanguages: ['Hindi'],
      preferredCategories: ['Technology'],
      interestScores: { AI: 95, Technology: 85 },
    },
  });

  assert.equal(results[0].id, 'high_eng');
});



