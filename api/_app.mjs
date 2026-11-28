// server/app.ts
import "dotenv/config";
import { randomUUID as randomUUID4 } from "node:crypto";
import fs5 from "node:fs";
import path5 from "node:path";
import express from "express";
import multer2 from "multer";

// server/aiService.ts
import { randomUUID } from "node:crypto";

// server/db.ts
import fs2 from "node:fs";
import { createRequire } from "node:module";
import path2 from "node:path";

// server/domain.ts
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
var INDIAN_LANGUAGES = [
  "Hindi",
  "English",
  "Tamil",
  "Telugu",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Punjabi",
  "Odia",
  "Assamese",
  "Urdu"
];
var VIDEO_CATEGORIES = [
  "Education",
  "Entertainment",
  "Technology",
  "Gaming",
  "Music",
  "Sports",
  "Cricket",
  "News",
  "Comedy",
  "Movies",
  "Lifestyle",
  "Cooking",
  "Travel",
  "Science",
  "Agriculture",
  "Business",
  "Devotional",
  "Health and Fitness"
];
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  const derived = scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, "hex");
  if (derived.length !== original.length) return false;
  return timingSafeEqual(derived, original);
}
function buildUsernameSuggestions(name, preferredHandle) {
  const base = (preferredHandle || name || "creator").toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_]/g, "").slice(0, 14) || "doptubeuser";
  const year = (/* @__PURE__ */ new Date()).getFullYear().toString().slice(-2);
  const candidates = [
    base,
    `${base}${year}`,
    `${base}_in`,
    `real_${base}`,
    `${base}07`,
    `${base}_official`
  ];
  return Array.from(new Set(candidates)).map((c) => `@${c}`);
}
function signSessionToken(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}
function verifySessionToken(token, secret) {
  const dotIdx = token.indexOf(".");
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = createHmac("sha256", secret).update(encoded).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!parsed.userId || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function scoreVideoForUser(video, signals, nowMs = Date.now()) {
  let score = Math.log10(Math.max(10, video.views)) * 12 + Math.log10(Math.max(2, video.likes)) * 8;
  const ageHours = Math.max(1, (nowMs - new Date(video.createdAt).getTime()) / (1e3 * 60 * 60));
  const recencyBoost = Math.max(0, 28 - Math.log2(ageHours) * 2.5);
  score += recencyBoost;
  if (video.isLive) score += 18;
  if (signals.subscribedChannelIds.has(video.channelId)) score += 35;
  if (signals.preferredLanguages.includes(video.language)) {
    score += 22;
  }
  const catWatchWeight = signals.watchedCategories[video.category] ?? 0;
  const catLikeWeight = signals.likedCategories[video.category] ?? 0;
  score += Math.min(30, catWatchWeight * 6) + Math.min(24, catLikeWeight * 8);
  const haystack = `${video.title} ${video.description} ${video.tags.join(" ")} ${video.category}`.toLowerCase();
  for (const term of signals.recentSearches) {
    const normalized = term.trim().toLowerCase();
    if (normalized.length >= 2 && haystack.includes(normalized)) {
      score += 18;
    }
  }
  return Number(score.toFixed(2));
}
function rankVideos(videos, signals, nowMs = Date.now()) {
  return [...videos].sort((a, b) => scoreVideoForUser(b, signals, nowMs) - scoreVideoForUser(a, signals, nowMs));
}
function filterAndSortVideos(videos, opts) {
  const q = (opts.query ?? "").trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];
  const refNowMs = opts.nowMs ?? Date.now();
  const filtered = videos.filter((v) => {
    if (opts.category && opts.category !== "All") {
      const catNorm = opts.category.toLowerCase();
      const matchesCat = v.category.toLowerCase() === catNorm || v.tags.some((t) => t.toLowerCase() === catNorm) || catNorm === "live" && v.isLive || catNorm === "mixes" && v.category === "Music" || catNorm === "jee advanced" && (v.tags.some((t) => t.toLowerCase().includes("jee")) || v.title.toLowerCase().includes("jee")) || catNorm === "board examinations" && v.tags.some((t) => t.toLowerCase().includes("board") || t.toLowerCase().includes("class 10") || t.toLowerCase().includes("class 12")) || catNorm === "physics" && (v.tags.some((t) => t.toLowerCase().includes("physics")) || v.title.toLowerCase().includes("physics"));
      if (!matchesCat) return false;
    }
    if (opts.language && opts.language !== "All") {
      if (v.language.toLowerCase() !== opts.language.toLowerCase()) return false;
    }
    if (opts.duration && opts.duration !== "all") {
      if (opts.duration === "short" && v.durationSec >= 240) return false;
      if (opts.duration === "medium" && (v.durationSec < 240 || v.durationSec > 1200)) return false;
      if (opts.duration === "long" && v.durationSec <= 1200) return false;
    }
    if (opts.uploadDate && opts.uploadDate !== "any") {
      const createdMs = new Date(v.createdAt).getTime();
      if (!Number.isNaN(createdMs)) {
        const diffMs = Math.max(0, refNowMs - createdMs);
        const dayMs = 24 * 60 * 60 * 1e3;
        if (opts.uploadDate === "today" && diffMs > dayMs) return false;
        if (opts.uploadDate === "week" && diffMs > 7 * dayMs) return false;
        if (opts.uploadDate === "month" && diffMs > 30 * dayMs) return false;
      }
    }
    if (terms.length > 0) {
      const text = `${v.title} ${v.description} ${v.category} ${v.language} ${v.tags.join(" ")}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    }
    return true;
  });
  if (opts.sort === "date") {
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  if (opts.sort === "views") {
    return filtered.sort((a, b) => b.views - a.views);
  }
  if (terms.length > 0) {
    return filtered.sort((a, b) => {
      const scoreTitle = (v) => terms.reduce((acc, t) => acc + (v.title.toLowerCase().includes(t) ? 10 : 1), 0) + Math.log10(Math.max(10, v.views));
      return scoreTitle(b) - scoreTitle(a);
    });
  }
  return filtered;
}
function parseIsoDurationToSeconds(iso) {
  if (!iso || typeof iso !== "string") return 0;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}
function validateVideoInput(input) {
  const title = (input.title ?? "").trim();
  if (title.length < 3 || title.length > 160) {
    return "Video title must be between 3 and 160 characters.";
  }
  if (!input.category || !VIDEO_CATEGORIES.includes(input.category)) {
    return "Please select a valid video category.";
  }
  if (!input.language || !INDIAN_LANGUAGES.includes(input.language)) {
    return "Please select a valid supported language.";
  }
  const vis = input.visibility ?? "public";
  if (!["public", "unlisted", "private"].includes(vis)) {
    return "Visibility must be public, unlisted, or private.";
  }
  return null;
}
function validateCommentInput(text) {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 1 || trimmed.length > 1500) {
    return "Comment must be between 1 and 1500 characters.";
  }
  return null;
}
function validateCopyrightClaim(input) {
  if (!input.claimantName || input.claimantName.trim().length < 2) {
    return "Claimant or organization name is required.";
  }
  if (!input.claimantEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.claimantEmail.trim())) {
    return "A valid contact email is required.";
  }
  if (!input.reason || input.reason.trim().length < 15) {
    return "Please describe the rights ownership claim in at least 15 characters.";
  }
  return null;
}

// server/media.ts
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var DATA_DIR = process.env.VERCEL ? "/tmp/doptube-data" : path.resolve(process.cwd(), "data");
var UPLOAD_DIR = path.join(DATA_DIR, "uploads");
var THUMB_DIR = path.join(DATA_DIR, "thumbnails");
var MEDIA_DIR = path.join(DATA_DIR, "media");
var HLS_DIR = path.join(DATA_DIR, "hls");
function ensureMediaDirs() {
  for (const dir of [DATA_DIR, UPLOAD_DIR, THUMB_DIR, MEDIA_DIR, HLS_DIR]) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
    }
  }
}
async function probeMediaFile(filePath) {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { timeout: 1e4 }
    );
    const parsed = JSON.parse(stdout);
    const videoStream = parsed.streams?.find((s) => s.codec_type === "video");
    const duration = Math.max(1, Math.round(Number(parsed.format?.duration ?? 10)));
    return {
      durationSec: Number.isFinite(duration) ? duration : 10,
      width: videoStream?.width ?? 1280,
      height: videoStream?.height ?? 720
    };
  } catch {
    return { durationSec: 12, width: 1280, height: 720 };
  }
}
async function extractThumbnail(videoPath, videoId) {
  ensureMediaDirs();
  const outThumb = path.join(THUMB_DIR, `${videoId}.jpg`);
  try {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-ss", "00:00:01", "-i", videoPath, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", outThumb],
      { timeout: 15e3 }
    );
    if (fs.existsSync(outThumb)) {
      return `/api/thumbnails/${videoId}.jpg`;
    }
    return null;
  } catch {
    return null;
  }
}
async function transcodeToHls(videoPath, videoId) {
  ensureMediaDirs();
  const outDir = path.join(HLS_DIR, videoId);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const playlist360 = path.join(outDir, "360p.m3u8");
  const playlist720 = path.join(outDir, "720p.m3u8");
  const masterPath = path.join(outDir, "master.m3u8");
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        videoPath,
        "-vf",
        "scale=-2:360",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-b:v",
        "600k",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "-hls_time",
        "4",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        path.join(outDir, "360p_%03d.ts"),
        playlist360
      ],
      { timeout: 45e3 }
    );
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        videoPath,
        "-vf",
        "scale=-2:720",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-b:v",
        "1400k",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-hls_time",
        "4",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        path.join(outDir, "720p_%03d.ts"),
        playlist720
      ],
      { timeout: 6e4 }
    );
    const masterContent = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360",
      "360p.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=1550000,RESOLUTION=1280x720",
      "720p.m3u8"
    ].join("\n");
    fs.writeFileSync(masterPath, masterContent, "utf8");
    return {
      hlsUrl: `/api/hls/${videoId}/master.m3u8`,
      variants: [
        { quality: "360p", resolution: "640x360", bitrateKbps: 600, playlistPath: `/api/hls/${videoId}/360p.m3u8` },
        { quality: "720p", resolution: "1280x720", bitrateKbps: 1400, playlistPath: `/api/hls/${videoId}/720p.m3u8` }
      ]
    };
  } catch {
    return { hlsUrl: null, variants: [] };
  }
}

// server/db.ts
ensureMediaDirs();
var DB_PATH = path2.join(DATA_DIR, "doptube.db");
var SCHEMA_SQL = `
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
var TABLE_COPY_ORDER = [
  "users",
  "channels",
  "categories",
  "languages",
  "videos",
  "video_variants",
  "processing_jobs",
  "comments",
  "comment_replies",
  "video_reactions",
  "subscriptions",
  "playlists",
  "playlist_videos",
  "watch_later",
  "watch_history",
  "search_history",
  "notifications",
  "reports",
  "copyright_claims",
  "audit_logs",
  "user_events",
  "user_interests",
  "user_preferences",
  "user_feedback",
  "blocked_topics",
  "blocked_creators",
  "recommendation_impressions",
  "video_queue",
  "content_moderation_flags",
  "music_tracks",
  "music_history",
  "music_likes",
  "music_queue"
];
function removeDbArtifacts(dbFile) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      const target = `${dbFile}${suffix}`;
      if (fs2.existsSync(target)) fs2.unlinkSync(target);
    } catch {
    }
  }
}
function applySafeMigrations(target) {
  try {
    const cols = target.prepare(`PRAGMA table_info(users)`).all();
    if (!cols.some((c) => c.name === "firebase_uid")) {
      target.exec(`ALTER TABLE users ADD COLUMN firebase_uid TEXT`);
      target.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)`);
    }
    if (!cols.some((c) => c.name === "birthday")) {
      target.exec(`ALTER TABLE users ADD COLUMN birthday TEXT NOT NULL DEFAULT ''`);
    }
  } catch {
  }
}
function isQuickCheckOk(instance) {
  try {
    const row = instance.prepare("PRAGMA quick_check(1)").get();
    return row?.quick_check === "ok";
  } catch {
    return false;
  }
}
function rebuildHealthySqliteFromCorrupt(DatabaseSyncCtor, dbFile) {
  const repairedFile = `${dbFile}.repaired`;
  removeDbArtifacts(repairedFile);
  let sourceDb = null;
  const freshDb = new DatabaseSyncCtor(repairedFile);
  freshDb.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
  freshDb.exec(SCHEMA_SQL);
  applySafeMigrations(freshDb);
  try {
    sourceDb = new DatabaseSyncCtor(dbFile);
    freshDb.exec("PRAGMA foreign_keys = OFF;");
    for (const table of TABLE_COPY_ORDER) {
      try {
        const rows = sourceDb.prepare(`SELECT * FROM ${table}`).all();
        if (rows.length === 0) continue;
        const targetCols = freshDb.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
        const validCols = Object.keys(rows[0]).filter((c) => targetCols.includes(c));
        if (validCols.length === 0) continue;
        const placeholders = validCols.map(() => "?").join(", ");
        const insertStmt = freshDb.prepare(
          `INSERT OR IGNORE INTO ${table} (${validCols.join(", ")}) VALUES (${placeholders})`
        );
        for (const row of rows) {
          try {
            insertStmt.run(...validCols.map((col) => row[col] ?? null));
          } catch {
          }
        }
      } catch {
      }
    }
    freshDb.exec("PRAGMA foreign_keys = ON;");
  } catch {
  } finally {
    try {
      sourceDb?.close?.();
    } catch {
    }
    try {
      freshDb.close?.();
    } catch {
    }
  }
  removeDbArtifacts(dbFile);
  fs2.renameSync(repairedFile, dbFile);
  const verified = new DatabaseSyncCtor(dbFile);
  verified.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
  verified.exec(SCHEMA_SQL);
  applySafeMigrations(verified);
  if (!isQuickCheckOk(verified)) {
    throw new Error("Repaired SQLite verification failed");
  }
  return verified;
}
function tryOpenNodeSqlite() {
  if (process.env.VERCEL || process.env.FORCE_SQLJS === "1") {
    return null;
  }
  try {
    const req = createRequire(import.meta.url);
    const mod = req("node:sqlite");
    const initHealthyInstance = (dbFile) => {
      const instance = new mod.DatabaseSync(dbFile);
      try {
        instance.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
      } catch {
      }
      if (!isQuickCheckOk(instance)) {
        try {
          instance.exec("REINDEX;");
        } catch {
        }
      }
      if (!isQuickCheckOk(instance)) {
        try {
          instance.close?.();
        } catch {
        }
        console.warn(`Detected malformed SQLite image at ${dbFile}; rebuilding with intact table recovery.`);
        return rebuildHealthySqliteFromCorrupt(mod.DatabaseSync, dbFile);
      }
      instance.exec(SCHEMA_SQL);
      applySafeMigrations(instance);
      if (!isQuickCheckOk(instance)) {
        try {
          instance.close?.();
        } catch {
        }
        return rebuildHealthySqliteFromCorrupt(mod.DatabaseSync, dbFile);
      }
      return instance;
    };
    try {
      return initHealthyInstance(DB_PATH);
    } catch {
      try {
        return rebuildHealthySqliteFromCorrupt(mod.DatabaseSync, DB_PATH);
      } catch {
        removeDbArtifacts(DB_PATH);
        try {
          return initHealthyInstance(DB_PATH);
        } catch {
          const fallbackDir = "/tmp/doptube-data";
          if (!fs2.existsSync(fallbackDir)) fs2.mkdirSync(fallbackDir, { recursive: true });
          const fallbackPath = path2.join(fallbackDir, "doptube.db");
          removeDbArtifacts(fallbackPath);
          return initHealthyInstance(fallbackPath);
        }
      }
    }
  } catch {
    return null;
  }
}
function normalizeSqlParams(params) {
  return params.map((p) => {
    if (p === void 0 || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (typeof p === "number" || typeof p === "string" || p instanceof Uint8Array) return p;
    return String(p);
  });
}
async function createSqlJsCompatDatabase(snapshotPath) {
  let initMod;
  try {
    initMod = await import("sql.js/dist/sql-asm.js");
  } catch {
    const req = createRequire(import.meta.url);
    initMod = req("sql.js/dist/sql-asm.js");
  }
  const resolved = initMod;
  const candidate = typeof resolved === "function" ? resolved : resolved?.default;
  const initFn = typeof candidate === "function" ? candidate : candidate?.default;
  if (typeof initFn !== "function") {
    throw new Error("Failed to resolve sql.js asm initializer.");
  }
  const SQL = await initFn();
  let initialBytes;
  if (snapshotPath && fs2.existsSync(snapshotPath)) {
    try {
      initialBytes = fs2.readFileSync(snapshotPath);
    } catch {
      initialBytes = void 0;
    }
  }
  let sqlDb = new SQL.Database(initialBytes);
  try {
    const qc = sqlDb.exec("PRAGMA quick_check(1)");
    const qcVal = qc?.[0]?.values?.[0]?.[0];
    if (qcVal !== "ok") {
      throw new Error("Corrupt sql.js snapshot");
    }
    sqlDb.exec(SCHEMA_SQL);
    const check = sqlDb.prepare("SELECT COUNT(*) as c FROM users");
    check.step();
    check.free();
  } catch {
    sqlDb = new SQL.Database();
    sqlDb.exec(SCHEMA_SQL);
  }
  let dirtyTimer = null;
  const persistSnapshot = () => {
    if (!snapshotPath) return;
    try {
      const dir = path2.dirname(snapshotPath);
      if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
      const data = sqlDb.export();
      const tmpPath = `${snapshotPath}.tmp.${process.pid}`;
      fs2.writeFileSync(tmpPath, Buffer.from(data));
      fs2.renameSync(tmpPath, snapshotPath);
    } catch {
    }
  };
  const schedulePersist = () => {
    if (!snapshotPath) return;
    if (dirtyTimer) clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => {
      dirtyTimer = null;
      persistSnapshot();
    }, 80);
    if (typeof dirtyTimer.unref === "function") dirtyTimer.unref();
  };
  const compat = {
    exec: (sql) => {
      sqlDb.exec(sql);
      schedulePersist();
    },
    prepare: (sql) => ({
      get: (...params) => {
        const stmt = sqlDb.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(normalizeSqlParams(params));
          if (!stmt.step()) return void 0;
          return stmt.getAsObject();
        } finally {
          stmt.free();
        }
      },
      all: (...params) => {
        const stmt = sqlDb.prepare(sql);
        const rows = [];
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
      run: (...params) => {
        sqlDb.run(sql, normalizeSqlParams(params));
        const changes = sqlDb.getRowsModified();
        persistSnapshot();
        return { changes, lastInsertRowid: 0 };
      }
    })
  };
  applySafeMigrations(compat);
  persistSnapshot();
  return compat;
}
var activeDb = tryOpenNodeSqlite();
var dbInitPromise = activeDb ? Promise.resolve(activeDb) : null;
async function ensureDbReady() {
  if (activeDb) return activeDb;
  if (!dbInitPromise) {
    const snapPath = process.env.VERCEL ? "/tmp/doptube-data/doptube.sqlite" : path2.join(DATA_DIR, "doptube.sqlite");
    dbInitPromise = createSqlJsCompatDatabase(snapPath).then((instance) => {
      activeDb = instance;
      return instance;
    });
  }
  return dbInitPromise;
}
var db = {
  exec: (sql) => {
    if (!activeDb) throw new Error("Database is initializing; await ensureDbReady() first.");
    activeDb.exec(sql);
  },
  prepare: (sql) => {
    if (!activeDb) throw new Error("Database is initializing; await ensureDbReady() first.");
    return activeDb.prepare(sql);
  }
};
var LEGACY_SEED_USER_IDS = [
  "u_demo",
  "u_admin",
  "u_physics",
  "u_music",
  "u_food",
  "u_tech",
  "u_travel",
  "u_cricket",
  "u_dance"
];
var LEGACY_SEED_VIDEO_IDS = [
  "vid_physics_em",
  "vid_indie_rooftop",
  "vid_cricket_tactics",
  "vid_street_dosa",
  "vid_tech_flagship",
  "vid_ladakh_sunrise",
  "vid_board_electricity",
  "vid_tamil_gaming",
  "vid_comedy_hostel",
  "vid_telugu_science",
  "short_blore_desk",
  "short_kathak_spin",
  "short_chai_pour",
  "short_jee_trick",
  "short_cricket_yorker"
];
var seededOnce = false;
function purgeLegacySeedData() {
  const deleteVideo = db.prepare("DELETE FROM videos WHERE id = ?");
  for (const vid of LEGACY_SEED_VIDEO_IDS) {
    deleteVideo.run(vid);
  }
  const deleteUser = db.prepare("DELETE FROM users WHERE id = ?");
  for (const uid of LEGACY_SEED_USER_IDS) {
    deleteUser.run(uid);
  }
}
function seedDatabaseIfEmpty() {
  if (!activeDb || seededOnce) return;
  for (const cat of VIDEO_CATEGORIES) {
    db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)").run(cat);
  }
  for (const lang of INDIAN_LANGUAGES) {
    db.prepare("INSERT OR IGNORE INTO languages (name) VALUES (?)").run(lang);
  }
  purgeLegacySeedData();
  seededOnce = true;
}
function getVideoThumbnailSvg(videoId) {
  const row = activeDb ? db.prepare(`
          SELECT v.title, v.category, v.language, v.is_short, c.name as channel_name, c.banner_color
          FROM videos v JOIN channels c ON c.id = v.channel_id
          WHERE v.id = ?
        `).get(videoId) : void 0;
  const title = row?.title ?? "DopTube Spotlight";
  const category = row?.category ?? "Featured";
  const language = row?.language ?? "India";
  const channel = row?.channel_name ?? "DopTube Creator";
  const isShort = row?.is_short === 1;
  const w = isShort ? 540 : 960;
  const h = isShort ? 960 : 540;
  const palettes = {
    Cricket: ["#040814", "#0b2545", "#1d4ed8", "#38bdf8"],
    Education: ["#050816", "#0f172a", "#2563eb", "#ec4899"],
    Gaming: ["#08061a", "#1e1b4b", "#7c3aed", "#ec4899"],
    Comedy: ["#0a0814", "#27122b", "#db2777", "#fbbf24"],
    Science: ["#040914", "#082f49", "#0284c7", "#a855f7"],
    Cooking: ["#0d0710", "#2b1218", "#e11d48", "#f59e0b"],
    Music: ["#050714", "#17153b", "#1d4ed8", "#ec4899"],
    Technology: ["#030712", "#0b1437", "#2563eb", "#a855f7"]
  };
  const [c1, c2, glowBlue, glowPink] = palettes[category] ?? ["#050816", "#0b1437", "#1d4ed8", "#ec4899"];
  const safe = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const words = title.split(/\s+/).filter(Boolean);
  const line1 = safe(words.slice(0, isShort ? 3 : 5).join(" "));
  const line2 = safe(words.slice(isShort ? 3 : 5, isShort ? 7 : 10).join(" "));
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
function getChannelAvatarSvg(channelId) {
  const row = activeDb ? db.prepare("SELECT name, banner_color FROM channels WHERE id = ?").get(channelId) : void 0;
  const name = row?.name ?? "DT";
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const palette = ["#1d4ed8", "#7c3aed", "#db2777", "#2563eb", "#0891b2", "#059669", "#dc2626"];
  let hash = 0;
  for (let i = 0; i < channelId.length; i++) hash = (hash * 31 + channelId.charCodeAt(i)) % palette.length;
  const bg = palette[Math.abs(hash) % palette.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" rx="64" fill="${bg}"/>
    <text x="64" y="76" fill="#ffffff" font-family="sans-serif" font-size="46" font-weight="700" text-anchor="middle">${initials || "DT"}</text>
  </svg>`;
}

// server/validation.ts
function validateContentCandidate(candidate, ctx) {
  if (!candidate || !candidate.id || !candidate.title?.trim()) {
    return { valid: false, reason: "missing_metadata" };
  }
  if (candidate.status !== "published") {
    return { valid: false, reason: "not_published" };
  }
  const isOwner = Boolean(ctx.viewerUserId && candidate.ownerUserId && ctx.viewerUserId === candidate.ownerUserId);
  if (candidate.visibility !== "public" && !isOwner) {
    return { valid: false, reason: "not_public" };
  }
  if (candidate.isModerated || ctx.moderatedVideoIds.has(candidate.id)) {
    return { valid: false, reason: "moderated" };
  }
  if (!candidate.thumbnailUrl || candidate.thumbnailUrl.trim().length < 4) {
    return { valid: false, reason: "missing_thumbnail" };
  }
  if (candidate.sourceType === "native") {
    if (!candidate.videoUrl && !candidate.hlsUrl) {
      return { valid: false, reason: "missing_native_stream" };
    }
  } else if (candidate.sourceType === "external") {
    if (!candidate.externalEmbedUrl || !candidate.externalEmbedUrl.startsWith("https://")) {
      return { valid: false, reason: "invalid_external_embed" };
    }
  }
  if (ctx.blockedCreators.has(candidate.channelId)) {
    return { valid: false, reason: "blocked_creator" };
  }
  if (ctx.notInterestedVideoIds.has(candidate.id)) {
    return { valid: false, reason: "not_interested" };
  }
  const lowerTopics = /* @__PURE__ */ new Set([
    candidate.category.toLowerCase(),
    ...candidate.tags.map((t) => t.toLowerCase())
  ]);
  for (const blocked of ctx.blockedTopics) {
    const b = blocked.toLowerCase();
    if (lowerTopics.has(b) || candidate.title.toLowerCase().includes(b)) {
      return { valid: false, reason: "blocked_topic" };
    }
  }
  if (ctx.restrictedMode) {
    const titleLower = candidate.title.toLowerCase();
    const matureKeywords = ["18+", "nsfw", "explicit", "gore"];
    if (matureKeywords.some((kw) => titleLower.includes(kw))) {
      return { valid: false, reason: "restricted_mode" };
    }
  }
  if (ctx.region && candidate.regionCode && candidate.regionCode !== ctx.region) {
    return { valid: false, reason: "region_unavailable" };
  }
  return { valid: true };
}
function detectInteractionAnomaly(timestampsMs, windowMs = 15e3, maxEvents = 12) {
  if (timestampsMs.length < maxEvents) return false;
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  for (let i = maxEvents - 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - maxEvents + 1] <= windowMs) {
      return true;
    }
  }
  return false;
}

