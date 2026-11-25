import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const THUMB_DIR = path.join(DATA_DIR, 'thumbnails');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const HLS_DIR = path.join(DATA_DIR, 'hls');

export function ensureMediaDirs() {
  for (const dir of [DATA_DIR, UPLOAD_DIR, THUMB_DIR, MEDIA_DIR, HLS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
}

export async function probeMediaFile(filePath: string): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 10_000 }
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    };
    const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
    const duration = Math.max(1, Math.round(Number(parsed.format?.duration ?? 10)));
    return {
      durationSec: Number.isFinite(duration) ? duration : 10,
      width: videoStream?.width ?? 1280,
      height: videoStream?.height ?? 720,
    };
  } catch {
    return { durationSec: 12, width: 1280, height: 720 };
  }
}

export async function extractThumbnail(videoPath: string, videoId: string): Promise<string | null> {
  ensureMediaDirs();
  const outThumb = path.join(THUMB_DIR, `${videoId}.jpg`);
  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-ss', '00:00:01', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', outThumb],
      { timeout: 15_000 }
    );
    if (fs.existsSync(outThumb)) {
      return `/api/thumbnails/${videoId}.jpg`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function transcodeToHls(
  videoPath: string,
  videoId: string
): Promise<{
  hlsUrl: string | null;
  variants: Array<{ quality: string; resolution: string; bitrateKbps: number; playlistPath: string }>;
}> {
  ensureMediaDirs();
  const outDir = path.join(HLS_DIR, videoId);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const playlist360 = path.join(outDir, '360p.m3u8');
  const playlist720 = path.join(outDir, '720p.m3u8');
  const masterPath = path.join(outDir, 'master.m3u8');

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        videoPath,
        '-vf',
        'scale=-2:360',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-b:v',
        '600k',
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        '-hls_time',
        '4',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        path.join(outDir, '360p_%03d.ts'),
        playlist360,
      ],
      { timeout: 45_000 }
    );

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        videoPath,
        '-vf',
        'scale=-2:720',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-b:v',
        '1400k',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-hls_time',
        '4',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        path.join(outDir, '720p_%03d.ts'),
        playlist720,
      ],
      { timeout: 60_000 }
    );

    const masterContent = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360',
      '360p.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=1550000,RESOLUTION=1280x720',
      '720p.m3u8',
    ].join('\n');
    fs.writeFileSync(masterPath, masterContent, 'utf8');

    return {
      hlsUrl: `/api/hls/${videoId}/master.m3u8`,
      variants: [
        { quality: '360p', resolution: '640x360', bitrateKbps: 600, playlistPath: `/api/hls/${videoId}/360p.m3u8` },
        { quality: '720p', resolution: '1280x720', bitrateKbps: 1400, playlistPath: `/api/hls/${videoId}/720p.m3u8` },
      ],
    };
  } catch {
    return { hlsUrl: null, variants: [] };
  }
}
