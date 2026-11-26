import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Captions,
  Maximize,
  Minimize,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { VideoItem } from '../types';
import { formatDuration } from '../lib/format';

export type PlayerBehaviorEvent =
  | 'start'
  | 'progress_10'
  | 'progress_25'
  | 'progress_50'
  | 'progress_75'
  | 'completion'
  | 'replay';

interface VideoPlayerProps {
  video: VideoItem;
  theaterMode?: boolean;
  onToggleTheater?: () => void;
  onMinimize?: () => void;
  onProgressSave?: (progressSec: number) => void;
  onBehaviorEvent?: (eventType: PlayerBehaviorEvent, progressPct: number, watchDurationSec: number) => void;
  onEndedNext?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  video,
  theaterMode = false,
  onToggleTheater,
  onMinimize,
  onProgressSave,
  onBehaviorEvent,
  onEndedNext,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const firedMilestonesRef = useRef<Set<string>>(new Set());
  const endedOnceRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.durationSec || 0);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState('Auto');
  const [captionsOn, setCaptionsOn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const isExternalEmbed = video.sourceType === 'external' && Boolean(video.externalEmbedUrl);

  useEffect(() => {
    firedMilestonesRef.current = new Set();
    endedOnceRef.current = false;
    onBehaviorEvent?.('start', 0, 0);
  }, [video.id]);

  useEffect(() => {
    if (isExternalEmbed) return;
    const el = videoRef.current;
    if (!el) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setPlaying(false);
    setCurrentTime(video.progressSec || 0);

    if (video.hlsUrl && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(video.hlsUrl);
      hls.attachMedia(el);
      hlsRef.current = hls;
    } else if (video.hlsUrl && el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = video.hlsUrl;
    } else {
      el.src = video.videoUrl;
    }

    const onLoadedMetadata = () => {
      if (el.duration && Number.isFinite(el.duration)) {
        setDuration(el.duration);
      }
      if (video.progressSec && video.progressSec > 2 && video.progressSec < (el.duration || Infinity) - 2) {
        el.currentTime = video.progressSec;
      }
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };

    el.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isExternalEmbed, video.id, video.videoUrl, video.hlsUrl]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (isExternalEmbed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const el = videoRef.current;
      if (!el) return;

      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 'c') {
        setCaptionsOn((v) => !v);
      } else if (e.key.toLowerCase() === 't' && onToggleTheater) {
        onToggleTheater();
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l') {
        el.currentTime = Math.min(el.duration || 0, el.currentTime + 5);
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j') {
        el.currentTime = Math.max(0, el.currentTime - 5);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    if (isExternalEmbed || !onProgressSave) return;
    const interval = setInterval(() => {
      const el = videoRef.current;
      if (el && !el.paused && el.currentTime > 1) {
        onProgressSave(Math.floor(el.currentTime));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isExternalEmbed, onProgressSave]);

  if (isExternalEmbed && video.externalEmbedUrl) {
    return (
      <div className="w-full aspect-video rounded-none sm:rounded-xl overflow-hidden bg-black relative">
        <iframe
          key={video.id}
          src={video.externalEmbedUrl}
          title={video.title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      if (endedOnceRef.current && el.currentTime >= (el.duration || 1) - 1) {
        el.currentTime = 0;
        onBehaviorEvent?.('replay', 0, Math.floor(el.duration || 0));
      }
      el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
      if (onProgressSave) onProgressSave(Math.floor(el.currentTime));
    }
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  const handleVolumeChange = (val: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = val;
    el.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };

  const handleSeek = (val: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = val;
    setCurrentTime(val);
  };

  const handleSpeedChange = (newSpeed: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = newSpeed;
    setSpeed(newSpeed);
    setSettingsOpen(false);
  };

  const handleQualityChange = (newQ: string) => {
    setQuality(newQ);
    setSettingsOpen(false);
    if (hlsRef.current) {
      if (newQ === 'Auto') {
        hlsRef.current.currentLevel = -1;
      } else {
        const idx = hlsRef.current.levels.findIndex((l) => `${l.height}p` === newQ);
        if (idx >= 0) hlsRef.current.currentLevel = idx;
      }
    }
  };

  const togglePip = async () => {
    const el = videoRef.current;
    if (!el || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await el.requestPictureInPicture();
      }
    } catch {
      // ignore unsupported PiP browser errors
    }
  };

  const toggleFullscreen = async () => {
    const wrap = containerRef.current;
    if (!wrap) return;
    try {
      if (!document.fullscreenElement) {
        await wrap.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={() => setControlsVisible(true)}
      onMouseLeave={() => playing && setControlsVisible(false)}
      className={`relative w-full bg-black rounded-none sm:rounded-xl overflow-hidden select-none group ${
        theaterMode ? 'max-h-[75vh] aspect-video' : 'aspect-video'
      }`}
    >
      <video
        ref={videoRef}
        poster={video.thumbnailUrl}
        playsInline
        onClick={togglePlay}
        onTimeUpdate={() => {
          const el = videoRef.current;
          if (!el) return;
          setCurrentTime(el.currentTime);
          if (el.buffered.length > 0 && el.duration > 0) {
            setBufferedPct((el.buffered.end(el.buffered.length - 1) / el.duration) * 100);
          }
          if (el.duration > 0 && onBehaviorEvent) {
            const pct = (el.currentTime / el.duration) * 100;
            const milestones: Array<[number, PlayerBehaviorEvent]> = [
              [10, 'progress_10'],
              [25, 'progress_25'],
              [50, 'progress_50'],
              [75, 'progress_75'],
            ];
            for (const [threshold, eventName] of milestones) {
              if (pct >= threshold && !firedMilestonesRef.current.has(eventName)) {
                firedMilestonesRef.current.add(eventName);
                onBehaviorEvent(eventName, Math.round(pct), Math.floor(el.currentTime));
              }
            }
          }
        }}
        onEnded={() => {
          setPlaying(false);
          endedOnceRef.current = true;
          if (onProgressSave) onProgressSave(Math.floor(duration));
          onBehaviorEvent?.('completion', 100, Math.floor(duration));
          onEndedNext?.();
        }}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Captions / Subtitles Overlay */}
      {captionsOn && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded bg-black/80 text-white text-sm text-center max-w-[85%] pointer-events-none">
          [{video.language}] {video.title} — {video.channelName}
        </div>
      )}

      {/* Center Play Overlay when paused */}
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center bg-black/25 cursor-pointer"
        >
          <span className="w-16 h-16 rounded-full bg-black/80 border border-white/20 text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors">
            <Play className="w-7 h-7 fill-current ml-0.5" />
          </span>
        </button>
      )}

      {/* Bottom Controls Bar */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-8 pb-2.5 px-3 transition-opacity duration-200 ${
          controlsVisible || !playing ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Seek Bar */}
        <div className="relative h-4 flex items-center group/seek cursor-pointer mb-1">
          <div className="w-full h-1 group-hover/seek:h-1.5 bg-white/25 rounded-full overflow-hidden transition-all relative">
            <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${progressPct}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={0.1}
            value={currentTime}
            onChange={(e) => handleSeek(Number(e.target.value))}
            aria-label="Seek video timeline"
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between gap-2 text-white">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"
            >
              {playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
            </button>

            <div className="flex items-center gap-1 group/vol">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"
              >
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                aria-label="Volume"
                className="w-16 sm:w-20 accent-white cursor-pointer"
              />
            </div>

            <span className="text-xs font-mono-nums text-white/90 ml-1">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1 relative">
            <button
              type="button"
              onClick={() => setCaptionsOn((v) => !v)}
              aria-label="Toggle captions"
              title="Subtitles / Captions (C)"
              className={`p-1.5 rounded-lg hover:bg-white/15 cursor-pointer ${captionsOn ? 'bg-white text-black' : ''}`}
            >
              <Captions className="w-5 h-5" />
            </button>

            {/* Settings Menu (Speed & Quality) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-label="Player settings"
                className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"
              >
                <Settings className="w-5 h-5" />
              </button>
              {settingsOpen && (
                <div className="absolute right-0 bottom-10 w-52 rounded-xl bg-[#16181c]/95 border border-[#2f3336] p-3 shadow-2xl text-xs space-y-3 z-30">
                  <div>
                    <p className="text-[#71767b] mb-1.5 font-medium">Playback speed</p>
                    <div className="flex flex-wrap gap-1">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSpeedChange(s)}
                          className={`px-2 py-1 rounded cursor-pointer ${
                            speed === s ? 'bg-white text-black font-bold' : 'bg-[#202327] hover:bg-[#2f3336]'
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[#71767b] mb-1.5 font-medium">Quality</p>
                    <div className="flex flex-wrap gap-1">
                      {['Auto', '720p', '360p'].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => handleQualityChange(q)}
                          className={`px-2 py-1 rounded cursor-pointer ${
                            quality === q ? 'bg-white text-black font-bold' : 'bg-[#202327] hover:bg-[#2f3336]'
                          }`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                aria-label="Miniplayer"
                title="Miniplayer"
                className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer hidden sm:flex"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            )}

            <button
              type="button"
              onClick={togglePip}
              aria-label="Picture in Picture"
              title="Picture-in-Picture"
              className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer hidden sm:flex"
            >
              <PictureInPicture2 className="w-5 h-5" />
            </button>

            {onToggleTheater && (
              <button
                type="button"
                onClick={onToggleTheater}
                aria-label="Theater mode"
                title="Theater mode (T)"
                className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer hidden lg:flex"
              >
                <RectangleHorizontal className="w-5 h-5" />
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Fullscreen"
              title="Fullscreen (F)"
              className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
