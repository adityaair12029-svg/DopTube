import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { INDIAN_LANGUAGES, VIDEO_CATEGORIES } from './domain.ts';
import { DATA_DIR, ensureMediaDirs } from './media.ts';

ensureMediaDirs();

const DB_PATH = path.join(DATA_DIR, 'doptube.db');

export interface CompatStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
}

export interface CompatDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => CompatStatement;
}

const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    firebase_uid TEXT UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT 'google_oauth',
    avatar_url TEXT NOT NULL DEFAULT '',
    birthday TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'creator',
    preferred_language TEXT NOT NULL DEFAULT 'English',
    restricted_mode INTEGER NOT NULL DEFAULT 0,
    history_paused INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    handle TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    banner_color TEXT NOT NULL DEFAULT '#1f1f23',
    verified INTEGER NOT NULL DEFAULT 0,
    subscriber_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS languages (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    language TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    thumbnail_url TEXT NOT NULL,
    video_url TEXT NOT NULL,
    hls_url TEXT,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'public',
    status TEXT NOT NULL DEFAULT 'published',
    source_type TEXT NOT NULL DEFAULT 'native',
    external_ref TEXT,
    is_short INTEGER NOT NULL DEFAULT 0,
    is_live INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    dislikes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
  CREATE INDEX IF NOT EXISTS idx_videos_language ON videos(language);
  CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
  CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);

  CREATE TABLE IF NOT EXISTS video_variants (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    quality TEXT NOT NULL,
    resolution TEXT NOT NULL,
    bitrate_kbps INTEGER NOT NULL,
    playlist_path TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS processing_jobs (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',
    error_message TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comment_replies (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS video_reactions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL CHECK(reaction IN ('like', 'dislike')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    notify_all INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'private',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlist_videos (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    PRIMARY KEY (playlist_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS watch_later (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS watch_history (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    progress_sec INTEGER NOT NULL DEFAULT 0,
    watched_at TEXT NOT NULL,
    PRIMARY KEY (user_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS search_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    preview_thumb TEXT NOT NULL DEFAULT '',
    searched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_video_id TEXT,
    thumbnail_url TEXT NOT NULL DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('video', 'comment')),
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS copyright_claims (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    claimant_name TEXT NOT NULL,
    claimant_email TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  -- DopTube AI Recommendation, Behavior, Queue & Music Tables
  CREATE TABLE IF NOT EXISTS user_events (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL DEFAULT '',
    video_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    progress_pct INTEGER NOT NULL DEFAULT 0,
    watch_duration_sec INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_events_video ON user_events(video_id, event_type);

  CREATE TABLE IF NOT EXISTS user_interests (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 50,
    source TEXT NOT NULL DEFAULT 'behavior',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, topic)
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_languages_json TEXT NOT NULL DEFAULT '["English"]',
    preferred_categories_json TEXT NOT NULL DEFAULT '[]',
    selected_interests_json TEXT NOT NULL DEFAULT '[]',
    preferred_format TEXT NOT NULL DEFAULT 'all',
    personalization_enabled INTEGER NOT NULL DEFAULT 1,
    infinite_scroll_enabled INTEGER NOT NULL DEFAULT 1,
    autoplay_enabled INTEGER NOT NULL DEFAULT 1,
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT,
    channel_id TEXT,
    feedback_type TEXT NOT NULL CHECK(feedback_type IN ('not_interested', 'dont_recommend_creator')),
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocked_topics (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, topic)
  );

  CREATE TABLE IF NOT EXISTS blocked_creators (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS recommendation_impressions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    surface TEXT NOT NULL DEFAULT 'home',
    position INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0,
    clicked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS video_queue (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS content_moderation_flags (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS music_tracks (
    id TEXT PRIMARY KEY,
    video_id TEXT REFERENCES videos(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    album_name TEXT NOT NULL DEFAULT 'Single',
    audio_url TEXT NOT NULL,
    cover_url TEXT NOT NULL,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'English',
    genre TEXT NOT NULL DEFAULT 'Music',
    likes INTEGER NOT NULL DEFAULT 0,
    plays INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'public',
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS music_history (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
    played_at TEXT NOT NULL,
    PRIMARY KEY (user_id, track_id)
  );

  CREATE TABLE IF NOT EXISTS music_likes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, track_id)
  );

  CREATE TABLE IF NOT EXISTS music_queue (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, track_id)
  );
`;

function removeDbArtifacts(dbFile: string) {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      const target = `${dbFile}${suffix}`;
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch {
      // ignore cleanup failures
    }
  }
}

function applySafeMigrations(target: CompatDatabase) {
  try {
    const cols = target.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'firebase_uid')) {
      target.exec(`ALTER TABLE users ADD COLUMN firebase_uid TEXT`);
      target.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)`);
    }
    if (!cols.some((c) => c.name === 'birthday')) {
      target.exec(`ALTER TABLE users ADD COLUMN birthday TEXT NOT NULL DEFAULT ''`);
    }
  } catch {
    // ignore migration error if already present
  }
}

function tryOpenNodeSqlite(): CompatDatabase | null {
  if (process.env.VERCEL || process.env.FORCE_SQLJS === '1') {
    return null;
  }
  try {
    const req = createRequire(import.meta.url);
    const mod = req('node:sqlite') as {
      DatabaseSync: new (file: string) => CompatDatabase;
    };
    const initInstance = (dbFile: string): CompatDatabase => {
      const instance = new mod.DatabaseSync(dbFile);
      try {
        instance.exec('PRAGMA journal_mode = WAL;');
      } catch {
        // ignore if WAL unsupported
      }
      instance.exec(SCHEMA_SQL);
      instance.prepare('SELECT COUNT(*) as c FROM users').get();
      applySafeMigrations(instance);
      return instance;
    };

    try {
      return initInstance(DB_PATH);
    } catch {
      removeDbArtifacts(DB_PATH);
      try {
        return initInstance(DB_PATH);
      } catch {
        const fallbackDir = '/tmp/doptube-data';
        if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
        const fallbackPath = path.join(fallbackDir, 'doptube.db');
        removeDbArtifacts(fallbackPath);
        return initInstance(fallbackPath);
      }
    }
  } catch {
    return null;
  }
}

function normalizeSqlParams(params: unknown[]): Array<string | number | null | Uint8Array> {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'number' || typeof p === 'string' || p instanceof Uint8Array) return p;
    return String(p);
  });
}

export async function createSqlJsCompatDatabase(snapshotPath?: string): Promise<CompatDatabase> {
  const req = createRequire(import.meta.url);
  const initMod = req('sql.js/dist/sql-asm.js') as
    | ((opts?: Record<string, unknown>) => Promise<{
        Database: new (data?: ArrayLike<number> | Buffer | null) => {
          run: (sql: string, params?: unknown[]) => unknown;
          exec: (sql: string) => unknown[];
          prepare: (sql: string) => {
            bind: (params?: unknown[]) => boolean;
            step: () => boolean;
            getAsObject: () => Record<string, unknown>;
            free: () => void;
          };
          getRowsModified: () => number;
          export: () => Uint8Array;
        };
      }>)
    | { default?: unknown };

  const initFn = (typeof initMod === 'function' ? initMod : initMod.default) as (
    opts?: Record<string, unknown>
  ) => Promise<{
    Database: new (data?: ArrayLike<number> | Buffer | null) => {
      run: (sql: string, params?: unknown[]) => unknown;
      exec: (sql: string) => unknown[];
      prepare: (sql: string) => {
        bind: (params?: unknown[]) => boolean;
        step: () => boolean;
        getAsObject: () => Record<string, unknown>;
        free: () => void;
      };
      getRowsModified: () => number;
      export: () => Uint8Array;
    };
  }>;

  const SQL = await initFn();
  let initialBytes: Uint8Array | undefined;
  if (snapshotPath && fs.existsSync(snapshotPath)) {
    try {
      initialBytes = fs.readFileSync(snapshotPath);
    } catch {
      initialBytes = undefined;
    }
  }

  let sqlDb = new SQL.Database(initialBytes);
  try {
    sqlDb.exec(SCHEMA_SQL);
    const check = sqlDb.prepare('SELECT COUNT(*) as c FROM users');
    check.step();
    check.free();
  } catch {
    sqlDb = new SQL.Database();
    sqlDb.exec(SCHEMA_SQL);
  }

  let dirtyTimer: ReturnType<typeof setTimeout> | null = null;
  const persistSnapshot = () => {
    if (!snapshotPath) return;
    try {
      const dir = path.dirname(snapshotPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = sqlDb.export();
      fs.writeFileSync(snapshotPath, Buffer.from(data));
    } catch {
      // ignore disk write issues in read-only edge envs
    }
  };

  const schedulePersist = () => {
    if (!snapshotPath) return;
    if (dirtyTimer) clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => {
      dirtyTimer = null;
      persistSnapshot();
    }, 80);
    if (typeof dirtyTimer.unref === 'function') dirtyTimer.unref();
  };

  const compat: CompatDatabase = {
    exec: (sql: string) => {
      sqlDb.exec(sql);
      schedulePersist();
    },
    prepare: (sql: string): CompatStatement => ({
      get: (...params: unknown[]) => {
        const stmt = sqlDb.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(normalizeSqlParams(params));
          if (!stmt.step()) return undefined;
          return stmt.getAsObject();
        } finally {
          stmt.free();
        }
      },
      all: (...params: unknown[]) => {
        const stmt = sqlDb.prepare(sql);
        const rows: Record<string, unknown>[] = [];
        try {
          if (params.length > 0) stmt.bind(normalizeSqlParams(params));
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          return rows;
        } finally {
          stmt.free();
        }
      },
      run: (...params: unknown[]) => {
        sqlDb.run(sql, normalizeSqlParams(params));
        const changes = sqlDb.getRowsModified();
        persistSnapshot();
        return { changes, lastInsertRowid: 0 };
      },
    }),
  };

  applySafeMigrations(compat);
  persistSnapshot();
  return compat;
}

let activeDb: CompatDatabase | null = tryOpenNodeSqlite();
let dbInitPromise: Promise<CompatDatabase> | null = activeDb ? Promise.resolve(activeDb) : null;

export async function ensureDbReady(): Promise<CompatDatabase> {
  if (activeDb) return activeDb;
  if (!dbInitPromise) {
    const snapPath = process.env.VERCEL ? '/tmp/doptube-data/doptube.sqlite' : path.join(DATA_DIR, 'doptube.sqlite');
    dbInitPromise = createSqlJsCompatDatabase(snapPath).then((instance) => {
      activeDb = instance;
      return instance;
    });
  }
  return dbInitPromise;
}

export const db: CompatDatabase = {
  exec: (sql: string) => {
    if (!activeDb) throw new Error('Database is initializing; await ensureDbReady() first.');
    activeDb.exec(sql);
  },
  prepare: (sql: string) => {
    if (!activeDb) throw new Error('Database is initializing; await ensureDbReady() first.');
    return activeDb.prepare(sql);
  },
};

const LEGACY_SEED_USER_IDS = [
  'u_demo',
  'u_admin',
  'u_physics',
  'u_music',
  'u_food',
  'u_tech',
  'u_travel',
  'u_cricket',
  'u_dance',
];

const LEGACY_SEED_VIDEO_IDS = [
  'vid_physics_em',
  'vid_indie_rooftop',
  'vid_cricket_tactics',
  'vid_street_dosa',
  'vid_tech_flagship',
  'vid_ladakh_sunrise',
  'vid_board_electricity',
  'vid_tamil_gaming',
  'vid_comedy_hostel',
  'vid_telugu_science',
  'short_blore_desk',
  'short_kathak_spin',
  'short_chai_pour',
  'short_jee_trick',
  'short_cricket_yorker',
];

let seededOnce = false;

export function purgeLegacySeedData() {
  const deleteVideo = db.prepare('DELETE FROM videos WHERE id = ?');
  for (const vid of LEGACY_SEED_VIDEO_IDS) {
    deleteVideo.run(vid);
  }
  const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');
  for (const uid of LEGACY_SEED_USER_IDS) {
    deleteUser.run(uid);
  }
}

export function seedDatabaseIfEmpty() {
  if (!activeDb || seededOnce) return;
  for (const cat of VIDEO_CATEGORIES) {
    db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(cat);
  }
  for (const lang of INDIAN_LANGUAGES) {
    db.prepare('INSERT OR IGNORE INTO languages (name) VALUES (?)').run(lang);
  }
  purgeLegacySeedData();
  seededOnce = true;
}

export function getVideoThumbnailSvg(videoId: string): string {
  const row = activeDb
    ? (db
        .prepare(`
          SELECT v.title, v.category, v.language, v.is_short, c.name as channel_name, c.banner_color
          FROM videos v JOIN channels c ON c.id = v.channel_id
          WHERE v.id = ?
        `)
        .get(videoId) as
        | {
            title: string;
            category: string;
            language: string;
            is_short: number;
            channel_name: string;
            banner_color: string;
          }
        | undefined)
    : undefined;

  const title = row?.title ?? 'DopTube Spotlight';
  const category = row?.category ?? 'Featured';
  const language = row?.language ?? 'India';
  const channel = row?.channel_name ?? 'DopTube Creator';
  const isShort = row?.is_short === 1;
  const w = isShort ? 540 : 960;
  const h = isShort ? 960 : 540;

  // Hybrid X pitch-black + JioHotstar royal-blue-to-magenta spotlight palettes
  const palettes: Record<string, [string, string, string, string]> = {
    Cricket: ['#040814', '#0b2545', '#1d4ed8', '#38bdf8'],
    Education: ['#050816', '#0f172a', '#2563eb', '#ec4899'],
    Gaming: ['#08061a', '#1e1b4b', '#7c3aed', '#ec4899'],
    Comedy: ['#0a0814', '#27122b', '#db2777', '#fbbf24'],
    Science: ['#040914', '#082f49', '#0284c7', '#a855f7'],
    Cooking: ['#0d0710', '#2b1218', '#e11d48', '#f59e0b'],
    Music: ['#050714', '#17153b', '#1d4ed8', '#ec4899'],
    Technology: ['#030712', '#0b1437', '#2563eb', '#a855f7'],
  };
  const [c1, c2, glowBlue, glowPink] = palettes[category] ?? ['#050816', '#0b1437', '#1d4ed8', '#ec4899'];

  const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const words = title.split(/\s+/).filter(Boolean);
  const line1 = safe(words.slice(0, isShort ? 3 : 5).join(' '));
  const line2 = safe(words.slice(isShort ? 3 : 5, isShort ? 7 : 10).join(' '));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#000000"/>
        <stop offset="55%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
      <linearGradient id="jioGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${glowBlue}"/>
        <stop offset="55%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="${glowPink}"/>
      </linearGradient>
      <radialGradient id="spotR" cx="0.82" cy="0.22" r="0.58">
        <stop offset="0%" stop-color="${glowPink}" stop-opacity="0.34"/>
        <stop offset="55%" stop-color="${glowBlue}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="spotL" cx="0.14" cy="0.88" r="0.5">
        <stop offset="0%" stop-color="${glowBlue}" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#spotR)"/>
    <rect width="${w}" height="${h}" fill="url(#spotL)"/>
    <path d="M 0 ${h * 0.72} L ${w} ${h * 0.42}" stroke="url(#jioGrad)" stroke-opacity="0.24" stroke-width="2"/>
    <circle cx="${w * 0.84}" cy="${h * 0.24}" r="${w * 0.16}" fill="none" stroke="url(#jioGrad)" stroke-opacity="0.35" stroke-width="2"/>
    <rect x="48" y="${h * 0.15}" width="${Math.max(120, category.length * 13 + 38)}" height="34" rx="6" fill="url(#jioGrad)"/>
    <text x="${48 + Math.max(120, category.length * 13 + 38) / 2}" y="${h * 0.15 + 22}" fill="#ffffff" font-family="sans-serif" font-size="14" font-weight="800" letter-spacing="1" text-anchor="middle">${safe(category.toUpperCase())}</text>
    <text x="${48 + Math.max(120, category.length * 13 + 38) + 18}" y="${h * 0.15 + 22}" fill="#9ca3af" font-family="sans-serif" font-size="14" font-weight="700">${safe(language.toUpperCase())}</text>
    <text x="48" y="${h * 0.43}" fill="#ffffff" font-family="sans-serif" font-size="${isShort ? 38 : 44}" font-weight="800">${line1}</text>
    <text x="48" y="${h * 0.43 + (isShort ? 48 : 56)}" fill="#e2e8f0" font-family="sans-serif" font-size="${isShort ? 32 : 36}" font-weight="700">${line2}</text>
    <rect x="48" y="${h - 76}" width="42" height="30" rx="6" fill="url(#jioGrad)"/>
    <polygon points="64,${h - 68} 64,${h - 54} 76,${h - 61}" fill="#ffffff"/>
    <text x="104" y="${h - 54}" fill="#f1f5f9" font-family="sans-serif" font-size="22" font-weight="700">${safe(channel)}</text>
    <rect x="0" y="${h - 5}" width="${w}" height="5" fill="url(#jioGrad)"/>
  </svg>`;
}

export function getChannelAvatarSvg(channelId: string): string {
  const row = activeDb
    ? (db.prepare('SELECT name, banner_color FROM channels WHERE id = ?').get(channelId) as
        | { name: string; banner_color: string }
        | undefined)
    : undefined;
  const name = row?.name ?? 'DT';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const palette = ['#1d4ed8', '#7c3aed', '#db2777', '#2563eb', '#0891b2', '#059669', '#dc2626'];
  let hash = 0;
  for (let i = 0; i < channelId.length; i++) hash = (hash * 31 + channelId.charCodeAt(i)) % palette.length;
  const bg = palette[Math.abs(hash) % palette.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" rx="64" fill="${bg}"/>
    <text x="64" y="76" fill="#ffffff" font-family="sans-serif" font-size="46" font-weight="700" text-anchor="middle">${initials || 'DT'}</text>
  </svg>`;
}

export function readFileIfExists(p: string): boolean {
  return fs.existsSync(p);
}
