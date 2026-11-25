import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Flag,
  ListPlus,
  MoreVertical,
  PictureInPicture2,
  Radio,
  Share2,
} from 'lucide-react';
import type { VideoItem } from '../types';
import { formatDuration, formatRelativeTime, formatViews } from '../lib/format';

interface VideoCardProps {
  video: VideoItem;
  layout?: 'grid' | 'horizontal' | 'compact';
  onWatch: (videoId: string) => void;
  onOpenChannel: (channelId: string) => void;
  onSaveWatchLater: (videoId: string) => void;
  onSavePlaylist: (videoId: string) => void;
  onShare: (video: VideoItem) => void;
  onReport: (video: VideoItem) => void;
  onMiniPlayer?: (video: VideoItem) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  layout = 'grid',
  onWatch,
  onOpenChannel,
  onSaveWatchLater,
  onSavePlaylist,
  onShare,
  onReport,
  onMiniPlayer,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const progressPct =
    video.progressSec && video.durationSec > 0
      ? Math.min(100, Math.round((video.progressSec / video.durationSec) * 100))
      : 0;

  const thumbnailBox = (
    <div
      className={`relative overflow-hidden bg-neutral-200 dark:bg-[#1f1f1f] shrink-0 group ${
        layout === 'horizontal'
          ? 'w-full sm:w-[360px] md:w-[400px] aspect-video rounded-xl'
          : layout === 'compact'
          ? 'w-40 aspect-video rounded-lg'
          : 'w-full aspect-video rounded-xl'
      }`}
    >
      <button
        type="button"
        onClick={() => onWatch(video.id)}
        aria-label={`Watch ${video.title}`}
        className="w-full h-full block cursor-pointer"
      >
        {!imgError ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 p-4 text-center text-white text-sm font-semibold">
            {video.title}
          </div>
        )}
      </button>

      {video.isLive ? (
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-[#cc0000] text-white text-[11px] font-semibold tracking-wide flex items-center gap-1 pointer-events-none">
          <Radio className="w-3 h-3" />
          LIVE
        </span>
      ) : (
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[12px] font-medium font-mono-nums pointer-events-none">
          {formatDuration(video.durationSec || 0)}
        </span>
      )}

      {progressPct > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30 pointer-events-none">
          <div className="h-full bg-[#ff0033]" style={{ width: `${progressPct}%` }} />
        </div>
      )}
    </div>
  );

  const actionMenu = (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        aria-label={`More actions for ${video.title}`}
        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-[#272727] text-[#0f0f0f] dark:text-[#f1f1f1] cursor-pointer"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-9 w-52 rounded-xl bg-white dark:bg-[#282828] border border-neutral-200 dark:border-[#3e3e3e] shadow-2xl py-1.5 z-40 text-sm">
          {onMiniPlayer && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onMiniPlayer(video);
              }}
              className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
            >
              <PictureInPicture2 className="w-4 h-4" />
              <span>Play in Miniplayer</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onSaveWatchLater(video.id);
            }}
            className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
          >
            <Clock className="w-4 h-4" />
            <span>Save to Watch later</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onSavePlaylist(video.id);
            }}
            className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
          >
            <ListPlus className="w-4 h-4" />
            <span>Save to playlist</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onShare(video);
            }}
            className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onReport(video);
            }}
            className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
          >
            <Flag className="w-4 h-4" />
            <span>Report</span>
          </button>
        </div>
      )}
    </div>
  );

  if (layout === 'compact') {
    return (
      <div className="flex gap-2.5 group">
        {thumbnailBox}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onWatch(video.id)}
            className="text-left text-[14px] font-semibold leading-snug text-[#0f0f0f] dark:text-[#f1f1f1] line-clamp-2 hover:text-[#ff0033] dark:hover:text-white cursor-pointer"
          >
            {video.title}
          </button>
          <button
            type="button"
            onClick={() => onOpenChannel(video.channelId)}
            className="mt-1 flex items-center gap-1 text-[12px] text-[#606060] dark:text-[#aaaaaa] hover:text-[#0f0f0f] dark:hover:text-white cursor-pointer"
          >
            <span className="truncate">{video.channelName}</span>
            {video.channelVerified && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          </button>
          <p className="text-[12px] text-[#606060] dark:text-[#aaaaaa] font-mono-nums">
            {formatViews(video.views)} views · {formatRelativeTime(video.createdAt)}
          </p>
        </div>
        {actionMenu}
      </div>
    );
  }

  if (layout === 'horizontal') {
    return (
      <div className="flex flex-col sm:flex-row gap-4 group">
        {thumbnailBox}
        <div className="flex-1 min-w-0 flex items-start justify-between gap-2 py-0.5">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onWatch(video.id)}
              className="text-left text-[18px] font-semibold leading-snug text-[#0f0f0f] dark:text-[#f1f1f1] line-clamp-2 cursor-pointer"
            >
              {video.title}
            </button>
            <p className="mt-1 text-[12px] text-[#606060] dark:text-[#aaaaaa] font-mono-nums">
              {formatViews(video.views)} views · {formatRelativeTime(video.createdAt)} · {video.language}
            </p>
            <button
              type="button"
              onClick={() => onOpenChannel(video.channelId)}
              className="my-2.5 flex items-center gap-2 text-[13px] text-[#606060] dark:text-[#aaaaaa] hover:text-[#0f0f0f] dark:hover:text-white cursor-pointer"
            >
              <img
                src={video.channelAvatar}
                alt={video.channelName}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="truncate font-medium">{video.channelName}</span>
              {video.channelVerified && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
            </button>
            <p className="text-[13px] text-[#606060] dark:text-[#aaaaaa] line-clamp-2 leading-relaxed">
              {video.description}
            </p>
          </div>
          {actionMenu}
        </div>
      </div>
    );
  }

  // Grid Card (matches homepage screenshot proportions)
  return (
    <article className="flex flex-col">
      {thumbnailBox}
      <div className="mt-3 flex items-start gap-3">
        <button
          type="button"
          onClick={() => onOpenChannel(video.channelId)}
          aria-label={`Visit ${video.channelName}`}
          className="w-9 h-9 rounded-full overflow-hidden shrink-0 mt-0.5 cursor-pointer"
        >
          <img
            src={video.channelAvatar}
            alt={video.channelName}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </button>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onWatch(video.id)}
            className="text-left text-[15px] sm:text-[16px] font-semibold leading-[1.35] text-[#0f0f0f] dark:text-[#f1f1f1] line-clamp-2 cursor-pointer"
          >
            {video.title}
          </button>

          <button
            type="button"
            onClick={() => onOpenChannel(video.channelId)}
            className="mt-1 flex items-center gap-1 text-[13px] text-[#606060] dark:text-[#aaaaaa] hover:text-[#0f0f0f] dark:hover:text-white cursor-pointer"
          >
            <span className="truncate">{video.channelName}</span>
            {video.channelVerified && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          </button>

          <p className="text-[13px] text-[#606060] dark:text-[#aaaaaa] font-mono-nums">
            {formatViews(video.views)} views · {video.isLive ? 'Streaming live' : formatRelativeTime(video.createdAt)}
          </p>
        </div>

        {actionMenu}
      </div>
    </article>
  );
};
