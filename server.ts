import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  attachAuth,
  clearSessionCookie,
  getSessionSecret,
  rateLimit,
  requireAdmin,
  requireAuth,
  securityHeaders,
  setSessionCookie,
  type AuthedRequest,
} from './server/auth.ts';
import { db, getChannelAvatarSvg, getVideoThumbnailSvg, seedDatabaseIfEmpty } from './server/db.ts';
import {
  fetchExternalChannelById,
  fetchExternalDiscovery,
  fetchExternalFeed,
  fetchExternalVideoById,
  type DiscoveryResult,
} from './server/discovery.ts';
import {
  filterAndSortVideos,
  hashPassword,
  INDIAN_LANGUAGES,
  rankVideos,
  signSessionToken,
  validateCommentInput,
  validateCopyrightClaim,
  validateVideoInput,
  verifyPassword,
  VIDEO_CATEGORIES,
  type RankableVideo,
} from './server/domain.ts';
import {
  ensureMediaDirs,
  extractThumbnail,
  generateSeedVideoClip,
  HLS_DIR,
  MEDIA_DIR,
  probeMediaFile,
  THUMB_DIR,
  transcodeToHls,
  UPLOAD_DIR,
} from './server/media.ts';

ensureMediaDirs();
seedDatabaseIfEmpty();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(securityHeaders);
app.use(express.json({ limit: '4mb' }));
app.use(attachAuth);

const uploadStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    cb(null, file.fieldname === 'thumbnail' ? THUMB_DIR : UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || (file.fieldname === 'thumbnail' ? '.jpg' : '.mp4');
    cb(null, `${Date.now()}_${randomUUID().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'video') {
      const ok = /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.originalname) || file.mimetype.startsWith('video/');
      cb(null, ok);
      return;
    }
    if (file.fieldname === 'thumbnail') {
      const ok = /\.(jpg|jpeg|png|webp)$/i.test(file.originalname) || file.mimetype.startsWith('image/');
      cb(null, ok);
      return;
    }
    cb(null, false);
  },
});

interface VideoRow {
  id: string;
  channel_id: string;
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

function hydrateVideoRow(r: VideoRow) {
  let tags: string[] = [];
  try {
    tags = JSON.parse(r.tags_json || '[]');
  } catch {
    tags = [];
  }
  const extRef = r.external_ref || (r.id.startsWith('ext_') ? r.id.slice(4) : '');
  return {
    id: r.id,
    channelId: r.channel_id,
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
    ...(r.source_type === 'external' && extRef
      ? {
          externalEmbedUrl:
            r.is_short === 1
              ? `https://www.youtube.com/embed/${extRef}?autoplay=1&loop=1&playlist=${extRef}&rel=0`
              : `https://www.youtube.com/embed/${extRef}?autoplay=1&rel=0`,
          externalOriginalUrl: `https://www.youtube.com/watch?v=${extRef}`,
        }
      : {}),
    isShort: r.is_short === 1,
    isLive: r.is_live === 1,
    views: r.views,
    likes: r.likes,
    dislikes: r.dislikes,
    createdAt: r.created_at,
  };
}

function ensureExternalChannelStub(channel: {
  id: string;
  name: string;
  handle: string;
  description?: string;
  avatarUrl: string;
  verified?: boolean;
  subscriberCount?: number;
}) {
  const existing = db.prepare('SELECT id FROM channels WHERE id = ?').get(channel.id);
  if (existing) return;

  const sysUserId = 'u_ext_registry';
  const sysUser = db.prepare('SELECT id FROM users WHERE id = ?').get(sysUserId);
  const nowIso = new Date().toISOString();
  if (!sysUser) {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, avatar_url, role, preferred_language, created_at)
      VALUES (?, 'External Creators', 'external-registry@doptube.internal', 'disabled', '', 'user', 'Hindi', ?)
    `).run(sysUserId, nowIso);
  }

  let safeHandle = channel.handle || `@${channel.id}`;
  const clash = db.prepare('SELECT id FROM channels WHERE handle = ?').get(safeHandle);
  if (clash) safeHandle = `${safeHandle}_${channel.id.slice(-4)}`;

  db.prepare(`
    INSERT OR IGNORE INTO channels (id, user_id, name, handle, description, avatar_url, banner_color, verified, subscriber_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '#1f1f23', ?, ?, ?)
  `).run(
    channel.id,
    sysUserId,
    channel.name,
    safeHandle,
    channel.description || '',
    channel.avatarUrl,
    channel.verified ? 1 : 0,
    channel.subscriberCount || 0,
    nowIso
  );
}

async function ensureExternalVideoRecord(videoId: string, extData?: DiscoveryResult): Promise<boolean> {
  if (!videoId.startsWith('ext_')) return true;
  const existing = db.prepare('SELECT id FROM videos WHERE id = ?').get(videoId);
  if (existing) return true;

  const resolved = extData ?? (await fetchExternalVideoById(videoId))?.video;
  if (!resolved) return false;

  ensureExternalChannelStub({
    id: resolved.channelId,
    name: resolved.channelName,
    handle: resolved.channelHandle,
    avatarUrl: resolved.channelAvatar,
    verified: resolved.channelVerified,
    subscriberCount: resolved.subscriberCount,
  });

  const rawRef = videoId.slice(4);
  db.prepare(`
    INSERT OR IGNORE INTO videos (
      id, channel_id, title, description, category, language, tags_json,
      thumbnail_url, video_url, hls_url, duration_sec, visibility, status,
      source_type, external_ref, is_short, is_live, views, likes, dislikes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', NULL, ?, 'public', 'published', 'external', ?, ?, ?, ?, ?, 0, ?)
  `).run(
    resolved.id,
    resolved.channelId,
    resolved.title,
    resolved.description,
    resolved.category,
    resolved.language,
    JSON.stringify(resolved.tags || []),
    resolved.thumbnailUrl,
    resolved.durationSec,
    rawRef,
    resolved.isShort ? 1 : 0,
    resolved.isLive ? 1 : 0,
    resolved.views,
    resolved.likes,
    resolved.createdAt
  );
  return true;
}

function buildSignalsForUser(userId?: string) {
  const empty = {
    preferredLanguages: ['Hindi', 'English'],
    watchedCategories: {} as Record<string, number>,
    likedCategories: {} as Record<string, number>,
    subscribedChannelIds: new Set<string>(),
    recentSearches: [] as string[],
  };
  if (!userId) return empty;

  const user = db.prepare('SELECT preferred_language FROM users WHERE id = ?').get(userId) as
    | { preferred_language: string }
    | undefined;
  if (user?.preferred_language) {
    empty.preferredLanguages = [user.preferred_language, 'English'];
  }

  const subs = db.prepare('SELECT channel_id FROM subscriptions WHERE user_id = ?').all(userId) as Array<{ channel_id: string }>;
  for (const s of subs) empty.subscribedChannelIds.add(s.channel_id);

  const histCats = db.prepare(`
    SELECT v.category, COUNT(*) as cnt
    FROM watch_history wh JOIN videos v ON v.id = wh.video_id
    WHERE wh.user_id = ?
    GROUP BY v.category
  `).all(userId) as Array<{ category: string; cnt: number }>;
  for (const row of histCats) empty.watchedCategories[row.category] = row.cnt;

  const likedCats = db.prepare(`
    SELECT v.category, COUNT(*) as cnt
    FROM video_reactions vr JOIN videos v ON v.id = vr.video_id
    WHERE vr.user_id = ? AND vr.reaction = 'like'
    GROUP BY v.category
  `).all(userId) as Array<{ category: string; cnt: number }>;
  for (const row of likedCats) empty.likedCategories[row.category] = row.cnt;

  const searches = db.prepare('SELECT query FROM search_history WHERE user_id = ? ORDER BY searched_at DESC LIMIT 8').all(userId) as Array<{ query: string }>;
  empty.recentSearches = searches.map((s) => s.query);

  return empty;
}

function getUserPayload(userId: string) {
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_url, u.role, u.preferred_language, u.restricted_mode, u.history_paused, u.created_at,
           c.id as channel_id, c.name as channel_name, c.handle as channel_handle, c.description as channel_desc, c.subscriber_count
    FROM users u
    LEFT JOIN channels c ON c.user_id = u.id
    WHERE u.id = ?
  `).get(userId) as Record<string, unknown> | undefined;

  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_url,
    role: user.role,
    preferredLanguage: user.preferred_language,
    restrictedMode: user.restricted_mode === 1,
    historyPaused: user.history_paused === 1,
    createdAt: user.created_at,
    channel: user.channel_id
      ? {
          id: user.channel_id,
          name: user.channel_name,
          handle: user.channel_handle,
          description: user.channel_desc,
          subscriberCount: user.subscriber_count,
        }
      : null,
  };
}