// server/recommendation.ts
var DEFAULT_RANKING_WEIGHTS = {
  userInterestMatch: 0.25,
  topicLanguageMatch: 0.15,
  explicitFeedback: 0.15,
  predictedSatisfaction: 0.15,
  contentQualitySafety: 0.1,
  creatorAffinity: 0.08,
  freshnessBoost: 0.07,
  explorationDiversity: 0.05
};
function computeInterestDelta(eventType) {
  switch (eventType) {
    case "completion":
      return 10;
    case "replay":
      return 12;
    case "like":
      return 8;
    case "save":
    case "playlist_add":
      return 7;
    case "subscribe":
      return 10;
    case "share":
    case "comment":
    case "reply":
      return 6;
    case "progress_75":
      return 6;
    case "progress_50":
      return 4;
    case "progress_25":
      return 2;
    case "click":
    case "start":
      return 1;
    case "skip":
    case "abandoned":
      return -5;
    case "dislike":
      return -9;
    case "not_interested":
      return -14;
    case "dont_recommend_creator":
      return -16;
    case "unsubscribe":
      return -6;
    default:
      return 0;
  }
}
function applyInterestDecayAndDelta(currentScore, delta, daysSinceUpdate = 0) {
  const decayed = currentScore * Math.pow(0.97, Math.max(0, daysSinceUpdate));
  return Math.max(0, Math.min(100, Number((decayed + delta).toFixed(2))));
}
function normalize01(value, max) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}
function scoreCandidateWithReason(video, ctx, weights = DEFAULT_RANKING_WEIGHTS, nowMs = Date.now()) {
  const haystack = `${video.title} ${video.description} ${video.category} ${video.tags.join(" ")}`.toLowerCase();
  let interestSum = 0;
  let interestHits = 0;
  let topMatchedTopic = "";
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
  const userInterestMatch = ctx.personalizationEnabled ? Math.min(1, interestHits > 0 ? interestSum / Math.min(3, interestHits) : 0.15) : 0.2;
  const matchesLanguage = ctx.preferredLanguages.includes(video.language);
  const matchesPreferredCategory = ctx.preferredCategories.includes(video.category);
  const matchesRecentSearch = ctx.recentSearches.some(
    (term) => term.trim().length >= 2 && haystack.includes(term.trim().toLowerCase())
  );
  let langMatch = matchesLanguage ? 0.6 : 0.15;
  if (matchesPreferredCategory) langMatch += 0.3;
  if (matchesRecentSearch) langMatch += 0.08;
  const topicLanguageMatch = Math.min(1, langMatch);
  let explicitFeedback = 0.5;
  if (ctx.likedVideoIds.has(video.id)) explicitFeedback += 0.35;
  if (ctx.dislikedVideoIds.has(video.id)) explicitFeedback -= 0.45;
  if (ctx.skippedVideoIds.has(video.id)) explicitFeedback -= 0.3;
  explicitFeedback = Math.max(0, Math.min(1, explicitFeedback));
  const likeRatio = video.views > 0 ? Math.min(1, video.likes / Math.max(10, video.views) * 12) : 0.35;
  const dislikePenalty = video.views > 0 ? Math.min(0.4, video.dislikes / Math.max(10, video.views) * 8) : 0;
  const completedBoost = ctx.completedVideoIds.has(video.id) ? -0.15 : 0.1;
  const predictedSatisfaction = Math.max(0, Math.min(1, 0.35 + likeRatio * 0.55 - dislikePenalty + completedBoost));
  const verifiedScore = video.channelVerified ? 0.3 : 0.1;
  const popularityScore = normalize01(Math.log10(Math.max(10, video.views)), 7) * 0.55;
  const metadataScore = video.description.length > 20 && video.tags.length > 0 ? 0.15 : 0.05;
  const contentQualitySafety = Math.min(1, verifiedScore + popularityScore + metadataScore);
  const isSubscribed = ctx.subscribedChannelIds.has(video.channelId);
  const subScore = isSubscribed ? 0.75 : 0;
  const creatorWatches = ctx.creatorWatchCounts[video.channelId] ?? 0;
  const creatorAffinity = Math.min(1, subScore + Math.min(0.35, creatorWatches * 0.1));
  const ageHours = Math.max(0.5, (nowMs - new Date(video.createdAt).getTime()) / (1e3 * 60 * 60));
  const freshnessBoost = Math.max(0.05, Math.min(1, 1 - Math.log2(ageHours) / 11));
  const isUnwatchedTopic = !ctx.watchedVideoIds.has(video.id) && !(video.category in ctx.interestScores);
  const explorationDiversity = isUnwatchedTopic ? 0.85 : 0.3;
  const weighted = userInterestMatch * weights.userInterestMatch + topicLanguageMatch * weights.topicLanguageMatch + explicitFeedback * weights.explicitFeedback + predictedSatisfaction * weights.predictedSatisfaction + contentQualitySafety * weights.contentQualitySafety + creatorAffinity * weights.creatorAffinity + freshnessBoost * weights.freshnessBoost + explorationDiversity * weights.explorationDiversity;
  let finalScore = weighted * 100;
  const isOtherLowViewNative = video.sourceType === "native" && video.views < 25 && (!ctx.userId || video.ownerUserId !== ctx.userId) && !isSubscribed && interestHits === 0 && !matchesPreferredCategory && !matchesRecentSearch;
  if (isOtherLowViewNative) {
    finalScore -= 24;
  }
  const recommendationReasons = [];
  if (isSubscribed) {
    recommendationReasons.push("Subscribed creator");
  }
  if (ctx.personalizationEnabled && (topMatchedTopic || matchesPreferredCategory)) {
    const topicLabel = topMatchedTopic || video.category;
    recommendationReasons.push(`Matches your interest in ${topicLabel}`);
  }
  if (matchesRecentSearch) {
    recommendationReasons.push("Matches your recent search");
  }
  if (matchesLanguage) {
    recommendationReasons.push(`In your preferred language (${video.language})`);
  }
  if (ageHours <= 72) {
    recommendationReasons.push("Fresh upload");
  }
  if (video.views >= 1e5 || video.isLive) {
    recommendationReasons.push("Popular in India");
  }
  return {
    score: Number(Math.max(0, finalScore).toFixed(3)),
    recommendationReasons,
    recommendationReason: recommendationReasons[0]
  };
}
function scoreCandidate(video, ctx, weights = DEFAULT_RANKING_WEIGHTS, nowMs = Date.now()) {
  return scoreCandidateWithReason(video, ctx, weights, nowMs).score;
}
function normalizeTitlePrefix(title) {
  if (!title) return "";
  return title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2).slice(0, 4).join(" ");
}
function diversifyFeed(items, maxConsecutiveCreator = 1, maxConsecutiveCategory = 2, maxPerCreatorInTopWindow = 2, topWindowSize = 15) {
  const remaining = [...items];
  const output = [];
  const creatorCountInWindow = /* @__PURE__ */ new Map();
  const seenTitlePrefixes = /* @__PURE__ */ new Set();
  while (remaining.length > 0) {
    let pickedIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const recentCreators = output.slice(-maxConsecutiveCreator).map((x) => x.channelId);
      const recentCats = output.slice(-maxConsecutiveCategory).map((x) => x.category);
      const creatorClash = recentCreators.length === maxConsecutiveCreator && recentCreators.every((c) => c === cand.channelId);
      const catClash = recentCats.length === maxConsecutiveCategory && recentCats.every((c) => c === cand.category);
      const windowCreatorCount = creatorCountInWindow.get(cand.channelId) ?? 0;
      const windowCapClash = output.length < topWindowSize && windowCreatorCount >= maxPerCreatorInTopWindow;
      const prefix2 = normalizeTitlePrefix(cand.title);
      const titleDupClash = prefix2.length >= 8 && seenTitlePrefixes.has(prefix2);
      if (!creatorClash && !catClash && !windowCapClash && !titleDupClash) {
        pickedIdx = i;
        break;
      }
    }
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
function generatePersonalizedRecommendations(candidates, ctx, opts) {
  const validCandidates = candidates.filter((c) => validateContentCandidate(c, ctx.validation).valid);
  const seen = /* @__PURE__ */ new Set();
  const unique = validCandidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  const scored = unique.map((v) => {
    const scoredRes = scoreCandidateWithReason(v, ctx, opts?.weights ?? DEFAULT_RANKING_WEIGHTS, opts?.nowMs);
    return {
      ...v,
      score: scoredRes.score,
      recommendationReasons: scoredRes.recommendationReasons,
      recommendationReason: scoredRes.recommendationReason
    };
  }).sort((a, b) => b.score - a.score);
  const diversified = diversifyFeed(scored, 1, 2);
  const cursor = Math.max(0, opts?.cursor ?? 0);
  const limit = Math.max(1, Math.min(40, opts?.limit ?? 12));
  const slice = diversified.slice(cursor, cursor + limit);
  const nextCursor = cursor + slice.length < diversified.length ? cursor + slice.length : null;
  return {
    items: slice,
    nextCursor,
    hasMore: nextCursor !== null,
    total: diversified.length
  };
}
function rankTrendingIndia(candidates, ctx, nowMs = Date.now()) {
  const valid = candidates.filter((c) => validateContentCandidate(c, ctx).valid);
  return [...valid].sort((a, b) => {
    const score = (v) => {
      const ageHours = Math.max(1, (nowMs - new Date(v.createdAt).getTime()) / (1e3 * 60 * 60));
      const velocity = v.views / Math.pow(ageHours + 2, 0.75);
      const engagement = v.likes * 3 / Math.max(50, v.views);
      const spamDampener = v.dislikes > v.likes ? 0.5 : 1;
      return (Math.log10(Math.max(10, v.views)) * 15 + Math.log10(Math.max(1, velocity)) * 20 + engagement * 40) * spamDampener;
    };
    return score(b) - score(a);
  });
}
function rankRelatedVideos(currentVideo, candidates, ctx) {
  const valid = candidates.filter(
    (c) => c.id !== currentVideo.id && !c.isShort && validateContentCandidate(c, ctx.validation).valid
  );
  const currentTags = new Set(currentVideo.tags.map((t) => t.toLowerCase()));
  const sorted = [...valid].sort((a, b) => {
    const simScore = (v) => {
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
function rankShortsFeed(candidates, ctx, nowMs = Date.now(), opts) {
  const mode = opts?.mode ?? "for_you";
  const catFilter = (opts?.category ?? "All").trim();
  let valid = candidates.filter((c) => c.isShort && validateContentCandidate(c, ctx.validation).valid);
  if (catFilter && catFilter !== "All") {
    const catNorm = catFilter.toLowerCase();
    valid = valid.filter(
      (c) => c.category.toLowerCase() === catNorm || c.tags.some((t) => t.toLowerCase() === catNorm)
    );
  }
  if (mode === "following") {
    valid = valid.filter((c) => ctx.subscribedChannelIds.has(c.channelId));
  } else if (mode === "new_creators") {
    valid = valid.filter((c) => c.subscriberCount < 25e4);
  }
  const shortsWeights = mode === "trending" ? {
    userInterestMatch: 0.1,
    topicLanguageMatch: 0.1,
    explicitFeedback: 0.15,
    predictedSatisfaction: 0.25,
    contentQualitySafety: 0.2,
    creatorAffinity: 0.05,
    freshnessBoost: 0.1,
    explorationDiversity: 0.05
  } : mode === "new_creators" ? {
    userInterestMatch: 0.2,
    topicLanguageMatch: 0.15,
    explicitFeedback: 0.15,
    predictedSatisfaction: 0.15,
    contentQualitySafety: 0.05,
    creatorAffinity: 0.05,
    freshnessBoost: 0.15,
    explorationDiversity: 0.1
  } : {
    userInterestMatch: 0.25,
    topicLanguageMatch: 0.15,
    explicitFeedback: 0.2,
    predictedSatisfaction: 0.2,
    contentQualitySafety: 0.05,
    creatorAffinity: 0.05,
    freshnessBoost: 0.05,
    explorationDiversity: 0.05
  };
  return diversifyFeed(
    valid.map((v) => {
      const res = scoreCandidateWithReason(v, ctx, shortsWeights, nowMs);
      return {
        ...v,
        _s: mode === "trending" ? res.score + Math.log10(Math.max(10, v.views)) * 12 : res.score,
        recommendationReasons: res.recommendationReasons,
        recommendationReason: res.recommendationReason
      };
    }).sort((a, b) => b._s - a._s),
    1,
    2
  ).map(({ _s: _unused, ...rest }) => rest);
}
function resolveNextVideo(input) {
  if (input.mode === "repeat" && input.currentVideo) {
    return { nextVideoId: input.currentVideo.id, source: "repeat" };
  }
  if (input.queueVideoIds.length > 0) {
    const nextInQueue = input.queueVideoIds.find((id) => id !== input.currentVideoId) ?? input.queueVideoIds[0];
    if (nextInQueue) return { nextVideoId: nextInQueue, source: "queue" };
  }
  if (input.playlistVideoIds.length > 0) {
    const idx = input.playlistVideoIds.indexOf(input.currentVideoId);
    if (idx >= 0 && idx + 1 < input.playlistVideoIds.length) {
      return { nextVideoId: input.playlistVideoIds[idx + 1], source: "playlist" };
    }
    if (idx === -1) {
      return { nextVideoId: input.playlistVideoIds[0], source: "playlist" };
    }
  }
  const nextRec = input.recommendedVideos.find((v) => v.id !== input.currentVideoId);
  if (nextRec) {
    return { nextVideoId: nextRec.id, source: "recommended" };
  }
  return { nextVideoId: null, source: "none" };
}
function buildConditionalSections(params) {
  const sections = [];
  const usedIds = /* @__PURE__ */ new Set();
  const takeUnique = (pool, limit = 4) => {
    const out = [];
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
        id: "continue_watching",
        title: "Continue watching",
        videos: items
      });
    }
  }
  if (params.subscribedVideos.length > 0) {
    const items = takeUnique(params.subscribedVideos, 4);
    if (items.length > 0) {
      sections.push({
        id: "from_subscriptions",
        title: "From creators you follow",
        videos: items
      });
    }
  }
  if (params.topInterestTopic) {
    const topicNorm = params.topInterestTopic.toLowerCase();
    const topicMatches = params.recommended.filter(
      (v) => !usedIds.has(v.id) && (v.category.toLowerCase() === topicNorm || v.tags.some((t) => t.toLowerCase() === topicNorm))
    );
    if (topicMatches.length >= 2) {
      const items = takeUnique(topicMatches, 4);
      sections.push({
        id: "interest_spotlight",
        title: `Because you follow ${params.topInterestTopic}`,
        videos: items
      });
    }
  }
  const newCreatorPool = params.newCreators && params.newCreators.length > 0 ? params.newCreators : params.recommended.filter((v) => v.subscriberCount > 0 && v.subscriberCount < 25e4);
  const diversifiedNewCreators = diversifyFeed(
    newCreatorPool.filter((v) => !usedIds.has(v.id)),
    1,
    1
  );
  if (diversifiedNewCreators.length >= 2) {
    const items = takeUnique(diversifiedNewCreators, 4);
    if (items.length >= 2) {
      sections.push({
        id: "discover_new_creators",
        title: "Discover new creators",
        videos: items
      });
    }
  }
  if (params.preferredLanguage && params.preferredLanguage !== "All") {
    const langNorm = params.preferredLanguage.toLowerCase();
    const langMatches = params.recommended.filter(
      (v) => !usedIds.has(v.id) && v.language.toLowerCase() === langNorm
    );
    if (langMatches.length >= 2) {
      const items = takeUnique(langMatches, 4);
      sections.push({
        id: "popular_language",
        title: `Popular in ${params.preferredLanguage}`,
        videos: items
      });
    }
  }
  if (params.trending.length > 0) {
    const freshTrending = takeUnique(params.trending, 4);
    const items = freshTrending.length > 0 ? freshTrending : params.trending.slice(0, 4);
    sections.push({
      id: "trending_india",
      title: "Trending in India",
      videos: items
    });
  }
  return sections;
}
function computeViewsLast30Days(params) {
  const now = params.nowMs ?? Date.now();
  const DAY_MS = 24 * 60 * 60 * 1e3;
  const buckets = /* @__PURE__ */ new Map();
  const orderedDates = [];
  for (let offset = 29; offset >= 0; offset--) {
    const d = new Date(now - offset * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    orderedDates.push(iso);
    buckets.set(iso, 0);
  }
  let trackedCount = 0;
  for (const ev of params.events) {
    const day = (ev.createdAt || "").slice(0, 10);
    if (buckets.has(day)) {
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
      trackedCount += 1;
    }
  }
  for (const h of params.history) {
    const day = (h.watchedAt || "").slice(0, 10);
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
      const day = (v.createdAt || "").slice(0, 10);
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
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return orderedDates.map((iso) => {
    const [, mm, dd] = iso.split("-");
    const monthLabel = monthNames[Math.max(0, Number(mm) - 1)] || mm;
    return {
      date: iso,
      label: `${monthLabel} ${Number(dd)}`,
      views: buckets.get(iso) ?? 0
    };
  });
}

// server/aiService.ts
function hydrateVideoRow(r) {
  let tags = [];
  try {
    tags = JSON.parse(r.tags_json || "[]");
  } catch {
    tags = [];
  }
  const isDailymotion = r.id.startsWith("dm_");
  const extRef = r.external_ref || (r.id.startsWith("ext_") ? r.id.slice(4) : isDailymotion ? r.id.slice(3) : "");
  const externalEmbedUrl = r.source_type === "external" && extRef ? isDailymotion ? `https://www.dailymotion.com/embed/video/${extRef}?autoplay=1` : r.is_short === 1 ? `https://www.youtube-nocookie.com/embed/${extRef}?autoplay=1&playsinline=1&loop=1&playlist=${extRef}&rel=0&modestbranding=1&iv_load_policy=3` : `https://www.youtube-nocookie.com/embed/${extRef}?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3` : void 0;
  return {
    id: r.id,
    channelId: r.channel_id,
    ...r.owner_user_id ? { ownerUserId: r.owner_user_id } : {},
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
    ...externalEmbedUrl ? { externalEmbedUrl } : {},
    isShort: r.is_short === 1,
    isLive: r.is_live === 1,
    views: r.views,
    likes: r.likes,
    dislikes: r.dislikes,
    createdAt: r.created_at
  };
}
function ensureUserPreferencesRow(userId, preferredLanguage = "English") {
  const existing = db.prepare("SELECT user_id FROM user_preferences WHERE user_id = ?").get(userId);
  if (existing) return;
  db.prepare(`
    INSERT INTO user_preferences (
      user_id, preferred_languages_json, preferred_categories_json, selected_interests_json,
      preferred_format, personalization_enabled, infinite_scroll_enabled, autoplay_enabled,
      onboarding_completed, updated_at
    ) VALUES (?, ?, '[]', '[]', 'all', 1, 1, 1, 0, ?)
  `).run(userId, JSON.stringify([preferredLanguage || "English"]), (/* @__PURE__ */ new Date()).toISOString());
}
function getUserPreferencesPayload(userId) {
  ensureUserPreferencesRow(userId);
  const row = db.prepare("SELECT * FROM user_preferences WHERE user_id = ?").get(userId);
  const safeParse = (s, fb = []) => {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : fb;
    } catch {
      return fb;
    }
  };
  return {
    preferredLanguages: safeParse(row.preferred_languages_json, ["English"]),
    preferredCategories: safeParse(row.preferred_categories_json, []),
    selectedInterests: safeParse(row.selected_interests_json, []),
    preferredFormat: row.preferred_format || "all",
    personalizationEnabled: row.personalization_enabled === 1,
    infiniteScrollEnabled: row.infinite_scroll_enabled === 1,
    autoplayEnabled: row.autoplay_enabled === 1,
    onboardingCompleted: row.onboarding_completed === 1
  };
}
function buildUserAiContext(userId) {
  const moderatedRows = db.prepare(`SELECT target_id FROM content_moderation_flags WHERE target_type = 'video' AND status = 'active'`).all();
  const moderatedVideoIds = new Set(moderatedRows.map((r) => r.target_id));
  const ctx = {
    userId,
    preferredLanguages: ["Hindi", "English"],
    preferredCategories: [],
    selectedInterests: [],
    interestScores: {},
    subscribedChannelIds: /* @__PURE__ */ new Set(),
    creatorWatchCounts: {},
    likedVideoIds: /* @__PURE__ */ new Set(),
    dislikedVideoIds: /* @__PURE__ */ new Set(),
    watchedVideoIds: /* @__PURE__ */ new Set(),
    completedVideoIds: /* @__PURE__ */ new Set(),
    skippedVideoIds: /* @__PURE__ */ new Set(),
    recentSearches: [],
    personalizationEnabled: true,
    validation: {
      viewerUserId: userId,
      restrictedMode: false,
      blockedCreators: /* @__PURE__ */ new Set(),
      blockedTopics: /* @__PURE__ */ new Set(),
      notInterestedVideoIds: /* @__PURE__ */ new Set(),
      moderatedVideoIds,
      region: "IN"
    }
  };
  if (!userId) return ctx;
  const userRow = db.prepare("SELECT preferred_language, restricted_mode FROM users WHERE id = ?").get(userId);
  if (userRow) {
    ctx.validation.restrictedMode = userRow.restricted_mode === 1;
    const prefs = getUserPreferencesPayload(userId);
    ctx.preferredLanguages = prefs.preferredLanguages.length > 0 ? prefs.preferredLanguages : [userRow.preferred_language || "English"];
    ctx.preferredCategories = prefs.preferredCategories;
    ctx.selectedInterests = prefs.selectedInterests;
    ctx.personalizationEnabled = prefs.personalizationEnabled;
  }
  const interestRows = db.prepare("SELECT topic, score FROM user_interests WHERE user_id = ?").all(userId);
  for (const r of interestRows) {
    ctx.interestScores[r.topic] = r.score;
  }
  for (const interest of ctx.selectedInterests) {
    if (!(interest in ctx.interestScores)) {
      ctx.interestScores[interest] = 75;
    }
  }
  const subRows = db.prepare("SELECT channel_id FROM subscriptions WHERE user_id = ?").all(userId);
  for (const s of subRows) ctx.subscribedChannelIds.add(s.channel_id);
  const blockedCreators = db.prepare("SELECT channel_id FROM blocked_creators WHERE user_id = ?").all(userId);
  for (const bc of blockedCreators) ctx.validation.blockedCreators.add(bc.channel_id);
  const blockedTopics = db.prepare("SELECT topic FROM blocked_topics WHERE user_id = ?").all(userId);
  for (const bt of blockedTopics) ctx.validation.blockedTopics.add(bt.topic);
  const fbRows = db.prepare("SELECT video_id, channel_id, feedback_type FROM user_feedback WHERE user_id = ?").all(userId);
  for (const fb of fbRows) {
    if (fb.feedback_type === "not_interested" && fb.video_id) {
      ctx.validation.notInterestedVideoIds.add(fb.video_id);
    }
    if (fb.feedback_type === "dont_recommend_creator" && fb.channel_id) {
      ctx.validation.blockedCreators.add(fb.channel_id);
    }
  }
  const reactRows = db.prepare("SELECT video_id, reaction FROM video_reactions WHERE user_id = ?").all(userId);
  for (const r of reactRows) {
    if (r.reaction === "like") ctx.likedVideoIds.add(r.video_id);
    if (r.reaction === "dislike") ctx.dislikedVideoIds.add(r.video_id);
  }
  const histRows = db.prepare(`
      SELECT wh.video_id, v.channel_id
      FROM watch_history wh
      LEFT JOIN videos v ON v.id = wh.video_id
      WHERE wh.user_id = ?
      ORDER BY wh.watched_at DESC
      LIMIT 60
    `).all(userId);
  for (const h of histRows) {
    ctx.watchedVideoIds.add(h.video_id);
    if (h.channel_id) {
      ctx.creatorWatchCounts[h.channel_id] = (ctx.creatorWatchCounts[h.channel_id] ?? 0) + 1;
    }
  }
  const eventRows = db.prepare("SELECT video_id, event_type FROM user_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 120").all(userId);
  for (const ev of eventRows) {
    if (ev.event_type === "completion") ctx.completedVideoIds.add(ev.video_id);
    if (ev.event_type === "skip" || ev.event_type === "abandoned") ctx.skippedVideoIds.add(ev.video_id);
  }
  const searches = db.prepare("SELECT query FROM search_history WHERE user_id = ? ORDER BY searched_at DESC LIMIT 8").all(userId);
  ctx.recentSearches = searches.map((s) => s.query);
  return ctx;
}
function getAllNativeCandidates() {
  const rows = db.prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
             c.verified as channel_verified, c.subscriber_count, c.user_id as owner_user_id
      FROM videos v
      JOIN channels c ON c.id = v.channel_id
      WHERE v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'native'
    `).all();
  return rows.map(hydrateVideoRow);
}
function toCandidate(item) {
  return {
    ...item,
    status: "status" in item ? item.status : "published",
    visibility: "visibility" in item ? item.visibility : "public",
    dislikes: "dislikes" in item ? item.dislikes : 0
  };
}
function recordBehaviorEvent(params) {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const nowMs = Date.now();
  let isAnomaly = false;
  if (params.userId) {
    const recent = db.prepare("SELECT created_at FROM user_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(params.userId);
    const timestamps = recent.map((r) => new Date(r.created_at).getTime()).filter((t) => !Number.isNaN(t));
    timestamps.push(nowMs);
    isAnomaly = detectInteractionAnomaly(timestamps, 1e4, 16);
  }
  const cleanEventId = typeof params.eventId === "string" && params.eventId.trim().length > 0 ? params.eventId.trim().slice(0, 64) : `ev_${randomUUID().slice(0, 10)}`;
  const info = db.prepare(`
      INSERT OR IGNORE INTO user_events (id, user_id, session_id, video_id, event_type, progress_pct, watch_duration_sec, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
    cleanEventId,
    params.userId ?? null,
    params.sessionId || "",
    params.videoId,
    params.eventType,
    Math.max(0, Math.min(100, Math.round(params.progressPct ?? 0))),
    Math.max(0, Math.round(params.watchDurationSec ?? 0)),
    JSON.stringify({ ...params.metadata ?? {}, anomaly: isAnomaly }),
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
  const vidRow = db.prepare("SELECT category, tags_json FROM videos WHERE id = ?").get(params.videoId);
  if (!vidRow) return { recorded: true, deduplicated: false, anomaly: false };
  const topics = /* @__PURE__ */ new Set([vidRow.category]);
  try {
    const parsedTags = JSON.parse(vidRow.tags_json || "[]");
    for (const t of parsedTags.slice(0, 3)) {
      if (t && t.trim().length >= 2) topics.add(t.trim());
    }
  } catch {
  }
  const getInterest = db.prepare("SELECT score, updated_at FROM user_interests WHERE user_id = ? AND topic = ?");
  const upsertInterest = db.prepare(`
    INSERT INTO user_interests (user_id, topic, score, source, updated_at)
    VALUES (?, ?, ?, 'behavior', ?)
    ON CONFLICT(user_id, topic) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at
  `);
  for (const topic of topics) {
    const existing = getInterest.get(params.userId, topic);
    const days = existing ? Math.max(0, (nowMs - new Date(existing.updated_at).getTime()) / (1e3 * 60 * 60 * 24)) : 0;
    const baseScore = existing ? existing.score : 50;
    const nextScore = applyInterestDecayAndDelta(baseScore, topic === vidRow.category ? delta : delta * 0.5, days);
    upsertInterest.run(params.userId, topic, nextScore, nowIso);
  }
  return { recorded: true, deduplicated: false, anomaly: false };
}
function recordBehaviorEventBatch(events) {
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
function getRelatedCandidatePool(currentVideo, ctx, extraExternal = []) {
  const native = getAllNativeCandidates();
  const cachedExtRows = db.prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
             c.verified as channel_verified, c.subscriber_count
      FROM videos v JOIN channels c ON c.id = v.channel_id
      WHERE v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'external' AND v.is_short = 0
      ORDER BY v.views DESC LIMIT 20
    `).all();
  const pool = [...extraExternal.map(toCandidate), ...native, ...cachedExtRows.map(hydrateVideoRow).map(toCandidate)];
  return rankRelatedVideos(currentVideo, pool, ctx);
}

// server/aiRoutes.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// server/auth.ts
import { createHash } from "node:crypto";
var SESSION_COOKIE = "doptube_session";
var FALLBACK_SESSION_SECRET = createHash("sha256").update("sodium-booster-bv9wh:ai-studio-doptube-aa4523de-08c1-49e2-88b8-a324bef5d6ed:doptube-session-v1").digest("hex");
function getSessionSecret() {
  return (process.env.SESSION_SECRET || FALLBACK_SESSION_SECRET).trim();
}
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}
function hydrateSessionUserIfMissing(payload) {
  const existing = db.prepare("SELECT id, role FROM users WHERE id = ?").get(payload.userId);
  if (existing) return existing;
  if (!payload.email) return null;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const safeName = (payload.name || payload.email.split("@")[0] || "DopTube User").trim();
  const safeEmail = payload.email.trim().toLowerCase();
  const safeLang = payload.preferredLanguage || "English";
  const chId = `ch_${payload.userId.replace(/^u_/, "")}`;
  const avatarUrl = payload.avatarUrl || `/api/avatars/${chId}.svg`;
  const cleanBase = (payload.handle || `@${safeName.toLowerCase().replace(/[^a-z0-9]/g, "") || "creator"}`).replace(/^@*/, "@");
  try {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, avatar_url, birthday, role, preferred_language, email_verified, created_at)
      VALUES (?, ?, ?, 'session_hydrated', ?, ?, ?, ?, 1, ?)
    `).run(payload.userId, safeName, safeEmail, avatarUrl, payload.birthday || "", payload.role, safeLang, nowIso);
    const existingChannel = db.prepare("SELECT id FROM channels WHERE user_id = ?").get(payload.userId);
    if (!existingChannel) {
      let handle = cleanBase;
      if (db.prepare("SELECT id FROM channels WHERE handle = ?").get(handle)) {
        handle = `${cleanBase}_${payload.userId.slice(-4)}`;
      }
      db.prepare(`
        INSERT OR IGNORE INTO channels (id, user_id, name, handle, description, avatar_url, banner_color, verified, subscriber_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '#000000', 0, 0, ?)
      `).run(chId, payload.userId, safeName, handle, `Official DopTube channel of ${safeName}.`, avatarUrl, nowIso);
    }
    db.prepare(`
      INSERT OR IGNORE INTO user_preferences (
        user_id, preferred_languages_json, preferred_categories_json, selected_interests_json,
        preferred_format, personalization_enabled, infinite_scroll_enabled, autoplay_enabled,
        onboarding_completed, updated_at
      ) VALUES (?, ?, '[]', '[]', 'all', 1, 1, 1, 1, ?)
    `).run(payload.userId, JSON.stringify([safeLang]), nowIso);
    return { id: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}
function attachAuth(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const token = bearerToken || cookies[SESSION_COOKIE];
  if (token) {
    const payload = verifySessionToken(token, getSessionSecret());
    if (payload) {
      const userRow = hydrateSessionUserIfMissing(payload);
      if (userRow) {
        req.auth = { ...payload, role: userRow.role };
      }
    }
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required. Please sign in to continue." });
    return;
  }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (req.auth.role !== "admin") {
    res.status(403).json({ error: "Administrator permission required." });
    return;
  }
  next();
}
function setSessionCookie(res, token, req) {
  const isHttps = Boolean(req?.secure) || req?.headers["x-forwarded-proto"] === "https" || (process.env.APP_URL || "").startsWith("https://");
  if (isHttps) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      partitioned: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1e3
    });
  } else {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1e3
    });
  }
}
function clearSessionCookie(res, req) {
  const isHttps = Boolean(req?.secure) || req?.headers["x-forwarded-proto"] === "https" || (process.env.APP_URL || "").startsWith("https://");
  res.clearCookie(SESSION_COOKIE, {
    path: "/",
    ...isHttps ? { secure: true, sameSite: "none", partitioned: true } : { sameSite: "lax" }
  });
}
function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
}
var rateBuckets = /* @__PURE__ */ new Map();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip || "local"}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
      return;
    }
    bucket.count += 1;
    next();
  };
}

