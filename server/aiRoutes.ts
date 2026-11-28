import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import {
  buildUserAiContext,
  getAllNativeCandidates,
  getRelatedCandidatePool,
  getUserPreferencesPayload,
  hydrateVideoRow,
  recordBehaviorEvent,
  recordBehaviorEventBatch,
  toCandidate,
  type BehaviorEventInput,
  type VideoDbRow,
} from './aiService.ts';
import { rateLimit, requireAdmin, requireAuth, type AuthedRequest } from './auth.ts';
import { db } from './db.ts';
import {
  fetchExternalDiscovery,
  fetchExternalFeedPaged,
  fetchExternalVideoById,
  getDiscoveryStatus,
  type DiscoveryResult,
} from './discovery.ts';
import { filterAndSortVideos, INDIAN_LANGUAGES } from './domain.ts';
import {
  buildConditionalSections,
  generatePersonalizedRecommendations,
  rankShortsFeed,
  rankTrendingIndia,
  resolveNextVideo,
  type BehaviorEventType,
  type CandidateVideo,
  type ShortsFeedMode,
} from './recommendation.ts';
import { GoogleGenAI } from '@google/genai';
import { validateContentCandidate } from './validation.ts';

const asyncRoute =
  (fn: (req: AuthedRequest, res: any) => Promise<void> | void) =>
  (req: any, res: any, next: any) => {
    Promise.resolve(fn(req as AuthedRequest, res)).catch(next);
  };

