import { randomUUID } from 'node:crypto';
import { db } from './db.ts';
import type { DiscoveryResult } from './discovery.ts';
import {
  applyInterestDecayAndDelta,
  computeInterestDelta,
  rankRelatedVideos,
  type BehaviorEventType,
  type CandidateVideo,
  type UserAiContext,
} from './recommendation.ts';
import { detectInteractionAnomaly } from './validation.ts';

export interface HydratedVideoRow {
  id: string;
  channelId: string;
  ownerUserId?: string;
  channelName: string;
  channelHandle: string;
  channelAvatar: string;
  channelVerified: boolean;
  subscriberCount: number;
  title: string;
  description: string;
  category: string;
  language: string;
  tags: string[];
  thumbnailUrl: string;
  videoUrl: string;
  hlsUrl: string | null;
  durationSec: number;
  visibility: string;
  status: string;
  sourceType: 'native' | 'external';
  externalEmbedUrl?: string;
  isShort: boolean;
  isLive: boolean;
  views: number;
  likes: number;
  dislikes: number;
  createdAt: string;
}

export interface VideoDbRow {
  id: string;
  channel_id: string;
  owner_user_id?: string;
  title: string;
  description: string;
  category: string;
  language: string;
  tags_json: string;
  thumbnail_url: string;
  video_url: string;
  hls_url: string | null;
  duration_sec: number;
  visibility: string;
  status: string;
  source_type: 'native' | 'external';
  external_ref: string | null;
  is_short: number;
  is_live: number;
  views: number;
  likes: number;
  dislikes: number;
  created_at: string;
  channel_name: string;
  channel_handle: string;
  channel_avatar: string;
  channel_verified: number;
  subscriber_count: number;
}

export function hydrateVideoRow(r: VideoDbRow): HydratedVideoRow {
  let tags: string[] = [];
  try {
    tags = JSON.parse(r.tags_json || '[]');
  } catch {
    tags = [];
  }
  const isDailymotion = r.id.startsWith('dm_');
  const extRef =
    r.external_ref ||
    (r.id.startsWith('ext_') ? r.id.slice(4) : isDailymotion ? r.id.slice(3) : '');
  const externalEmbedUrl =
    r.source_type === 'external' && extRef
      ? isDailymotion
        ? `https://www.dailymotion.com/embed/video/${extRef}?autoplay=1`
        : r.is_short === 1
        ? `https://www.youtube-nocookie.com/embed/${extRef}?autoplay=1&playsinline=1&loop=1&playlist=${extRef}&rel=0&modestbranding=1&iv_load_policy=3`
        : `https://www.youtube-nocookie.com/embed/${extRef}?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`
      : undefined;

  return {
    id: r.id,
    channelId: r.channel_id,
    ...(r.owner_user_id ? { ownerUserId: r.owner_user_id } : {}),
    channelName: r.channel_name,
    channelHandle: r.channel_handle,
    channelAvatar: r.channel_avatar,
    channelVerified: r.channel_verified === 1,
    subscriberCount: r.subscriber_count,
    title: r.title,
    description: r.description,
    category: r.category,
    language: r.language,
    tags,
    thumbnailUrl: r.thumbnail_url,
    videoUrl: r.video_url,
    hlsUrl: r.hls_url,
    durationSec: r.duration_sec,
    visibility: r.visibility,
    status: r.status,
    sourceType: r.source_type,
    ...(externalEmbedUrl ? { externalEmbedUrl } : {}),
    isShort: r.is_short === 1,
    isLive: r.is_live === 1,
    views: r.views,
    likes: r.likes,
    dislikes: r.dislikes,
    createdAt: r.created_at,
  };
}

export function ensureUserPreferencesRow(userId: string, preferredLanguage = 'English') {
  const existing = db.prepare('SELECT user_id FROM user_preferences WHERE user_id = ?').get(userId);
  if (existing) return;
  db.prepare(`
    INSERT INTO user_preferences (
      user_id, preferred_languages_json, preferred_categories_json, selected_interests_json,
      preferred_format, personalization_enabled, infinite_scroll_enabled, autoplay_enabled,
      onboarding_completed, updated_at
    ) VALUES (?, ?, '[]', '[]', 'all', 1, 1, 1, 0, ?)
  `).run(userId, JSON.stringify([preferredLanguage || 'English']), new Date().toISOString());
}