// server/discovery.ts
import { AsyncLocalStorage } from "node:async_hooks";
var FEED_CACHE_TTL_MS = 20 * 60 * 1e3;
var META_CACHE_TTL_MS = 90 * 60 * 1e3;
var QUOTA_COOLDOWN_MS = 15 * 60 * 1e3;
var apiCache = /* @__PURE__ */ new Map();
var refererStore = new AsyncLocalStorage();
var keyCooldownUntil = /* @__PURE__ */ new Map();
var lastDiscoveryIssue = null;
function runWithDiscoveryReferer(referer, fn) {
  return refererStore.run(referer, fn);
}
function getExternalApiKeys() {
  const combined = [
    process.env.EXTERNAL_VIDEO_API_KEY,
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_DATA_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.VITE_EXTERNAL_VIDEO_API_KEY,
    process.env.VITE_YOUTUBE_API_KEY
  ].filter(Boolean).join(",");
  return Array.from(
    new Set(
      combined.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    )
  );
}
function getExternalApiKey() {
  const keys = getExternalApiKeys();
  if (keys.length === 0) return "";
  const now = Date.now();
  const active = keys.find((k) => (keyCooldownUntil.get(k) ?? 0) <= now);
  return active ?? "";
}
function markKeyQuotaExceeded(apiKey) {
  if (!apiKey) return;
  keyCooldownUntil.set(apiKey, Date.now() + QUOTA_COOLDOWN_MS);
}
function getDiscoveryStatus() {
  const allKeys = getExternalApiKeys();
  const activeKey = getExternalApiKey();
  const inCooldown = allKeys.length > 0 && !activeKey;
  const providers = ["dailymotion", "youtube-rss", ...activeKey ? ["youtube-api"] : []];
  return {
    configured: true,
    providers,
    youtubeConfigured: allKeys.length > 0,
    issue: inCooldown ? lastDiscoveryIssue || {
      code: "quota_exceeded",
      status: 403,
      message: "YouTube daily quota reached; serving live multi-source Indian feeds.",
      at: (/* @__PURE__ */ new Date()).toISOString()
    } : allKeys.length > 0 ? lastDiscoveryIssue : null
  };
}
function getEffectiveReferer() {
  const ctxRef = refererStore.getStore();
  if (ctxRef && ctxRef.startsWith("http")) return ctxRef;
  if (process.env.APP_URL && process.env.APP_URL.startsWith("http")) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/`;
  return "https://doptube.vercel.app/";
}
async function discoveryFetch(url, apiKeyUsed = "", timeoutMs = 6e3) {
  const candidateReferers = Array.from(
    /* @__PURE__ */ new Set([
      getEffectiveReferer(),
      "https://doptube.vercel.app/",
      "https://doobtube.vercel.app/",
      null
    ])
  );
  let resp = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: candidateReferers[0] ? { Referer: candidateReferers[0] } : void 0
  });
  if (resp.status === 403) {
    let isRefererIssue = true;
    try {
      const txt = await resp.clone().text();
      if (/quotaExceeded|rateLimitExceeded|dailyLimitExceeded/i.test(txt)) {
        isRefererIssue = false;
      }
    } catch {
    }
    if (isRefererIssue) {
      for (let i = 1; i < candidateReferers.length; i++) {
        const ref = candidateReferers[i];
        const retryResp = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: ref ? { Referer: ref } : void 0
        });
        if (retryResp.ok) {
          lastDiscoveryIssue = null;
          return retryResp;
        }
        resp = retryResp;
      }
    }
  }
  if (!resp.ok) {
    let reason = `HTTP ${resp.status}`;
    let apiReason = "";
    try {
      const cloneText = await resp.clone().text();
      const parsed = JSON.parse(cloneText);
      const apiMsg = parsed?.error?.message || cloneText.slice(0, 140);
      apiReason = parsed?.error?.errors?.[0]?.reason || "";
      reason = apiReason ? `${apiReason}: ${apiMsg}` : apiMsg;
    } catch {
    }
    const isQuota = resp.status === 429 || /quota|rateLimitExceeded|dailyLimitExceeded/i.test(apiReason) || /quota|rateLimitExceeded/i.test(reason);
    if (isQuota && apiKeyUsed) {
      markKeyQuotaExceeded(apiKeyUsed);
    }
    lastDiscoveryIssue = {
      code: isQuota ? "quota_exceeded" : resp.status === 403 ? "api_forbidden" : "api_error",
      status: resp.status,
      message: reason,
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
    console.warn(`YouTube API (${resp.status}):`, reason);
  } else {
    lastDiscoveryIssue = null;
  }
  return resp;
}
function getCached(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return entry.value;
}
function setCached(key, value, ttlMs = FEED_CACHE_TTL_MS) {
  if (Array.isArray(value) && value.length === 0) {
    return value;
  }
  if (apiCache.size > 350) {
    const firstKey = apiCache.keys().next().value;
    if (firstKey) apiCache.delete(firstKey);
  }
  apiCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}
var CURATED_RSS_CHANNELS = [
  { id: "UCOhHO2ICt0ti9KAh-QHvttQ", name: "Technical Guruji", handle: "@TechnicalGuruji", category: "Technology", language: "Hindi" },
  { id: "UCiGyWN6DEbnj2alu7iapuKQ", name: "Physics Wallah", handle: "@PhysicsWallah", category: "Education", language: "Hindi" },
  { id: "UCq-Fj5jknLsUf-MWSy4_brA", name: "T-Series", handle: "@tseries", category: "Music", language: "Hindi" },
  { id: "UCqwUrj10mAEsqezcItqvwEw", name: "BB Ki Vines", handle: "@BBKiVines", category: "Comedy", language: "Hindi" },
  { id: "UCpEhnqL0y41EpW2TvWAHD7Q", name: "SET India", handle: "@SETIndia", category: "Entertainment", language: "Hindi" },
  { id: "UCt4t-jeY85JegMlZ-E5UWtA", name: "Aaj Tak", handle: "@aajtak", category: "News", language: "Hindi" },
  { id: "UCXuqSBlHAE6Xw-yeJA0Tunw", name: "Linus Tech Tips", handle: "@LinusTechTips", category: "Technology", language: "English" },
  { id: "UCsXVk37bltHxD1rDPwtNM8Q", name: "Kurzgesagt", handle: "@kurzgesagt", category: "Science", language: "English" },
  { id: "UCBJycsmduvYEL83R_U4JriQ", name: "Marques Brownlee", handle: "@mkbhd", category: "Technology", language: "English" }
];
function decodeXmlEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/").replace(/&nbsp;/g, " ");
}
function cleanHtmlText(str) {
  if (!str) return "";
  return decodeXmlEntities(str).replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li|h[1-6])>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function extractXmlTag(block, tagName) {
  const escaped = tagName.replace(/[:]/g, "\\:");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i"));
  return match ? decodeXmlEntities(match[1].trim()) : "";
}
function parseAtomRssFeed(xml, meta) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
  const results = [];
  for (const entry of entries) {
    const vid = extractXmlTag(entry, "yt:videoId");
    if (!vid) continue;
    const rawChId = extractXmlTag(entry, "yt:channelId") || meta.channelId;
    const title = cleanHtmlText(extractXmlTag(entry, "title")) || "Featured Video";
    const authorName = extractXmlTag(entry, "name") || meta.channelName || "Creator Channel";
    const published = extractXmlTag(entry, "published") || (/* @__PURE__ */ new Date()).toISOString();
    const description = cleanHtmlText(extractXmlTag(entry, "media:description") || "");
    const linkMatch = entry.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i);
    const altHref = linkMatch?.[1] || "";
    const thumbMatch = entry.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    const thumbnailUrl = thumbMatch?.[1] || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    const viewsMatch = entry.match(/<media:statistics[^>]+views=["'](\d+)["']/i);
    const views = viewsMatch ? Number(viewsMatch[1]) : 0;
    const ratingMatch = entry.match(/<media:starRating[^>]+count=["'](\d+)["']/i);
    const likes = ratingMatch ? Number(ratingMatch[1]) : Math.round(views * 0.035);
    const isShort = altHref.includes("/shorts/") || /#shorts?\b/i.test(title) || /#shorts?\b/i.test(description);
    const handle = meta.channelHandle || `@${authorName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 22) || "creator"}`;
    const item = {
      id: `ext_${vid}`,
      title,
      description: description.slice(0, 500),
      tags: [meta.category, meta.language, ...isShort ? ["shorts"] : []],
      category: meta.category,
      language: meta.language,
      channelId: `ext_ch_${rawChId}`,
      channelName: authorName,
      channelHandle: handle.startsWith("@") ? handle : `@${handle}`,
      channelAvatar: `/api/avatars/ext_ch_${rawChId}.svg`,
      channelVerified: true,
      subscriberCount: 1e6,
      views,
      likes,
      createdAt: published,
      isShort,
      isLive: false,
      visibility: "public",
      durationSec: isShort ? 45 : 420,
      thumbnailUrl,
      videoUrl: "",
      hlsUrl: null,
      sourceType: "external",
      externalEmbedUrl: isShort ? `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&playsinline=1&loop=1&playlist=${vid}&rel=0&modestbranding=1&iv_load_policy=3` : `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`
    };
    setCached(`vid:${item.id}`, item, META_CACHE_TTL_MS);
    results.push(item);
  }
  return results;
}
async function fetchCuratedYouTubeRss(opts) {
  const cacheKey = `yt_rss_pool:${opts?.category || "All"}:${opts?.language || "All"}`;
  let allItems = getCached(cacheKey);
  if (!allItems) {
    const selected = CURATED_RSS_CHANNELS.filter((ch) => {
      if (opts?.category && opts.category !== "All" && ch.category.toLowerCase() !== opts.category.toLowerCase()) {
        return false;
      }
      if (opts?.language && opts.language !== "All" && ch.language.toLowerCase() !== opts.language.toLowerCase()) {
        return false;
      }
      return true;
    });
    const targets = selected.length > 0 ? selected : CURATED_RSS_CHANNELS;
    const settled = await Promise.allSettled(
      targets.map(async (ch) => {
        const chCacheKey = `yt_rss_ch:${ch.id}`;
        const cachedCh = getCached(chCacheKey);
        if (cachedCh) return cachedCh;
        const resp = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ch.id)}`, {
          signal: AbortSignal.timeout(4500),
          headers: { "User-Agent": "Mozilla/5.0 DopTubeFeed/1.0" }
        });
        if (!resp.ok) return [];
        const xml = await resp.text();
        const parsed = parseAtomRssFeed(xml, {
          channelId: ch.id,
          channelName: ch.name,
          channelHandle: ch.handle,
          category: ch.category,
          language: ch.language
        });
        if (parsed.length > 0) setCached(chCacheKey, parsed, FEED_CACHE_TTL_MS);
        return parsed;
      })
    );
    const interleaved = [];
    const perChannel = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const maxRows = Math.max(0, ...perChannel.map((arr) => arr.length));
    for (let i = 0; i < maxRows; i++) {
      for (const list of perChannel) {
        if (i < list.length) interleaved.push(list[i]);
      }
    }
    if (interleaved.length > 0) {
      setCached(cacheKey, interleaved, FEED_CACHE_TTL_MS);
    }
    allItems = interleaved;
  }
  if (opts?.shortsOnly === true) {
    return allItems.filter((v) => v.isShort);
  }
  if (opts?.shortsOnly === false) {
    return allItems.filter((v) => !v.isShort);
  }
  return allItems;
}
var DM_FIELDS = "id,title,description,thumbnail_720_url,thumbnail_480_url,duration,views_total,likes_total,created_time,language,channel,owner.username,owner.screenname,owner.avatar_120_url,tags";
var DM_CHANNEL_CATEGORY_MAP = {
  news: "News",
  sport: "Cricket",
  music: "Music",
  tech: "Technology",
  videogames: "Gaming",
  fun: "Comedy",
  school: "Education",
  creation: "Entertainment",
  people: "Lifestyle",
  lifestyle: "Lifestyle"
};
var CATEGORY_TO_DM_QUERY = {
  Cricket: "cricket highlights India",
  Education: "science education study India",
  Gaming: "gaming esports India",
  Comedy: "comedy standup India",
  Music: "hindi music bollywood indie",
  Technology: "tech smartphone review India",
  Science: "space science documentary",
  Cooking: "indian street food recipe",
  News: "india latest news",
  Entertainment: "bollywood entertainment india",
  Mixes: "hindi music mix jukebox",
  Travel: "india travel vlog",
  Lifestyle: "lifestyle vlog india"
};
function mapDailymotionItem(item, opts) {
  if (!item.id || !item.title) return null;
  const durationSec = Math.max(0, Math.round(Number(item.duration || 0)));
  const ownerUsername = (item["owner.username"] || "dailymotion").replace(/[^a-zA-Z0-9_-]/g, "") || "creator";
  const ownerName = cleanHtmlText(item["owner.screenname"] || ownerUsername);
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 10) : [];
  const isShort = Boolean(opts?.forceShort) || durationSec > 0 && durationSec <= 90 || /#shorts?\b/i.test(item.title) || tags.some((t) => /^shorts?$/i.test(t));
  const mappedCat = opts?.category && opts.category !== "All" ? opts.category === "Mixes" ? "Music" : opts.category : DM_CHANNEL_CATEGORY_MAP[String(item.channel || "").toLowerCase()] || "Entertainment";
  const mappedLang = opts?.language && opts.language !== "All" ? opts.language : mapLanguageCode(item.language, "Hindi");
  const views = Math.max(0, Number(item.views_total || 0));
  const likes = Math.max(0, Number(item.likes_total || Math.round(views * 0.03)));
  const createdIso = item.created_time ? new Date(Number(item.created_time) * 1e3).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
  const videoId = `dm_${item.id}`;
  const result = {
    id: videoId,
    title: cleanHtmlText(item.title),
    description: cleanHtmlText(item.description || "").slice(0, 1e3),
    tags: tags.length > 0 ? tags : [mappedCat, mappedLang],
    category: mappedCat,
    language: mappedLang,
    channelId: `dm_ch_${ownerUsername}`,
    channelName: ownerName,
    channelHandle: `@${ownerUsername.toLowerCase()}`,
    channelAvatar: item["owner.avatar_120_url"] || `/api/avatars/dm_ch_${ownerUsername}.svg`,
    channelVerified: views >= 5e4,
    subscriberCount: Math.max(1200, Math.round(views * 0.08)),
    views,
    likes,
    createdAt: createdIso,
    isShort,
    isLive: false,
    visibility: "public",
    durationSec,
    thumbnailUrl: item.thumbnail_720_url || item.thumbnail_480_url || `/api/thumbnails/card/${videoId}.svg`,
    videoUrl: "",
    hlsUrl: null,
    sourceType: "external",
    externalEmbedUrl: `https://www.dailymotion.com/embed/video/${item.id}?autoplay=1`
  };
  setCached(`vid:${videoId}`, result, META_CACHE_TTL_MS);
  return result;
}
async function fetchDailymotionFeedPaged(params) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(35, Math.max(10, params.limit ?? 20));
  const sort = params.sort || (params.query ? "relevance" : "trending");
  const query = (params.query || "").trim();
  const cacheKey = `dm_feed:${query.toLowerCase()}:${params.category || "All"}:${params.language || "All"}:${Boolean(
    params.shorts
  )}:${sort}:${page}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  try {
    const qs = new URLSearchParams({
      country: "in",
      flags: "no_live",
      limit: String(limit),
      page: String(page),
      sort,
      fields: DM_FIELDS
    });
    if (query) {
      qs.set("search", query);
    }
    if (params.shorts) {
      qs.set("shorter_than", "2");
    }
    const resp = await fetch(`https://api.dailymotion.com/videos?${qs.toString()}`, {
      signal: AbortSignal.timeout(5500),
      headers: { Accept: "application/json" }
    });
    if (!resp.ok) return { items: [], nextPage: null };
    const json = await resp.json();
    const rawList = json.list ?? [];
    const mapped = rawList.map(
      (item) => mapDailymotionItem(item, {
        category: params.category,
        language: params.language,
        forceShort: Boolean(params.shorts && (item.duration ?? 0) <= 95)
      })
    ).filter((v) => Boolean(v)).filter((v) => params.shorts ? v.durationSec > 0 && v.durationSec <= 95 : true);
    const payload = {
      items: mapped,
      nextPage: json.has_more ? page + 1 : null
    };
    if (mapped.length > 0) setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
    return payload;
  } catch {
    return { items: [], nextPage: null };
  }
}
async function fetchDailymotionVideoById(dmId) {
  const rawId = dmId.startsWith("dm_") ? dmId.slice(3) : dmId;
  if (!rawId) return null;
  let video = getCached(`vid:dm_${rawId}`);
  if (!video) {
    try {
      const resp = await fetch(
        `https://api.dailymotion.com/video/${encodeURIComponent(rawId)}?fields=${encodeURIComponent(DM_FIELDS)}`,
        { signal: AbortSignal.timeout(5e3) }
      );
      if (resp.ok) {
        const raw = await resp.json();
        video = mapDailymotionItem(raw);
      }
    } catch {
      return null;
    }
  }
  if (!video) return null;
  const relKey = `rel:dm_${rawId}`;
  let related = getCached(relKey);
  if (!related) {
    const keywords = video.title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 3).slice(0, 3).join(" ");
    const dmRel = await fetchDailymotionFeedPaged({
      query: keywords || video.category,
      language: video.language,
      limit: 14
    });
    related = dmRel.items.filter((r) => r.id !== video.id && !r.isShort).slice(0, 12);
    if (related.length > 0) setCached(relKey, related, FEED_CACHE_TTL_MS);
  }
  return { video, related };
}
async function fetchDailymotionChannelById(dmChannelId, pageToken = "") {
  const username = dmChannelId.startsWith("dm_ch_") ? dmChannelId.slice(6) : dmChannelId;
  if (!username) return null;
  const page = Math.max(1, Number(pageToken.replace(/^dm_p/, "")) || 1);
  const cacheKey = `dm_channel:${username}:${page}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  try {
    const [userResp, vidsResp] = await Promise.all([
      fetch(
        `https://api.dailymotion.com/user/${encodeURIComponent(username)}?fields=username,screenname,description,avatar_120_url,followers_total,videos_total,verified`,
        { signal: AbortSignal.timeout(5e3) }
      ),
      fetch(
        `https://api.dailymotion.com/user/${encodeURIComponent(username)}/videos?limit=24&page=${page}&fields=${encodeURIComponent(
          DM_FIELDS
        )}`,
        { signal: AbortSignal.timeout(5500) }
      )
    ]);
    if (!vidsResp.ok && !userResp.ok) return null;
    const userJson = userResp.ok ? await userResp.json() : {};
    const vidsJson = vidsResp.ok ? await vidsResp.json() : { list: [] };
    const videos = (vidsJson.list ?? []).map((item) => mapDailymotionItem(item)).filter((v) => Boolean(v));
    const name = userJson.screenname || videos[0]?.channelName || username;
    const handleRaw = (userJson.username || username).toLowerCase();
    const detail = {
      id: `dm_ch_${username}`,
      userId: `dm_user_${username}`,
      name,
      handle: `@${handleRaw}`,
      description: userJson.description || "",
      avatarUrl: userJson.avatar_120_url || `/api/avatars/dm_ch_${username}.svg`,
      bannerColor: "#111827",
      verified: Boolean(userJson.verified || (userJson.followers_total ?? 0) > 1e4),
      subscriberCount: Number(userJson.followers_total || videos[0]?.subscriberCount || 0),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const nextPageToken = vidsJson.has_more ? `dm_p${page + 1}` : null;
    const payload = {
      channel: detail,
      videos,
      nextPageToken,
      hasMore: Boolean(nextPageToken),
      totalResults: Number(userJson.videos_total || vidsJson.total || videos.length)
    };
    setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
    return payload;
  } catch {
    return null;
  }
}
var CATEGORY_ID_MAP = {
  "1": "Entertainment",
  "10": "Music",
  "17": "Cricket",
  "20": "Gaming",
  "22": "Lifestyle",
  "23": "Comedy",
  "24": "Entertainment",
  "25": "News",
  "27": "Education",
  "28": "Science"
};
function mapLanguageCode(code, fallback = "Hindi") {
  if (!code) return fallback;
  const c = code.toLowerCase();
  if (c.startsWith("hi")) return "Hindi";
  if (c.startsWith("en")) return "English";
  if (c.startsWith("ta")) return "Tamil";
  if (c.startsWith("te")) return "Telugu";
  if (c.startsWith("bn")) return "Bengali";
  if (c.startsWith("mr")) return "Marathi";
  if (c.startsWith("gu")) return "Gujarati";
  if (c.startsWith("kn")) return "Kannada";
  if (c.startsWith("ml")) return "Malayalam";
  if (c.startsWith("pa")) return "Punjabi";
  if (c.startsWith("or")) return "Odia";
  if (c.startsWith("as")) return "Assamese";
  if (c.startsWith("ur")) return "Urdu";
  return fallback;
}
async function fetchChannelsMap(channelIds, apiKey) {
  const result = /* @__PURE__ */ new Map();
  const unique = Array.from(new Set(channelIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) return result;
  const missing = [];
  for (const cid of unique) {
    const cached = getCached(`ch:${cid}`);
    if (cached) result.set(cid, cached);
    else missing.push(cid);
  }
  if (missing.length === 0) return result;
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(
      missing.join(",")
    )}&key=${encodeURIComponent(apiKey)}`;
    const resp = await discoveryFetch(url, apiKey, 5500);
    if (!resp.ok) return result;
    const json = await resp.json();
    for (const ch of json.items ?? []) {
      if (ch.id) {
        setCached(`ch:${ch.id}`, ch, META_CACHE_TTL_MS);
        result.set(ch.id, ch);
      }
    }
  } catch {
  }
  return result;
}
function toDiscoveryResult(item, chMap, opts) {
  const vid = typeof item.id === "string" ? item.id : item.id?.videoId;
  const sn = item.snippet;
  if (!vid || !sn) return null;
  const chId = sn.channelId || vid;
  const chMeta = chMap.get(chId);
  const channelAvatar = chMeta?.snippet?.thumbnails?.medium?.url || chMeta?.snippet?.thumbnails?.default?.url || `/api/avatars/ext_ch_${chId}.svg`;
  const subscriberCount = Number(chMeta?.statistics?.subscriberCount || 0);
  const durationSec = parseIsoDurationToSeconds(item.contentDetails?.duration || "");
  const views = Number(item.statistics?.viewCount || 0);
  const likes = Number(item.statistics?.likeCount || 0);
  const isLive = sn.liveBroadcastContent === "live";
  const titleText = sn.title ?? "Video";
  const tags = sn.tags?.slice(0, 10) ?? [];
  const isShort = Boolean(opts?.forceShort) || durationSec > 0 && durationSec <= 62 || /#shorts?\b/i.test(titleText) || tags.some((t) => /^shorts?$/i.test(t));
  const mappedCat = opts?.category && opts.category !== "All" ? opts.category === "Mixes" ? "Music" : opts.category : CATEGORY_ID_MAP[sn.categoryId || ""] || "Entertainment";
  const mappedLang = opts?.language && opts.language !== "All" ? opts.language : mapLanguageCode(sn.defaultAudioLanguage, "Hindi");
  const handleRaw = chMeta?.snippet?.customUrl ? chMeta.snippet.customUrl : `@${(sn.channelTitle ?? "creator").toLowerCase().replace(/[^a-z0-9]/g, "") || "creator"}`;
  return {
    id: `ext_${vid}`,
    title: titleText,
    description: sn.description ?? "",
    tags: tags.length > 0 ? tags : [mappedLang, mappedCat],
    category: mappedCat,
    language: mappedLang,
    channelId: `ext_ch_${chId}`,
    channelName: sn.channelTitle ?? chMeta?.snippet?.title ?? "Creator Channel",
    channelHandle: handleRaw.startsWith("@") ? handleRaw : `@${handleRaw}`,
    channelAvatar,
    channelVerified: subscriberCount >= 1e5,
    subscriberCount,
    views,
    likes,
    createdAt: sn.publishedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    isShort,
    isLive,
    visibility: "public",
    durationSec,
    thumbnailUrl: sn.thumbnails?.maxres?.url || sn.thumbnails?.standard?.url || sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || `/api/thumbnails/card/ext_${vid}.svg`,
    videoUrl: "",
    hlsUrl: null,
    sourceType: "external",
    externalEmbedUrl: isShort ? `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&playsinline=1&loop=1&playlist=${vid}&rel=0&modestbranding=1&iv_load_policy=3` : `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`
  };
}
async function enrichVideoIds(videoIds, apiKey, opts) {
  const uniqueIds = Array.from(new Set(videoIds.filter(Boolean))).slice(0, 50);
  if (uniqueIds.length === 0) return [];
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${encodeURIComponent(
      uniqueIds.join(",")
    )}&key=${encodeURIComponent(apiKey)}`;
    const response = await discoveryFetch(url, apiKey, 6500);
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    const items = (data.items ?? []).filter((i) => i.status?.embeddable !== false);
    const chMap = await fetchChannelsMap(
      items.map((i) => i.snippet?.channelId || "").filter(Boolean),
      apiKey
    );
    const results = [];
    for (const item of items) {
      const converted = toDiscoveryResult(item, chMap, opts);
      if (converted) {
        setCached(`vid:${converted.id}`, converted, META_CACHE_TTL_MS);
        results.push(converted);
      }
    }
    return results;
  } catch (err) {
    console.warn("External discovery enrich failed:", err instanceof Error ? err.message : "unknown");
    return [];
  }
}
function interleaveProviders(...lists) {
  const out = [];
  const seenIds = /* @__PURE__ */ new Set();
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i < list.length && !seenIds.has(list[i].id)) {
        seenIds.add(list[i].id);
        out.push(list[i]);
      }
    }
  }
  return out;
}
async function fetchExternalFeedPaged(params) {
  const category = params.category || "All";
  const language = params.language || "All";
  const pageToken = (params.pageToken || "").trim();
  const seed = Math.abs(Math.floor(params.refreshSeed ?? 0));
  const dmPageMatch = pageToken.match(/^dm_p(\d+)$/);
  const dmPage = dmPageMatch ? Number(dmPageMatch[1]) : pageToken === "" ? 1 : null;
  const ytToken = pageToken && !pageToken.startsWith("dm_p") ? pageToken.replace(/^yt:/, "") : "";
  const cacheKey = `unified_feed:${category}:${language}:${Boolean(params.trending)}:${Boolean(
    params.shorts
  )}:${pageToken}:${seed}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const apiKey = getExternalApiKey();
  try {
    if (params.shorts) {
      const dmTopicPool = [
        "cricket",
        "comedy",
        "technology",
        "music",
        "food",
        "science"
      ];
      const topicSeed = (seed + (dmPage ?? 1)) % dmTopicPool.length;
      const dmQuery = category !== "All" ? CATEGORY_TO_DM_QUERY[category] || category : params.interestTopics && params.interestTopics.length > 0 && topicSeed % 2 === 0 ? params.interestTopics[topicSeed % params.interestTopics.length] : dmTopicPool[topicSeed];
      const [rssShorts, dmShorts] = await Promise.all([
        pageToken === "" ? fetchCuratedYouTubeRss({ category, language, shortsOnly: true }) : Promise.resolve([]),
        dmPage ? fetchDailymotionFeedPaged({
          query: dmQuery,
          category,
          language,
          shorts: true,
          page: dmPage,
          limit: 24,
          sort: "trending"
        }) : Promise.resolve({ items: [], nextPage: null })
      ]);
      const combined2 = interleaveProviders(dmShorts.items, rssShorts);
      const nextToken2 = dmShorts.nextPage ? `dm_p${dmShorts.nextPage}` : null;
      const payload2 = { items: combined2, nextPageToken: nextToken2 };
      if (combined2.length > 0) setCached(cacheKey, payload2, FEED_CACHE_TTL_MS);
      return payload2;
    }
    const dmCategoryQuery = category !== "All" ? CATEGORY_TO_DM_QUERY[category] || category : params.trending ? "" : params.interestTopics && params.interestTopics.length > 0 && (seed + (dmPage ?? 1)) % 3 === 1 ? params.interestTopics[seed % params.interestTopics.length] : "";
    const fetchYtPopular = async () => {
      if (!apiKey || params.trending === false && ytToken === "" && pageToken.startsWith("dm_p")) {
        return { items: [], nextPageToken: null };
      }
      if (!apiKey || category !== "All" && category !== "Live") {
        return { items: [], nextPageToken: null };
      }
      const tokenParam = ytToken ? `&pageToken=${encodeURIComponent(ytToken)}` : "";
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&chart=mostPopular&regionCode=IN&maxResults=20${tokenParam}&key=${encodeURIComponent(
        apiKey
      )}`;
      const resp = await discoveryFetch(url, apiKey, 5500);
      if (!resp.ok) return { items: [], nextPageToken: null };
      const data = await resp.json();
      const items = (data.items ?? []).filter((i) => i.status?.embeddable !== false);
      const chMap = await fetchChannelsMap(
        items.map((i) => i.snippet?.channelId || "").filter(Boolean),
        apiKey
      );
      const converted = items.map((it) => toDiscoveryResult(it, chMap, { category, language })).filter((v) => Boolean(v && !v.isShort));
      for (const v of converted) setCached(`vid:${v.id}`, v, META_CACHE_TTL_MS);
      return { items: converted, nextPageToken: data.nextPageToken || null };
    };
    const [rssItems, dmRes, ytPop] = await Promise.all([
      pageToken === "" ? fetchCuratedYouTubeRss({ category, language, shortsOnly: false }) : Promise.resolve([]),
      dmPage ? fetchDailymotionFeedPaged({
        query: dmCategoryQuery,
        category,
        language,
        shorts: false,
        page: dmPage,
        limit: 24,
        sort: params.trending ? "visited" : "trending"
      }) : Promise.resolve({ items: [], nextPage: null }),
      category === "All" && language === "All" ? fetchYtPopular() : Promise.resolve({ items: [], nextPageToken: null })
    ]);
    const combined = interleaveProviders(ytPop.items, dmRes.items, rssItems);
    const nextToken = dmRes.nextPage ? `dm_p${dmRes.nextPage}` : ytPop.nextPageToken ? `yt:${ytPop.nextPageToken}` : null;
    const payload = {
      items: combined,
      nextPageToken: nextToken
    };
    if (combined.length > 0) setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
    return payload;
  } catch (err) {
    console.warn("Unified discovery feed failed:", err instanceof Error ? err.message : "unknown");
    return { items: [], nextPageToken: null };
  }
}
async function fetchExternalFeed(params) {
  const res = await fetchExternalFeedPaged(params);
  return res.items;
}
async function fetchExternalDiscoveryPaged(query, language, pageToken = "") {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { items: [], nextPageToken: null };
  }
  const cleanToken = pageToken.trim();
  const cacheKey = `search_unified:${cleanQuery.toLowerCase()}:${language || "All"}:${cleanToken}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const dmPageMatch = cleanToken.match(/^dm_p(\d+)$/);
  const dmPage = dmPageMatch ? Number(dmPageMatch[1]) : cleanToken === "" ? 1 : 1;
  const fullQuery = language && language !== "All" ? `${cleanQuery} ${language}` : cleanQuery;
  const apiKey = getExternalApiKey();
  const fetchYtSearch = async () => {
    if (!apiKey || cleanToken.startsWith("dm_p")) return { items: [], nextPageToken: null };
    try {
      const tokenParam = cleanToken ? `&pageToken=${encodeURIComponent(cleanToken)}` : "";
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&regionCode=IN&maxResults=20${tokenParam}&q=${encodeURIComponent(
        fullQuery
      )}&key=${encodeURIComponent(apiKey)}`;
      const response = await discoveryFetch(url, apiKey, 5500);
      if (!response.ok) return { items: [], nextPageToken: null };
      const data = await response.json();
      const ids = (data.items ?? []).map((it) => typeof it.id === "string" ? it.id : it.id?.videoId || "").filter(Boolean);
      const enriched = await enrichVideoIds(ids, apiKey, { language });
      return { items: enriched, nextPageToken: data.nextPageToken || null };
    } catch {
      return { items: [], nextPageToken: null };
    }
  };
  const fetchRssSearch = async () => {
    if (cleanToken) return [];
    const pool = await fetchCuratedYouTubeRss({ language });
    const qLower = cleanQuery.toLowerCase();
    return pool.filter(
      (v) => v.title.toLowerCase().includes(qLower) || v.channelName.toLowerCase().includes(qLower) || v.tags.some((t) => t.toLowerCase().includes(qLower))
    );
  };
  const [dmRes, ytRes, rssMatches] = await Promise.all([
    fetchDailymotionFeedPaged({
      query: fullQuery,
      language,
      page: dmPage,
      limit: 24,
      sort: "relevance"
    }),
    fetchYtSearch(),
    fetchRssSearch()
  ]);
  const combined = interleaveProviders(ytRes.items, dmRes.items, rssMatches);
  const nextPageToken = dmRes.nextPage ? `dm_p${dmRes.nextPage}` : ytRes.nextPageToken || null;
  const payload = { items: combined, nextPageToken };
  if (combined.length > 0) setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
  return payload;
}
async function fetchExternalDiscovery(query, language) {
  const res = await fetchExternalDiscoveryPaged(query, language);
  return res.items;
}
async function fetchExternalVideoById(extId) {
  if (extId.startsWith("dm_")) {
    return fetchDailymotionVideoById(extId);
  }
  const rawId = extId.startsWith("ext_") ? extId.slice(4) : extId;
  if (!rawId) return null;
  let video = getCached(`vid:ext_${rawId}`);
  const apiKey = getExternalApiKey();
  if (!video && apiKey) {
    const list = await enrichVideoIds([rawId], apiKey);
    video = list[0] ?? null;
  }
  if (!video) {
    try {
      const oembedResp = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(rawId)}&format=json`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (oembedResp.ok) {
        const meta = await oembedResp.json();
        const title = meta.title || "Featured Video";
        const isShort = /#shorts?\b/i.test(title);
        const authorName = meta.author_name || "Creator Channel";
        const syntheticChId = authorName.toLowerCase().replace(/[^a-z0-9]/g, "") || rawId;
        video = {
          id: `ext_${rawId}`,
          title,
          description: "",
          tags: [isShort ? "Shorts" : "Featured", "India"],
          category: "Entertainment",
          language: "Hindi",
          channelId: `ext_ch_${syntheticChId}`,
          channelName: authorName,
          channelHandle: `@${syntheticChId}`,
          channelAvatar: `/api/avatars/ext_ch_${syntheticChId}.svg`,
          channelVerified: true,
          subscriberCount: 1e5,
          views: 15e3,
          likes: 900,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          isShort,
          isLive: false,
          visibility: "public",
          durationSec: isShort ? 45 : 300,
          thumbnailUrl: meta.thumbnail_url || `https://i.ytimg.com/vi/${rawId}/hqdefault.jpg`,
          videoUrl: "",
          hlsUrl: null,
          sourceType: "external",
          externalEmbedUrl: isShort ? `https://www.youtube-nocookie.com/embed/${rawId}?autoplay=1&playsinline=1&loop=1&playlist=${rawId}&rel=0&modestbranding=1&iv_load_policy=3` : `https://www.youtube-nocookie.com/embed/${rawId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`
        };
        setCached(`vid:ext_${rawId}`, video, META_CACHE_TTL_MS);
      }
    } catch {
    }
  }
  if (!video) return null;
  const relKey = `rel:ext_${rawId}`;
  let related = getCached(relKey);
  if (!related) {
    const topicWords = video.title.split(/\s+/).slice(0, 4).join(" ");
    const found = await fetchExternalDiscovery(topicWords || video.category, video.language);
    related = found.filter((r) => r.id !== video.id && !r.isShort).slice(0, 14);
    if (related.length > 0) setCached(relKey, related, FEED_CACHE_TTL_MS);
  }
  return { video, related };
}
async function fetchExternalChannelById(extChannelId, pageToken = "") {
  if (extChannelId.startsWith("dm_ch_")) {
    return fetchDailymotionChannelById(extChannelId, pageToken);
  }
  const rawChannelId = extChannelId.startsWith("ext_ch_") ? extChannelId.slice(7) : extChannelId;
  if (!rawChannelId) return null;
  const cleanToken = pageToken.trim();
  const cacheKey = `channel_page:${rawChannelId}:${cleanToken}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const apiKey = getExternalApiKey();
  if (apiKey) {
    try {
      const chMap = await fetchChannelsMap([rawChannelId], apiKey);
      const ch = chMap.get(rawChannelId);
      if (ch) {
        const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
        const tokenParam = cleanToken ? `&pageToken=${encodeURIComponent(cleanToken)}` : "";
        let ids = [];
        let nextPageToken = null;
        let totalResults = Number(ch.statistics?.videoCount || 0);
        if (uploadsPlaylistId) {
          const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(
            uploadsPlaylistId
          )}&maxResults=50${tokenParam}&key=${encodeURIComponent(apiKey)}`;
          const plResp = await discoveryFetch(playlistUrl, apiKey, 6500);
          if (plResp.ok) {
            const plData = await plResp.json();
            ids = (plData.items ?? []).map((it) => it.contentDetails?.videoId || it.snippet?.resourceId?.videoId || "").filter(Boolean);
            nextPageToken = plData.nextPageToken || null;
            if (plData.pageInfo?.totalResults) totalResults = plData.pageInfo.totalResults;
          }
        }
        const videos = await enrichVideoIds(ids, apiKey);
        if (videos.length > 0) {
          const subscriberCount = Number(ch.statistics?.subscriberCount || 0);
          const handle = ch.snippet?.customUrl ? ch.snippet.customUrl.startsWith("@") ? ch.snippet.customUrl : `@${ch.snippet.customUrl}` : `@${(ch.snippet?.title || "creator").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
          const detail = {
            id: `ext_ch_${rawChannelId}`,
            userId: `ext_user_${rawChannelId}`,
            name: ch.snippet?.title || "Creator Channel",
            handle,
            description: ch.snippet?.description || "",
            avatarUrl: ch.snippet?.thumbnails?.high?.url || ch.snippet?.thumbnails?.medium?.url || `/api/avatars/ext_ch_${rawChannelId}.svg`,
            bannerColor: "#1f1f23",
            verified: subscriberCount >= 1e5,
            subscriberCount,
            createdAt: ch.snippet?.publishedAt || (/* @__PURE__ */ new Date()).toISOString()
          };
          const payload = {
            channel: detail,
            videos,
            nextPageToken,
            hasMore: Boolean(nextPageToken),
            totalResults: Math.max(totalResults, videos.length)
          };
          return setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
        }
      }
    } catch {
    }
  }
  try {
    const resp = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(rawChannelId)}`,
      { signal: AbortSignal.timeout(4500) }
    );
    if (!resp.ok) return null;
    const xml = await resp.text();
    const videos = parseAtomRssFeed(xml, {
      channelId: rawChannelId,
      category: "Entertainment",
      language: "Hindi"
    });
    if (videos.length === 0) return null;
    const first = videos[0];
    const detail = {
      id: `ext_ch_${rawChannelId}`,
      userId: `ext_user_${rawChannelId}`,
      name: first.channelName,
      handle: first.channelHandle,
      description: `Official channel feed of ${first.channelName}`,
      avatarUrl: `/api/avatars/ext_ch_${rawChannelId}.svg`,
      bannerColor: "#1f1f23",
      verified: true,
      subscriberCount: first.subscriberCount,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const payload = {
      channel: detail,
      videos,
      nextPageToken: null,
      hasMore: false,
      totalResults: videos.length
    };
    return setCached(cacheKey, payload, FEED_CACHE_TTL_MS);
  } catch {
    return null;
  }
}