function logAudit(actorUserId: string | null, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(`log_${randomUUID().slice(0, 10)}`, actorUserId, action, targetType, targetId, JSON.stringify(metadata), new Date().toISOString());
}

// =========================================================================
// AUTH ROUTES
// =========================================================================

app.get('/api/auth/me', (req: AuthedRequest, res) => {
  if (!req.auth) {
    res.json({ user: null });
    return;
  }
  const user = getUserPayload(req.auth.userId);
  res.json({ user });
});

app.post('/api/auth/register', rateLimit(20, 60_000), (req, res) => {
  const { name, email, password, preferredLanguage } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    preferredLanguage?: string;
  };
  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters.' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (!password || password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const userId = `u_${randomUUID().slice(0, 10)}`;
  const channelId = `ch_${randomUUID().slice(0, 10)}`;
  const cleanHandleBase = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'creator';
  const handle = `@${cleanHandleBase}${Math.floor(100 + Math.random() * 899)}`;
  const avatarUrl = `/api/avatars/${channelId}.svg`;
  const nowIso = new Date().toISOString();
  const lang = INDIAN_LANGUAGES.includes(preferredLanguage as (typeof INDIAN_LANGUAGES)[number])
    ? preferredLanguage!
    : 'Hindi';

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, avatar_url, role, preferred_language, created_at)
    VALUES (?, ?, ?, ?, ?, 'creator', ?, ?)
  `).run(userId, name.trim(), normalizedEmail, hashPassword(password), avatarUrl, lang, nowIso);

  db.prepare(`
    INSERT INTO channels (id, user_id, name, handle, description, avatar_url, banner_color, verified, subscriber_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '#1f1f23', 0, 0, ?)
  `).run(channelId, userId, name.trim(), handle, `Official DopTube channel of ${name.trim()}.`, avatarUrl, nowIso);

  const token = signSessionToken(
    { userId, role: 'creator', exp: Date.now() + 7 * 24 * 60 * 60 * 1000 },
    getSessionSecret()
  );
  setSessionCookie(res, token);
  logAudit(userId, 'USER_REGISTER', 'user', userId);
  res.status(201).json({ user: getUserPayload(userId) });
});

app.post('/api/auth/login', rateLimit(30, 60_000), (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const row = db.prepare('SELECT id, password_hash, role FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
    | { id: string; password_hash: string; role: 'user' | 'creator' | 'admin' }
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = signSessionToken(
    { userId: row.id, role: row.role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 },
    getSessionSecret()
  );
  setSessionCookie(res, token);
  logAudit(row.id, 'USER_LOGIN', 'user', row.id);
  res.json({ user: getUserPayload(row.id) });
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.patch('/api/auth/profile', requireAuth, (req: AuthedRequest, res) => {
  const { name, preferredLanguage, restrictedMode, historyPaused } = req.body as {
    name?: string;
    preferredLanguage?: string;
    restrictedMode?: boolean;
    historyPaused?: boolean;
  };
  const uid = req.auth!.userId;
  if (name && name.trim().length >= 2) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), uid);
  }
  if (preferredLanguage && INDIAN_LANGUAGES.includes(preferredLanguage as (typeof INDIAN_LANGUAGES)[number])) {
    db.prepare('UPDATE users SET preferred_language = ? WHERE id = ?').run(preferredLanguage, uid);
  }
  if (typeof restrictedMode === 'boolean') {
    db.prepare('UPDATE users SET restricted_mode = ? WHERE id = ?').run(restrictedMode ? 1 : 0, uid);
  }
  if (typeof historyPaused === 'boolean') {
    db.prepare('UPDATE users SET history_paused = ? WHERE id = ?').run(historyPaused ? 1 : 0, uid);
  }
  res.json({ user: getUserPayload(uid) });
});

app.post('/api/auth/reset-password', requireAuth, (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters.' });
    return;
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.auth!.userId) as { password_hash: string };
  if (!verifyPassword(currentPassword, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.auth!.userId);
  logAudit(req.auth!.userId, 'PASSWORD_RESET', 'user', req.auth!.userId);
  res.json({ ok: true });
});

app.delete('/api/auth/account', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.auth!.userId;
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// =========================================================================
// METADATA & MEDIA SERVING ROUTES
// =========================================================================

app.get('/api/meta', (_req, res) => {
  res.json({
    categories: VIDEO_CATEGORIES,
    languages: INDIAN_LANGUAGES,
  });
});

app.get('/api/avatars/:file', (req, res) => {
  const channelId = req.params.file.replace(/\.svg$/, '');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(getChannelAvatarSvg(channelId));
});

app.get('/api/thumbnails/card/:file', (req, res) => {
  const videoId = req.params.file.replace(/\.svg$/, '');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(getVideoThumbnailSvg(videoId));
});

app.get('/api/thumbnails/:file', (req, res) => {
  const safeName = path.basename(req.params.file);
  const full = path.join(THUMB_DIR, safeName);
  if (!fs.existsSync(full)) {
    res.status(404).end();
    return;
  }
  res.sendFile(full);
});

app.get('/api/hls/:videoId/:file', (req, res) => {
  const vid = path.basename(req.params.videoId);
  const file = path.basename(req.params.file);
  const target = path.join(HLS_DIR, vid, file);
  if (!fs.existsSync(target)) {
    res.status(404).end();
    return;
  }
  if (file.endsWith('.m3u8')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  } else if (file.endsWith('.ts')) {
    res.setHeader('Content-Type', 'video/mp2t');
  }
  res.sendFile(target);
});

app.get('/api/stream/:id', async (req, res) => {
  const videoId = path.basename(req.params.id);
  const video = db.prepare('SELECT id, video_url, thumbnail_url, is_short FROM videos WHERE id = ?').get(videoId) as
    | { id: string; video_url: string; thumbnail_url: string; is_short: number }
    | undefined;

  if (!video) {
    res.status(404).json({ error: 'Video stream not found.' });
    return;
  }

  let filePath = path.join(UPLOAD_DIR, `${videoId}.mp4`);
  if (!fs.existsSync(filePath)) {
    // Check for original uploaded extension
    const uploadedMatch = fs.readdirSync(UPLOAD_DIR).find((f) => f.startsWith(`${videoId}.`));
    if (uploadedMatch) {
      filePath = path.join(UPLOAD_DIR, uploadedMatch);
    } else {
      const cachedSeed = path.join(MEDIA_DIR, `${videoId}.mp4`);
      if (!fs.existsSync(cachedSeed)) {
        const imgPath = video.thumbnail_url.startsWith('/src/') ? video.thumbnail_url : undefined;
        await generateSeedVideoClip({
          videoId,
          imagePath: imgPath,
          durationSec: video.is_short === 1 ? 8 : 10,
          isShort: video.is_short === 1,
        });
      }
      filePath = cachedSeed;
    }
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.webm' ? 'video/webm' : 'video/mp4';
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || start >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    const clampedEnd = Math.min(end, fileSize - 1);
    const chunkSize = clampedEnd - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
    });
    fs.createReadStream(filePath, { start, end: clampedEnd }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// =========================================================================
// VIDEOS, FEED, UPLOAD & PROCESSING
// =========================================================================

app.get('/api/videos', async (req: AuthedRequest, res) => {
  const { category = 'All', language = 'All', shorts, trending, sort, q, nativeOnly } = req.query as Record<string, string | undefined>;
  const rows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    WHERE v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'native'
  `).all() as unknown as VideoRow[];

  let items = rows.map(hydrateVideoRow);
  if (shorts === '1') {
    items = items.filter((v) => v.isShort);
  } else if (shorts === '0') {
    items = items.filter((v) => !v.isShort);
  }

  const filteredNative = filterAndSortVideos(items as (ReturnType<typeof hydrateVideoRow> & RankableVideo)[], {
    query: q,
    category,
    language,
    sort: trending === '1' ? 'views' : (sort as 'relevance' | 'date' | 'views' | undefined),
  });

  const rankedNative =
    !q && !sort && trending !== '1'
      ? rankVideos(filteredNative, buildSignalsForUser(req.auth?.userId))
      : filteredNative;

  if (nativeOnly === '1') {
    res.json({ videos: rankedNative });
    return;
  }

  const externalItems = q
    ? await fetchExternalDiscovery(q, language)
    : await fetchExternalFeed({
        category,
        language,
        trending: trending === '1',
        shorts: shorts === '1',
      });

  // Blend external API videos with DopTube native videos (deduplicated by id)
  const seen = new Set(rankedNative.map((v) => v.id));
  const freshExternal = externalItems.filter((v) => !seen.has(v.id));

  let combined: Array<ReturnType<typeof hydrateVideoRow> | DiscoveryResult>;
  if (trending === '1') {
    combined = [...rankedNative, ...freshExternal].sort((a, b) => b.views - a.views);
  } else {
    // Interleave external API videos right alongside native videos so both appear prominently
    combined = [];
    const maxLen = Math.max(rankedNative.length, freshExternal.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < freshExternal.length) combined.push(freshExternal[i]);
      if (i < rankedNative.length) combined.push(rankedNative[i]);
    }
  }

  res.json({ videos: combined });
});

