import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import multer from 'multer';
import { requireAuth, type AuthedRequest } from './auth.ts';
import { db } from './db.ts';
import { THUMB_DIR, UPLOAD_DIR } from './media.ts';

const audioStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    cb(null, file.fieldname === 'cover' ? THUMB_DIR : UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || (file.fieldname === 'cover' ? '.jpg' : '.mp3');
    cb(null, `aud_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'audio') {
      const ok = /\.(mp3|m4a|wav|ogg|webm|aac)$/i.test(file.originalname) || file.mimetype.startsWith('audio/');
      cb(null, ok);
      return;
    }
    if (file.fieldname === 'cover') {
      const ok = /\.(jpg|jpeg|png|webp)$/i.test(file.originalname) || file.mimetype.startsWith('image/');
      cb(null, ok);
      return;
    }
    cb(null, false);
  },
});

export interface HydratedMusicTrack {
  id: string;
  videoId: string | null;
  channelId: string;
  title: string;
  artistName: string;
  albumName: string;
  audioUrl: string;
  coverUrl: string;
  durationSec: number;
  language: string;
  genre: string;
  likes: number;
  plays: number;
  isLiked?: boolean;
  createdAt: string;
}

function getMusicCatalog(userId?: string): HydratedMusicTrack[] {
  const likedSet = new Set<string>();
  if (userId) {
    const likes = db.prepare('SELECT track_id FROM music_likes WHERE user_id = ?').all(userId) as Array<{ track_id: string }>;
    for (const l of likes) likedSet.add(l.track_id);
  }

  const trackRows = db
    .prepare(`
      SELECT id, video_id, channel_id, title, artist_name, album_name, audio_url, cover_url,
             duration_sec, language, genre, likes, plays, created_at
      FROM music_tracks
      WHERE visibility = 'public' AND status = 'published'
      ORDER BY plays DESC, created_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const tracks: HydratedMusicTrack[] = trackRows.map((r) => ({
    id: String(r.id),
    videoId: r.video_id ? String(r.video_id) : null,
    channelId: String(r.channel_id),
    title: String(r.title),
    artistName: String(r.artist_name),
    albumName: String(r.album_name || 'Single'),
    audioUrl: String(r.audio_url),
    coverUrl: String(r.cover_url),
    durationSec: Number(r.duration_sec || 0),
    language: String(r.language || 'Hindi'),
    genre: String(r.genre || 'Music'),
    likes: Number(r.likes || 0),
    plays: Number(r.plays || 0),
    isLiked: likedSet.has(String(r.id)),
    createdAt: String(r.created_at),
  }));

  // Include authorized native Music-category videos uploaded directly to DopTube
  const existingVideoIds = new Set(tracks.map((t) => t.videoId).filter(Boolean));
  const nativeMusicVideos = db
    .prepare(`
      SELECT v.id, v.channel_id, v.title, c.name as artist_name, v.thumbnail_url, v.video_url,
             v.duration_sec, v.language, v.likes, v.views, v.created_at
      FROM videos v
      JOIN channels c ON c.id = v.channel_id
      WHERE v.source_type = 'native' AND v.visibility = 'public' AND v.status = 'published' AND v.category = 'Music'
      ORDER BY v.views DESC, v.created_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

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
      albumName: 'DopTube Native Audio',
      audioUrl: String(v.video_url),
      coverUrl: String(v.thumbnail_url),
      durationSec: Number(v.duration_sec || 0),
      language: String(v.language || 'Hindi'),
      genre: 'Music',
      likes: Number(v.likes || 0),
      plays: Number(v.views || 0),
      isLiked: likedSet.has(syntheticId),
      createdAt: String(v.created_at),
    });
  }

  return tracks;
}

export function registerMusicRoutes(app: Express) {
  app.get('/api/music/home', (req: AuthedRequest, res) => {
    const tracks = getMusicCatalog(req.auth?.userId);
    const languageFilter = String(req.query.language || 'All');
    const filtered =
      languageFilter !== 'All'
        ? tracks.filter((t) => t.language.toLowerCase() === languageFilter.toLowerCase())
        : tracks;

    const byLang = new Map<string, HydratedMusicTrack[]>();
    for (const t of tracks) {
      const list = byLang.get(t.language) ?? [];
      list.push(t);
      byLang.set(t.language, list);
    }

    const mixes = Array.from(byLang.entries()).map(([lang, list]) => ({
      id: `mix_${lang.toLowerCase()}`,
      title: `${lang} Mix`,
      subtitle: `${list.length} DopTube-hosted tracks`,
      coverUrl: list[0]?.coverUrl || '',
      tracks: list.slice(0, 12),
    }));

    let recentlyPlayed: HydratedMusicTrack[] = [];
    if (req.auth) {
      const hist = db
        .prepare('SELECT track_id FROM music_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 12')
        .all(req.auth.userId) as Array<{ track_id: string }>;
      const map = new Map(tracks.map((t) => [t.id, t]));
      recentlyPlayed = hist.map((h) => map.get(h.track_id)).filter((t): t is HydratedMusicTrack => Boolean(t));
    }

    res.json({
      tracks: filtered,
      mixes,
      recentlyPlayed,
    });
  });

  app.get('/api/music/library', requireAuth, (req: AuthedRequest, res) => {
    const tracks = getMusicCatalog(req.auth!.userId);
    const liked = tracks.filter((t) => t.isLiked);
    const uploaded = tracks.filter((t) => {
      const ch = db.prepare('SELECT id FROM channels WHERE user_id = ?').get(req.auth!.userId) as { id: string } | undefined;
      return ch && t.channelId === ch.id;
    });
    res.json({ liked, uploaded });
  });

  app.get('/api/music/recently-played', requireAuth, (req: AuthedRequest, res) => {
    const tracks = getMusicCatalog(req.auth!.userId);
    const map = new Map(tracks.map((t) => [t.id, t]));
    const hist = db
      .prepare('SELECT track_id, played_at FROM music_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 30')
      .all(req.auth!.userId) as Array<{ track_id: string; played_at: string }>;
    res.json({
      tracks: hist.map((h) => map.get(h.track_id)).filter((t): t is HydratedMusicTrack => Boolean(t)),
    });
  });

  app.get('/api/recommendations/music', (req: AuthedRequest, res) => {
    const tracks = getMusicCatalog(req.auth?.userId);
    const sorted = [...tracks].sort((a, b) => b.plays + b.likes * 3 - (a.plays + a.likes * 3));
    res.json({ tracks: sorted });
  });

  app.post(
    '/api/music/upload',
    requireAuth,
    audioUpload.fields([
      { name: 'audio', maxCount: 1 },
      { name: 'cover', maxCount: 1 },
    ]),
    (req: AuthedRequest, res) => {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const audioFile = files?.audio?.[0];
      const coverFile = files?.cover?.[0];
      if (!audioFile) {
        res.status(400).json({ error: 'Please choose an MP3, M4A, WAV, or WebM audio file.' });
        return;
      }

      const { title = '', artistName = '', albumName = 'Single', language = 'Hindi', genre = 'Music' } = req.body as Record<string, string>;
      if (title.trim().length < 2) {
        fs.unlink(audioFile.path, () => {});
        if (coverFile) fs.unlink(coverFile.path, () => {});
        res.status(400).json({ error: 'Track title must be at least 2 characters.' });
        return;
      }

      const channel = db.prepare('SELECT id, name FROM channels WHERE user_id = ?').get(req.auth!.userId) as
        | { id: string; name: string }
        | undefined;
      if (!channel) {
        fs.unlink(audioFile.path, () => {});
        if (coverFile) fs.unlink(coverFile.path, () => {});
        res.status(400).json({ error: 'Creator channel not found.' });
        return;
      }

      const trackId = `trk_${randomUUID().slice(0, 10)}`;
      const ext = path.extname(audioFile.filename) || '.mp3';
      const canonicalAudioPath = path.resolve(UPLOAD_DIR, `${trackId}${ext}`);
      if (!canonicalAudioPath.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
        fs.unlink(audioFile.path, () => {});
        res.status(400).json({ error: 'Invalid file path.' });
        return;
      }
      fs.renameSync(audioFile.path, canonicalAudioPath);

      const coverUrl = coverFile
        ? `/api/thumbnails/${path.basename(coverFile.path)}`
        : `/api/avatars/${channel.id}.svg`;

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
        albumName.trim() || 'Single',
        `/api/music/stream/${trackId}`,
        coverUrl,
        language,
        genre,
        new Date().toISOString()
      );

      res.status(201).json({ trackId });
    }
  );

  app.get('/api/music/stream/:id', (req, res) => {
    const trackId = path.basename(req.params.id);
    const match = fs.readdirSync(UPLOAD_DIR).find((f) => f.startsWith(`${trackId}.`));
    if (!match) {
      res.status(404).json({ error: 'Audio stream not found.' });
      return;
    }
    const baseDir = path.resolve(UPLOAD_DIR);
    const filePath = path.resolve(baseDir, match);
    if (!filePath.startsWith(baseDir + path.sep) || !fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const mimeType =
      ext === '.mp3'
        ? 'audio/mpeg'
        : ext === '.wav'
        ? 'audio/wav'
        : ext === '.ogg'
        ? 'audio/ogg'
        : ext === '.m4a'
        ? 'audio/mp4'
        : 'audio/webm';

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
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': clampedEnd - start + 1,
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

  app.post('/api/music/history', requireAuth, (req: AuthedRequest, res) => {
    const { trackId } = req.body as { trackId?: string };
    if (!trackId) {
      res.status(400).json({ error: 'trackId required.' });
      return;
    }
    if (trackId.startsWith('mv_')) {
      const vid = trackId.slice(3);
      db.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(vid);
      res.json({ ok: true });
      return;
    }
    const track = db.prepare('SELECT id FROM music_tracks WHERE id = ?').get(trackId);
    if (!track) {
      res.status(404).json({ error: 'Track not found.' });
      return;
    }
    db.prepare('UPDATE music_tracks SET plays = plays + 1 WHERE id = ?').run(trackId);
    db.prepare(`
      INSERT INTO music_history (user_id, track_id, played_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, track_id) DO UPDATE SET played_at = excluded.played_at
    `).run(req.auth!.userId, trackId, new Date().toISOString());
    res.json({ ok: true });
  });

  app.post('/api/music/like/:trackId', requireAuth, (req: AuthedRequest, res) => {
    const trackId = req.params.trackId;
    const uid = req.auth!.userId;
    if (trackId.startsWith('mv_')) {
      const vid = trackId.slice(3);
      const exists = db
        .prepare(`SELECT 1 FROM video_reactions WHERE user_id = ? AND video_id = ? AND reaction = 'like'`)
        .get(uid, vid);
      if (exists) {
        db.prepare('DELETE FROM video_reactions WHERE user_id = ? AND video_id = ?').run(uid, vid);
        db.prepare('UPDATE videos SET likes = MAX(0, likes - 1) WHERE id = ?').run(vid);
        res.json({ liked: false });
      } else {
        db.prepare(`
          INSERT INTO video_reactions (user_id, video_id, reaction, created_at)
          VALUES (?, ?, 'like', ?)
          ON CONFLICT(user_id, video_id) DO UPDATE SET reaction = 'like'
        `).run(uid, vid, new Date().toISOString());
        db.prepare('UPDATE videos SET likes = likes + 1 WHERE id = ?').run(vid);
        res.json({ liked: true });
      }
      return;
    }

    const exists = db.prepare('SELECT 1 FROM music_likes WHERE user_id = ? AND track_id = ?').get(uid, trackId);
    if (exists) {
      db.prepare('DELETE FROM music_likes WHERE user_id = ? AND track_id = ?').run(uid, trackId);
      db.prepare('UPDATE music_tracks SET likes = MAX(0, likes - 1) WHERE id = ?').run(trackId);
      res.json({ liked: false });
    } else {
      db.prepare('INSERT INTO music_likes (user_id, track_id, created_at) VALUES (?, ?, ?)').run(
        uid,
        trackId,
        new Date().toISOString()
      );
      db.prepare('UPDATE music_tracks SET likes = likes + 1 WHERE id = ?').run(trackId);
      res.json({ liked: true });
    }
  });

  app.get('/api/music/queue', requireAuth, (req: AuthedRequest, res) => {
    const tracks = getMusicCatalog(req.auth!.userId);
    const map = new Map(tracks.map((t) => [t.id, t]));
    const rows = db
      .prepare('SELECT track_id FROM music_queue WHERE user_id = ? ORDER BY position ASC, added_at ASC')
      .all(req.auth!.userId) as Array<{ track_id: string }>;
    res.json({
      tracks: rows.map((r) => map.get(r.track_id)).filter((t): t is HydratedMusicTrack => Boolean(t)),
    });
  });

  app.post('/api/music/queue', requireAuth, (req: AuthedRequest, res) => {
    const { trackId } = req.body as { trackId?: string };
    if (!trackId) {
      res.status(400).json({ error: 'trackId required.' });
      return;
    }
    const maxPos = (
      db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM music_queue WHERE user_id = ?').get(req.auth!.userId) as {
        m: number;
      }
    ).m;
    db.prepare('INSERT OR REPLACE INTO music_queue (user_id, track_id, position, added_at) VALUES (?, ?, ?, ?)').run(
      req.auth!.userId,
      trackId,
      maxPos + 1,
      new Date().toISOString()
    );
    res.json({ ok: true });
  });

  app.delete('/api/music/queue/:trackId', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM music_queue WHERE user_id = ? AND track_id = ?').run(req.auth!.userId, req.params.trackId);
    res.json({ ok: true });
  });
}