export function registerAiAndLibraryRoutes(
  app: Express,
  ensureExternalVideoRecord: (videoId: string, extData?: DiscoveryResult) => Promise<boolean>
) {
  // =========================================================================
  // PERSONALIZED RECOMMENDATIONS, SECTIONS, SHORTS, TRENDING, NEXT-VIDEO
  // =========================================================================

  const handleHomeFeed = asyncRoute(async (req: AuthedRequest, res: Express['response'] | any) => {
    const {
      category = 'All',
      language = 'All',
      shorts = '0',
      pageToken = '',
      feedFilter = 'for_you',
    } = req.query as Record<string, string | undefined>;
    const cursor = Math.max(0, Number(req.query.cursor || 0));
    const limit = Math.max(1, Math.min(30, Number(req.query.limit || 12)));
    const cleanToken = (pageToken || '').trim();

    const ctx = buildUserAiContext(req.auth?.userId);

    if (feedFilter === 'following') {
      if (!req.auth) {
        res.json({
          videos: [],
          sections: [],
          nextCursor: null,
          nextPageToken: null,
          hasMore: false,
          total: 0,
          followingRequiresAuth: true,
          discoveryStatus: getDiscoveryStatus(),
        });
        return;
      }

      const subRows = db
        .prepare(`
          SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
                 c.verified as channel_verified, c.subscriber_count
          FROM videos v
          JOIN channels c ON c.id = v.channel_id
          JOIN subscriptions s ON s.channel_id = c.id
          WHERE s.user_id = ? AND v.visibility = 'public' AND v.status = 'published'
          ORDER BY v.created_at DESC
        `)
        .all(req.auth.userId) as unknown as VideoDbRow[];

      const hydrated = subRows
        .map(hydrateVideoRow)
        .filter((v) => (shorts === '1' ? v.isShort : !v.isShort));
      const filtered = filterAndSortVideos(hydrated, { category, language });
      const valid = filtered
        .map(toCandidate)
        .filter((v) => validateContentCandidate(v, ctx.validation).valid)
        .map((v) => ({
          ...v,
          recommendationReasons: ['Subscribed creator', `In ${v.language}`],
          recommendationReason: 'Subscribed creator',
        }));
      const slice = valid.slice(cursor, cursor + limit);
      const nextCursor = cursor + slice.length < valid.length ? cursor + slice.length : null;

      res.json({
        videos: slice,
        sections: [],
        nextCursor,
        nextPageToken: null,
        hasMore: nextCursor !== null,
        total: valid.length,
        followingEmpty: valid.length === 0,
        discoveryStatus: getDiscoveryStatus(),
      });
      return;
    }

    const native =
      cleanToken === ''
        ? filterAndSortVideos(
            getAllNativeCandidates().filter((v) => (shorts === '1' ? v.isShort : !v.isShort)),
            { category, language }
          )
        : [];

    const topTopics = Object.entries(ctx.interestScores)
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
      .slice(0, 5);
    const seed = Number(req.query.seed || 0) || Math.floor(Date.now() / (10 * 60 * 1000)) % 12;

    const extPaged = await fetchExternalFeedPaged({
      category,
      language,
      shorts: shorts === '1',
      pageToken: cleanToken,
      interestTopics: topTopics,
      recentSearches: ctx.recentSearches,
      preferredLanguage: ctx.preferredLanguages[0],
      refreshSeed: seed,
    });

    const pool: CandidateVideo[] = [...native, ...extPaged.items.map(toCandidate)];
    const rec = generatePersonalizedRecommendations(pool, ctx, { cursor, limit });

    let respNextCursor: number | null = rec.nextCursor;
    let respNextPageToken: string = cleanToken;
    let respHasMore = rec.hasMore;

    if (rec.nextCursor === null && extPaged.nextPageToken) {
      respNextCursor = 0;
      respNextPageToken = extPaged.nextPageToken;
      respHasMore = true;
    }

    let sections: ReturnType<typeof buildConditionalSections> = [];
    if (cursor === 0 && cleanToken === '' && category === 'All' && language === 'All' && shorts !== '1') {
      const continueWatchingRows = req.auth
        ? (db
            .prepare(`
              SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
                     c.verified as channel_verified, c.subscriber_count
              FROM watch_history wh
              JOIN videos v ON v.id = wh.video_id
              JOIN channels c ON c.id = v.channel_id
              WHERE wh.user_id = ? AND wh.progress_sec > 10 AND v.visibility = 'public' AND v.status = 'published' AND v.is_short = 0
              ORDER BY wh.watched_at DESC LIMIT 8
            `)
            .all(req.auth.userId) as unknown as VideoDbRow[])
        : [];
      const continueWatching = continueWatchingRows
        .map(hydrateVideoRow)
        .map(toCandidate)
        .filter((v) => validateContentCandidate(v, ctx.validation).valid);

      const subscribedRows = req.auth
        ? (db
            .prepare(`
              SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
                     c.verified as channel_verified, c.subscriber_count
              FROM videos v
              JOIN channels c ON c.id = v.channel_id
              JOIN subscriptions s ON s.channel_id = c.id
              WHERE s.user_id = ? AND v.visibility = 'public' AND v.status = 'published' AND v.is_short = 0
              ORDER BY v.created_at DESC LIMIT 8
            `)
            .all(req.auth.userId) as unknown as VideoDbRow[])
        : [];
      const subscribedVideos = subscribedRows
        .map(hydrateVideoRow)
        .map(toCandidate)
        .filter((v) => validateContentCandidate(v, ctx.validation).valid);

      const topInterestTopic = Object.entries(ctx.interestScores).sort((a, b) => b[1] - a[1])[0]?.[0];
      const trending = rankTrendingIndia(pool, ctx.validation);
      const newCreators = pool.filter((v) => !v.isShort && v.subscriberCount < 250_000);

      sections = buildConditionalSections({
        recommended: rec.items,
        continueWatching,
        trending,
        subscribedVideos,
        topInterestTopic,
        preferredLanguage: ctx.preferredLanguages[0],
        newCreators,
      });
    }

      res.status(200).json({
      videos: rec.items,
      sections,
      nextCursor: respNextCursor,
      nextPageToken: respNextPageToken || null,
      hasMore: respHasMore,
      total: rec.total,
      discoveryStatus: getDiscoveryStatus(),
    });
  });

  app.get('/api/recommendations/home', handleHomeFeed);
  app.get('/api/feed/home', handleHomeFeed);

  app.get('/api/recommendations/trending', asyncRoute(async (req: AuthedRequest, res) => {
    const language = String(req.query.language || 'All');
    const pageToken = String(req.query.pageToken || '').trim();
    const ctx = buildUserAiContext(req.auth?.userId);
    const native =
      pageToken === ''
        ? filterAndSortVideos(
            getAllNativeCandidates().filter((v) => !v.isShort),
            { language }
          )
        : [];
    const extPaged = await fetchExternalFeedPaged({ trending: true, language, shorts: false, pageToken });
    const ranked = rankTrendingIndia([...native, ...extPaged.items.map(toCandidate)], ctx.validation);
    res.json({
      videos: ranked,
      nextPageToken: extPaged.nextPageToken,
      hasMore: Boolean(extPaged.nextPageToken),
      discoveryStatus: getDiscoveryStatus(),
    });
  }));

  app.get('/api/recommendations/shorts', asyncRoute(async (req: AuthedRequest, res) => {
    const language = String(req.query.language || 'All');
    const category = String(req.query.category || 'All');
    const feedRaw = String(req.query.feed || 'for_you');
    const mode: ShortsFeedMode = ['for_you', 'following', 'trending', 'new_creators'].includes(feedRaw)
      ? (feedRaw as ShortsFeedMode)
      : 'for_you';
    const pageToken = String(req.query.pageToken || '').trim();
    const ctx = buildUserAiContext(req.auth?.userId);

    if (mode === 'following' && !req.auth) {
      res.json({
        videos: [],
        nextPageToken: null,
        hasMore: false,
        followingRequiresAuth: true,
        discoveryStatus: getDiscoveryStatus(),
      });
      return;
    }

    const native =
      pageToken === ''
        ? filterAndSortVideos(
            getAllNativeCandidates().filter((v) => v.isShort),
            { language, category }
          )
        : [];
    const topTopics = Object.entries(ctx.interestScores)
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
      .slice(0, 5);
    const seed = Number(req.query.seed || 0) || Math.floor(Date.now() / (5 * 60 * 1000)) % 12;

    let subscribedShorts: CandidateVideo[] = [];
    if (mode === 'following' && req.auth && pageToken === '') {
      const subRows = db
        .prepare(`
          SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
                 c.verified as channel_verified, c.subscriber_count
          FROM videos v
          JOIN channels c ON c.id = v.channel_id
          JOIN subscriptions s ON s.channel_id = c.id
          WHERE s.user_id = ? AND v.visibility = 'public' AND v.status = 'published' AND v.is_short = 1
          ORDER BY v.created_at DESC
        `)
        .all(req.auth.userId) as unknown as VideoDbRow[];
      subscribedShorts = subRows.map(hydrateVideoRow).map(toCandidate);
    }

    const extPaged =
      mode === 'following'
        ? { items: [], nextPageToken: null }
        : await fetchExternalFeedPaged({
            shorts: true,
            category,
            language,
            trending: mode === 'trending',
            pageToken,
            interestTopics: topTopics,
            recentSearches: ctx.recentSearches,
            preferredLanguage: ctx.preferredLanguages[0],
            refreshSeed: seed,
          });
    const ranked = rankShortsFeed([...subscribedShorts, ...native, ...extPaged.items.map(toCandidate)], ctx, Date.now(), {
      mode,
      category,
    });
    res.json({
      videos: ranked,
      nextPageToken: extPaged.nextPageToken,
      hasMore: Boolean(extPaged.nextPageToken),
      discoveryStatus: getDiscoveryStatus(),
    });
  }));

  app.get('/api/recommendations/related/:videoId', asyncRoute(async (req: AuthedRequest, res) => {
    const videoId = req.params.videoId;
    const ctx = buildUserAiContext(req.auth?.userId);
    let current: CandidateVideo | null = null;
    let extRelated: DiscoveryResult[] = [];

    const row = db
      .prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
               c.verified as channel_verified, c.subscriber_count
        FROM videos v JOIN channels c ON c.id = v.channel_id
        WHERE v.id = ?
      `)
      .get(videoId) as VideoDbRow | undefined;

    if (row) current = toCandidate(hydrateVideoRow(row));
    if (videoId.startsWith('ext_') || videoId.startsWith('dm_')) {
      const extFetched = await fetchExternalVideoById(videoId);
      if (extFetched) {
        current = toCandidate(extFetched.video);
        extRelated = extFetched.related;
      }
    }

    if (!current) {
      res.json({ videos: [] });
      return;
    }

    if (extRelated.length < 4) {
      const topicWords = current.title
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3)
        .slice(0, 4)
        .join(' ');
      const fallbackTopic = topicWords || current.tags[0] || current.category;
      if (fallbackTopic) {
        try {
          const extra = await fetchExternalDiscovery(fallbackTopic, current.language);
          const seenExt = new Set(extRelated.map((r) => r.id));
          for (const item of extra) {
            if (item.id !== current.id && !item.isShort && !seenExt.has(item.id)) {
              extRelated.push(item);
              seenExt.add(item.id);
            }
          }
        } catch {
          // ignore transient discovery failure
        }
      }
    }

    const ranked = getRelatedCandidatePool(current, ctx, extRelated);
    res.json({ videos: ranked.slice(0, 16) });
  }));

  app.get('/api/recommendations/next-video', asyncRoute(async (req: AuthedRequest, res) => {
    const currentVideoId = String(req.query.currentVideoId || '');
    const mode = (String(req.query.mode || 'recommended') as 'recommended' | 'playlist' | 'queue' | 'repeat');
    const playlistId = String(req.query.playlistId || '');
    const ctx = buildUserAiContext(req.auth?.userId);

    const queueVideoIds = req.auth
      ? (
          db
            .prepare('SELECT video_id FROM video_queue WHERE user_id = ? ORDER BY position ASC, added_at ASC')
            .all(req.auth.userId) as Array<{ video_id: string }>
        ).map((r) => r.video_id)
      : [];

    const playlistVideoIds =
      req.auth && playlistId
        ? (
            db
              .prepare(`
                SELECT pv.video_id
                FROM playlist_videos pv
                JOIN playlists p ON p.id = pv.playlist_id
                WHERE pv.playlist_id = ? AND p.user_id = ?
                ORDER BY pv.position ASC, pv.added_at ASC
              `)
              .all(playlistId, req.auth.userId) as Array<{ video_id: string }>
          ).map((r) => r.video_id)
        : [];

    let currentVideo: CandidateVideo | null = null;
    const row = db
      .prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
               c.verified as channel_verified, c.subscriber_count
        FROM videos v JOIN channels c ON c.id = v.channel_id WHERE v.id = ?
      `)
      .get(currentVideoId) as VideoDbRow | undefined;
    if (row) currentVideo = toCandidate(hydrateVideoRow(row));

    let extRelated: DiscoveryResult[] = [];
    if (currentVideoId.startsWith('ext_') || currentVideoId.startsWith('dm_')) {
      const extFetched = await fetchExternalVideoById(currentVideoId);
      if (extFetched) {
        currentVideo = currentVideo ?? toCandidate(extFetched.video);
        extRelated = extFetched.related;
      }
    }

    const related = currentVideo ? getRelatedCandidatePool(currentVideo, ctx, extRelated) : getAllNativeCandidates();
    const resolution = resolveNextVideo({
      currentVideoId,
      mode,
      queueVideoIds,
      playlistVideoIds,
      recommendedVideos: related,
      currentVideo,
    });

    if (!resolution.nextVideoId) {
      res.json({ nextVideo: null, source: 'none' });
      return;
    }

    const nextRow = db
      .prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
               c.verified as channel_verified, c.subscriber_count
        FROM videos v JOIN channels c ON c.id = v.channel_id WHERE v.id = ?
      `)
      .get(resolution.nextVideoId) as VideoDbRow | undefined;

    if (nextRow) {
      res.json({ nextVideo: hydrateVideoRow(nextRow), source: resolution.source });
      return;
    }

    const fromPool = related.find((v) => v.id === resolution.nextVideoId);
    res.json({ nextVideo: fromPool ?? null, source: resolution.source });
  }));

  // =========================================================================
  // BEHAVIOR TRACKING & FEEDBACK EVENTS
  // =========================================================================

  app.post('/api/events/watch', rateLimit(120, 60_000), asyncRoute(async (req: AuthedRequest, res) => {
    const { eventId, videoId, eventType, progressPct = 0, watchDurationSec = 0, sessionId = '' } = (req.body ?? {}) as {
      eventId?: string;
      videoId?: string;
      eventType?: BehaviorEventType;
      progressPct?: number;
      watchDurationSec?: number;
      sessionId?: string;
    };
    if (!videoId || !eventType) {
      res.status(400).json({ error: 'videoId and eventType required.' });
      return;
    }
    await ensureExternalVideoRecord(videoId);
    const result = recordBehaviorEvent({
      eventId,
      userId: req.auth?.userId,
      sessionId,
      videoId,
      eventType,
      progressPct,
      watchDurationSec,
    });
    res.json(result);
  }));

  app.post('/api/events/batch', rateLimit(60, 60_000), asyncRoute(async (req: AuthedRequest, res) => {
    const { events = [] } = (req.body ?? {}) as {
      events?: Array<{
        eventId?: string;
        videoId?: string;
        eventType?: BehaviorEventType;
        progressPct?: number;
        watchDurationSec?: number;
        sessionId?: string;
        surface?: string;
        metadata?: Record<string, unknown>;
      }>;
    };
    if (!Array.isArray(events) || events.length === 0) {
      res.status(400).json({ error: 'events array is required.' });
      return;
    }
    const bounded = events.slice(0, 50).filter((e) => e && typeof e.videoId === 'string' && typeof e.eventType === 'string');
    const uniqueVideoIds = Array.from(new Set(bounded.map((e) => e.videoId!))).slice(0, 20);
    for (const vid of uniqueVideoIds) {
      await ensureExternalVideoRecord(vid);
    }
    const prepared: BehaviorEventInput[] = bounded.map((e) => ({
      eventId: e.eventId,
      userId: req.auth?.userId,
      sessionId: e.sessionId,
      videoId: e.videoId!,
      eventType: e.eventType!,
      progressPct: e.progressPct,
      watchDurationSec: e.watchDurationSec,
      metadata: e.surface ? { ...(e.metadata ?? {}), surface: e.surface } : e.metadata,
    }));
    const result = recordBehaviorEventBatch(prepared);
    res.json({ ok: true, ...result });
  }));

  app.post('/api/events/skip', rateLimit(120, 60_000), asyncRoute(async (req: AuthedRequest, res) => {
    const { eventId, videoId, watchDurationSec = 0 } = (req.body ?? {}) as {
      eventId?: string;
      videoId?: string;
      watchDurationSec?: number;
    };
    if (!videoId) {
      res.status(400).json({ error: 'videoId required.' });
      return;
    }
    await ensureExternalVideoRecord(videoId);
    const result = recordBehaviorEvent({
      eventId,
      userId: req.auth?.userId,
      videoId,
      eventType: 'skip',
      watchDurationSec,
    });
    res.json(result);
  }));

  app.post('/api/events/like', requireAuth, asyncRoute(async (req: AuthedRequest, res) => {
    const { eventId, videoId, reaction = 'like' } = (req.body ?? {}) as {
      eventId?: string;
      videoId?: string;
      reaction?: 'like' | 'dislike';
    };
    if (!videoId) {
      res.status(400).json({ error: 'videoId required.' });
      return;
    }
    await ensureExternalVideoRecord(videoId);
    const result = recordBehaviorEvent({
      eventId,
      userId: req.auth!.userId,
      videoId,
      eventType: reaction === 'dislike' ? 'dislike' : 'like',
    });
    res.json(result);
  }));

  app.post('/api/events/share', rateLimit(60, 60_000), asyncRoute(async (req: AuthedRequest, res) => {
    const { eventId, videoId } = (req.body ?? {}) as { eventId?: string; videoId?: string };
    if (!videoId) {
      res.status(400).json({ error: 'videoId required.' });
      return;
    }
    await ensureExternalVideoRecord(videoId);
    const result = recordBehaviorEvent({
      eventId,
      userId: req.auth?.userId,
      videoId,
      eventType: 'share',
    });
    res.json(result);
  }));

  app.post('/api/events/feedback', requireAuth, asyncRoute(async (req: AuthedRequest, res) => {
    const { videoId, channelId, feedbackType, reason = '' } = (req.body ?? {}) as {
      videoId?: string;
      channelId?: string;
      feedbackType?: 'not_interested' | 'dont_recommend_creator';
      reason?: string;
    };
    if (!feedbackType || !['not_interested', 'dont_recommend_creator'].includes(feedbackType)) {
      res.status(400).json({ error: 'Invalid feedbackType.' });
      return;
    }
    if (videoId) await ensureExternalVideoRecord(videoId);
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO user_feedback (id, user_id, video_id, channel_id, feedback_type, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`fb_${randomUUID().slice(0, 10)}`, req.auth!.userId, videoId ?? null, channelId ?? null, feedbackType, reason, nowIso);

    if (feedbackType === 'dont_recommend_creator' && channelId) {
      db.prepare('INSERT OR IGNORE INTO blocked_creators (user_id, channel_id, created_at) VALUES (?, ?, ?)').run(
        req.auth!.userId,
        channelId,
        nowIso
      );
    }

    if (videoId) {
      recordBehaviorEvent({
        userId: req.auth!.userId,
        videoId,
        eventType: feedbackType,
      });
    }
    res.json({ ok: true });
  }));

  app.post('/api/recommendations/impression', rateLimit(200, 60_000), asyncRoute((req: AuthedRequest, res) => {
    const { videoIds = [], surface = 'home' } = (req.body ?? {}) as { videoIds?: string[]; surface?: string };
    const stmt = db.prepare(`
      INSERT INTO recommendation_impressions (id, user_id, video_id, surface, position, score, clicked, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?)
    `);
    const nowIso = new Date().toISOString();
    videoIds.slice(0, 24).forEach((vid, idx) => {
      if (vid) {
        stmt.run(`imp_${randomUUID().slice(0, 10)}`, req.auth?.userId ?? null, vid, surface, idx, nowIso);
      }
    });
    res.json({ ok: true });
  }));

  app.post('/api/recommendations/click', rateLimit(120, 60_000), asyncRoute((req: AuthedRequest, res) => {
    const { videoId, surface = 'home', eventId } = (req.body ?? {}) as {
      videoId?: string;
      surface?: string;
      eventId?: string;
    };
    if (!videoId) {
      res.status(400).json({ error: 'videoId required.' });
      return;
    }
    if (req.auth) {
      db.prepare(`
        UPDATE recommendation_impressions SET clicked = 1
        WHERE user_id = ? AND video_id = ? AND surface = ?
      `).run(req.auth.userId, videoId, surface);
    }
    recordBehaviorEvent({ eventId, userId: req.auth?.userId, videoId, eventType: 'click', metadata: { surface } });
    res.json({ ok: true });
  }));

  // =========================================================================
  // PREFERENCES, INTEREST WEIGHTS, BLOCKED CREATORS/TOPICS & DATA PRIVACY
  // =========================================================================

  app.get('/api/preferences', requireAuth, (req: AuthedRequest, res) => {
    const uid = req.auth!.userId;
    const preferences = getUserPreferencesPayload(uid);
    const interests = db
      .prepare('SELECT topic, score, source, updated_at as updatedAt FROM user_interests WHERE user_id = ? ORDER BY score DESC')
      .all(uid);
    const blockedTopics = db
      .prepare('SELECT topic, created_at as createdAt FROM blocked_topics WHERE user_id = ? ORDER BY created_at DESC')
      .all(uid);
    const blockedCreators = db
      .prepare(`
        SELECT bc.channel_id as channelId, COALESCE(c.name, bc.channel_id) as channelName, bc.created_at as createdAt
        FROM blocked_creators bc
        LEFT JOIN channels c ON c.id = bc.channel_id
        WHERE bc.user_id = ?
        ORDER BY bc.created_at DESC
      `)
      .all(uid);

    res.json({ preferences, interests, blockedTopics, blockedCreators });
  });

  app.patch('/api/preferences', requireAuth, (req: AuthedRequest, res) => {
    const uid = req.auth!.userId;
    const current = getUserPreferencesPayload(uid);
    const body = req.body as Partial<{
      preferredLanguages: string[];
      preferredCategories: string[];
      selectedInterests: string[];
      preferredFormat: string;
      personalizationEnabled: boolean;
      infiniteScrollEnabled: boolean;
      autoplayEnabled: boolean;
      onboardingCompleted: boolean;
    }>;

    const nextLangs = Array.isArray(body.preferredLanguages)
      ? body.preferredLanguages.filter((l) => INDIAN_LANGUAGES.includes(l as (typeof INDIAN_LANGUAGES)[number]))
      : current.preferredLanguages;

    db.prepare(`
      UPDATE user_preferences
      SET preferred_languages_json = ?,
          preferred_categories_json = ?,
          selected_interests_json = ?,
          preferred_format = ?,
          personalization_enabled = ?,
          infinite_scroll_enabled = ?,
          autoplay_enabled = ?,
          onboarding_completed = ?,
          updated_at = ?
      WHERE user_id = ?
    `).run(
      JSON.stringify(nextLangs.length ? nextLangs : current.preferredLanguages),
      JSON.stringify(Array.isArray(body.preferredCategories) ? body.preferredCategories : current.preferredCategories),
      JSON.stringify(Array.isArray(body.selectedInterests) ? body.selectedInterests : current.selectedInterests),
      body.preferredFormat || current.preferredFormat,
      typeof body.personalizationEnabled === 'boolean'
        ? body.personalizationEnabled
          ? 1
          : 0
        : current.personalizationEnabled
        ? 1
        : 0,
      typeof body.infiniteScrollEnabled === 'boolean'
        ? body.infiniteScrollEnabled
          ? 1
          : 0
        : current.infiniteScrollEnabled
        ? 1
        : 0,
      typeof body.autoplayEnabled === 'boolean'
        ? body.autoplayEnabled
          ? 1
          : 0
        : current.autoplayEnabled
        ? 1
        : 0,
      typeof body.onboardingCompleted === 'boolean'
        ? body.onboardingCompleted
          ? 1
          : 0
        : current.onboardingCompleted
        ? 1
        : 0,
      new Date().toISOString(),
      uid
    );

    if (nextLangs.length > 0) {
      db.prepare('UPDATE users SET preferred_language = ? WHERE id = ?').run(nextLangs[0], uid);
    }

    res.json({ preferences: getUserPreferencesPayload(uid) });
  });

  app.post('/api/preferences/interests', requireAuth, (req: AuthedRequest, res) => {
    const uid = req.auth!.userId;
    const { interests, topic, score, preferredLanguage, onboardingCompleted } = req.body as {
      interests?: string[];
      topic?: string;
      score?: number;
      preferredLanguage?: string;
      onboardingCompleted?: boolean;
    };
    const nowIso = new Date().toISOString();

    if (topic && typeof score === 'number') {
      const clamped = Math.max(0, Math.min(100, Math.round(score)));
      db.prepare(`
        INSERT INTO user_interests (user_id, topic, score, source, updated_at)
        VALUES (?, ?, ?, 'manual', ?)
        ON CONFLICT(user_id, topic) DO UPDATE SET score = excluded.score, source = 'manual', updated_at = excluded.updated_at
      `).run(uid, topic.trim(), clamped, nowIso);
    }

    if (Array.isArray(interests)) {
      const clean = interests.map((i) => i.trim()).filter(Boolean).slice(0, 15);
      const stmt = db.prepare(`
        INSERT INTO user_interests (user_id, topic, score, source, updated_at)
        VALUES (?, ?, 80, 'onboarding', ?)
        ON CONFLICT(user_id, topic) DO UPDATE SET score = MAX(user_interests.score, 80), updated_at = excluded.updated_at
      `);
      for (const item of clean) {
        stmt.run(uid, item, nowIso);
      }
      db.prepare(`
        UPDATE user_preferences
        SET selected_interests_json = ?,
            preferred_categories_json = ?,
            preferred_languages_json = COALESCE(?, preferred_languages_json),
            onboarding_completed = ?,
            updated_at = ?
        WHERE user_id = ?
      `).run(
        JSON.stringify(clean),
        JSON.stringify(clean),
        preferredLanguage ? JSON.stringify([preferredLanguage]) : null,
        onboardingCompleted === false ? 0 : 1,
        nowIso,
        uid
      );
      if (preferredLanguage && INDIAN_LANGUAGES.includes(preferredLanguage as (typeof INDIAN_LANGUAGES)[number])) {
        db.prepare('UPDATE users SET preferred_language = ? WHERE id = ?').run(preferredLanguage, uid);
      }
    } else if (onboardingCompleted) {
      db.prepare('UPDATE user_preferences SET onboarding_completed = 1, updated_at = ? WHERE user_id = ?').run(nowIso, uid);
    }

    const updated = db
      .prepare('SELECT topic, score, source, updated_at as updatedAt FROM user_interests WHERE user_id = ? ORDER BY score DESC')
      .all(uid);
    res.json({ interests: updated, preferences: getUserPreferencesPayload(uid) });
  });

  app.post('/api/blocked-topics', requireAuth, (req: AuthedRequest, res) => {
    const { topic } = req.body as { topic?: string };
    if (!topic || topic.trim().length < 2) {
      res.status(400).json({ error: 'Topic must be at least 2 characters.' });
      return;
    }
    db.prepare('INSERT OR IGNORE INTO blocked_topics (user_id, topic, created_at) VALUES (?, ?, ?)').run(
      req.auth!.userId,
      topic.trim(),
      new Date().toISOString()
    );
    res.json({ ok: true });
  });

  app.delete('/api/blocked-topics/:topic', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM blocked_topics WHERE user_id = ? AND LOWER(topic) = LOWER(?)').run(
      req.auth!.userId,
      req.params.topic
    );
    res.json({ ok: true });
  });

  app.delete('/api/blocked-creators/:channelId', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM blocked_creators WHERE user_id = ? AND channel_id = ?').run(
      req.auth!.userId,
      req.params.channelId
    );
    db.prepare(`DELETE FROM user_feedback WHERE user_id = ? AND channel_id = ? AND feedback_type = 'dont_recommend_creator'`).run(
      req.auth!.userId,
      req.params.channelId
    );
    res.json({ ok: true });
  });

  app.get('/api/users/me/export', requireAuth, (req: AuthedRequest, res) => {
    const uid = req.auth!.userId;
    const profile = db
      .prepare('SELECT id, name, email, role, preferred_language as preferredLanguage, created_at as createdAt FROM users WHERE id = ?')
      .get(uid);
    const preferences = getUserPreferencesPayload(uid);
    const interests = db.prepare('SELECT topic, score, source FROM user_interests WHERE user_id = ?').all(uid);
    const watchHistory = db.prepare('SELECT video_id as videoId, progress_sec as progressSec, watched_at as watchedAt FROM watch_history WHERE user_id = ?').all(uid);
    const searchHistory = db.prepare('SELECT query, searched_at as searchedAt FROM search_history WHERE user_id = ?').all(uid);
    const playlists = db.prepare('SELECT id, title, visibility, created_at as createdAt FROM playlists WHERE user_id = ?').all(uid);

    res.setHeader('Content-Disposition', 'attachment; filename="doptube-my-data.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      profile,
      preferences,
      interests,
      watchHistory,
      searchHistory,
      playlists,
    });
  });

  app.delete('/api/users/me/watch-history', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM watch_history WHERE user_id = ?').run(req.auth!.userId);
    res.json({ ok: true });
  });

  // =========================================================================
  // PLAYLIST MANAGEMENT (RENAME, DELETE, REORDER) & PERSISTENT VIDEO QUEUE
  // =========================================================================

  app.patch('/api/playlists/:id', requireAuth, (req: AuthedRequest, res) => {
    const { title, description, visibility } = req.body as {
      title?: string;
      description?: string;
      visibility?: 'public' | 'unlisted' | 'private';
    };
    const own = db.prepare('SELECT id, title, description, visibility FROM playlists WHERE id = ? AND user_id = ?').get(
      req.params.id,
      req.auth!.userId
    ) as { id: string; title: string; description: string; visibility: string } | undefined;
    if (!own) {
      res.status(404).json({ error: 'Playlist not found.' });
      return;
    }
    const nextTitle = title && title.trim().length >= 2 ? title.trim() : own.title;
    const nextDesc = typeof description === 'string' ? description.trim() : own.description;
    const nextVis = visibility && ['public', 'unlisted', 'private'].includes(visibility) ? visibility : own.visibility;
    db.prepare('UPDATE playlists SET title = ?, description = ?, visibility = ? WHERE id = ? AND user_id = ?').run(
      nextTitle,
      nextDesc,
      nextVis,
      req.params.id,
      req.auth!.userId
    );
    res.json({ ok: true });
  });

  app.delete('/api/playlists/:id', requireAuth, (req: AuthedRequest, res) => {
    const info = db.prepare('DELETE FROM playlists WHERE id = ? AND user_id = ?').run(req.params.id, req.auth!.userId);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Playlist not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.put('/api/playlists/:id/reorder', requireAuth, (req: AuthedRequest, res) => {
    const { videoIds = [] } = req.body as { videoIds?: string[] };
    const own = db.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.auth!.userId);
    if (!own) {
      res.status(404).json({ error: 'Playlist not found.' });
      return;
    }
    const stmt = db.prepare('UPDATE playlist_videos SET position = ? WHERE playlist_id = ? AND video_id = ?');
    videoIds.forEach((vid, idx) => stmt.run(idx, req.params.id, vid));
    res.json({ ok: true });
  });

  app.get('/api/queue', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
               c.verified as channel_verified, c.subscriber_count, vq.position
        FROM video_queue vq
        JOIN videos v ON v.id = vq.video_id
        JOIN channels c ON c.id = v.channel_id
        WHERE vq.user_id = ?
        ORDER BY vq.position ASC, vq.added_at ASC
      `)
      .all(req.auth!.userId) as unknown as VideoDbRow[];
    res.json({ videos: rows.map(hydrateVideoRow) });
  });

  app.post('/api/queue', requireAuth, async (req: AuthedRequest, res) => {
    const { videoId, playNext = false } = req.body as { videoId?: string; playNext?: boolean };
    if (!videoId) {
      res.status(400).json({ error: 'videoId required.' });
      return;
    }
    await ensureExternalVideoRecord(videoId);
    const uid = req.auth!.userId;
    if (playNext) {
      db.prepare('UPDATE video_queue SET position = position + 1 WHERE user_id = ?').run(uid);
      db.prepare('INSERT OR REPLACE INTO video_queue (user_id, video_id, position, added_at) VALUES (?, ?, 0, ?)').run(
        uid,
        videoId,
        new Date().toISOString()
      );
    } else {
      const maxPos = (
        db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM video_queue WHERE user_id = ?').get(uid) as { m: number }
      ).m;
      db.prepare('INSERT OR REPLACE INTO video_queue (user_id, video_id, position, added_at) VALUES (?, ?, ?, ?)').run(
        uid,
        videoId,
        maxPos + 1,
        new Date().toISOString()
      );
    }
    res.json({ ok: true });
  });

  app.put('/api/queue/reorder', requireAuth, (req: AuthedRequest, res) => {
    const { videoIds = [] } = req.body as { videoIds?: string[] };
    const stmt = db.prepare('UPDATE video_queue SET position = ? WHERE user_id = ? AND video_id = ?');
    videoIds.forEach((vid, idx) => stmt.run(idx, req.auth!.userId, vid));
    res.json({ ok: true });
  });

  app.delete('/api/queue/:videoId', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM video_queue WHERE user_id = ? AND video_id = ?').run(req.auth!.userId, req.params.videoId);
    res.json({ ok: true });
  });

  app.delete('/api/queue', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM video_queue WHERE user_id = ?').run(req.auth!.userId);
    res.json({ ok: true });
  });

  // =========================================================================
  // ADMIN AI RECOMMENDATION ANALYTICS
  // =========================================================================

  app.get('/api/analytics/recommendations', requireAdmin, (_req, res) => {
    const totalImpressions = (
      db.prepare('SELECT COUNT(*) as c FROM recommendation_impressions').get() as { c: number }
    ).c;
    const totalClicks = (
      db.prepare('SELECT COUNT(*) as c FROM recommendation_impressions WHERE clicked = 1').get() as { c: number }
    ).c;
    const startEvents = (
      db.prepare(`SELECT COUNT(*) as c FROM user_events WHERE event_type = 'start'`).get() as { c: number }
    ).c;
    const completionEvents = (
      db.prepare(`SELECT COUNT(*) as c FROM user_events WHERE event_type = 'completion'`).get() as { c: number }
    ).c;
    const notInterestedCount = (
      db.prepare(`SELECT COUNT(*) as c FROM user_feedback WHERE feedback_type = 'not_interested'`).get() as { c: number }
    ).c;
    const dontRecommendCreatorCount = (
      db.prepare(`SELECT COUNT(*) as c FROM user_feedback WHERE feedback_type = 'dont_recommend_creator'`).get() as {
        c: number;
      }
    ).c;
    const anomalyFlags = (
      db.prepare(`SELECT COUNT(*) as c FROM user_events WHERE metadata_json LIKE '%"anomaly":true%'`).get() as { c: number }
    ).c;
    const topTopics = db
      .prepare(`
        SELECT topic, ROUND(AVG(score), 1) as avgScore, COUNT(*) as usersCount
        FROM user_interests
        GROUP BY topic
        ORDER BY usersCount DESC, avgScore DESC
        LIMIT 8
      `)
      .all();

    res.json({
      totalImpressions,
      totalClicks,
      ctrPercent: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(1)) : 0,
      completionRatePercent: startEvents > 0 ? Number(((completionEvents / startEvents) * 100).toFixed(1)) : 0,
      notInterestedCount,
      dontRecommendCreatorCount,
      anomalyFlags,
      topTopics,
    });
  });

  // =========================================================================
  // MULTI-TURN GEMINI AI ASSISTANT CHATBOT (FREE-TIER MODELS ONLY)
  // =========================================================================

  app.post('/api/ai/chat', rateLimit(30, 60_000), asyncRoute(async (req: AuthedRequest, res) => {
    const { message, history = [], role = 'general', videoContext } = (req.body ?? {}) as {
      message?: string;
      history?: Array<{ role?: string; text?: string }>;
      role?: 'general' | 'fast' | 'creator' | 'discovery';
      videoContext?: {
        id?: string;
        title?: string;
        channelName?: string;
        category?: string;
        language?: string;
        description?: string;
      } | null;
    };

    const cleanMessage = typeof message === 'string' ? message.trim() : '';
    if (!cleanMessage) {
      res.status(400).json({ error: 'Please enter a message.' });
      return;
    }
    if (cleanMessage.length > 2000) {
      res.status(400).json({ error: 'Message exceeds 2,000 characters.' });
      return;
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }

    const roleInstructions: Record<string, string> = {
      general:
        'You are DopTube Assistant, a concise and helpful guide for India’s DopTube video platform. Answer clearly in English or Hinglish/Hindi matching the user.',
      fast:
        'You are DopTube Quick Q&A. Give direct, crisp 1-3 sentence answers for quick questions about videos, features, or general topics.',
      creator:
        'You are DopTube Creator Strategist. Help creators improve video hooks, titles, thumbnails, Shorts retention, and growth across Indian languages.',
      discovery:
        'You are DopTube Discovery Guide. Recommend specific search keywords, Indian creator niches, playlists, and learning tracks tailored to user interests.',
    };

    const selectedRole = role in roleInstructions ? role : 'general';
    const model = selectedRole === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

    const ctx = buildUserAiContext(req.auth?.userId);
    const userTopics = Object.entries(ctx.interestScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t);
    const topicSuffix =
      userTopics.length > 0
        ? ` The current viewer follows topics: ${userTopics.join(', ')} (languages: ${ctx.preferredLanguages.join(', ')}).`
        : '';

    const safeVideoMeta =
      videoContext && typeof videoContext.title === 'string' && videoContext.title.trim()
        ? ` Active video metadata only (you cannot see the video frames or audio stream—state this limitation clearly if asked about visual/spoken details not in metadata): Title="${videoContext.title.trim().slice(0, 180)}", Channel="${String(videoContext.channelName || '').slice(0, 80)}", Category="${String(videoContext.category || '').slice(0, 60)}", Language="${String(videoContext.language || '').slice(0, 40)}", Description="${String(videoContext.description || '').slice(0, 400)}".`
        : '';
    const contextSuffix = `${topicSuffix}${safeVideoMeta}`;

    const normalizedHistory = Array.isArray(history)
      ? history
          .slice(-20)
          .filter((turn) => typeof turn?.text === 'string' && turn.text.trim().length > 0)
          .map((turn) => ({
            role: turn.role === 'model' ? ('model' as const) : ('user' as const),
            parts: [{ text: turn.text!.trim().slice(0, 2000) }],
          }))
      : [];

    const runChat = async (targetModel: string) => {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const chat = ai.chats.create({
        model: targetModel,
        history: normalizedHistory,
        config: {
          systemInstruction: `${roleInstructions[selectedRole]}${contextSuffix}`,
          temperature: 0.7,
        },
      });
      return chat.sendMessage({ message: cleanMessage });
    };

    try {
      let activeModel = model;
      let result;
      try {
        result = await runChat(activeModel);
      } catch (primaryErr) {
        const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        const isTransient = /503|UNAVAILABLE|high demand|overloaded/i.test(primaryMsg);
        if (activeModel !== 'gemini-3.1-flash-lite' && isTransient) {
          activeModel = 'gemini-3.1-flash-lite';
          result = await runChat(activeModel);
        } else {
          throw primaryErr;
        }
      }

      const reply = (result.text || '').trim();
      if (!reply) {
        res.status(502).json({ error: 'Assistant returned an empty response.' });
        return;
      }
      res.json({ reply, model: activeModel, role: selectedRole });
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Unable to reach Gemini service.';
      let friendly = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: string } };
        if (parsed?.error?.message) friendly = parsed.error.message;
      } catch {
        // keep raw message
      }
      console.error('Gemini chat error:', friendly);
      res.status(502).json({ error: friendly });
    }
  }));
}