app.get('/api/videos/:id', async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const row = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    WHERE v.id = ?
  `).get(id) as VideoRow | undefined;

  let videoData: (ReturnType<typeof hydrateVideoRow> | DiscoveryResult) | null = null;
  let extRelated: DiscoveryResult[] = [];

  if (row) {
    if (row.source_type === 'external') {
      const extFetched = await fetchExternalVideoById(id);
      if (extFetched) {
        videoData = extFetched.video;
        extRelated = extFetched.related;
      } else {
        videoData = hydrateVideoRow(row);
      }
    } else {
      db.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(id);
      row.views += 1;
      videoData = hydrateVideoRow(row);
    }
  } else if (id.startsWith('ext_')) {
    const extFetched = await fetchExternalVideoById(id);
    if (extFetched) {
      videoData = extFetched.video;
      extRelated = extFetched.related;
    }
  }

  if (!videoData) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }

  const variants =
    videoData.sourceType === 'native'
      ? db.prepare('SELECT quality, resolution, bitrate_kbps as bitrateKbps, playlist_path as playlistPath FROM video_variants WHERE video_id = ?').all(id)
      : [];

  let userReaction: 'like' | 'dislike' | null = null;
  let isSubscribed = false;
  let inWatchLater = false;
  let progressSec = 0;

  if (req.auth) {
    const uid = req.auth.userId;
    const reactRow = db.prepare('SELECT reaction FROM video_reactions WHERE user_id = ? AND video_id = ?').get(uid, id) as
      | { reaction: 'like' | 'dislike' }
      | undefined;
    userReaction = reactRow?.reaction ?? null;

    const subRow = db.prepare('SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?').get(uid, videoData.channelId);
    isSubscribed = Boolean(subRow);

    const wlRow = db.prepare('SELECT 1 FROM watch_later WHERE user_id = ? AND video_id = ?').get(uid, id);
    inWatchLater = Boolean(wlRow);

    const histRow = db.prepare('SELECT progress_sec FROM watch_history WHERE user_id = ? AND video_id = ?').get(uid, id) as
      | { progress_sec: number }
      | undefined;
    progressSec = histRow?.progress_sec ?? 0;

    // Auto-record watch history unless paused
    const userPref = db.prepare('SELECT history_paused FROM users WHERE id = ?').get(uid) as { history_paused: number } | undefined;
    if (userPref && userPref.history_paused === 0) {
      const ok = await ensureExternalVideoRecord(id, videoData.sourceType === 'external' ? (videoData as DiscoveryResult) : undefined);
      if (ok) {
        db.prepare(`
          INSERT INTO watch_history (user_id, video_id, progress_sec, watched_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, video_id) DO UPDATE SET watched_at = excluded.watched_at
        `).run(uid, id, progressSec, new Date().toISOString());
      }
    }
  }

  const relatedRows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    WHERE v.id != ? AND v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'native' AND v.is_short = 0
    ORDER BY (CASE WHEN v.category = ? THEN 1 ELSE 0 END) DESC, v.views DESC
    LIMIT 8
  `).all(id, videoData.category) as unknown as VideoRow[];

  const combinedRelated = [...extRelated, ...relatedRows.map(hydrateVideoRow)].slice(0, 14);

  res.json({
    video: {
      ...videoData,
      variants,
      userReaction,
      isSubscribed,
      inWatchLater,
      progressSec,
    },
    related: combinedRelated,
  });
});