export function getUserPreferencesPayload(userId: string) {
  ensureUserPreferencesRow(userId);
  const row = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as {
    preferred_languages_json: string;
    preferred_categories_json: string;
    selected_interests_json: string;
    preferred_format: string;
    personalization_enabled: number;
    infinite_scroll_enabled: number;
    autoplay_enabled: number;
    onboarding_completed: number;
  };
  const safeParse = (s: string, fb: string[] = []): string[] => {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : fb;
    } catch {
      return fb;
    }
  };
  return {
    preferredLanguages: safeParse(row.preferred_languages_json, ['English']),
    preferredCategories: safeParse(row.preferred_categories_json, []),
    selectedInterests: safeParse(row.selected_interests_json, []),
    preferredFormat: row.preferred_format || 'all',
    personalizationEnabled: row.personalization_enabled === 1,
    infiniteScrollEnabled: row.infinite_scroll_enabled === 1,
    autoplayEnabled: row.autoplay_enabled === 1,
    onboardingCompleted: row.onboarding_completed === 1,
  };
}

export function buildUserAiContext(userId?: string): UserAiContext {
  const moderatedRows = db
    .prepare(`SELECT target_id FROM content_moderation_flags WHERE target_type = 'video' AND status = 'active'`)
    .all() as Array<{ target_id: string }>;
  const moderatedVideoIds = new Set(moderatedRows.map((r) => r.target_id));

  const ctx: UserAiContext = {
    userId,
    preferredLanguages: ['Hindi', 'English'],
    preferredCategories: [],
    selectedInterests: [],
    interestScores: {},
    subscribedChannelIds: new Set<string>(),
    creatorWatchCounts: {},
    likedVideoIds: new Set<string>(),
    dislikedVideoIds: new Set<string>(),
    watchedVideoIds: new Set<string>(),
    completedVideoIds: new Set<string>(),
    skippedVideoIds: new Set<string>(),
    recentSearches: [],
    personalizationEnabled: true,
    validation: {
      viewerUserId: userId,
      restrictedMode: false,
      blockedCreators: new Set<string>(),
      blockedTopics: new Set<string>(),
      notInterestedVideoIds: new Set<string>(),
      moderatedVideoIds,
      region: 'IN',
    },
  };

  if (!userId) return ctx;

  const userRow = db
    .prepare('SELECT preferred_language, restricted_mode FROM users WHERE id = ?')
    .get(userId) as { preferred_language: string; restricted_mode: number } | undefined;

  if (userRow) {
    ctx.validation.restrictedMode = userRow.restricted_mode === 1;
    const prefs = getUserPreferencesPayload(userId);
    ctx.preferredLanguages = prefs.preferredLanguages.length > 0 ? prefs.preferredLanguages : [userRow.preferred_language || 'English'];
    ctx.preferredCategories = prefs.preferredCategories;
    ctx.selectedInterests = prefs.selectedInterests;
    ctx.personalizationEnabled = prefs.personalizationEnabled;
  }

  const interestRows = db
    .prepare('SELECT topic, score FROM user_interests WHERE user_id = ?')
    .all(userId) as Array<{ topic: string; score: number }>;
  for (const r of interestRows) {
    ctx.interestScores[r.topic] = r.score;
  }
  for (const interest of ctx.selectedInterests) {
    if (!(interest in ctx.interestScores)) {
      ctx.interestScores[interest] = 75;
    }
  }

  const subRows = db
    .prepare('SELECT channel_id FROM subscriptions WHERE user_id = ?')
    .all(userId) as Array<{ channel_id: string }>;
  for (const s of subRows) ctx.subscribedChannelIds.add(s.channel_id);

  const blockedCreators = db
    .prepare('SELECT channel_id FROM blocked_creators WHERE user_id = ?')
    .all(userId) as Array<{ channel_id: string }>;
  for (const bc of blockedCreators) ctx.validation.blockedCreators.add(bc.channel_id);

  const blockedTopics = db
    .prepare('SELECT topic FROM blocked_topics WHERE user_id = ?')
    .all(userId) as Array<{ topic: string }>;
  for (const bt of blockedTopics) ctx.validation.blockedTopics.add(bt.topic);

  const fbRows = db
    .prepare('SELECT video_id, channel_id, feedback_type FROM user_feedback WHERE user_id = ?')
    .all(userId) as Array<{ video_id: string | null; channel_id: string | null; feedback_type: string }>;
  for (const fb of fbRows) {
    if (fb.feedback_type === 'not_interested' && fb.video_id) {
      ctx.validation.notInterestedVideoIds.add(fb.video_id);
    }
    if (fb.feedback_type === 'dont_recommend_creator' && fb.channel_id) {
      ctx.validation.blockedCreators.add(fb.channel_id);
    }
  }

  const reactRows = db
    .prepare('SELECT video_id, reaction FROM video_reactions WHERE user_id = ?')
    .all(userId) as Array<{ video_id: string; reaction: 'like' | 'dislike' }>;
  for (const r of reactRows) {
    if (r.reaction === 'like') ctx.likedVideoIds.add(r.video_id);
    if (r.reaction === 'dislike') ctx.dislikedVideoIds.add(r.video_id);
  }

  const histRows = db
    .prepare(`
      SELECT wh.video_id, v.channel_id
      FROM watch_history wh
      LEFT JOIN videos v ON v.id = wh.video_id
      WHERE wh.user_id = ?
      ORDER BY wh.watched_at DESC
      LIMIT 60
    `)
    .all(userId) as Array<{ video_id: string; channel_id: string | null }>;
  for (const h of histRows) {
    ctx.watchedVideoIds.add(h.video_id);
    if (h.channel_id) {
      ctx.creatorWatchCounts[h.channel_id] = (ctx.creatorWatchCounts[h.channel_id] ?? 0) + 1;
    }
  }

  const eventRows = db
    .prepare('SELECT video_id, event_type FROM user_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 120')
    .all(userId) as Array<{ video_id: string; event_type: string }>;
  for (const ev of eventRows) {
    if (ev.event_type === 'completion') ctx.completedVideoIds.add(ev.video_id);
    if (ev.event_type === 'skip' || ev.event_type === 'abandoned') ctx.skippedVideoIds.add(ev.video_id);
  }

  const searches = db
    .prepare('SELECT query FROM search_history WHERE user_id = ? ORDER BY searched_at DESC LIMIT 8')
    .all(userId) as Array<{ query: string }>;
  ctx.recentSearches = searches.map((s) => s.query);

  return ctx;
}

