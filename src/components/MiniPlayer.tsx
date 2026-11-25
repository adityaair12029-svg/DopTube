import React, { useRef, useState } from 'react';
import { Maximize2, Pause, Play, X } from 'lucide-react';
import type { VideoItem } from '../types';

interface MiniPlayerProps {
  video: VideoItem;
  onExpand: (videoId: string) => void;
  onClose: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ video, onExpand, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="fixed bottom-16 md:bottom-5 right-4 z-40 w-72 sm:w-80 rounded-xl bg-white dark:bg-[#212121] border border-neutral-200 dark:border-[#383838] shadow-2xl overflow-hidden">
      <div className="relative aspect-video bg-black group">
        {video.sourceType === 'external' && video.externalEmbedUrl ? (
          <iframe
            key={video.id}
            src={video.externalEmbedUrl}
            title={video.title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <>
            <video
              ref={videoRef}
              src={video.videoUrl}
              poster={video.thumbnailUrl}
              autoPlay
              playsInline
              onClick={togglePlay}
              className="w-full h-full object-cover cursor-pointer"
            />
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause Miniplayer' : 'Play Miniplayer'}
              className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-black/75 text-white flex items-center justify-center cursor-pointer"
            >
              {playing ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            </button>
          </>
        )}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onExpand(video.id)}
            aria-label="Expand Miniplayer"
            className="w-7 h-7 rounded-full bg-black/75 text-white flex items-center justify-center hover:bg-black cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Miniplayer"
            className="w-7 h-7 rounded-full bg-black/75 text-white flex items-center justify-center hover:bg-black cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onExpand(video.id)}
          className="text-left min-w-0 flex-1 cursor-pointer"
        >
          <p className="text-xs font-semibold truncate text-[#0f0f0f] dark:text-[#f1f1f1]">{video.title}</p>
          <p className="text-[11px] text-[#606060] dark:text-[#aaaaaa] truncate">{video.channelName}</p>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss miniplayer"
          className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-[#383838] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