async function runFfmpegProcessingPipeline(videoId: string, uploadedVideoPath: string, hasCustomThumb: boolean) {
  const updateJob = (stage: string, progress: number, status = 'processing', errorMsg: string | null = null) => {
    db.prepare(`
      UPDATE processing_jobs SET stage = ?, progress = ?, status = ?, error_message = ?, updated_at = ?
      WHERE video_id = ?
    `).run(stage, progress, status, errorMsg, new Date().toISOString(), videoId);
  };

  try {
    updateJob('Inspecting media stream (FFprobe)', 20);
    const probe = await probeMediaFile(uploadedVideoPath);
    db.prepare('UPDATE videos SET duration_sec = ? WHERE id = ?').run(probe.durationSec, videoId);

    if (!hasCustomThumb) {
      updateJob('Generating video thumbnail', 45);
      const extracted = await extractThumbnail(uploadedVideoPath, videoId);
      if (extracted) {
        db.prepare('UPDATE videos SET thumbnail_url = ? WHERE id = ?').run(extracted, videoId);
      }
    }

    updateJob('Transcoding adaptive HLS streams (360p & 720p)', 70);
    const hls = await transcodeToHls(uploadedVideoPath, videoId);
    if (hls.hlsUrl) {
      db.prepare('UPDATE videos SET hls_url = ? WHERE id = ?').run(hls.hlsUrl, videoId);
      const insertVar = db.prepare(`
        INSERT INTO video_variants (id, video_id, quality, resolution, bitrate_kbps, playlist_path)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const variant of hls.variants) {
        insertVar.run(`var_${randomUUID().slice(0, 8)}`, videoId, variant.quality, variant.resolution, variant.bitrateKbps, variant.playlistPath);
      }
    }

    db.prepare(`UPDATE videos SET status = 'published' WHERE id = ?`).run(videoId);
    updateJob('Published and ready for streaming', 100, 'completed');
  } catch (err) {
    db.prepare(`UPDATE videos SET status = 'published' WHERE id = ?`).run(videoId);
    updateJob('Published (direct playback)', 100, 'completed', err instanceof Error ? err.message : null);
  }
}

app.post(
  '/api/videos/upload',
  requireAuth,
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  (req: AuthedRequest, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const videoFile = files?.video?.[0];
    const thumbFile = files?.thumbnail?.[0];

    if (!videoFile) {
      res.status(400).json({ error: 'Please select an MP4, WebM, or MOV video file to upload.' });
      return;
    }

    const { title, description = '', category, language, tags = '', visibility = 'public', isShort = 'false' } = req.body as Record<string, string>;
    const validationError = validateVideoInput({ title, category, language, visibility });
    if (validationError) {
      fs.unlink(videoFile.path, () => {});
      if (thumbFile) fs.unlink(thumbFile.path, () => {});
      res.status(400).json({ error: validationError });
      return;
    }

    const channel = db.prepare('SELECT id FROM channels WHERE user_id = ?').get(req.auth!.userId) as { id: string } | undefined;
    if (!channel) {
      res.status(400).json({ error: 'Creator channel not found.' });
      return;
    }

    const videoId = `vid_${randomUUID().slice(0, 10)}`;
    const ext = path.extname(videoFile.filename) || '.mp4';
    const canonicalVideoPath = path.join(UPLOAD_DIR, `${videoId}${ext}`);
    fs.renameSync(videoFile.path, canonicalVideoPath);

    let thumbUrl = `/api/thumbnails/card/${videoId}.svg`;
    if (thumbFile) {
      thumbUrl = `/api/thumbnails/${path.basename(thumbFile.path)}`;
    }

    const tagArray = tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 12);

    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO videos (
        id, channel_id, title, description, category, language, tags_json,
        thumbnail_url, video_url, hls_url, duration_sec, visibility, status,
        source_type, is_short, is_live, views, likes, dislikes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, 'processing', 'native', ?, 0, 0, 0, 0, ?)
    `).run(
      videoId,
      channel.id,
      title.trim(),
      description.trim(),
      category,
      language,
      JSON.stringify(tagArray),
      thumbUrl,
      `/api/stream/${videoId}`,
      visibility,
      isShort === 'true' || isShort === '1' ? 1 : 0,
      nowIso
    );

    db.prepare(`
      INSERT INTO processing_jobs (id, video_id, stage, progress, status, updated_at)
      VALUES (?, ?, 'Queued for FFmpeg processing', 5, 'queued', ?)
    `).run(`job_${randomUUID().slice(0, 8)}`, videoId, nowIso);

    logAudit(req.auth!.userId, 'VIDEO_UPLOAD', 'video', videoId, { title: title.trim() });

    void runFfmpegProcessingPipeline(videoId, canonicalVideoPath, Boolean(thumbFile));

    res.status(201).json({ videoId, status: 'processing' });
  }
);

app.get('/api/videos/:id/status', (req, res) => {
  const job = db.prepare(`
    SELECT j.*, v.status as video_status, v.hls_url, v.thumbnail_url, v.duration_sec
    FROM processing_jobs j
    JOIN videos v ON v.id = j.video_id
    WHERE j.video_id = ?
  `).get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Processing job not found.' });
    return;
  }
  res.json(job);
});

app.patch('/api/videos/:id', requireAuth, (req: AuthedRequest, res) => {
  const videoId = req.params.id;
  const owner = db.prepare(`
    SELECT v.id, c.user_id FROM videos v JOIN channels c ON c.id = v.channel_id WHERE v.id = ?
  `).get(videoId) as { id: string; user_id: string } | undefined;

  if (!owner) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }
  if (owner.user_id !== req.auth!.userId && req.auth!.role !== 'admin') {
    res.status(403).json({ error: 'You do not have permission to edit this video.' });
    return;
  }

  const { title, description, category, language, visibility, tags } = req.body as {
    title?: string;
    description?: string;
    category?: string;
    language?: string;
    visibility?: string;
    tags?: string[];
  };
  const err = validateVideoInput({ title, category, language, visibility });
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  db.prepare(`
    UPDATE videos SET title = ?, description = ?, category = ?, language = ?, visibility = ?, tags_json = ?
    WHERE id = ?
  `).run(title!.trim(), (description ?? '').trim(), category!, language!, visibility ?? 'public', JSON.stringify(tags ?? []), videoId);

  logAudit(req.auth!.userId, 'VIDEO_UPDATE', 'video', videoId);
  res.json({ ok: true });
});