// server/aiRoutes.ts
import { GoogleGenAI } from "@google/genai";
var asyncRoute = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch(next);
};
function registerAiAndLibraryRoutes(app2, ensureExternalVideoRecord2) {
  const handleHomeFeed = asyncRoute(async (req, res) => {
    const {
      category = "All",
      language = "All",
      shorts = "0",
      pageToken = "",
      feedFilter = "for_you"
    } = req.query;
    const cursor = Math.max(0, Number(req.query.cursor || 0));
    const limit = Math.max(1, Math.min(30, Number(req.query.limit || 12)));
    const cleanToken = (pageToken || "").trim();
    const ctx = buildUserAiContext(req.auth?.userId);
    if (feedFilter === "following") {
      if (!req.auth) {
        res.json({
          videos: [],
          sections: [],
          nextCursor: null,
          nextPageToken: null,
          hasMore: false,
          total: 0,
          followingRequiresAuth: true,
          discoveryStatus: getDiscoveryStatus()
        });
        return;
      }
      const subRows = db.prepare(`
          SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
                 c.verified as channel_verified, c.subscriber_count
          FROM videos v
          JOIN channels c ON c.id = v.channel_id
          JOIN subscriptions s ON s.channel_id = c.id
          WHERE s.user_id = ? AND v.visibility = 'public' AND v.status = 'published'
          ORDER BY v.created_at DESC
        `).all(req.auth.userId);
      const hydrated = subRows.map(hydrateVideoRow).filter((v) => shorts === "1" ? v.isShort : !v.isShort);
      const filtered = filterAndSortVideos(hydrated, { category, language });
      const valid = filtered.map(toCandidate).filter((v) => validateContentCandidate(v, ctx.validation).valid);
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
        discoveryStatus: getDiscoveryStatus()
      });
      return;
    }
    const native = cleanToken === "" ? filterAndSortVideos(
      getAllNativeCandidates().filter((v) => shorts === "1" ? v.isShort : !v.isShort),
      { category, language }
    ) : [];
    const topTopics = Object.entries(ctx.interestScores).sort((a, b) => b[1] - a[1]).map(([topic]) => topic).slice(0, 5);
    const seed = Number(req.query.seed || 0) || Math.floor(Date.now() / (10 * 60 * 1e3)) % 12;
    const extPaged = await fetchExternalFeedPaged({
      category,
      language,
      shorts: shorts === "1",
      pageToken: cleanToken,
      interestTopics: topTopics,
      recentSearches: ctx.recentSearches,
      preferredLanguage: ctx.preferredLanguages[0],
      refreshSeed: seed
    });
    const pool = [...native, ...extPaged.items.map(toCandidate)];
    const rec = generatePersonalizedRecommendations(pool, ctx, { cursor, limit });
    let respNextCursor = rec.nextCursor;
    let respNextPageToken = cleanToken;
    let respHasMore = rec.hasMore;
    if (rec.nextCursor === null && extPaged.nextPageToken) {
      respNextCursor = 0;
      respNextPageToken = extPaged.nextPageToken;
      respHasMore = true;
    }
    let sections = [];
    if (cursor === 0 && cleanToken === "" && category === "All" && language === "All" && shorts !== "1") {
      const continueWatchingRows = req.auth ? db.prepare(`
              SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
                     c.verified as channel_verified, c.subscriber_count
              FROM watch_history wh
              JOIN videos v ON v.id = wh.video_id
              JOIN channels c ON c.id = v.channel_id
              WHERE wh.user_id = ? AND wh.progress_sec > 10 AND v.visibility = 'public' AND v.status = 'published' AND v.is_short = 0
              ORDER BY wh.watched_at DESC LIMIT 8
            `).all(req.auth.userId) : [];
      const continueWatching = continueWatchingRows.map(hydrateVideoRow).map(toCandidate).filter((v) => validateContentCandidate(v, ctx.validation).valid);
      const subscribedRows = req.auth ? db.prepare(`
              SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
                     c.verified as channel_verified, c.subscriber_count
              FROM videos v
              JOIN channels c ON c.id = v.channel_id
              JOIN subscriptions s ON s.channel_id = c.id
              WHERE s.user_id = ? AND v.visibility = 'public' AND v.status = 'published' AND v.is_short = 0
              ORDER BY v.created_at DESC LIMIT 8
            `).all(req.auth.userId) : [];
      const subscribedVideos = subscribedRows.map(hydrateVideoRow).map(toCandidate).filter((v) => validateContentCandidate(v, ctx.validation).valid);
      const topInterestTopic = Object.entries(ctx.interestScores).sort((a, b) => b[1] - a[1])[0]?.[0];
      const trending = rankTrendingIndia(pool, ctx.validation);
      const newCreators = pool.filter((v) => !v.isShort && v.subscriberCount < 25e4);
      sections = buildConditionalSections({
        recommended: rec.items,
        continueWatching,
        trending,
        subscribedVideos,
        topInterestTopic,
        preferredLanguage: ctx.preferredLanguages[0],
        newCreators
      });
    }
    res.status(200).json({
      videos: rec.items,
      sections,
      nextCursor: respNextCursor,
      nextPageToken: respNextPageToken || null,
      hasMore: respHasMore,
      total: rec.total,
      discoveryStatus: getDiscoveryStatus()
    });
  });
  app2.get("/api/recommendations/home", handleHomeFeed);
  app2.get("/api/feed/home", handleHomeFeed);
  app2.get("/api/recommendations/trending", asyncRoute(async (req, res) => {
    const language = String(req.query.language || "All");
    const pageToken = String(req.query.pageToken || "").trim();
    const ctx = buildUserAiContext(req.auth?.userId);
    const native = pageToken === "" ? filterAndSortVideos(
      getAllNativeCandidates().filter((v) => !v.isShort),
      { language }
    ) : [];
    const extPaged = await fetchExternalFeedPaged({ trending: true, language, shorts: false, pageToken });
    const ranked = rankTrendingIndia([...native, ...extPaged.items.map(toCandidate)], ctx.validation);
    res.json({
      videos: ranked,
      nextPageToken: extPaged.nextPageToken,
      hasMore: Boolean(extPaged.nextPageToken),
      discoveryStatus: getDiscoveryStatus()
    });
  }));
  app2.get("/api/recommendations/shorts", asyncRoute(async (req, res) => {
    const language = String(req.query.language || "All");
    const category = String(req.query.category || "All");
    const feedRaw = String(req.query.feed || "for_you");
    const mode = ["for_you", "following", "trending", "new_creators"].includes(feedRaw) ? feedRaw : "for_you";
    const pageToken = String(req.query.pageToken || "").trim();
    const ctx = buildUserAiContext(req.auth?.userId);
    if (mode === "following" && !req.auth) {
      res.json({
        videos: [],
        nextPageToken: null,
        hasMore: false,
        followingRequiresAuth: true,
        discoveryStatus: getDiscoveryStatus()
      });
      return;
    }
    const native = pageToken === "" ? filterAndSortVideos(
      getAllNativeCandidates().filter((v) => v.isShort),
      { language, category }
    ) : [];
    const topTopics = Object.entries(ctx.interestScores).sort((a, b) => b[1] - a[1]).map(([topic]) => topic).slice(0, 5);
    const seed = Number(req.query.seed || 0) || Math.floor(Date.now() / (5 * 60 * 1e3)) % 12;
    let subscribedShorts = [];
    if (mode === "following" && req.auth && pageToken === "") {
      const subRows = db.prepare(`
          SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
                 c.verified as channel_verified, c.subscriber_count
          FROM videos v
          JOIN channels c ON c.id = v.channel_id
          JOIN subscriptions s ON s.channel_id = c.id
          WHERE s.user_id = ? AND v.visibility = 'public' AND v.status = 'published' AND v.is_short = 1
          ORDER BY v.created_at DESC
        `).all(req.auth.userId);
      subscribedShorts = subRows.map(hydrateVideoRow).map(toCandidate);
    }
    const extPaged = mode === "following" ? { items: [], nextPageToken: null } : await fetchExternalFeedPaged({
      shorts: true,
      category,
      language,
      trending: mode === "trending",
      pageToken,
      interestTopics: topTopics,
      recentSearches: ctx.recentSearches,
      preferredLanguage: ctx.preferredLanguages[0],
      refreshSeed: seed
    });
    const ranked = rankShortsFeed([...subscribedShorts, ...native, ...extPaged.items.map(toCandidate)], ctx, Date.now(), {
      mode,
      category
    });
    res.json({
      videos: ranked,
      nextPageToken: extPaged.nextPageToken,
      hasMore: Boolean(extPaged.nextPageToken),
      discoveryStatus: getDiscoveryStatus()
    });
  }));
  app2.get("/api/recommendations/related/:videoId", asyncRoute(async (req, res) => {
    const videoId = req.params.videoId;
    const ctx = buildUserAiContext(req.auth?.userId);
    let current = null;
    let extRelated = [];
    const row = db.prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
               c.verified as channel_verified, c.subscriber_count
        FROM videos v JOIN channels c ON c.id = v.channel_id
        WHERE v.id = ?
      `).get(videoId);
    if (row) current = toCandidate(hydrateVideoRow(row));
    if (videoId.startsWith("ext_") || videoId.startsWith("dm_")) {
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
    const ranked = getRelatedCandidatePool(current, ctx, extRelated);
    res.json({ videos: ranked.slice(0, 16) });
  }));
  app2.get("/api/recommendations/next-video", asyncRoute(async (req, res) => {
    const currentVideoId = String(req.query.currentVideoId || "");
    const mode = String(req.query.mode || "recommended");
    const playlistId = String(req.query.playlistId || "");
    const ctx = buildUserAiContext(req.auth?.userId);
    const queueVideoIds = req.auth ? db.prepare("SELECT video_id FROM video_queue WHERE user_id = ? ORDER BY position ASC, added_at ASC").all(req.auth.userId).map((r) => r.video_id) : [];
    const playlistVideoIds = req.auth && playlistId ? db.prepare(`
                SELECT pv.video_id
                FROM playlist_videos pv
                JOIN playlists p ON p.id = pv.playlist_id
                WHERE pv.playlist_id = ? AND p.user_id = ?
                ORDER BY pv.position ASC, pv.added_at ASC
              `).all(playlistId, req.auth.userId).map((r) => r.video_id) : [];
    let currentVideo = null;
    const row = db.prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
               c.verified as channel_verified, c.subscriber_count
        FROM videos v JOIN channels c ON c.id = v.channel_id WHERE v.id = ?
      `).get(currentVideoId);
    if (row) currentVideo = toCandidate(hydrateVideoRow(row));
    let extRelated = [];
    if (currentVideoId.startsWith("ext_") || currentVideoId.startsWith("dm_")) {
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
      currentVideo
    });
    if (!resolution.nextVideoId) {
      res.json({ nextVideo: null, source: "none" });
      return;
    }
    const nextRow = db.prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
               c.verified as channel_verified, c.subscriber_count
        FROM videos v JOIN channels c ON c.id = v.channel_id WHERE v.id = ?
      `).get(resolution.nextVideoId);
    if (nextRow) {
      res.json({ nextVideo: hydrateVideoRow(nextRow), source: resolution.source });
      return;
    }
    const fromPool = related.find((v) => v.id === resolution.nextVideoId);
    res.json({ nextVideo: fromPool ?? null, source: resolution.source });
  }));
  app2.post("/api/events/watch", rateLimit(120, 6e4), asyncRoute(async (req, res) => {
    const { eventId, videoId, eventType, progressPct = 0, watchDurationSec = 0, sessionId = "" } = req.body ?? {};
    if (!videoId || !eventType) {
      res.status(400).json({ error: "videoId and eventType required." });
      return;
    }
    await ensureExternalVideoRecord2(videoId);
    const result = recordBehaviorEvent({
      eventId,
      userId: req.auth?.userId,
      sessionId,
      videoId,
      eventType,
      progressPct,
      watchDurationSec
    });
    res.json(result);
  }));
  app2.post("/api/events/batch", rateLimit(60, 6e4), asyncRoute(async (req, res) => {
    const { events = [] } = req.body ?? {};
    if (!Array.isArray(events) || events.length === 0) {
      res.status(400).json({ error: "events array is required." });
      return;
    }
    const bounded = events.slice(0, 50).filter((e) => e && typeof e.videoId === "string" && typeof e.eventType === "string");
    const uniqueVideoIds = Array.from(new Set(bounded.map((e) => e.videoId))).slice(0, 20);
    for (const vid of uniqueVideoIds) {
      await ensureExternalVideoRecord2(vid);
    }
    const prepared = bounded.map((e) => ({
      eventId: e.eventId,
      userId: req.auth?.userId,
      sessionId: e.sessionId,
      videoId: e.videoId,
      eventType: e.eventType,
      progressPct: e.progressPct,
      watchDurationSec: e.watchDurationSec,
      metadata: e.surface ? { ...e.metadata ?? {}, surface: e.surface } : e.metadata
    }));
    const result = recordBehaviorEventBatch(prepared);
    res.json({ ok: true, ...result });
  }));
  app2.post("/api/events/skip", rateLimit(120, 6e4), asyncRoute(async (req, res) => {
    const { eventId, videoId, watchDurationSec = 0 } = req.body ?? {};
    if (!videoId) {
      res.status(400).json({ error: "videoId required." });
      return;
    }
    await ensureExternalVideoRecord2(videoId);
    const result = recordBehaviorEvent({
      eventId,
      userId: req.auth?.userId,
      videoId,
      eventType: "skip",
      watchDurationSec
    });
    res.json(result);
  }));
  app2.post("/api/events/like", requireAuth, asyncRoute(async (req, res) => {
    const { eventId, videoId, reaction = "like" } = req.body ?? {};
    if (!videoId) {
      res.status(400).json({ error: "videoId required." });
      return;
    }
    await ensureExternalVideoRecord2(videoId);
    const result = recordBehaviorEvent({
      eventId,
      userId: req.auth.userId,
      videoId,
      eventType: reaction === "dislike" ? "dislike" : "like"
    });
    res.json(result);
  }));
  app2.post("/api/events/share", rateLimit(60, 6e4), asyncRoute(async (req, res) => {
    const { eventId, videoId } = req.body ?? {};
    if (!videoId) {
      res.status(400).json({ error: "videoId required." });
      return;
    }
    await ensureExternalVideoRecord2(videoId);
    const result = recordBehaviorEvent({
      eventId,
      userId: req.auth?.userId,
      videoId,
      eventType: "share"
    });
    res.json(result);
  }));
  app2.post("/api/events/feedback", requireAuth, asyncRoute(async (req, res) => {
    const { videoId, channelId, feedbackType, reason = "" } = req.body ?? {};
    if (!feedbackType || !["not_interested", "dont_recommend_creator"].includes(feedbackType)) {
      res.status(400).json({ error: "Invalid feedbackType." });
      return;
    }
    if (videoId) await ensureExternalVideoRecord2(videoId);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO user_feedback (id, user_id, video_id, channel_id, feedback_type, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`fb_${randomUUID2().slice(0, 10)}`, req.auth.userId, videoId ?? null, channelId ?? null, feedbackType, reason, nowIso);
    if (feedbackType === "dont_recommend_creator" && channelId) {
      db.prepare("INSERT OR IGNORE INTO blocked_creators (user_id, channel_id, created_at) VALUES (?, ?, ?)").run(
        req.auth.userId,
        channelId,
        nowIso
      );
    }
    if (videoId) {
      recordBehaviorEvent({
        userId: req.auth.userId,
        videoId,
        eventType: feedbackType
      });
    }
    res.json({ ok: true });
  }));
  app2.post("/api/recommendations/impression", rateLimit(200, 6e4), asyncRoute((req, res) => {
    const { videoIds = [], surface = "home" } = req.body ?? {};
    const stmt = db.prepare(`
      INSERT INTO recommendation_impressions (id, user_id, video_id, surface, position, score, clicked, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?)
    `);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    videoIds.slice(0, 24).forEach((vid, idx) => {
      if (vid) {
        stmt.run(`imp_${randomUUID2().slice(0, 10)}`, req.auth?.userId ?? null, vid, surface, idx, nowIso);
      }
    });
    res.json({ ok: true });
  }));
  app2.post("/api/recommendations/click", rateLimit(120, 6e4), asyncRoute((req, res) => {
    const { videoId, surface = "home", eventId } = req.body ?? {};
    if (!videoId) {
      res.status(400).json({ error: "videoId required." });
      return;
    }
    if (req.auth) {
      db.prepare(`
        UPDATE recommendation_impressions SET clicked = 1
        WHERE user_id = ? AND video_id = ? AND surface = ?
      `).run(req.auth.userId, videoId, surface);
    }
    recordBehaviorEvent({ eventId, userId: req.auth?.userId, videoId, eventType: "click", metadata: { surface } });
    res.json({ ok: true });
  }));
  app2.get("/api/preferences", requireAuth, (req, res) => {
    const uid = req.auth.userId;
    const preferences = getUserPreferencesPayload(uid);
    const interests = db.prepare("SELECT topic, score, source, updated_at as updatedAt FROM user_interests WHERE user_id = ? ORDER BY score DESC").all(uid);
    const blockedTopics = db.prepare("SELECT topic, created_at as createdAt FROM blocked_topics WHERE user_id = ? ORDER BY created_at DESC").all(uid);
    const blockedCreators = db.prepare(`
        SELECT bc.channel_id as channelId, COALESCE(c.name, bc.channel_id) as channelName, bc.created_at as createdAt
        FROM blocked_creators bc
        LEFT JOIN channels c ON c.id = bc.channel_id
        WHERE bc.user_id = ?
        ORDER BY bc.created_at DESC
      `).all(uid);
    res.json({ preferences, interests, blockedTopics, blockedCreators });
  });
  app2.patch("/api/preferences", requireAuth, (req, res) => {
    const uid = req.auth.userId;
    const current = getUserPreferencesPayload(uid);
    const body = req.body;
    const nextLangs = Array.isArray(body.preferredLanguages) ? body.preferredLanguages.filter((l) => INDIAN_LANGUAGES.includes(l)) : current.preferredLanguages;
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
      typeof body.personalizationEnabled === "boolean" ? body.personalizationEnabled ? 1 : 0 : current.personalizationEnabled ? 1 : 0,
      typeof body.infiniteScrollEnabled === "boolean" ? body.infiniteScrollEnabled ? 1 : 0 : current.infiniteScrollEnabled ? 1 : 0,
      typeof body.autoplayEnabled === "boolean" ? body.autoplayEnabled ? 1 : 0 : current.autoplayEnabled ? 1 : 0,
      typeof body.onboardingCompleted === "boolean" ? body.onboardingCompleted ? 1 : 0 : current.onboardingCompleted ? 1 : 0,
      (/* @__PURE__ */ new Date()).toISOString(),
      uid
    );
    if (nextLangs.length > 0) {
      db.prepare("UPDATE users SET preferred_language = ? WHERE id = ?").run(nextLangs[0], uid);
    }
    res.json({ preferences: getUserPreferencesPayload(uid) });
  });
  app2.post("/api/preferences/interests", requireAuth, (req, res) => {
    const uid = req.auth.userId;
    const { interests, topic, score, preferredLanguage, onboardingCompleted } = req.body;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (topic && typeof score === "number") {
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
      if (preferredLanguage && INDIAN_LANGUAGES.includes(preferredLanguage)) {
        db.prepare("UPDATE users SET preferred_language = ? WHERE id = ?").run(preferredLanguage, uid);
      }
    } else if (onboardingCompleted) {
      db.prepare("UPDATE user_preferences SET onboarding_completed = 1, updated_at = ? WHERE user_id = ?").run(nowIso, uid);
    }
    const updated = db.prepare("SELECT topic, score, source, updated_at as updatedAt FROM user_interests WHERE user_id = ? ORDER BY score DESC").all(uid);
    res.json({ interests: updated, preferences: getUserPreferencesPayload(uid) });
  });
  app2.post("/api/blocked-topics", requireAuth, (req, res) => {
    const { topic } = req.body;
    if (!topic || topic.trim().length < 2) {
      res.status(400).json({ error: "Topic must be at least 2 characters." });
      return;
    }
    db.prepare("INSERT OR IGNORE INTO blocked_topics (user_id, topic, created_at) VALUES (?, ?, ?)").run(
      req.auth.userId,
      topic.trim(),
      (/* @__PURE__ */ new Date()).toISOString()
    );
    res.json({ ok: true });
  });
  app2.delete("/api/blocked-topics/:topic", requireAuth, (req, res) => {
    db.prepare("DELETE FROM blocked_topics WHERE user_id = ? AND LOWER(topic) = LOWER(?)").run(
      req.auth.userId,
      req.params.topic
    );
    res.json({ ok: true });
  });
  app2.delete("/api/blocked-creators/:channelId", requireAuth, (req, res) => {
    db.prepare("DELETE FROM blocked_creators WHERE user_id = ? AND channel_id = ?").run(
      req.auth.userId,
      req.params.channelId
    );
    db.prepare(`DELETE FROM user_feedback WHERE user_id = ? AND channel_id = ? AND feedback_type = 'dont_recommend_creator'`).run(
      req.auth.userId,
      req.params.channelId
    );
    res.json({ ok: true });
  });
  app2.get("/api/users/me/export", requireAuth, (req, res) => {
    const uid = req.auth.userId;
    const profile = db.prepare("SELECT id, name, email, role, preferred_language as preferredLanguage, created_at as createdAt FROM users WHERE id = ?").get(uid);
    const preferences = getUserPreferencesPayload(uid);
    const interests = db.prepare("SELECT topic, score, source FROM user_interests WHERE user_id = ?").all(uid);
    const watchHistory = db.prepare("SELECT video_id as videoId, progress_sec as progressSec, watched_at as watchedAt FROM watch_history WHERE user_id = ?").all(uid);
    const searchHistory = db.prepare("SELECT query, searched_at as searchedAt FROM search_history WHERE user_id = ?").all(uid);
    const playlists = db.prepare("SELECT id, title, visibility, created_at as createdAt FROM playlists WHERE user_id = ?").all(uid);
    res.setHeader("Content-Disposition", 'attachment; filename="doptube-my-data.json"');
    res.json({
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      profile,
      preferences,
      interests,
      watchHistory,
      searchHistory,
      playlists
    });
  });
  app2.delete("/api/users/me/watch-history", requireAuth, (req, res) => {
    db.prepare("DELETE FROM watch_history WHERE user_id = ?").run(req.auth.userId);
    res.json({ ok: true });
  });
  app2.patch("/api/playlists/:id", requireAuth, (req, res) => {
    const { title, description, visibility } = req.body;
    const own = db.prepare("SELECT id, title, description, visibility FROM playlists WHERE id = ? AND user_id = ?").get(
      req.params.id,
      req.auth.userId
    );
    if (!own) {
      res.status(404).json({ error: "Playlist not found." });
      return;
    }
    const nextTitle = title && title.trim().length >= 2 ? title.trim() : own.title;
    const nextDesc = typeof description === "string" ? description.trim() : own.description;
    const nextVis = visibility && ["public", "unlisted", "private"].includes(visibility) ? visibility : own.visibility;
    db.prepare("UPDATE playlists SET title = ?, description = ?, visibility = ? WHERE id = ? AND user_id = ?").run(
      nextTitle,
      nextDesc,
      nextVis,
      req.params.id,
      req.auth.userId
    );
    res.json({ ok: true });
  });
  app2.delete("/api/playlists/:id", requireAuth, (req, res) => {
    const info = db.prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?").run(req.params.id, req.auth.userId);
    if (info.changes === 0) {
      res.status(404).json({ error: "Playlist not found." });
      return;
    }
    res.json({ ok: true });
  });
  app2.put("/api/playlists/:id/reorder", requireAuth, (req, res) => {
    const { videoIds = [] } = req.body;
    const own = db.prepare("SELECT id FROM playlists WHERE id = ? AND user_id = ?").get(req.params.id, req.auth.userId);
    if (!own) {
      res.status(404).json({ error: "Playlist not found." });
      return;
    }
    const stmt = db.prepare("UPDATE playlist_videos SET position = ? WHERE playlist_id = ? AND video_id = ?");
    videoIds.forEach((vid, idx) => stmt.run(idx, req.params.id, vid));
    res.json({ ok: true });
  });
  app2.get("/api/queue", requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
               c.verified as channel_verified, c.subscriber_count, vq.position
        FROM video_queue vq
        JOIN videos v ON v.id = vq.video_id
        JOIN channels c ON c.id = v.channel_id
        WHERE vq.user_id = ?
        ORDER BY vq.position ASC, vq.added_at ASC
      `).all(req.auth.userId);
    res.json({ videos: rows.map(hydrateVideoRow) });
  });
  app2.post("/api/queue", requireAuth, async (req, res) => {
    const { videoId, playNext = false } = req.body;
    if (!videoId) {
      res.status(400).json({ error: "videoId required." });
      return;
    }
    await ensureExternalVideoRecord2(videoId);
    const uid = req.auth.userId;
    if (playNext) {
      db.prepare("UPDATE video_queue SET position = position + 1 WHERE user_id = ?").run(uid);
      db.prepare("INSERT OR REPLACE INTO video_queue (user_id, video_id, position, added_at) VALUES (?, ?, 0, ?)").run(
        uid,
        videoId,
        (/* @__PURE__ */ new Date()).toISOString()
      );
    } else {
      const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) as m FROM video_queue WHERE user_id = ?").get(uid).m;
      db.prepare("INSERT OR REPLACE INTO video_queue (user_id, video_id, position, added_at) VALUES (?, ?, ?, ?)").run(
        uid,
        videoId,
        maxPos + 1,
        (/* @__PURE__ */ new Date()).toISOString()
      );
    }
    res.json({ ok: true });
  });
  app2.put("/api/queue/reorder", requireAuth, (req, res) => {
    const { videoIds = [] } = req.body;
    const stmt = db.prepare("UPDATE video_queue SET position = ? WHERE user_id = ? AND video_id = ?");
    videoIds.forEach((vid, idx) => stmt.run(idx, req.auth.userId, vid));
    res.json({ ok: true });
  });
  app2.delete("/api/queue/:videoId", requireAuth, (req, res) => {
    db.prepare("DELETE FROM video_queue WHERE user_id = ? AND video_id = ?").run(req.auth.userId, req.params.videoId);
    res.json({ ok: true });
  });
  app2.delete("/api/queue", requireAuth, (req, res) => {
    db.prepare("DELETE FROM video_queue WHERE user_id = ?").run(req.auth.userId);
    res.json({ ok: true });
  });
  app2.get("/api/analytics/recommendations", requireAdmin, (_req, res) => {
    const totalImpressions = db.prepare("SELECT COUNT(*) as c FROM recommendation_impressions").get().c;
    const totalClicks = db.prepare("SELECT COUNT(*) as c FROM recommendation_impressions WHERE clicked = 1").get().c;
    const startEvents = db.prepare(`SELECT COUNT(*) as c FROM user_events WHERE event_type = 'start'`).get().c;
    const completionEvents = db.prepare(`SELECT COUNT(*) as c FROM user_events WHERE event_type = 'completion'`).get().c;
    const notInterestedCount = db.prepare(`SELECT COUNT(*) as c FROM user_feedback WHERE feedback_type = 'not_interested'`).get().c;
    const dontRecommendCreatorCount = db.prepare(`SELECT COUNT(*) as c FROM user_feedback WHERE feedback_type = 'dont_recommend_creator'`).get().c;
    const anomalyFlags = db.prepare(`SELECT COUNT(*) as c FROM user_events WHERE metadata_json LIKE '%"anomaly":true%'`).get().c;
    const topTopics = db.prepare(`
        SELECT topic, ROUND(AVG(score), 1) as avgScore, COUNT(*) as usersCount
        FROM user_interests
        GROUP BY topic
        ORDER BY usersCount DESC, avgScore DESC
        LIMIT 8
      `).all();
    res.json({
      totalImpressions,
      totalClicks,
      ctrPercent: totalImpressions > 0 ? Number((totalClicks / totalImpressions * 100).toFixed(1)) : 0,
      completionRatePercent: startEvents > 0 ? Number((completionEvents / startEvents * 100).toFixed(1)) : 0,
      notInterestedCount,
      dontRecommendCreatorCount,
      anomalyFlags,
      topTopics
    });
  });
  app2.post("/api/ai/chat", rateLimit(30, 6e4), asyncRoute(async (req, res) => {
    const { message, history = [], role = "general", videoContext } = req.body ?? {};
    const cleanMessage = typeof message === "string" ? message.trim() : "";
    if (!cleanMessage) {
      res.status(400).json({ error: "Please enter a message." });
      return;
    }
    if (cleanMessage.length > 2e3) {
      res.status(400).json({ error: "Message exceeds 2,000 characters." });
      return;
    }
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      res.status(503).json({ error: "GEMINI_API_KEY is not configured on the server." });
      return;
    }
    const roleInstructions = {
      general: "You are DopTube Assistant, a concise and helpful guide for India\u2019s DopTube video platform. Answer clearly in English or Hinglish/Hindi matching the user.",
      fast: "You are DopTube Quick Q&A. Give direct, crisp 1-3 sentence answers for quick questions about videos, features, or general topics.",
      creator: "You are DopTube Creator Strategist. Help creators improve video hooks, titles, thumbnails, Shorts retention, and growth across Indian languages.",
      discovery: "You are DopTube Discovery Guide. Recommend specific search keywords, Indian creator niches, playlists, and learning tracks tailored to user interests."
    };
    const selectedRole = role in roleInstructions ? role : "general";
    const model = selectedRole === "fast" ? "gemini-3.1-flash-lite" : "gemini-4-hydrogen";
    const ctx = buildUserAiContext(req.auth?.userId);
    const userTopics = Object.entries(ctx.interestScores).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
    const topicSuffix = userTopics.length > 0 ? ` The current viewer follows topics: ${userTopics.join(", ")} (languages: ${ctx.preferredLanguages.join(", ")}).` : "";
    const safeVideoMeta = videoContext && typeof videoContext.title === "string" && videoContext.title.trim() ? ` Active video metadata only (you cannot see the video frames or audio stream\u2014state this limitation clearly if asked about visual/spoken details not in metadata): Title="${videoContext.title.trim().slice(0, 180)}", Channel="${String(videoContext.channelName || "").slice(0, 80)}", Category="${String(videoContext.category || "").slice(0, 60)}", Language="${String(videoContext.language || "").slice(0, 40)}", Description="${String(videoContext.description || "").slice(0, 400)}".` : "";
    const contextSuffix = `${topicSuffix}${safeVideoMeta}`;
    const normalizedHistory = Array.isArray(history) ? history.slice(-20).filter((turn) => typeof turn?.text === "string" && turn.text.trim().length > 0).map((turn) => ({
      role: turn.role === "model" ? "model" : "user",
      parts: [{ text: turn.text.trim().slice(0, 2e3) }]
    })) : [];
    const runChat = async (targetModel) => {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });
      const chat = ai.chats.create({
        model: targetModel,
        history: normalizedHistory,
        config: {
          systemInstruction: `${roleInstructions[selectedRole]}${contextSuffix}`,
          temperature: 0.7
        }
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
        if (activeModel !== "gemini-3.1-flash-lite" && isTransient) {
          activeModel = "gemini-3.1-flash-lite";
          result = await runChat(activeModel);
        } else {
          throw primaryErr;
        }
      }
      const reply = (result.text || "").trim();
      if (!reply) {
        res.status(502).json({ error: "Assistant returned an empty response." });
        return;
      }
      res.json({ reply, model: activeModel, role: selectedRole });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Unable to reach Gemini service.";
      let friendly = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error?.message) friendly = parsed.error.message;
      } catch {
      }
      console.error("Gemini chat error:", friendly);
      res.status(502).json({ error: friendly });
    }
  }));
}

