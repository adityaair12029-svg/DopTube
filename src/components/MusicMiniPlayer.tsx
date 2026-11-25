import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp, Heart, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2, X } from 'lucide-react';
import type { MusicTrack } from '../types';
import { formatDuration } from '../lib/format';

interface MusicMiniPlayerProps {
  track: MusicTrack | null;
  queue: MusicTrack[];
  onSelectTrack: (track: MusicTrack) => void;
  onToggleLike: (trackId: string) => void;
  onClose: () => void;
}

export const MusicMiniPlayer: React.FC<MusicMiniPlayerProps> = ({
  track,
  queue,
  onSelectTrack,
  onToggleLike,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.src = track.audioUrl;
    audio.volume = volume;
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [track?.id]);

  if (!track) return null;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const playAdjacent = (dir: 1 | -1) => {
    if (queue.length === 0) return;
    if (shuffle && queue.length > 1) {
      const candidates = queue.filter((t) => t.id !== track.id);
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (pick) onSelectTrack(pick);
      return;
    }
    const idx = queue.findIndex((t) => t.id === track.id);
    const nextIdx = idx < 0 ? 0 : (idx + dir + queue.length) % queue.length;
    onSelectTrack(queue[nextIdx]);
  };

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          setCurrentTime(a.currentTime);
          if (a.duration && Number.isFinite(a.duration)) setDuration(a.duration);
        }}
        onEnded={() => {
          if (repeat && audioRef.current) {
            audioRef.current.currentTime = 0;
            void audioRef.current.play();
          } else {
            playAdjacent(1);
          }
        }}
      />

      {/* Expanded Now Playing Modal */}
      {expanded && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-[#0f0f0f] text-[#0f0f0f] dark:text-white flex flex-col p-5 sm:p-8 overflow-y-auto">
          <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#ff0033]">DopTube Music · Now Playing</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs font-semibold cursor-pointer"
              >
                Minimize
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center my-auto">
              <div className="aspect-square max-w-sm w-full mx-auto rounded-2xl overflow-hidden bg-neutral-200 dark:bg-[#1f1f1f] shadow-2xl">
                <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
              </div>

              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold leading-tight">{track.title}</h2>
                  <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-1">
                    {track.artistName} · {track.albumName} · {track.language}
                  </p>
                </div>

                <div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, duration)}
                    step={0.5}
                    value={currentTime}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (audioRef.current) audioRef.current.currentTime = val;
                      setCurrentTime(val);
                    }}
                    aria-label="Seek music track"
                    className="w-full accent-[#ff0033] cursor-pointer"
                  />
                  <div className="flex justify-between text-xs font-mono-nums text-[#606060] dark:text-[#aaaaaa] mt-1">
                    <span>{formatDuration(currentTime)}</span>
                    <span>{formatDuration(duration)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShuffle((v) => !v)}
                    aria-label="Toggle shuffle"
                    className={`p-2 rounded-full cursor-pointer ${shuffle ? 'text-[#ff0033]' : 'text-[#606060] dark:text-[#aaaaaa]'}`}
                  >
                    <Shuffle className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={() => playAdjacent(-1)} aria-label="Previous track" className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-[#272727] cursor-pointer">
                    <SkipBack className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={playing ? 'Pause music' : 'Play music'}
                    className="w-14 h-14 rounded-full bg-[#ff0033] text-white flex items-center justify-center shadow-lg cursor-pointer"
                  >
                    {playing ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
                  </button>
                  <button type="button" onClick={() => playAdjacent(1)} aria-label="Next track" className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-[#272727] cursor-pointer">
                    <SkipForward className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepeat((v) => !v)}
                    aria-label="Toggle repeat"
                    className={`p-2 rounded-full cursor-pointer ${repeat ? 'text-[#ff0033]' : 'text-[#606060] dark:text-[#aaaaaa]'}`}
                  >
                    <Repeat className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => onToggleLike(track.id)}
                    className={`h-9 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                      track.isLiked ? 'bg-[#ff0033] text-white' : 'bg-neutral-100 dark:bg-[#272727]'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${track.isLiked ? 'fill-white' : ''}`} />
                    <span>{track.isLiked ? 'Liked' : 'Like song'}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-[#606060] dark:text-[#aaaaaa]" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setVolume(v);
                        if (audioRef.current) audioRef.current.volume = v;
                      }}
                      aria-label="Audio volume"
                      className="w-24 accent-[#ff0033] cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Mini Audio Bar */}
      <div className="fixed bottom-14 md:bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#181818]/95 backdrop-blur-md border-t border-neutral-200 dark:border-[#2e2e2e] px-3 sm:px-6 py-2">
        <div className="h-0.5 bg-neutral-200 dark:bg-[#333] -mx-3 sm:-mx-6 -mt-2 mb-2">
          <div className="h-full bg-[#ff0033] transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
          >
            <img src={track.coverUrl} alt={track.title} className="w-10 h-10 rounded-lg object-cover shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{track.title}</p>
              <p className="text-xs text-[#606060] dark:text-[#aaaaaa] truncate">{track.artistName}</p>
            </div>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button type="button" onClick={() => playAdjacent(-1)} aria-label="Previous track" className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-[#2a2a2a] cursor-pointer hidden sm:flex">
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause music' : 'Play music'}
              className="w-9 h-9 rounded-full bg-[#ff0033] text-white flex items-center justify-center cursor-pointer"
            >
              {playing ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
            </button>
            <button type="button" onClick={() => playAdjacent(1)} aria-label="Next track" className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-[#2a2a2a] cursor-pointer">
              <SkipForward className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setExpanded(true)} aria-label="Expand music player" className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-[#2a2a2a] cursor-pointer">
              <ChevronUp className="w-4 h-4" />
            </button>
            <button type="button" onClick={onClose} aria-label="Close music player" className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-[#2a2a2a] cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