app.delete('/api/videos/:id', requireAuth, (req: AuthedRequest, res) => {
  const videoId = req.params.id;
  const owner = db.prepare(`
    SELECT v.id, c.user_id FROM videos v JOIN channels c ON c.id = v.channel_id WHERE v.id = ?
  `).get(videoId) as { id: string; user_id: string } | undefined;

  if (!owner) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }
  if (owner.user_id !== req.auth!.userId && req.auth!.role !== 'admin') {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }

  db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
  logAudit(req.auth!.userId, 'VIDEO_DELETE', 'video', videoId);
  res.json({ ok: true });
});

// =========================================================================
// UNIFIED SEARCH & SUGGESTIONS
// =========================================================================

app.get('/api/search', async (req: AuthedRequest, res) => {
  const { q = '', category = 'All', language = 'All', sort = 'relevance', duration = 'all' } = req.query as Record<string, string>;

  const rows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    WHERE v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'native'
  `).all() as unknown as VideoRow[];

  const hydrated = rows.map(hydrateVideoRow);
  const nativeMatches = filterAndSortVideos(hydrated as (ReturnType<typeof hydrateVideoRow> & RankableVideo)[], {
    query: q,
    category,
    language,
    sort: sort as 'relevance' | 'date' | 'views',
    duration: duration as 'all' | 'short' | 'medium' | 'long',
  });

  const channelMatches = q.trim()
    ? db.prepare(`
        SELECT id, name, handle, description, avatar_url as avatarUrl, verified, subscriber_count as subscriberCount
        FROM channels
        WHERE LOWER(name) LIKE ? OR LOWER(handle) LIKE ?
        LIMIT 5
      `).all(`%${q.trim().toLowerCase()}%`, `%${q.trim().toLowerCase()}%`)
    : [];

  const externalRaw = q.trim() ? await fetchExternalDiscovery(q, language) : await fetchExternalFeed({ category, language });
  const externalMatches = filterAndSortVideos(externalRaw, {
    duration: duration as 'all' | 'short' | 'medium' | 'long',
    sort: sort as 'relevance' | 'date' | 'views',
  });
  const combined = [...nativeMatches, ...externalMatches];

  if (req.auth && q.trim().length >= 2) {
    const uid = req.auth.userId;
    const userPref = db.prepare('SELECT history_paused FROM users WHERE id = ?').get(uid) as { history_paused: number } | undefined;
    if (userPref && userPref.history_paused === 0) {
      const topThumb = combined[0]?.thumbnailUrl ?? '';
      db.prepare('DELETE FROM search_history WHERE user_id = ? AND LOWER(query) = LOWER(?)').run(uid, q.trim());
      db.prepare('INSERT INTO search_history (id, user_id, query, preview_thumb, searched_at) VALUES (?, ?, ?, ?, ?)').run(
        `sh_${randomUUID().slice(0, 8)}`,
        uid,
        q.trim(),
        topThumb,
        new Date().toISOString()
      );
    }
  }

  res.json({ videos: combined, channels: channelMatches });
});

app.get('/api/search/suggestions', (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const historyRows = req.auth
    ? (db.prepare(`
        SELECT id, query, preview_thumb as previewThumb, searched_at as searchedAt
        FROM search_history
        WHERE user_id = ? AND (? = '' OR LOWER(query) LIKE ?)
        ORDER BY searched_at DESC
        LIMIT 6
      `).all(req.auth.userId, q, `%${q}%`) as Array<{ id: string; query: string; previewThumb: string }>)
    : [];

  const videoSuggestions = q
    ? (db.prepare(`
        SELECT title, thumbnail_url as previewThumb
        FROM videos
        WHERE visibility = 'public' AND status = 'published' AND (LOWER(title) LIKE ? OR LOWER(tags_json) LIKE ?)
        ORDER BY views DESC
        LIMIT 6
      `).all(`%${q}%`, `%${q}%`) as Array<{ title: string; previewThumb: string }>)
    : (db.prepare(`
        SELECT title, thumbnail_url as previewThumb
        FROM videos
        WHERE visibility = 'public' AND status = 'published'
        ORDER BY views DESC
        LIMIT 5
      `).all() as Array<{ title: string; previewThumb: string }>);

  res.json({
    history: historyRows,
    suggestions: videoSuggestions.map((v) => ({ query: v.title, previewThumb: v.previewThumb })),
  });
});

app.get('/api/search/history', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT id, query, preview_thumb as previewThumb, searched_at as searchedAt FROM search_history WHERE user_id = ? ORDER BY searched_at DESC').all(req.auth!.userId);
  res.json({ history: rows });
});

app.delete('/api/search/history', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM search_history WHERE user_id = ?').run(req.auth!.userId);
  res.json({ ok: true });
});

app.delete('/api/search/history/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM search_history WHERE id = ? AND user_id = ?').run(req.params.id, req.auth!.userId);
  res.json({ ok: true });
});

// =========================================================================
// SOCIAL FEATURES: REACTIONS, COMMENTS, SUBSCRIPTIONS, PLAYLISTS, HISTORY
// =========================================================================

app.post('/api/videos/:id/react', requireAuth, rateLimit(60, 60_000), async (req: AuthedRequest, res) => {
  const videoId = req.params.id;
  const uid = req.auth!.userId;
  const { reaction } = req.body as { reaction?: 'like' | 'dislike' | 'none' };
  if (!reaction || !['like', 'dislike', 'none'].includes(reaction)) {
    res.status(400).json({ error: 'Invalid reaction.' });
    return;
  }
  await ensureExternalVideoRecord(videoId);

  const existing = db.prepare('SELECT reaction FROM video_reactions WHERE user_id = ? AND video_id = ?').get(uid, videoId) as
    | { reaction: 'like' | 'dislike' }
    | undefined;

  if (existing?.reaction === 'like') db.prepare('UPDATE videos SET likes = MAX(0, likes - 1) WHERE id = ?').run(videoId);
  if (existing?.reaction === 'dislike') db.prepare('UPDATE videos SET dislikes = MAX(0, dislikes - 1) WHERE id = ?').run(videoId);

  if (reaction === 'none' || existing?.reaction === reaction) {
    db.prepare('DELETE FROM video_reactions WHERE user_id = ? AND video_id = ?').run(uid, videoId);
    const updated = db.prepare('SELECT likes, dislikes FROM videos WHERE id = ?').get(videoId) as { likes: number; dislikes: number };
    res.json({ userReaction: null, ...updated });
    return;
  }

  db.prepare(`
    INSERT INTO video_reactions (user_id, video_id, reaction, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, video_id) DO UPDATE SET reaction = excluded.reaction, created_at = excluded.created_at
  `).run(uid, videoId, reaction, new Date().toISOString());

  if (reaction === 'like') db.prepare('UPDATE videos SET likes = likes + 1 WHERE id = ?').run(videoId);
  if (reaction === 'dislike') db.prepare('UPDATE videos SET dislikes = dislikes + 1 WHERE id = ?').run(videoId);

  const updated = db.prepare('SELECT likes, dislikes FROM videos WHERE id = ?').get(videoId) as { likes: number; dislikes: number };
  res.json({ userReaction: reaction, ...updated });
});

app.get('/api/videos/:id/comments', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.video_id as videoId, c.user_id as userId, c.body, c.likes, c.created_at as createdAt,
           u.name as authorName, u.avatar_url as authorAvatar, ch.handle as authorHandle
    FROM comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN channels ch ON ch.user_id = u.id
    WHERE c.video_id = ?
    ORDER BY c.created_at DESC
  `).all(req.params.id) as Array<{ id: string; [k: string]: unknown }>;

  const replyStmt = db.prepare(`
    SELECT r.id, r.comment_id as commentId, r.user_id as userId, r.body, r.created_at as createdAt,
           u.name as authorName, u.avatar_url as authorAvatar, ch.handle as authorHandle
    FROM comment_replies r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN channels ch ON ch.user_id = u.id
    WHERE r.comment_id = ?
    ORDER BY r.created_at ASC
  `);

  const comments = rows.map((c) => ({
    ...c,
    replies: replyStmt.all(c.id),
  }));
  res.json({ comments });
});