// server/firebaseAdmin.ts
import crypto from "node:crypto";
import fs3 from "node:fs";
import path3 from "node:path";
var FALLBACK_FIREBASE_PROJECT_ID = "sodium-booster-bv9wh";
var GOOGLE_X509_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var cachedCerts = null;
function loadProjectId() {
  try {
    const configPath = path3.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs3.existsSync(configPath)) {
      const raw = JSON.parse(fs3.readFileSync(configPath, "utf8"));
      if (raw.projectId && raw.projectId !== "remixed-project-id") return raw.projectId;
    }
  } catch {
  }
  return process.env.FIREBASE_PROJECT_ID || FALLBACK_FIREBASE_PROJECT_ID;
}
function decodeBase64UrlJson(segment) {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json);
}
async function fetchGoogleSecureTokenCerts() {
  if (cachedCerts && Date.now() < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }
  const resp = await fetch(GOOGLE_X509_CERTS_URL, {
    signal: AbortSignal.timeout(5e3)
  });
  if (!resp.ok) {
    throw new Error(`Unable to fetch Google public token certificates (${resp.status}).`);
  }
  const certs = await resp.json();
  const cacheHeader = resp.headers.get("cache-control") || "";
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheHeader);
  const ttlSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;
  cachedCerts = {
    certs,
    expiresAt: Date.now() + ttlSec * 1e3
  };
  return certs;
}
async function verifyJwtWithGoogleCerts(idToken, projectId) {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson(headerB64);
  const payload = decodeBase64UrlJson(payloadB64);
  if (header.alg !== "RS256" || !header.kid) return null;
  const certs = await fetchGoogleSecureTokenCerts();
  const certPem = certs[header.kid];
  if (!certPem) return null;
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const sigBuf = Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (!verifier.verify(certPem, sigBuf)) return null;
  const nowSec = Math.floor(Date.now() / 1e3);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || typeof payload.exp !== "number" || payload.exp <= nowSec) return null;
  if (typeof payload.iat === "number" && payload.iat > nowSec + 300) return null;
  if (!payload.email || payload.email_verified !== true) return null;
  return {
    uid: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    name: payload.name || payload.email.split("@")[0] || "DopTube User",
    picture: payload.picture || ""
  };
}
async function verifyFirebaseGoogleToken(idToken) {
  const projectId = loadProjectId();
  if (!projectId || !idToken || typeof idToken !== "string") {
    return null;
  }
  try {
    const [{ getApp, getApps, initializeApp }, { getAuth }] = await Promise.all([
      import("firebase-admin/app"),
      import("firebase-admin/auth")
    ]);
    const app2 = getApps().length ? getApp() : initializeApp({ projectId });
    const decoded = await getAuth(app2).verifyIdToken(idToken);
    if (!decoded.email || decoded.email_verified !== true) {
      return null;
    }
    return {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      emailVerified: Boolean(decoded.email_verified),
      name: decoded.name || decoded.email.split("@")[0] || "DopTube User",
      picture: decoded.picture || ""
    };
  } catch {
    return verifyJwtWithGoogleCerts(idToken, projectId);
  }
}