export function getAllNativeCandidates(): CandidateVideo[] {
  const rows = db
    .prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
             c.verified as channel_verified, c.subscriber_count, c.user_id as owner_user_id
      FROM videos v
      JOIN channels c ON c.id = v.channel_id
      WHERE v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'native'
    `)
    .all() as unknown as VideoDbRow[];
  return rows.map(hydrateVideoRow);
}

export function toCandidate(item: HydratedVideoRow | DiscoveryResult): CandidateVideo {
  return {
    ...item,
    status: 'status' in item ? item.status : 'published',
    visibility: 'visibility' in item ? item.visibility : 'public',
    dislikes: 'dislikes' in item ? item.dislikes : 0,
  };
}

export interface BehaviorEventInput {
  eventId?: string;
  userId?: string;
  sessionId?: string;
  videoId: string;
  eventType: BehaviorEventType;
  progressPct?: number;
  watchDurationSec?: number;
  metadata?: Record<string, unknown>;
}

export function recordBehaviorEvent(params: BehaviorEventInput) {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  let isAnomaly = false;

  if (params.userId) {
    const recent = db
      .prepare('SELECT created_at FROM user_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(params.userId) as Array<{ created_at: string }>;
    const timestamps = recent.map((r) => new Date(r.created_at).getTime()).filter((t) => !Number.isNaN(t));
    timestamps.push(nowMs);
    isAnomaly = detectInteractionAnomaly(timestamps, 10_000, 16);
  }

  const cleanEventId =
    typeof params.eventId === 'string' && params.eventId.trim().length > 0
      ? params.eventId.trim().slice(0, 64)
      : `ev_${randomUUID().slice(0, 10)}`;

  const info = db
    .prepare(`
      INSERT OR IGNORE INTO user_events (id, user_id, session_id, video_id, event_type, progress_pct, watch_duration_sec, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      cleanEventId,
      params.userId ?? null,
      params.sessionId || '',
      params.videoId,
      params.eventType,
      Math.max(0, Math.min(100, Math.round(params.progressPct ?? 0))),
      Math.max(0, Math.round(params.watchDurationSec ?? 0)),
      JSON.stringify({ ...(params.metadata ?? {}), anomaly: isAnomaly }),
      nowIso
    );

  if (info.changes === 0) {
    return { recorded: true, deduplicated: true, anomaly: false };
  }

  if (!params.userId || isAnomaly) return { recorded: true, deduplicated: false, anomaly: isAnomaly };

  const prefs = getUserPreferencesPayload(params.userId);
  if (!prefs.personalizationEnabled) return { recorded: true, deduplicated: false, anomaly: false };

  const delta = computeInterestDelta(params.eventType);
  if (delta === 0) return { recorded: true, deduplicated: false, anomaly: false };

  const vidRow = db
    .prepare('SELECT category, tags_json FROM videos WHERE id = ?')
    .get(params.videoId) as { category: string; tags_json: string } | undefined;

  if (!vidRow) return { recorded: true, deduplicated: false, anomaly: false };

  const topics = new Set<string>([vidRow.category]);
  try {
    const parsedTags = JSON.parse(vidRow.tags_json || '[]') as string[];
    for (const t of parsedTags.slice(0, 3)) {
      if (t && t.trim().length >= 2) topics.add(t.trim());
    }
  } catch {
    // ignore invalid json
  }

  const getInterest = db.prepare('SELECT score, updated_at FROM user_interests WHERE user_id = ? AND topic = ?');
  const upsertInterest = db.prepare(`
    INSERT INTO user_interests (user_id, topic, score, source, updated_at)
    VALUES (?, ?, ?, 'behavior', ?)
    ON CONFLICT(user_id, topic) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at
  `);

  for (const topic of topics) {
    const existing = getInterest.get(params.userId, topic) as { score: number; updated_at: string } | undefined;
    const days = existing
      ? Math.max(0, (nowMs - new Date(existing.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const baseScore = existing ? existing.score : 50;
    const nextScore = applyInterestDecayAndDelta(baseScore, topic === vidRow.category ? delta : delta * 0.5, days);
    upsertInterest.run(params.userId, topic, nextScore, nowIso);
  }

  return { recorded: true, deduplicated: false, anomaly: false };
}

export function recordBehaviorEventBatch(events: BehaviorEventInput[]) {
  let recorded = 0;
  let deduplicated = 0;
  let skipped = 0;
  for (const ev of events) {
    if (!ev?.videoId || !ev?.eventType) {
      skipped += 1;
      continue;
    }
    const res = recordBehaviorEvent(ev);
    if (res.deduplicated) deduplicated += 1;
    else recorded += 1;
  }
  return { recorded, deduplicated, skipped, total: events.length };
}

export function getRelatedCandidatePool(currentVideo: CandidateVideo, ctx: UserAiContext, extraExternal: DiscoveryResult[] = []): CandidateVideo[] {
  const native = getAllNativeCandidates();
  const cachedExtRows = db
    .prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
             c.verified as channel_verified, c.subscriber_count
      FROM videos v JOIN channels c ON c.id = v.channel_id
      WHERE v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'external' AND v.is_short = 0
      ORDER BY v.views DESC LIMIT 20
    `)
    .all() as unknown as VideoDbRow[];
  const pool = [...extraExternal.map(toCandidate), ...native, ...cachedExtRows.map(hydrateVideoRow).map(toCandidate)];
  return rankRelatedVideos(currentVideo, pool, ctx);
}