app.post('/api/videos/:id/comments', requireAuth, rateLimit(20, 60_000), async (req: AuthedRequest, res) => {
  const { body } = req.body as { body?: string };
  const err = validateCommentInput(body);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  await ensureExternalVideoRecord(req.params.id);
  const commentId = `cmt_${randomUUID().slice(0, 10)}`;
  db.prepare('INSERT INTO comments (id, video_id, user_id, body, likes, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
    commentId,
    req.params.id,
    req.auth!.userId,
    body!.trim(),
    new Date().toISOString()
  );
  res.status(201).json({ id: commentId });
});

app.post('/api/comments/:id/reply', requireAuth, rateLimit(20, 60_000), (req: AuthedRequest, res) => {
  const { body } = req.body as { body?: string };
  const err = validateCommentInput(body);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const replyId = `rep_${randomUUID().slice(0, 10)}`;
  db.prepare('INSERT INTO comment_replies (id, comment_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
    replyId,
    req.params.id,
    req.auth!.userId,
    body!.trim(),
    new Date().toISOString()
  );
  res.status(201).json({ id: replyId });
});

app.get('/api/channels/:id', async (req: AuthedRequest, res) => {
  const requestedId = req.params.id;
  if (requestedId.startsWith('ext_ch_')) {
    const extCh = await fetchExternalChannelById(requestedId);
    if (!extCh) {
      res.status(404).json({ error: 'Channel not found.' });
      return;
    }
    const isSubscribed = req.auth
      ? Boolean(db.prepare('SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?').get(req.auth.userId, extCh.channel.id))
      : false;
    res.json({
      channel: { ...extCh.channel, isSubscribed },
      videos: extCh.videos,
    });
    return;
  }

  const channel = db.prepare(`
    SELECT id, user_id as userId, name, handle, description, avatar_url as avatarUrl, banner_color as bannerColor,
           verified, subscriber_count as subscriberCount, created_at as createdAt
    FROM channels WHERE id = ? OR handle = ?
  `).get(requestedId, requestedId) as Record<string, unknown> | undefined;

  if (!channel) {
    res.status(404).json({ error: 'Channel not found.' });
    return;
  }

  const isSubscribed = req.auth
    ? Boolean(db.prepare('SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?').get(req.auth.userId, String(channel.id)))
    : false;

  const videoRows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v JOIN channels c ON c.id = v.channel_id
    WHERE v.channel_id = ? AND v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'native'
    ORDER BY v.created_at DESC
  `).all(String(channel.id)) as unknown as VideoRow[];

  res.json({
    channel: { ...channel, isSubscribed },
    videos: videoRows.map(hydrateVideoRow),
  });
});

app.patch('/api/channels/me', requireAuth, (req: AuthedRequest, res) => {
  const { name, description, bannerColor } = req.body as { name?: string; description?: string; bannerColor?: string };
  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: 'Channel name must be at least 2 characters.' });
    return;
  }
  db.prepare('UPDATE channels SET name = ?, description = ?, banner_color = ? WHERE user_id = ?').run(
    name.trim(),
    (description ?? '').trim(),
    bannerColor || '#1f1f23',
    req.auth!.userId
  );
  res.json({ user: getUserPayload(req.auth!.userId) });
});

app.post('/api/channels/:id/subscribe', requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.auth!.userId;
  const channelId = req.params.id;
  if (channelId.startsWith('ext_ch_')) {
    const extCh = await fetchExternalChannelById(channelId);
    if (extCh) ensureExternalChannelStub(extCh.channel);
  }
  const ch = db.prepare('SELECT id, subscriber_count FROM channels WHERE id = ?').get(channelId) as
    | { id: string; subscriber_count: number }
    | undefined;
  if (!ch) {
    res.status(404).json({ error: 'Channel not found.' });
    return;
  }

  const existing = db.prepare('SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?').get(uid, channelId);
  if (existing) {
    db.prepare('DELETE FROM subscriptions WHERE user_id = ? AND channel_id = ?').run(uid, channelId);
    db.prepare('UPDATE channels SET subscriber_count = MAX(0, subscriber_count - 1) WHERE id = ?').run(channelId);
    res.json({ subscribed: false, subscriberCount: Math.max(0, ch.subscriber_count - 1) });
  } else {
    db.prepare('INSERT INTO subscriptions (user_id, channel_id, notify_all, created_at) VALUES (?, ?, 1, ?)').run(
      uid,
      channelId,
      new Date().toISOString()
    );
    db.prepare('UPDATE channels SET subscriber_count = subscriber_count + 1 WHERE id = ?').run(channelId);
    res.json({ subscribed: true, subscriberCount: ch.subscriber_count + 1 });
  }
});

app.get('/api/subscriptions', (req: AuthedRequest, res) => {
  if (!req.auth) {
    const featuredChannels = db.prepare(`
      SELECT id, name, handle, avatar_url as avatarUrl, verified, subscriber_count as subscriberCount
      FROM channels ORDER BY subscriber_count DESC LIMIT 7
    `).all();
    res.json({ channels: featuredChannels, videos: [] });
    return;
  }

  const channels = db.prepare(`
    SELECT c.id, c.name, c.handle, c.avatar_url as avatarUrl, c.verified, c.subscriber_count as subscriberCount, s.notify_all as notifyAll
    FROM subscriptions s JOIN channels c ON c.id = s.channel_id
    WHERE s.user_id = ?
    ORDER BY c.subscriber_count DESC
  `).all(req.auth.userId);

  const videos = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    JOIN subscriptions s ON s.channel_id = c.id
    WHERE s.user_id = ? AND v.visibility = 'public' AND v.status = 'published'
    ORDER BY v.created_at DESC
  `).all(req.auth.userId) as unknown as VideoRow[];

  res.json({ channels, videos: videos.map(hydrateVideoRow) });
});