// server/musicRoutes.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import fs4 from "node:fs";
import path4 from "node:path";
import multer from "multer";
var audioStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    cb(null, file.fieldname === "cover" ? THUMB_DIR : UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path4.extname(file.originalname || "").toLowerCase() || (file.fieldname === "cover" ? ".jpg" : ".mp3");
    cb(null, `aud_${Date.now()}_${randomUUID3().slice(0, 8)}${ext}`);
  }
});
var audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "audio") {
      const ok = /\.(mp3|m4a|wav|ogg|webm|aac)$/i.test(file.originalname) || file.mimetype.startsWith("audio/");
      cb(null, ok);
      return;
    }
    if (file.fieldname === "cover") {
      const ok = /\.(jpg|jpeg|png|webp)$/i.test(file.originalname) || file.mimetype.startsWith("image/");
      cb(null, ok);
      return;
    }
    cb(null, false);
  }
});
function getMusicCatalog(userId) {
  const likedSet = /* @__PURE__ */ new Set();
  if (userId) {
    const likes = db.prepare("SELECT track_id FROM music_likes WHERE user_id = ?").all(userId);
    for (const l of likes) likedSet.add(l.track_id);
  }
  const trackRows = db.prepare(`
      SELECT id, video_id, channel_id, title, artist_name, album_name, audio_url, cover_url,
             duration_sec, language, genre, likes, plays, created_at
      FROM music_tracks
      WHERE visibility = 'public' AND status = 'published'
      ORDER BY plays DESC, created_at DESC
    `).all();
  const tracks = trackRows.map((r) => ({
    id: String(r.id),
    videoId: r.video_id ? String(r.video_id) : null,
    channelId: String(r.channel_id),
    title: String(r.title),
    artistName: String(r.artist_name),
    albumName: String(r.album_name || "Single"),
    audioUrl: String(r.audio_url),
    coverUrl: String(r.cover_url),
    durationSec: Number(r.duration_sec || 0),
    language: String(r.language || "Hindi"),
    genre: String(r.genre || "Music"),
    likes: Number(r.likes || 0),
    plays: Number(r.plays || 0),
    isLiked: likedSet.has(String(r.id)),
    createdAt: String(r.created_at)
  }));
  const existingVideoIds = new Set(tracks.map((t) => t.videoId).filter(Boolean));
  const nativeMusicVideos = db.prepare(`
      SELECT v.id, v.channel_id, v.title, c.name as artist_name, v.thumbnail_url, v.video_url,
             v.duration_sec, v.language, v.likes, v.views, v.created_at
      FROM videos v
      JOIN channels c ON c.id = v.channel_id
      WHERE v.source_type = 'native' AND v.visibility = 'public' AND v.status = 'published' AND v.category = 'Music'
      ORDER BY v.views DESC, v.created_at DESC
    `).all();
  for (const v of nativeMusicVideos) {
    const vid = String(v.id);
    if (existingVideoIds.has(vid)) continue;
    const syntheticId = `mv_${vid}`;
    tracks.push({
      id: syntheticId,
      videoId: vid,
      channelId: String(v.channel_id),
      title: String(v.title),
      artistName: String(v.artist_name),
      albumName: "DopTube Native Audio",
      audioUrl: String(v.video_url),
      coverUrl: String(v.thumbnail_url),
      durationSec: Number(v.duration_sec || 0),
      language: String(v.language || "Hindi"),
      genre: "Music",
      likes: Number(v.likes || 0),
      plays: Number(v.views || 0),
      isLiked: likedSet.has(syntheticId),
      createdAt: String(v.created_at)
    });
  }
  return tracks;
}
function registerMusicRoutes(app2) {
  app2.get("/api/music/home", (req, res) => {
    const tracks = getMusicCatalog(req.auth?.userId);
    const languageFilter = String(req.query.language || "All");
    const filtered = languageFilter !== "All" ? tracks.filter((t) => t.language.toLowerCase() === languageFilter.toLowerCase()) : tracks;
    const byLang = /* @__PURE__ */ new Map();
    for (const t of tracks) {
      const list = byLang.get(t.language) ?? [];
      list.push(t);
      byLang.set(t.language, list);
    }
    const mixes = Array.from(byLang.entries()).map(([lang, list]) => ({
      id: `mix_${lang.toLowerCase()}`,
      title: `${lang} Mix`,
      subtitle: `${list.length} DopTube-hosted tracks`,
      coverUrl: list[0]?.coverUrl || "",
      tracks: list.slice(0, 12)
    }));
    let recentlyPlayed = [];
    if (req.auth) {
      const hist = db.prepare("SELECT track_id FROM music_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 12").all(req.auth.userId);
      const map = new Map(tracks.map((t) => [t.id, t]));
      recentlyPlayed = hist.map((h) => map.get(h.track_id)).filter((t) => Boolean(t));
    }
    res.json({
      tracks: filtered,
      mixes,
      recentlyPlayed
    });
  });
  app2.get("/api/music/library", requireAuth, (req, res) => {
    const tracks = getMusicCatalog(req.auth.userId);
    const liked = tracks.filter((t) => t.isLiked);
    const uploaded = tracks.filter((t) => {
      const ch = db.prepare("SELECT id FROM channels WHERE user_id = ?").get(req.auth.userId);
      return ch && t.channelId === ch.id;
    });
    res.json({ liked, uploaded });
  });
  app2.get("/api/music/recently-played", requireAuth, (req, res) => {
    const tracks = getMusicCatalog(req.auth.userId);
    const map = new Map(tracks.map((t) => [t.id, t]));
    const hist = db.prepare("SELECT track_id, played_at FROM music_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 30").all(req.auth.userId);
    res.json({
      tracks: hist.map((h) => map.get(h.track_id)).filter((t) => Boolean(t))
    });
  });
  app2.get("/api/recommendations/music", (req, res) => {
    const tracks = getMusicCatalog(req.auth?.userId);
    const sorted = [...tracks].sort((a, b) => b.plays + b.likes * 3 - (a.plays + a.likes * 3));
    res.json({ tracks: sorted });
  });
  app2.post(
    "/api/music/upload",
    requireAuth,
    audioUpload.fields([
      { name: "audio", maxCount: 1 },
      { name: "cover", maxCount: 1 }
    ]),
    (req, res) => {
      const files = req.files;
      const audioFile = files?.audio?.[0];
      const coverFile = files?.cover?.[0];
      if (!audioFile) {
        res.status(400).json({ error: "Please choose an MP3, M4A, WAV, or WebM audio file." });
        return;
      }
      const { title = "", artistName = "", albumName = "Single", language = "Hindi", genre = "Music" } = req.body;
      if (title.trim().length < 2) {
        fs4.unlink(audioFile.path, () => {
        });
        if (coverFile) fs4.unlink(coverFile.path, () => {
        });
        res.status(400).json({ error: "Track title must be at least 2 characters." });
        return;
      }
      const channel = db.prepare("SELECT id, name FROM channels WHERE user_id = ?").get(req.auth.userId);
      if (!channel) {
        fs4.unlink(audioFile.path, () => {
        });
        if (coverFile) fs4.unlink(coverFile.path, () => {
        });
        res.status(400).json({ error: "Creator channel not found." });
        return;
      }
      const trackId = `trk_${randomUUID3().slice(0, 10)}`;
      const ext = path4.extname(audioFile.filename) || ".mp3";
      const canonicalAudioPath = path4.resolve(UPLOAD_DIR, `${trackId}${ext}`);
      if (!canonicalAudioPath.startsWith(path4.resolve(UPLOAD_DIR) + path4.sep)) {
        fs4.unlink(audioFile.path, () => {
        });
        res.status(400).json({ error: "Invalid file path." });
        return;
      }
      fs4.renameSync(audioFile.path, canonicalAudioPath);
      const coverUrl = coverFile ? `/api/thumbnails/${path4.basename(coverFile.path)}` : `/api/avatars/${channel.id}.svg`;
      db.prepare(`
        INSERT INTO music_tracks (
          id, video_id, channel_id, title, artist_name, album_name, audio_url, cover_url,
          duration_sec, language, genre, likes, plays, visibility, status, created_at
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0, 'public', 'published', ?)
      `).run(
        trackId,
        channel.id,
        title.trim(),
        artistName.trim() || channel.name,
        albumName.trim() || "Single",
        `/api/music/stream/${trackId}`,
        coverUrl,
        language,
        genre,
        (/* @__PURE__ */ new Date()).toISOString()
      );
      res.status(201).json({ trackId });
    }
  );
  app2.get("/api/music/stream/:id", (req, res) => {
    const trackId = path4.basename(req.params.id);
    const match = fs4.readdirSync(UPLOAD_DIR).find((f) => f.startsWith(`${trackId}.`));
    if (!match) {
      res.status(404).json({ error: "Audio stream not found." });
      return;
    }
    const baseDir = path4.resolve(UPLOAD_DIR);
    const filePath = path4.resolve(baseDir, match);
    if (!filePath.startsWith(baseDir + path4.sep) || !fs4.existsSync(filePath)) {
      res.status(404).end();
      return;
    }
    const stat = fs4.statSync(filePath);
    const fileSize = stat.size;
    const ext = path4.extname(filePath).toLowerCase();
    const mimeType = ext === ".mp3" ? "audio/mpeg" : ext === ".wav" ? "audio/wav" : ext === ".ogg" ? "audio/ogg" : ext === ".m4a" ? "audio/mp4" : "audio/webm";
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (Number.isNaN(start) || start >= fileSize) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
        return;
      }
      const clampedEnd = Math.min(end, fileSize - 1);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${clampedEnd}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": clampedEnd - start + 1,
        "Content-Type": mimeType
      });
      fs4.createReadStream(filePath, { start, end: clampedEnd }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes"
      });
      fs4.createReadStream(filePath).pipe(res);
    }
  });
  app2.post("/api/music/history", requireAuth, (req, res) => {
    const { trackId } = req.body;
    if (!trackId) {
      res.status(400).json({ error: "trackId required." });
      return;
    }
    if (trackId.startsWith("mv_")) {
      const vid = trackId.slice(3);
      db.prepare("UPDATE videos SET views = views + 1 WHERE id = ?").run(vid);
      res.json({ ok: true });
      return;
    }
    const track = db.prepare("SELECT id FROM music_tracks WHERE id = ?").get(trackId);
    if (!track) {
      res.status(404).json({ error: "Track not found." });
      return;
    }
    db.prepare("UPDATE music_tracks SET plays = plays + 1 WHERE id = ?").run(trackId);
    db.prepare(`
      INSERT INTO music_history (user_id, track_id, played_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, track_id) DO UPDATE SET played_at = excluded.played_at
    `).run(req.auth.userId, trackId, (/* @__PURE__ */ new Date()).toISOString());
    res.json({ ok: true });
  });
  app2.post("/api/music/like/:trackId", requireAuth, (req, res) => {
    const trackId = req.params.trackId;
    const uid = req.auth.userId;
    if (trackId.startsWith("mv_")) {
      const vid = trackId.slice(3);
      const exists2 = db.prepare(`SELECT 1 FROM video_reactions WHERE user_id = ? AND video_id = ? AND reaction = 'like'`).get(uid, vid);
      if (exists2) {
        db.prepare("DELETE FROM video_reactions WHERE user_id = ? AND video_id = ?").run(uid, vid);
        db.prepare("UPDATE videos SET likes = MAX(0, likes - 1) WHERE id = ?").run(vid);
        res.json({ liked: false });
      } else {
        db.prepare(`
          INSERT INTO video_reactions (user_id, video_id, reaction, created_at)
          VALUES (?, ?, 'like', ?)
          ON CONFLICT(user_id, video_id) DO UPDATE SET reaction = 'like'
        `).run(uid, vid, (/* @__PURE__ */ new Date()).toISOString());
        db.prepare("UPDATE videos SET likes = likes + 1 WHERE id = ?").run(vid);
        res.json({ liked: true });
      }
      return;
    }
    const exists = db.prepare("SELECT 1 FROM music_likes WHERE user_id = ? AND track_id = ?").get(uid, trackId);
    if (exists) {
      db.prepare("DELETE FROM music_likes WHERE user_id = ? AND track_id = ?").run(uid, trackId);
      db.prepare("UPDATE music_tracks SET likes = MAX(0, likes - 1) WHERE id = ?").run(trackId);
      res.json({ liked: false });
    } else {
      db.prepare("INSERT INTO music_likes (user_id, track_id, created_at) VALUES (?, ?, ?)").run(
        uid,
        trackId,
        (/* @__PURE__ */ new Date()).toISOString()
      );
      db.prepare("UPDATE music_tracks SET likes = likes + 1 WHERE id = ?").run(trackId);
      res.json({ liked: true });
    }
  });
  app2.get("/api/music/queue", requireAuth, (req, res) => {
    const tracks = getMusicCatalog(req.auth.userId);
    const map = new Map(tracks.map((t) => [t.id, t]));
    const rows = db.prepare("SELECT track_id FROM music_queue WHERE user_id = ? ORDER BY position ASC, added_at ASC").all(req.auth.userId);
    res.json({
      tracks: rows.map((r) => map.get(r.track_id)).filter((t) => Boolean(t))
    });
  });
  app2.post("/api/music/queue", requireAuth, (req, res) => {
    const { trackId } = req.body;
    if (!trackId) {
      res.status(400).json({ error: "trackId required." });
      return;
    }
    const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) as m FROM music_queue WHERE user_id = ?").get(req.auth.userId).m;
    db.prepare("INSERT OR REPLACE INTO music_queue (user_id, track_id, position, added_at) VALUES (?, ?, ?, ?)").run(
      req.auth.userId,
      trackId,
      maxPos + 1,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    res.json({ ok: true });
  });
  app2.delete("/api/music/queue/:trackId", requireAuth, (req, res) => {
    db.prepare("DELETE FROM music_queue WHERE user_id = ? AND track_id = ?").run(req.auth.userId, req.params.trackId);
    res.json({ ok: true });
  });
}