app.get('/api/history', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count, wh.progress_sec, wh.watched_at
    FROM watch_history wh
    JOIN videos v ON v.id = wh.video_id
    JOIN channels c ON c.id = v.channel_id
    WHERE wh.user_id = ?
    ORDER BY wh.watched_at DESC
  `).all(req.auth!.userId) as unknown as Array<VideoRow & { progress_sec: number; watched_at: string }>;

  res.json({
    videos: rows.map((r) => ({
      ...hydrateVideoRow(r),
      progressSec: r.progress_sec,
      watchedAt: r.watched_at,
    })),
  });
});

app.post('/api/history', requireAuth, (req: AuthedRequest, res) => {
  const { videoId, progressSec = 0 } = req.body as { videoId?: string; progressSec?: number };
  if (!videoId) {
    res.status(400).json({ error: 'videoId required' });
    return;
  }
  const userPref = db.prepare('SELECT history_paused FROM users WHERE id = ?').get(req.auth!.userId) as { history_paused: number } | undefined;
  if (userPref?.history_paused === 1) {
    res.json({ paused: true });
    return;
  }
  db.prepare(`
    INSERT INTO watch_history (user_id, video_id, progress_sec, watched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, video_id) DO UPDATE SET progress_sec = excluded.progress_sec, watched_at = excluded.watched_at
  `).run(req.auth!.userId, videoId, Math.max(0, Math.round(progressSec)), new Date().toISOString());
  res.json({ ok: true });
});

app.delete('/api/history', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM watch_history WHERE user_id = ?').run(req.auth!.userId);
  res.json({ ok: true });
});

app.delete('/api/history/:videoId', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM watch_history WHERE user_id = ? AND video_id = ?').run(req.auth!.userId, req.params.videoId);
  res.json({ ok: true });
});

app.get('/api/watch-later', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM watch_later wl
    JOIN videos v ON v.id = wl.video_id
    JOIN channels c ON c.id = v.channel_id
    WHERE wl.user_id = ?
    ORDER BY wl.added_at DESC
  `).all(req.auth!.userId) as unknown as VideoRow[];
  res.json({ videos: rows.map(hydrateVideoRow) });
});

app.post('/api/watch-later/:videoId', requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.auth!.userId;
  const vid = req.params.videoId;
  await ensureExternalVideoRecord(vid);
  const exists = db.prepare('SELECT 1 FROM watch_later WHERE user_id = ? AND video_id = ?').get(uid, vid);
  if (exists) {
    db.prepare('DELETE FROM watch_later WHERE user_id = ? AND video_id = ?').run(uid, vid);
    res.json({ saved: false });
  } else {
    db.prepare('INSERT INTO watch_later (user_id, video_id, added_at) VALUES (?, ?, ?)').run(uid, vid, new Date().toISOString());
    res.json({ saved: true });
  }
});

app.get('/api/liked-videos', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM video_reactions vr
    JOIN videos v ON v.id = vr.video_id
    JOIN channels c ON c.id = v.channel_id
    WHERE vr.user_id = ? AND vr.reaction = 'like'
    ORDER BY vr.created_at DESC
  `).all(req.auth!.userId) as unknown as VideoRow[];
  res.json({ videos: rows.map(hydrateVideoRow) });
});

app.get('/api/playlists', requireAuth, (req: AuthedRequest, res) => {
  const playlists = db.prepare(`
    SELECT id, title, description, visibility, created_at as createdAt
    FROM playlists WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.auth!.userId) as Array<{ id: string; title: string; description: string; visibility: string; createdAt: string }>;

  const vidStmt = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM playlist_videos pv
    JOIN videos v ON v.id = pv.video_id
    JOIN channels c ON c.id = v.channel_id
    WHERE pv.playlist_id = ?
    ORDER BY pv.added_at DESC
  `);

  res.json({
    playlists: playlists.map((p) => ({
      ...p,
      videos: (vidStmt.all(p.id) as unknown as VideoRow[]).map(hydrateVideoRow),
    })),
  });
});

app.post('/api/playlists', requireAuth, (req: AuthedRequest, res) => {
  const { title, description = '', visibility = 'private' } = req.body as { title?: string; description?: string; visibility?: string };
  if (!title || title.trim().length < 2) {
    res.status(400).json({ error: 'Playlist title must be at least 2 characters.' });
    return;
  }
  const id = `pl_${randomUUID().slice(0, 8)}`;
  db.prepare('INSERT INTO playlists (id, user_id, title, description, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    req.auth!.userId,
    title.trim(),
    description.trim(),
    visibility,
    new Date().toISOString()
  );
  res.status(201).json({ id, title: title.trim() });
});

app.post('/api/playlists/:id/videos', requireAuth, async (req: AuthedRequest, res) => {
  const { videoId } = req.body as { videoId?: string };
  if (!videoId) {
    res.status(400).json({ error: 'videoId required.' });
    return;
  }
  const own = db.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.auth!.userId);
  if (!own) {
    res.status(404).json({ error: 'Playlist not found.' });
    return;
  }
  await ensureExternalVideoRecord(videoId);
  db.prepare('INSERT OR IGNORE INTO playlist_videos (playlist_id, video_id, position, added_at) VALUES (?, ?, 0, ?)').run(
    req.params.id,
    videoId,
    new Date().toISOString()
  );
  res.json({ ok: true });
});

app.delete('/api/playlists/:id/videos/:videoId', requireAuth, (req: AuthedRequest, res) => {
  const own = db.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.auth!.userId);
  if (!own) {
    res.status(404).json({ error: 'Playlist not found.' });
    return;
  }
  db.prepare('DELETE FROM playlist_videos WHERE playlist_id = ? AND video_id = ?').run(req.params.id, req.params.videoId);
  res.json({ ok: true });
});

app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(`
    SELECT id, title, message, target_video_id as targetVideoId, thumbnail_url as thumbnailUrl, is_read as isRead, created_at as createdAt
    FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.auth!.userId);
  res.json({ notifications: rows });
});

app.post('/api/notifications/read', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.auth!.userId);
  res.json({ ok: true });
});

app.post('/api/recommendations/reset', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.auth!.userId;
  db.prepare('DELETE FROM watch_history WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM search_history WHERE user_id = ?').run(uid);
  res.json({ ok: true });
});

// =========================================================================
// REPORTS, COPYRIGHT, STUDIO & ADMIN
// =========================================================================

app.post('/api/reports', (req: AuthedRequest, res) => {
  const { targetType = 'video', targetId, reason, details = '' } = req.body as {
    targetType?: 'video' | 'comment';
    targetId?: string;
    reason?: string;
    details?: string;
  };
  if (!targetId || !reason || reason.trim().length < 3) {
    res.status(400).json({ error: 'Please select a reason for this report.' });
    return;
  }
  const id = `rep_${randomUUID().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO reports (id, reporter_user_id, target_type, target_id, reason, details, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(id, req.auth?.userId ?? null, targetType, targetId, reason.trim(), details.trim(), new Date().toISOString());
  res.status(201).json({ id });
});

app.post('/api/copyright', (req: AuthedRequest, res) => {
  const { videoId, claimantName, claimantEmail, reason } = req.body as {
    videoId?: string;
    claimantName?: string;
    claimantEmail?: string;
    reason?: string;
  };
  if (!videoId) {
    res.status(400).json({ error: 'Video ID is required.' });
    return;
  }
  const err = validateCopyrightClaim({ claimantName, claimantEmail, reason });
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const id = `copy_${randomUUID().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO copyright_claims (id, video_id, reporter_user_id, claimant_name, claimant_email, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, videoId, req.auth?.userId ?? null, claimantName!.trim(), claimantEmail!.trim(), reason!.trim(), new Date().toISOString());
  logAudit(req.auth?.userId ?? null, 'COPYRIGHT_CLAIM_SUBMITTED', 'video', videoId, { claimantName });
  res.status(201).json({ id });
});

app.get('/api/studio/overview', requireAuth, (req: AuthedRequest, res) => {
  const channel = db.prepare(`
    SELECT id, name, handle, description, avatar_url as avatarUrl, banner_color as bannerColor, subscriber_count as subscriberCount, verified
    FROM channels WHERE user_id = ?
  `).get(req.auth!.userId) as { id: string; subscriberCount: number; [k: string]: unknown } | undefined;

  if (!channel) {
    res.status(404).json({ error: 'Channel not found.' });
    return;
  }

  const videos = (db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v JOIN channels c ON c.id = v.channel_id
    WHERE v.channel_id = ?
    ORDER BY v.created_at DESC
  `).all(channel.id) as unknown as VideoRow[]).map(hydrateVideoRow);

  const jobs = db.prepare(`
    SELECT j.*, v.title as videoTitle
    FROM processing_jobs j JOIN videos v ON v.id = j.video_id
    WHERE v.channel_id = ?
    ORDER BY j.updated_at DESC
    LIMIT 10
  `).all(channel.id);

  const comments = db.prepare(`
    SELECT c.id, c.body, c.created_at as createdAt, u.name as authorName, v.title as videoTitle, v.id as videoId
    FROM comments c
    JOIN videos v ON v.id = c.video_id
    JOIN users u ON u.id = c.user_id
    WHERE v.channel_id = ?
    ORDER BY c.created_at DESC
    LIMIT 15
  `).all(channel.id);

  const totalViews = videos.reduce((acc, v) => acc + v.views, 0);
  const totalLikes = videos.reduce((acc, v) => acc + v.likes, 0);
  const estWatchHours = Math.round(videos.reduce((acc, v) => acc + (v.views * Math.max(30, v.durationSec * 0.45)) / 3600, 0));

  res.json({
    channel,
    stats: {
      totalViews,
      totalLikes,
      subscribers: channel.subscriberCount,
      videoCount: videos.length,
      estWatchHours,
    },
    videos,
    jobs,
    comments,
  });
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const users = db.prepare('SELECT id, name, email, role, preferred_language as preferredLanguage, created_at as createdAt FROM users ORDER BY created_at DESC').all();
  const totalVideos = (db.prepare('SELECT COUNT(*) as c FROM videos').get() as { c: number }).c;
  const reports = db.prepare(`
    SELECT r.*, u.name as reporterName
    FROM reports r LEFT JOIN users u ON u.id = r.reporter_user_id
    ORDER BY r.created_at DESC
  `).all();
  const copyrightClaims = db.prepare(`
    SELECT cc.*, v.title as videoTitle
    FROM copyright_claims cc LEFT JOIN videos v ON v.id = cc.video_id
    ORDER BY cc.created_at DESC
  `).all();
  const jobs = db.prepare(`
    SELECT j.*, v.title as videoTitle
    FROM processing_jobs j LEFT JOIN videos v ON v.id = j.video_id
    ORDER BY j.updated_at DESC LIMIT 20
  `).all();
  const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 30').all();

  res.json({
    metrics: {
      totalUsers: users.length,
      totalVideos,
      openReports: reports.filter((r: Record<string, unknown>) => r.status === 'open').length,
      pendingClaims: copyrightClaims.filter((c: Record<string, unknown>) => c.status === 'pending').length,
    },
    users,
    reports,
    copyrightClaims,
    jobs,
    auditLogs,
  });
});

app.patch('/api/admin/reports/:id', requireAdmin, (req: AuthedRequest, res) => {
  const { status } = req.body as { status?: 'open' | 'resolved' | 'dismissed' };
  if (!status || !['open', 'resolved', 'dismissed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, req.params.id);
  logAudit(req.auth!.userId, 'REPORT_MODERATION', 'report', req.params.id, { status });
  res.json({ ok: true });
});

app.patch('/api/admin/copyright/:id', requireAdmin, (req: AuthedRequest, res) => {
  const { status, takedown } = req.body as { status?: string; takedown?: boolean };
  if (!status) {
    res.status(400).json({ error: 'Status required' });
    return;
  }
  db.prepare('UPDATE copyright_claims SET status = ? WHERE id = ?').run(status, req.params.id);
  if (takedown) {
    const claim = db.prepare('SELECT video_id FROM copyright_claims WHERE id = ?').get(req.params.id) as { video_id: string } | undefined;
    if (claim) {
      db.prepare(`UPDATE videos SET visibility = 'private', status = 'taken_down' WHERE id = ?`).run(claim.video_id);
    }
  }
  logAudit(req.auth!.userId, 'COPYRIGHT_DECISION', 'copyright_claim', req.params.id, { status, takedown });
  res.json({ ok: true });
});

app.patch('/api/admin/users/:id/role', requireAdmin, (req: AuthedRequest, res) => {
  const { role } = req.body as { role?: 'user' | 'creator' | 'admin' };
  if (!role || !['user', 'creator', 'admin'].includes(role)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  logAudit(req.auth!.userId, 'USER_ROLE_CHANGE', 'user', req.params.id, { role });
  res.json({ ok: true });
});

// =========================================================================
// VITE MIDDLEWARE (DEV) OR STATIC ASSETS (PROD)
// =========================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DopTube server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