// server/app.ts
var ADMIN_EMAIL = "doptails@gmail.com";
var asyncRoute2 = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
var readyPromise = null;
function ensureServerReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      ensureMediaDirs();
      await ensureDbReady();
      seedDatabaseIfEmpty();
    })();
  }
  return readyPromise;
}
var app = express();
app.set("trust proxy", 1);
app.use(securityHeaders);
app.use(async (_req, _res, next) => {
  try {
    await ensureServerReady();
    next();
  } catch (err) {
    next(err);
  }
});
app.use(express.json({ limit: "4mb" }));
app.use((req, _res, next) => {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "doptube.vercel.app";
  const origin = req.headers.origin || req.headers.referer || `${proto}://${host}/`;
  runWithDiscoveryReferer(String(origin), next);
});
app.use(attachAuth);
app.get("/api/health", (_req, res) => {
  const discoveryStatus = getDiscoveryStatus();
  res.json({
    ok: true,
    env: process.env.VERCEL ? "vercel" : "node",
    externalDiscovery: Boolean(getExternalApiKey()) || discoveryStatus.configured,
    discoveryStatus
  });
});
var uploadStorage = multer2.diskStorage({
  destination: (_req, file, cb) => {
    ensureMediaDirs();
    cb(null, file.fieldname === "thumbnail" ? THUMB_DIR : UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path5.extname(file.originalname || "").toLowerCase() || (file.fieldname === "thumbnail" ? ".jpg" : ".mp4");
    cb(null, `${Date.now()}_${randomUUID4().slice(0, 8)}${ext}`);
  }
});
var upload = multer2({
  storage: uploadStorage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "video") {
      const ok = /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.originalname) || file.mimetype.startsWith("video/");
      cb(null, ok);
      return;
    }
    if (file.fieldname === "thumbnail") {
      const ok = /\.(jpg|jpeg|png|webp)$/i.test(file.originalname) || file.mimetype.startsWith("image/");
      cb(null, ok);
      return;
    }
    cb(null, false);
  }
});
function ensureExternalChannelStub(channel) {
  const existing = db.prepare("SELECT id FROM channels WHERE id = ?").get(channel.id);
  if (existing) return;
  const sysUserId = "u_ext_registry";
  const sysUser = db.prepare("SELECT id FROM users WHERE id = ?").get(sysUserId);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  if (!sysUser) {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, avatar_url, role, preferred_language, created_at)
      VALUES (?, 'External Creators', 'external-registry@doptube.internal', 'disabled', '', 'user', 'Hindi', ?)
    `).run(sysUserId, nowIso);
  }
  let safeHandle = channel.handle || `@${channel.id}`;
  const clash = db.prepare("SELECT id FROM channels WHERE handle = ?").get(safeHandle);
  if (clash) safeHandle = `${safeHandle}_${channel.id.slice(-4)}`;
  db.prepare(`
    INSERT OR IGNORE INTO channels (id, user_id, name, handle, description, avatar_url, banner_color, verified, subscriber_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '#1f1f23', ?, ?, ?)
  `).run(
    channel.id,
    sysUserId,
    channel.name,
    safeHandle,
    channel.description || "",
    channel.avatarUrl,
    channel.verified ? 1 : 0,
    channel.subscriberCount || 0,
    nowIso
  );
}
async function ensureExternalVideoRecord(videoId, extData) {
  if (!videoId.startsWith("ext_") && !videoId.startsWith("dm_")) return true;
  const existing = db.prepare("SELECT id FROM videos WHERE id = ?").get(videoId);
  if (existing) return true;
  const resolved = extData ?? (await fetchExternalVideoById(videoId))?.video;
  if (!resolved) return false;
  ensureExternalChannelStub({
    id: resolved.channelId,
    name: resolved.channelName,
    handle: resolved.channelHandle,
    avatarUrl: resolved.channelAvatar,
    verified: resolved.channelVerified,
    subscriberCount: resolved.subscriberCount
  });
  const rawRef = videoId.startsWith("dm_") ? videoId.slice(3) : videoId.slice(4);
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
function buildSignalsForUser(userId) {
  const empty = {
    preferredLanguages: ["Hindi", "English"],
    watchedCategories: {},
    likedCategories: {},
    subscribedChannelIds: /* @__PURE__ */ new Set(),
    recentSearches: []
  };
  if (!userId) return empty;
  const user = db.prepare("SELECT preferred_language FROM users WHERE id = ?").get(userId);
  if (user?.preferred_language) {
    empty.preferredLanguages = [user.preferred_language, "English"];
  }
  const subs = db.prepare("SELECT channel_id FROM subscriptions WHERE user_id = ?").all(userId);
  for (const s of subs) empty.subscribedChannelIds.add(s.channel_id);
  const histCats = db.prepare(`
    SELECT v.category, COUNT(*) as cnt
    FROM watch_history wh JOIN videos v ON v.id = wh.video_id
    WHERE wh.user_id = ?
    GROUP BY v.category
  `).all(userId);
  for (const row of histCats) empty.watchedCategories[row.category] = row.cnt;
  const likedCats = db.prepare(`
    SELECT v.category, COUNT(*) as cnt
    FROM video_reactions vr JOIN videos v ON v.id = vr.video_id
    WHERE vr.user_id = ? AND vr.reaction = 'like'
    GROUP BY v.category
  `).all(userId);
  for (const row of likedCats) empty.likedCategories[row.category] = row.cnt;
  const searches = db.prepare("SELECT query FROM search_history WHERE user_id = ? ORDER BY searched_at DESC LIMIT 8").all(userId);
  empty.recentSearches = searches.map((s) => s.query);
  return empty;
}
function getUserPayload(userId) {
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_url, u.birthday, u.role, u.preferred_language, u.restricted_mode, u.history_paused, u.created_at,
           c.id as channel_id, c.name as channel_name, c.handle as channel_handle, c.description as channel_desc, c.subscriber_count
    FROM users u
    LEFT JOIN channels c ON c.user_id = u.id
    WHERE u.id = ?
  `).get(userId);
  if (!user) return null;
  const preferences = getUserPreferencesPayload(userId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_url,
    birthday: user.birthday || "",
    role: user.role,
    preferredLanguage: user.preferred_language,
    restrictedMode: user.restricted_mode === 1,
    historyPaused: user.history_paused === 1,
    createdAt: user.created_at,
    preferences,
    channel: user.channel_id ? {
      id: user.channel_id,
      name: user.channel_name,
      handle: user.channel_handle,
      description: user.channel_desc,
      subscriberCount: user.subscriber_count
    } : null
  };
}
function createSignedUserSession(userId) {
  const u = getUserPayload(userId);
  return signSessionToken(
    {
      userId,
      role: u?.role ?? "creator",
      exp: Date.now() + 30 * 24 * 60 * 60 * 1e3,
      name: u?.name,
      email: u?.email,
      handle: u?.channel?.handle,
      avatarUrl: u?.avatarUrl && !String(u.avatarUrl).startsWith("data:") ? u.avatarUrl : "",
      preferredLanguage: u?.preferredLanguage,
      birthday: u?.birthday
    },
    getSessionSecret()
  );
}
function logAudit(actorUserId, action, targetType, targetId, metadata = {}) {
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(`log_${randomUUID4().slice(0, 10)}`, actorUserId, action, targetType, targetId, JSON.stringify(metadata), (/* @__PURE__ */ new Date()).toISOString());
}
app.get("/api/auth/me", (req, res) => {
  if (!req.auth) {
    res.json({ user: null });
    return;
  }
  const user = getUserPayload(req.auth.userId);
  res.json({ user });
});
app.get("/api/auth/check-username", (req, res) => {
  const raw = String(req.query.username || "").trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_]/g, "");
  const nameHint = String(req.query.name || "").trim();
  const normalized = raw ? `@${raw}` : "";
  const existing = normalized ? db.prepare("SELECT id FROM channels WHERE LOWER(handle) = LOWER(?)").get(normalized) : null;
  const baseSuggestions = buildUsernameSuggestions(nameHint || raw || "creator", raw);
  const suggestions = baseSuggestions.filter(
    (s) => !db.prepare("SELECT id FROM channels WHERE LOWER(handle) = LOWER(?)").get(s)
  );
  res.json({
    available: Boolean(raw.length >= 3 && !existing),
    normalized,
    suggestions: suggestions.slice(0, 5)
  });
});
app.post("/api/auth/register", rateLimit(20, 6e4), asyncRoute2((req, res) => {
  const { name, email, birthday = "", password, username, avatarDataUrl = "", interests = [] } = req.body ?? {};
  const cleanName = (name || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();
  const rawHandle = (username || "").trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_]/g, "");
  if (cleanName.length < 2 || cleanName.length > 60) {
    res.status(400).json({ error: "Please enter your name (2\u201360 characters)." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters long." });
    return;
  }
  if (rawHandle.length < 3 || rawHandle.length > 24) {
    res.status(400).json({ error: "Username must be 3\u201324 letters, numbers, or underscores." });
    return;
  }
  if (db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?)").get(cleanEmail)) {
    res.status(409).json({ error: "An account with this email already exists. Try signing in instead." });
    return;
  }
  const handle = `@${rawHandle}`;
  if (db.prepare("SELECT id FROM channels WHERE LOWER(handle) = LOWER(?)").get(handle)) {
    res.status(409).json({ error: "That username is already taken. Pick another handle." });
    return;
  }
  const safeAvatar = typeof avatarDataUrl === "string" && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(avatarDataUrl) && avatarDataUrl.length < 6e5 ? avatarDataUrl : "";
  const userId = `u_${randomUUID4().slice(0, 10)}`;
  const channelId = `ch_${randomUUID4().slice(0, 10)}`;
  const avatarUrl = safeAvatar || `/api/avatars/${channelId}.svg`;
  const finalRole = cleanEmail === ADMIN_EMAIL ? "admin" : "creator";
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const passwordHash = hashPassword(password);
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, avatar_url, birthday, role, preferred_language, email_verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'English', 1, ?)
  `).run(userId, cleanName, cleanEmail, passwordHash, avatarUrl, birthday.trim(), finalRole, nowIso);
  db.prepare(`
    INSERT INTO channels (id, user_id, name, handle, description, avatar_url, banner_color, verified, subscriber_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '#000000', 0, 0, ?)
  `).run(channelId, userId, cleanName, handle, `Official DopTube channel of ${cleanName}.`, avatarUrl, nowIso);
  const cleanInterests = Array.isArray(interests) ? interests.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : [];
  db.prepare(`
    INSERT INTO user_preferences (
      user_id, preferred_languages_json, preferred_categories_json, selected_interests_json,
      preferred_format, personalization_enabled, infinite_scroll_enabled, autoplay_enabled,
      onboarding_completed, updated_at
    ) VALUES (?, '["English","Hindi"]', ?, ?, 'all', 1, 1, 1, ?, ?)
  `).run(userId, JSON.stringify(cleanInterests), JSON.stringify(cleanInterests), cleanInterests.length >= 3 ? 1 : 0, nowIso);
  const upsertInterest = db.prepare(`
    INSERT OR REPLACE INTO user_interests (user_id, topic, score, source, updated_at)
    VALUES (?, ?, 78, 'onboarding', ?)
  `);
  for (const topic of cleanInterests) {
    upsertInterest.run(userId, topic, nowIso);
  }
  const token = createSignedUserSession(userId);
  setSessionCookie(res, token, req);
  logAudit(userId, "ACCOUNT_REGISTERED", "user", userId, { email: cleanEmail, handle });
  res.status(201).json({ user: getUserPayload(userId), token });
}));
app.post("/api/auth/login", rateLimit(25, 6e4), asyncRoute2((req, res) => {
  const { identifier, password } = req.body ?? {};
  const cleanId = (identifier || "").trim().toLowerCase();
  if (!cleanId || !password) {
    res.status(400).json({ error: "Email or username and password are required." });
    return;
  }
  let row = db.prepare("SELECT id, password_hash, email FROM users WHERE LOWER(email) = LOWER(?)").get(cleanId);
  if (!row) {
    const withAt = cleanId.startsWith("@") ? cleanId : `@${cleanId}`;
    row = db.prepare(`
        SELECT u.id, u.password_hash, u.email
        FROM channels c JOIN users u ON u.id = c.user_id
        WHERE LOWER(c.handle) = LOWER(?)
      `).get(withAt);
  }
  if (!row) {
    res.status(401).json({ error: "Account not found. Check your email or username." });
    return;
  }
  if (row.password_hash === "google_oauth") {
    res.status(400).json({ error: "This account uses Google Sign-In. Please click Continue with Google." });
    return;
  }
  if (!verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }
  const token = createSignedUserSession(row.id);
  setSessionCookie(res, token, req);
  logAudit(row.id, "PASSWORD_LOGIN", "user", row.id, { email: row.email });
  res.json({ user: getUserPayload(row.id), token });
}));
app.post("/api/auth/avatar", requireAuth, (req, res) => {
  const { avatarDataUrl } = req.body;
  if (!avatarDataUrl || !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(avatarDataUrl) || avatarDataUrl.length > 6e5) {
    res.status(400).json({ error: "Please select a valid image under 450 KB." });
    return;
  }
  const uid = req.auth.userId;
  db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarDataUrl, uid);
  db.prepare("UPDATE channels SET avatar_url = ? WHERE user_id = ?").run(avatarDataUrl, uid);
  res.json({ user: getUserPayload(uid) });
});
app.post("/api/auth/google", rateLimit(30, 6e4), asyncRoute2(async (req, res) => {
  const { idToken } = req.body;
  if (!idToken || typeof idToken !== "string") {
    res.status(400).json({ error: "Google ID token is required." });
    return;
  }
  let identity;
  try {
    identity = await verifyFirebaseGoogleToken(idToken);
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : "Google token verification failed." });
    return;
  }
  if (!identity) {
    res.status(401).json({ error: "Unable to verify verified Google account." });
    return;
  }
  const normalizedEmail = identity.email.trim().toLowerCase();
  const isBootstrapAdmin = normalizedEmail === ADMIN_EMAIL;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const existingUser = db.prepare("SELECT id, role, avatar_url, name FROM users WHERE firebase_uid = ? OR email = ?").get(identity.uid, normalizedEmail);
  let userId;
  let finalRole;
  if (existingUser) {
    userId = existingUser.id;
    finalRole = isBootstrapAdmin ? "admin" : existingUser.role;
    db.prepare(`
      UPDATE users
      SET firebase_uid = ?,
          name = ?,
          avatar_url = CASE WHEN ? != '' THEN ? ELSE avatar_url END,
          role = ?,
          email_verified = 1
      WHERE id = ?
    `).run(identity.uid, identity.name, identity.picture, identity.picture, finalRole, userId);
  } else {
    userId = `u_${randomUUID4().slice(0, 10)}`;
    finalRole = isBootstrapAdmin ? "admin" : "creator";
    const channelId = `ch_${randomUUID4().slice(0, 10)}`;
    const avatarUrl = identity.picture || `/api/avatars/${channelId}.svg`;
    db.prepare(`
      INSERT INTO users (id, firebase_uid, name, email, password_hash, avatar_url, birthday, role, preferred_language, email_verified, created_at)
      VALUES (?, ?, ?, ?, 'google_oauth', ?, '', ?, 'English', 1, ?)
    `).run(userId, identity.uid, identity.name, normalizedEmail, avatarUrl, finalRole, nowIso);
    const cleanBase = identity.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18) || "creator";
    let handle = `@${cleanBase}`;
    if (db.prepare("SELECT id FROM channels WHERE handle = ?").get(handle)) {
      handle = `@${cleanBase}${Math.floor(100 + Math.random() * 899)}`;
    }
    db.prepare(`
      INSERT INTO channels (id, user_id, name, handle, description, avatar_url, banner_color, verified, subscriber_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '#000000', 0, 0, ?)
    `).run(channelId, userId, identity.name, handle, `Official DopTube channel of ${identity.name}.`, avatarUrl, nowIso);
  }
  const hasChannel = db.prepare("SELECT id FROM channels WHERE user_id = ?").get(userId);
  if (!hasChannel) {
    const channelId = `ch_${randomUUID4().slice(0, 10)}`;
    const cleanBase = identity.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18) || "creator";
    const handle = `@${cleanBase}${Math.floor(100 + Math.random() * 899)}`;
    const avatarUrl = identity.picture || `/api/avatars/${channelId}.svg`;
    db.prepare(`
      INSERT INTO channels (id, user_id, name, handle, description, avatar_url, banner_color, verified, subscriber_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '#000000', 0, 0, ?)
    `).run(channelId, userId, identity.name, handle, `Official DopTube channel of ${identity.name}.`, avatarUrl, nowIso);
  }
  ensureUserPreferencesRow(userId, "English");
  const token = createSignedUserSession(userId);
  setSessionCookie(res, token, req);
  logAudit(userId, "GOOGLE_LOGIN", "user", userId, { email: normalizedEmail });
  res.json({ user: getUserPayload(userId), token });
}));
app.post("/api/auth/logout", (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
});
app.patch("/api/auth/profile", requireAuth, (req, res) => {
  const { name, preferredLanguage, restrictedMode, historyPaused } = req.body;
  const uid = req.auth.userId;
  if (name && name.trim().length >= 2) {
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), uid);
  }
  if (preferredLanguage && INDIAN_LANGUAGES.includes(preferredLanguage)) {
    db.prepare("UPDATE users SET preferred_language = ? WHERE id = ?").run(preferredLanguage, uid);
    ensureUserPreferencesRow(uid, preferredLanguage);
    db.prepare("UPDATE user_preferences SET preferred_languages_json = ?, updated_at = ? WHERE user_id = ?").run(
      JSON.stringify([preferredLanguage]),
      (/* @__PURE__ */ new Date()).toISOString(),
      uid
    );
  }
  if (typeof restrictedMode === "boolean") {
    db.prepare("UPDATE users SET restricted_mode = ? WHERE id = ?").run(restrictedMode ? 1 : 0, uid);
  }
  if (typeof historyPaused === "boolean") {
    db.prepare("UPDATE users SET history_paused = ? WHERE id = ?").run(historyPaused ? 1 : 0, uid);
  }
  res.json({ user: getUserPayload(uid) });
});
app.delete("/api/auth/account", requireAuth, (req, res) => {
  const uid = req.auth.userId;
  db.prepare("DELETE FROM users WHERE id = ?").run(uid);
  clearSessionCookie(res, req);
  res.json({ ok: true });
});
app.get("/api/meta", (_req, res) => {
  res.json({
    categories: VIDEO_CATEGORIES,
    languages: INDIAN_LANGUAGES
  });
});
app.get("/api/avatars/:file", (req, res) => {
  const channelId = req.params.file.replace(/\.svg$/, "");
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(getChannelAvatarSvg(channelId));
});
app.get("/api/thumbnails/card/:file", (req, res) => {
  const videoId = req.params.file.replace(/\.svg$/, "");
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(getVideoThumbnailSvg(videoId));
});
app.get("/api/thumbnails/:file", (req, res) => {
  const safeName = path5.basename(req.params.file);
  const full = path5.join(THUMB_DIR, safeName);
  if (!fs5.existsSync(full)) {
    res.status(404).end();
    return;
  }
  res.sendFile(full);
});
app.get("/api/hls/:videoId/:file", (req, res) => {
  const vid = path5.basename(req.params.videoId);
  const file = path5.basename(req.params.file);
  const target = path5.join(HLS_DIR, vid, file);
  if (!fs5.existsSync(target)) {
    res.status(404).end();
    return;
  }
  if (file.endsWith(".m3u8")) {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  } else if (file.endsWith(".ts")) {
    res.setHeader("Content-Type", "video/mp2t");
  }
  res.sendFile(target);
});
app.get("/api/stream/:id", (req, res) => {
  const videoId = path5.basename(req.params.id);
  const video = db.prepare("SELECT id, video_url, thumbnail_url, is_short FROM videos WHERE id = ?").get(videoId);
  if (!video) {
    res.status(404).json({ error: "Video stream not found." });
    return;
  }
  const baseDir = path5.resolve(UPLOAD_DIR);
  if (!fs5.existsSync(baseDir)) {
    res.status(404).json({ error: "Uploaded media storage unavailable." });
    return;
  }
  const uploadedMatch = fs5.readdirSync(baseDir).find((f) => f.startsWith(`${videoId}.`));
  if (!uploadedMatch) {
    res.status(404).json({ error: "Uploaded media file not found." });
    return;
  }
  const filePath = path5.resolve(baseDir, uploadedMatch);
  if (!filePath.startsWith(baseDir + path5.sep) || !fs5.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  const stat = fs5.statSync(filePath);
  const fileSize = stat.size;
  const ext = path5.extname(filePath).toLowerCase();
  const mimeType = ext === ".webm" ? "video/webm" : "video/mp4";
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || start >= fileSize) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }
    const clampedEnd = Math.min(end, fileSize - 1);
    const chunkSize = clampedEnd - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${clampedEnd}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mimeType
    });
    fs5.createReadStream(filePath, { start, end: clampedEnd }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes"
    });
    fs5.createReadStream(filePath).pipe(res);
  }
});
app.get("/api/videos", asyncRoute2(async (req, res) => {
  const { category = "All", language = "All", shorts, trending, sort, q, nativeOnly } = req.query;
  const ctx = buildUserAiContext(req.auth?.userId);
  const rows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count, c.user_id as owner_user_id
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    WHERE v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'native'
  `).all();
  let items = rows.map(hydrateVideoRow).filter((v) => validateContentCandidate(toCandidate(v), ctx.validation).valid);
  if (shorts === "1") {
    items = items.filter((v) => v.isShort);
  } else if (shorts === "0") {
    items = items.filter((v) => !v.isShort);
  }
  const filteredNative = filterAndSortVideos(items, {
    query: q,
    category,
    language,
    sort: trending === "1" ? "views" : sort
  });
  const rankedNative = !q && !sort && trending !== "1" ? rankVideos(filteredNative, buildSignalsForUser(req.auth?.userId)) : filteredNative;
  if (nativeOnly === "1") {
    res.json({ videos: rankedNative });
    return;
  }
  const externalItems = (q ? (await fetchExternalDiscoveryPaged(q, language)).items : await fetchExternalFeed({
    category,
    language,
    trending: trending === "1",
    shorts: shorts === "1"
  })).filter((v) => validateContentCandidate(toCandidate(v), ctx.validation).valid);
  const seen = new Set(rankedNative.map((v) => v.id));
  const freshExternal = externalItems.filter((v) => !seen.has(v.id));
  let combined;
  if (trending === "1") {
    combined = [...rankedNative, ...freshExternal].sort((a, b) => b.views - a.views);
  } else {
    combined = [];
    const maxLen = Math.max(rankedNative.length, freshExternal.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < freshExternal.length) combined.push(freshExternal[i]);
      if (i < rankedNative.length) combined.push(rankedNative[i]);
    }
  }
  res.json({ videos: combined });
}));
app.get("/api/videos/:id", asyncRoute2(async (req, res) => {
  const id = req.params.id;
  const row = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    WHERE v.id = ?
  `).get(id);
  let videoData = null;
  let extRelated = [];
  if (row) {
    if (row.source_type === "external") {
      const extFetched = await fetchExternalVideoById(id);
      if (extFetched) {
        videoData = extFetched.video;
        extRelated = extFetched.related;
      } else {
        videoData = hydrateVideoRow(row);
      }
    } else {
      db.prepare("UPDATE videos SET views = views + 1 WHERE id = ?").run(id);
      row.views += 1;
      videoData = hydrateVideoRow(row);
    }
  } else if (id.startsWith("ext_") || id.startsWith("dm_")) {
    const extFetched = await fetchExternalVideoById(id);
    if (extFetched) {
      videoData = extFetched.video;
      extRelated = extFetched.related;
    }
  }
  if (!videoData) {
    res.status(404).json({ error: "Video not found." });
    return;
  }
  const variants = videoData.sourceType === "native" ? db.prepare("SELECT quality, resolution, bitrate_kbps as bitrateKbps, playlist_path as playlistPath FROM video_variants WHERE video_id = ?").all(id) : [];
  let userReaction = null;
  let isSubscribed = false;
  let inWatchLater = false;
  let progressSec = 0;
  if (req.auth) {
    const uid = req.auth.userId;
    const reactRow = db.prepare("SELECT reaction FROM video_reactions WHERE user_id = ? AND video_id = ?").get(uid, id);
    userReaction = reactRow?.reaction ?? null;
    const subRow = db.prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?").get(uid, videoData.channelId);
    isSubscribed = Boolean(subRow);
    const wlRow = db.prepare("SELECT 1 FROM watch_later WHERE user_id = ? AND video_id = ?").get(uid, id);
    inWatchLater = Boolean(wlRow);
    const histRow = db.prepare("SELECT progress_sec FROM watch_history WHERE user_id = ? AND video_id = ?").get(uid, id);
    progressSec = histRow?.progress_sec ?? 0;
    const userPref = db.prepare("SELECT history_paused FROM users WHERE id = ?").get(uid);
    if (userPref && userPref.history_paused === 0) {
      const ok = await ensureExternalVideoRecord(id, videoData.sourceType === "external" ? videoData : void 0);
      if (ok) {
        db.prepare(`
          INSERT INTO watch_history (user_id, video_id, progress_sec, watched_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, video_id) DO UPDATE SET watched_at = excluded.watched_at
        `).run(uid, id, progressSec, (/* @__PURE__ */ new Date()).toISOString());
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
  `).all(id, videoData.category);
  const combinedRelated = [...extRelated, ...relatedRows.map(hydrateVideoRow)].slice(0, 14);
  res.json({
    video: {
      ...videoData,
      variants,
      userReaction,
      isSubscribed,
      inWatchLater,
      progressSec
    },
    related: combinedRelated
  });
}));
async function runFfmpegProcessingPipeline(videoId, uploadedVideoPath, hasCustomThumb) {
  const updateJob = (stage, progress, status = "processing", errorMsg = null) => {
    db.prepare(`
      UPDATE processing_jobs SET stage = ?, progress = ?, status = ?, error_message = ?, updated_at = ?
      WHERE video_id = ?
    `).run(stage, progress, status, errorMsg, (/* @__PURE__ */ new Date()).toISOString(), videoId);
  };
  try {
    updateJob("Inspecting media stream (FFprobe)", 20);
    const probe = await probeMediaFile(uploadedVideoPath);
    db.prepare("UPDATE videos SET duration_sec = ? WHERE id = ?").run(probe.durationSec, videoId);
    if (!hasCustomThumb) {
      updateJob("Generating video thumbnail", 45);
      const extracted = await extractThumbnail(uploadedVideoPath, videoId);
      if (extracted) {
        db.prepare("UPDATE videos SET thumbnail_url = ? WHERE id = ?").run(extracted, videoId);
      }
    }
    updateJob("Transcoding adaptive HLS streams (360p & 720p)", 70);
    const hls = await transcodeToHls(uploadedVideoPath, videoId);
    if (hls.hlsUrl) {
      db.prepare("UPDATE videos SET hls_url = ? WHERE id = ?").run(hls.hlsUrl, videoId);
      const insertVar = db.prepare(`
        INSERT INTO video_variants (id, video_id, quality, resolution, bitrate_kbps, playlist_path)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const variant of hls.variants) {
        insertVar.run(`var_${randomUUID4().slice(0, 8)}`, videoId, variant.quality, variant.resolution, variant.bitrateKbps, variant.playlistPath);
      }
    }
    db.prepare(`UPDATE videos SET status = 'published' WHERE id = ?`).run(videoId);
    updateJob("Published and ready for streaming", 100, "completed");
  } catch (err) {
    db.prepare(`UPDATE videos SET status = 'published' WHERE id = ?`).run(videoId);
    updateJob("Published (direct playback)", 100, "completed", err instanceof Error ? err.message : null);
  }
}
app.post(
  "/api/videos/upload",
  requireAuth,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 }
  ]),
  (req, res) => {
    const files = req.files;
    const videoFile = files?.video?.[0];
    const thumbFile = files?.thumbnail?.[0];
    if (!videoFile) {
      res.status(400).json({ error: "Please select an MP4, WebM, or MOV video file to upload." });
      return;
    }
    const { title, description = "", category, language, tags = "", visibility = "public", isShort = "false" } = req.body;
    const validationError = validateVideoInput({ title, category, language, visibility });
    if (validationError) {
      fs5.unlink(videoFile.path, () => {
      });
      if (thumbFile) fs5.unlink(thumbFile.path, () => {
      });
      res.status(400).json({ error: validationError });
      return;
    }
    const channel = db.prepare("SELECT id FROM channels WHERE user_id = ?").get(req.auth.userId);
    if (!channel) {
      res.status(400).json({ error: "Creator channel not found." });
      return;
    }
    const videoId = `vid_${randomUUID4().slice(0, 10)}`;
    const ext = path5.extname(videoFile.filename) || ".mp4";
    const canonicalVideoPath = path5.join(UPLOAD_DIR, `${videoId}${ext}`);
    fs5.renameSync(videoFile.path, canonicalVideoPath);
    let thumbUrl = `/api/thumbnails/card/${videoId}.svg`;
    if (thumbFile) {
      thumbUrl = `/api/thumbnails/${path5.basename(thumbFile.path)}`;
    }
    const tagArray = tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 12);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
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
      isShort === "true" || isShort === "1" ? 1 : 0,
      nowIso
    );
    db.prepare(`
      INSERT INTO processing_jobs (id, video_id, stage, progress, status, updated_at)
      VALUES (?, ?, 'Queued for FFmpeg processing', 5, 'queued', ?)
    `).run(`job_${randomUUID4().slice(0, 8)}`, videoId, nowIso);
    logAudit(req.auth.userId, "VIDEO_UPLOAD", "video", videoId, { title: title.trim() });
    void runFfmpegProcessingPipeline(videoId, canonicalVideoPath, Boolean(thumbFile));
    res.status(201).json({ videoId, status: "processing" });
  }
);
app.get("/api/videos/:id/status", (req, res) => {
  const job = db.prepare(`
    SELECT j.*, v.status as video_status, v.hls_url, v.thumbnail_url, v.duration_sec
    FROM processing_jobs j
    JOIN videos v ON v.id = j.video_id
    WHERE j.video_id = ?
  `).get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Processing job not found." });
    return;
  }
  res.json(job);
});
app.patch("/api/videos/:id", requireAuth, (req, res) => {
  const videoId = req.params.id;
  const owner = db.prepare(`
    SELECT v.id, c.user_id FROM videos v JOIN channels c ON c.id = v.channel_id WHERE v.id = ?
  `).get(videoId);
  if (!owner) {
    res.status(404).json({ error: "Video not found." });
    return;
  }
  if (owner.user_id !== req.auth.userId && req.auth.role !== "admin") {
    res.status(403).json({ error: "You do not have permission to edit this video." });
    return;
  }
  const { title, description, category, language, visibility, tags } = req.body;
  const err = validateVideoInput({ title, category, language, visibility });
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  db.prepare(`
    UPDATE videos SET title = ?, description = ?, category = ?, language = ?, visibility = ?, tags_json = ?
    WHERE id = ?
  `).run(title.trim(), (description ?? "").trim(), category, language, visibility ?? "public", JSON.stringify(tags ?? []), videoId);
  logAudit(req.auth.userId, "VIDEO_UPDATE", "video", videoId);
  res.json({ ok: true });
});
app.delete("/api/videos/:id", requireAuth, (req, res) => {
  const videoId = req.params.id;
  const owner = db.prepare(`
    SELECT v.id, c.user_id FROM videos v JOIN channels c ON c.id = v.channel_id WHERE v.id = ?
  `).get(videoId);
  if (!owner) {
    res.status(404).json({ error: "Video not found." });
    return;
  }
  if (owner.user_id !== req.auth.userId && req.auth.role !== "admin") {
    res.status(403).json({ error: "Permission denied." });
    return;
  }
  db.prepare("DELETE FROM videos WHERE id = ?").run(videoId);
  logAudit(req.auth.userId, "VIDEO_DELETE", "video", videoId);
  res.json({ ok: true });
});
app.get("/api/search", asyncRoute2(async (req, res) => {
  const {
    q = "",
    category = "All",
    language = "All",
    sort = "relevance",
    duration = "all",
    uploadDate = "any",
    pageToken = ""
  } = req.query;
  const cleanToken = (pageToken || "").trim();
  const validUploadDate = ["any", "today", "week", "month"].includes(uploadDate) ? uploadDate : "any";
  let nativeMatches = [];
  let channelMatches = [];
  if (!cleanToken) {
    const rows = db.prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
             c.verified as channel_verified, c.subscriber_count
      FROM videos v
      JOIN channels c ON c.id = v.channel_id
      WHERE v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'native'
    `).all();
    const hydrated = rows.map(hydrateVideoRow);
    nativeMatches = filterAndSortVideos(hydrated, {
      query: q,
      category,
      language,
      sort,
      duration,
      uploadDate: validUploadDate
    });
    channelMatches = q.trim() ? db.prepare(`
          SELECT id, name, handle, description, avatar_url as avatarUrl, verified, subscriber_count as subscriberCount
          FROM channels
          WHERE LOWER(name) LIKE ? OR LOWER(handle) LIKE ?
          LIMIT 5
        `).all(`%${q.trim().toLowerCase()}%`, `%${q.trim().toLowerCase()}%`) : [];
  }
  const extPaged = q.trim() ? await fetchExternalDiscoveryPaged(q, language, cleanToken) : await fetchExternalFeedPaged({ category, language, pageToken: cleanToken });
  const externalMatches = filterAndSortVideos(extPaged.items, {
    duration,
    uploadDate: validUploadDate,
    sort
  });
  const combined = [...nativeMatches, ...externalMatches];
  if (!cleanToken && req.auth && q.trim().length >= 2) {
    const uid = req.auth.userId;
    const userPref = db.prepare("SELECT history_paused FROM users WHERE id = ?").get(uid);
    if (userPref && userPref.history_paused === 0) {
      const topThumb = combined[0]?.thumbnailUrl ?? "";
      db.prepare("DELETE FROM search_history WHERE user_id = ? AND LOWER(query) = LOWER(?)").run(uid, q.trim());
      db.prepare("INSERT INTO search_history (id, user_id, query, preview_thumb, searched_at) VALUES (?, ?, ?, ?, ?)").run(
        `sh_${randomUUID4().slice(0, 8)}`,
        uid,
        q.trim(),
        topThumb,
        (/* @__PURE__ */ new Date()).toISOString()
      );
    }
  }
  res.json({
    videos: combined,
    channels: channelMatches,
    nextPageToken: extPaged.nextPageToken,
    hasMore: Boolean(extPaged.nextPageToken),
    discoveryStatus: getDiscoveryStatus()
  });
}));
app.get("/api/search/suggestions", (req, res) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const historyRows = req.auth ? db.prepare(`
        SELECT id, query, preview_thumb as previewThumb, searched_at as searchedAt
        FROM search_history
        WHERE user_id = ? AND (? = '' OR LOWER(query) LIKE ?)
        ORDER BY searched_at DESC
        LIMIT 6
      `).all(req.auth.userId, q, `%${q}%`) : [];
  const videoSuggestions = q ? db.prepare(`
        SELECT title, thumbnail_url as previewThumb
        FROM videos
        WHERE visibility = 'public' AND status = 'published' AND (LOWER(title) LIKE ? OR LOWER(tags_json) LIKE ?)
        ORDER BY views DESC
        LIMIT 6
      `).all(`%${q}%`, `%${q}%`) : db.prepare(`
        SELECT title, thumbnail_url as previewThumb
        FROM videos
        WHERE visibility = 'public' AND status = 'published'
        ORDER BY views DESC
        LIMIT 5
      `).all();
  res.json({
    history: historyRows,
    suggestions: videoSuggestions.map((v) => ({ query: v.title, previewThumb: v.previewThumb }))
  });
});
app.get("/api/search/history", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id, query, preview_thumb as previewThumb, searched_at as searchedAt FROM search_history WHERE user_id = ? ORDER BY searched_at DESC").all(req.auth.userId);
  res.json({ history: rows });
});
app.delete("/api/search/history", requireAuth, (req, res) => {
  db.prepare("DELETE FROM search_history WHERE user_id = ?").run(req.auth.userId);
  res.json({ ok: true });
});
app.delete("/api/search/history/:id", requireAuth, (req, res) => {
  db.prepare("DELETE FROM search_history WHERE id = ? AND user_id = ?").run(req.params.id, req.auth.userId);
  res.json({ ok: true });
});
app.post("/api/videos/:id/react", requireAuth, rateLimit(60, 6e4), asyncRoute2(async (req, res) => {
  const videoId = req.params.id;
  const uid = req.auth.userId;
  const { reaction } = req.body;
  if (!reaction || !["like", "dislike", "none"].includes(reaction)) {
    res.status(400).json({ error: "Invalid reaction." });
    return;
  }
  await ensureExternalVideoRecord(videoId);
  const existing = db.prepare("SELECT reaction FROM video_reactions WHERE user_id = ? AND video_id = ?").get(uid, videoId);
  if (existing?.reaction === "like") db.prepare("UPDATE videos SET likes = MAX(0, likes - 1) WHERE id = ?").run(videoId);
  if (existing?.reaction === "dislike") db.prepare("UPDATE videos SET dislikes = MAX(0, dislikes - 1) WHERE id = ?").run(videoId);
  if (reaction === "none" || existing?.reaction === reaction) {
    db.prepare("DELETE FROM video_reactions WHERE user_id = ? AND video_id = ?").run(uid, videoId);
    const updated2 = db.prepare("SELECT likes, dislikes FROM videos WHERE id = ?").get(videoId);
    res.json({ userReaction: null, ...updated2 });
    return;
  }
  db.prepare(`
    INSERT INTO video_reactions (user_id, video_id, reaction, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, video_id) DO UPDATE SET reaction = excluded.reaction, created_at = excluded.created_at
  `).run(uid, videoId, reaction, (/* @__PURE__ */ new Date()).toISOString());
  if (reaction === "like") db.prepare("UPDATE videos SET likes = likes + 1 WHERE id = ?").run(videoId);
  if (reaction === "dislike") db.prepare("UPDATE videos SET dislikes = dislikes + 1 WHERE id = ?").run(videoId);
  const updated = db.prepare("SELECT likes, dislikes FROM videos WHERE id = ?").get(videoId);
  res.json({ userReaction: reaction, ...updated });
}));
app.get("/api/videos/:id/comments", (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.video_id as videoId, c.user_id as userId, c.body, c.likes, c.created_at as createdAt,
           u.name as authorName, u.avatar_url as authorAvatar, ch.handle as authorHandle
    FROM comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN channels ch ON ch.user_id = u.id
    WHERE c.video_id = ?
    ORDER BY c.created_at DESC
  `).all(req.params.id);
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
    replies: replyStmt.all(c.id)
  }));
  res.json({ comments });
});
app.post("/api/videos/:id/comments", requireAuth, rateLimit(20, 6e4), asyncRoute2(async (req, res) => {
  const { body } = req.body;
  const err = validateCommentInput(body);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  await ensureExternalVideoRecord(req.params.id);
  const commentId = `cmt_${randomUUID4().slice(0, 10)}`;
  db.prepare("INSERT INTO comments (id, video_id, user_id, body, likes, created_at) VALUES (?, ?, ?, ?, 0, ?)").run(
    commentId,
    req.params.id,
    req.auth.userId,
    body.trim(),
    (/* @__PURE__ */ new Date()).toISOString()
  );
  res.status(201).json({ id: commentId });
}));
app.post("/api/comments/:id/reply", requireAuth, rateLimit(20, 6e4), (req, res) => {
  const { body } = req.body;
  const err = validateCommentInput(body);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const replyId = `rep_${randomUUID4().slice(0, 10)}`;
  db.prepare("INSERT INTO comment_replies (id, comment_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)").run(
    replyId,
    req.params.id,
    req.auth.userId,
    body.trim(),
    (/* @__PURE__ */ new Date()).toISOString()
  );
  res.status(201).json({ id: replyId });
});
app.get("/api/channels/:id", asyncRoute2(async (req, res) => {
  const requestedId = req.params.id;
  const pageToken = String(req.query.pageToken || "").trim();
  if (requestedId.startsWith("ext_ch_") || requestedId.startsWith("dm_ch_")) {
    const extCh = await fetchExternalChannelById(requestedId, pageToken);
    if (!extCh) {
      res.status(404).json({ error: "Channel not found." });
      return;
    }
    const isSubscribed2 = req.auth ? Boolean(db.prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?").get(req.auth.userId, extCh.channel.id)) : false;
    res.json({
      channel: { ...extCh.channel, isSubscribed: isSubscribed2 },
      videos: extCh.videos,
      nextPageToken: extCh.nextPageToken,
      hasMore: extCh.hasMore,
      totalResults: extCh.totalResults
    });
    return;
  }
  const channel = db.prepare(`
    SELECT id, user_id as userId, name, handle, description, avatar_url as avatarUrl, banner_color as bannerColor,
           verified, subscriber_count as subscriberCount, created_at as createdAt
    FROM channels WHERE id = ? OR handle = ?
  `).get(requestedId, requestedId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found." });
    return;
  }
  const isSubscribed = req.auth ? Boolean(db.prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?").get(req.auth.userId, String(channel.id))) : false;
  const videoRows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v JOIN channels c ON c.id = v.channel_id
    WHERE v.channel_id = ? AND v.visibility = 'public' AND v.status = 'published' AND v.source_type = 'native'
    ORDER BY v.created_at DESC
  `).all(String(channel.id));
  const videos = videoRows.map(hydrateVideoRow);
  res.json({
    channel: { ...channel, isSubscribed },
    videos,
    nextPageToken: null,
    hasMore: false,
    totalResults: videos.length
  });
}));
app.patch("/api/channels/me", requireAuth, (req, res) => {
  const { name, description, bannerColor } = req.body;
  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: "Channel name must be at least 2 characters." });
    return;
  }
  db.prepare("UPDATE channels SET name = ?, description = ?, banner_color = ? WHERE user_id = ?").run(
    name.trim(),
    (description ?? "").trim(),
    bannerColor || "#1f1f23",
    req.auth.userId
  );
  res.json({ user: getUserPayload(req.auth.userId) });
});
app.post("/api/channels/:id/subscribe", requireAuth, asyncRoute2(async (req, res) => {
  const uid = req.auth.userId;
  const channelId = req.params.id;
  if (channelId.startsWith("ext_ch_") || channelId.startsWith("dm_ch_")) {
    const extCh = await fetchExternalChannelById(channelId);
    if (extCh) ensureExternalChannelStub(extCh.channel);
  }
  const ch = db.prepare("SELECT id, subscriber_count FROM channels WHERE id = ?").get(channelId);
  if (!ch) {
    res.status(404).json({ error: "Channel not found." });
    return;
  }
  const existing = db.prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?").get(uid, channelId);
  if (existing) {
    db.prepare("DELETE FROM subscriptions WHERE user_id = ? AND channel_id = ?").run(uid, channelId);
    db.prepare("UPDATE channels SET subscriber_count = MAX(0, subscriber_count - 1) WHERE id = ?").run(channelId);
    res.json({ subscribed: false, subscriberCount: Math.max(0, ch.subscriber_count - 1) });
  } else {
    db.prepare("INSERT INTO subscriptions (user_id, channel_id, notify_all, created_at) VALUES (?, ?, 1, ?)").run(
      uid,
      channelId,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    db.prepare("UPDATE channels SET subscriber_count = subscriber_count + 1 WHERE id = ?").run(channelId);
    res.json({ subscribed: true, subscriberCount: ch.subscriber_count + 1 });
  }
}));
app.get("/api/subscriptions", (req, res) => {
  if (!req.auth) {
    res.json({ channels: [], videos: [] });
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
  `).all(req.auth.userId);
  res.json({ channels, videos: videos.map(hydrateVideoRow) });
});
app.get("/api/history", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count, wh.progress_sec, wh.watched_at
    FROM watch_history wh
    JOIN videos v ON v.id = wh.video_id
    JOIN channels c ON c.id = v.channel_id
    WHERE wh.user_id = ?
    ORDER BY wh.watched_at DESC
  `).all(req.auth.userId);
  res.json({
    videos: rows.map((r) => ({
      ...hydrateVideoRow(r),
      progressSec: r.progress_sec,
      watchedAt: r.watched_at
    }))
  });
});
app.post("/api/history", requireAuth, (req, res) => {
  const { videoId, progressSec = 0 } = req.body;
  if (!videoId) {
    res.status(400).json({ error: "videoId required" });
    return;
  }
  const userPref = db.prepare("SELECT history_paused FROM users WHERE id = ?").get(req.auth.userId);
  if (userPref?.history_paused === 1) {
    res.json({ paused: true });
    return;
  }
  db.prepare(`
    INSERT INTO watch_history (user_id, video_id, progress_sec, watched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, video_id) DO UPDATE SET progress_sec = excluded.progress_sec, watched_at = excluded.watched_at
  `).run(req.auth.userId, videoId, Math.max(0, Math.round(progressSec)), (/* @__PURE__ */ new Date()).toISOString());
  res.json({ ok: true });
});
app.delete("/api/history", requireAuth, (req, res) => {
  db.prepare("DELETE FROM watch_history WHERE user_id = ?").run(req.auth.userId);
  res.json({ ok: true });
});
app.delete("/api/history/:videoId", requireAuth, (req, res) => {
  db.prepare("DELETE FROM watch_history WHERE user_id = ? AND video_id = ?").run(req.auth.userId, req.params.videoId);
  res.json({ ok: true });
});
app.get("/api/watch-later", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM watch_later wl
    JOIN videos v ON v.id = wl.video_id
    JOIN channels c ON c.id = v.channel_id
    WHERE wl.user_id = ?
    ORDER BY wl.added_at DESC
  `).all(req.auth.userId);
  res.json({ videos: rows.map(hydrateVideoRow) });
});
app.post("/api/watch-later/:videoId", requireAuth, asyncRoute2(async (req, res) => {
  const uid = req.auth.userId;
  const vid = req.params.videoId;
  await ensureExternalVideoRecord(vid);
  const exists = db.prepare("SELECT 1 FROM watch_later WHERE user_id = ? AND video_id = ?").get(uid, vid);
  if (exists) {
    db.prepare("DELETE FROM watch_later WHERE user_id = ? AND video_id = ?").run(uid, vid);
    res.json({ saved: false });
  } else {
    db.prepare("INSERT INTO watch_later (user_id, video_id, added_at) VALUES (?, ?, ?)").run(uid, vid, (/* @__PURE__ */ new Date()).toISOString());
    res.json({ saved: true });
  }
}));
app.get("/api/liked-videos", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM video_reactions vr
    JOIN videos v ON v.id = vr.video_id
    JOIN channels c ON c.id = v.channel_id
    WHERE vr.user_id = ? AND vr.reaction = 'like'
    ORDER BY vr.created_at DESC
  `).all(req.auth.userId);
  res.json({ videos: rows.map(hydrateVideoRow) });
});
app.get("/api/playlists", requireAuth, (req, res) => {
  const playlists = db.prepare(`
    SELECT id, title, description, visibility, created_at as createdAt
    FROM playlists WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.auth.userId);
  const vidStmt = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM playlist_videos pv
    JOIN videos v ON v.id = pv.video_id
    JOIN channels c ON c.id = v.channel_id
    WHERE pv.playlist_id = ?
    ORDER BY pv.position ASC, pv.added_at ASC
  `);
  res.json({
    playlists: playlists.map((p) => ({
      ...p,
      videos: vidStmt.all(p.id).map(hydrateVideoRow)
    }))
  });
});
app.post("/api/playlists", requireAuth, (req, res) => {
  const { title, description = "", visibility = "private" } = req.body;
  if (!title || title.trim().length < 2) {
    res.status(400).json({ error: "Playlist title must be at least 2 characters." });
    return;
  }
  const id = `pl_${randomUUID4().slice(0, 8)}`;
  db.prepare("INSERT INTO playlists (id, user_id, title, description, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    req.auth.userId,
    title.trim(),
    description.trim(),
    visibility,
    (/* @__PURE__ */ new Date()).toISOString()
  );
  res.status(201).json({ id, title: title.trim() });
});
app.post("/api/playlists/:id/videos", requireAuth, asyncRoute2(async (req, res) => {
  const { videoId } = req.body;
  if (!videoId) {
    res.status(400).json({ error: "videoId required." });
    return;
  }
  const own = db.prepare("SELECT id FROM playlists WHERE id = ? AND user_id = ?").get(req.params.id, req.auth.userId);
  if (!own) {
    res.status(404).json({ error: "Playlist not found." });
    return;
  }
  await ensureExternalVideoRecord(videoId);
  const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) as m FROM playlist_videos WHERE playlist_id = ?").get(req.params.id).m;
  db.prepare("INSERT OR IGNORE INTO playlist_videos (playlist_id, video_id, position, added_at) VALUES (?, ?, ?, ?)").run(
    req.params.id,
    videoId,
    maxPos + 1,
    (/* @__PURE__ */ new Date()).toISOString()
  );
  res.json({ ok: true });
}));
app.delete("/api/playlists/:id/videos/:videoId", requireAuth, (req, res) => {
  const own = db.prepare("SELECT id FROM playlists WHERE id = ? AND user_id = ?").get(req.params.id, req.auth.userId);
  if (!own) {
    res.status(404).json({ error: "Playlist not found." });
    return;
  }
  db.prepare("DELETE FROM playlist_videos WHERE playlist_id = ? AND video_id = ?").run(req.params.id, req.params.videoId);
  res.json({ ok: true });
});
app.get("/api/notifications", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, title, message, target_video_id as targetVideoId, thumbnail_url as thumbnailUrl, is_read as isRead, created_at as createdAt
    FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.auth.userId);
  res.json({ notifications: rows });
});
app.post("/api/notifications/read", requireAuth, (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.auth.userId);
  res.json({ ok: true });
});
app.post("/api/recommendations/reset", requireAuth, (req, res) => {
  const uid = req.auth.userId;
  db.prepare("DELETE FROM watch_history WHERE user_id = ?").run(uid);
  db.prepare("DELETE FROM search_history WHERE user_id = ?").run(uid);
  db.prepare("DELETE FROM user_interests WHERE user_id = ?").run(uid);
  db.prepare("DELETE FROM user_events WHERE user_id = ?").run(uid);
  db.prepare("DELETE FROM user_feedback WHERE user_id = ?").run(uid);
  res.json({ ok: true });
});
app.post("/api/reports", (req, res) => {
  const { targetType = "video", targetId, reason, details = "" } = req.body;
  if (!targetId || !reason || reason.trim().length < 3) {
    res.status(400).json({ error: "Please select a reason for this report." });
    return;
  }
  const id = `rep_${randomUUID4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO reports (id, reporter_user_id, target_type, target_id, reason, details, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(id, req.auth?.userId ?? null, targetType, targetId, reason.trim(), details.trim(), (/* @__PURE__ */ new Date()).toISOString());
  res.status(201).json({ id });
});
app.post("/api/copyright", (req, res) => {
  const { videoId, claimantName, claimantEmail, reason } = req.body;
  if (!videoId) {
    res.status(400).json({ error: "Video ID is required." });
    return;
  }
  const err = validateCopyrightClaim({ claimantName, claimantEmail, reason });
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const id = `copy_${randomUUID4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO copyright_claims (id, video_id, reporter_user_id, claimant_name, claimant_email, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, videoId, req.auth?.userId ?? null, claimantName.trim(), claimantEmail.trim(), reason.trim(), (/* @__PURE__ */ new Date()).toISOString());
  logAudit(req.auth?.userId ?? null, "COPYRIGHT_CLAIM_SUBMITTED", "video", videoId, { claimantName });
  res.status(201).json({ id });
});
app.get("/api/studio/overview", requireAuth, (req, res) => {
  const channel = db.prepare(`
    SELECT id, name, handle, description, avatar_url as avatarUrl, banner_color as bannerColor, subscriber_count as subscriberCount, verified
    FROM channels WHERE user_id = ?
  `).get(req.auth.userId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found." });
    return;
  }
  const videos = db.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar,
           c.verified as channel_verified, c.subscriber_count
    FROM videos v JOIN channels c ON c.id = v.channel_id
    WHERE v.channel_id = ?
    ORDER BY v.created_at DESC
  `).all(channel.id).map(hydrateVideoRow);
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
  const estWatchHours = Math.round(videos.reduce((acc, v) => acc + v.views * Math.max(30, v.durationSec * 0.45) / 3600, 0));
  const eventDates = db.prepare(`
    SELECT ue.created_at as createdAt
    FROM user_events ue
    JOIN videos v ON v.id = ue.video_id
    WHERE v.channel_id = ? AND ue.event_type IN ('start', 'click', 'completion')
    ORDER BY ue.created_at DESC
    LIMIT 1000
  `).all(channel.id);
  const historyDates = db.prepare(`
    SELECT wh.watched_at as watchedAt
    FROM watch_history wh
    JOIN videos v ON v.id = wh.video_id
    WHERE v.channel_id = ?
    ORDER BY wh.watched_at DESC
    LIMIT 1000
  `).all(channel.id);
  const viewsLast30Days = computeViewsLast30Days({
    events: eventDates,
    history: historyDates,
    videos: videos.map((v) => ({ createdAt: v.createdAt, views: v.views }))
  });
  res.json({
    channel,
    stats: {
      totalViews,
      totalLikes,
      subscribers: channel.subscriberCount,
      videoCount: videos.length,
      estWatchHours
    },
    viewsLast30Days,
    videos,
    jobs,
    comments
  });
});
app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  const users = db.prepare("SELECT id, name, email, role, preferred_language as preferredLanguage, created_at as createdAt FROM users ORDER BY created_at DESC").all();
  const totalVideos = db.prepare("SELECT COUNT(*) as c FROM videos").get().c;
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
  const auditLogs = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 30").all();
  res.json({
    metrics: {
      totalUsers: users.length,
      totalVideos,
      openReports: reports.filter((r) => r.status === "open").length,
      pendingClaims: copyrightClaims.filter((c) => c.status === "pending").length
    },
    users,
    reports,
    copyrightClaims,
    jobs,
    auditLogs
  });
});
app.patch("/api/admin/reports/:id", requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!status || !["open", "resolved", "dismissed"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  db.prepare("UPDATE reports SET status = ? WHERE id = ?").run(status, req.params.id);
  logAudit(req.auth.userId, "REPORT_MODERATION", "report", req.params.id, { status });
  res.json({ ok: true });
});
app.patch("/api/admin/copyright/:id", requireAdmin, (req, res) => {
  const { status, takedown } = req.body;
  if (!status) {
    res.status(400).json({ error: "Status required" });
    return;
  }
  db.prepare("UPDATE copyright_claims SET status = ? WHERE id = ?").run(status, req.params.id);
  if (takedown) {
    const claim = db.prepare("SELECT video_id FROM copyright_claims WHERE id = ?").get(req.params.id);
    if (claim) {
      db.prepare(`UPDATE videos SET visibility = 'private', status = 'taken_down' WHERE id = ?`).run(claim.video_id);
    }
  }
  logAudit(req.auth.userId, "COPYRIGHT_DECISION", "copyright_claim", req.params.id, { status, takedown });
  res.json({ ok: true });
});
app.patch("/api/admin/users/:id/role", requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!role || !["user", "creator", "admin"].includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);
  logAudit(req.auth.userId, "USER_ROLE_CHANGE", "user", req.params.id, { role });
  res.json({ ok: true });
});
registerAiAndLibraryRoutes(app, ensureExternalVideoRecord);
registerMusicRoutes(app);
app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const url = req.originalUrl || req.url || req.path || "";
  if (req.path.startsWith("/api") || url.startsWith("/api")) {
    const msg = err instanceof Error ? err.message : "Unexpected server error";
    console.error("API Error:", msg);
    res.status(500).json({ error: msg });
    return;
  }
  next(err);
});
export {
  app,
  ensureExternalVideoRecord,
  ensureServerReady
};
