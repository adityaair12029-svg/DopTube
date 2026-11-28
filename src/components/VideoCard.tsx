import React, { useEffect, useRef, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  EyeOff,
  Flag,
  Info,
  ListMusic,
  ListPlus,
  MoreVertical,
  PictureInPicture2,
  Play,
  Radio,
  Share2,
  X,
  Zap,
} from 'lucide-react';
import type { VideoItem } from '../types';
import { formatDuration, formatRelativeTime, formatViews } from '../lib/format';

interface VideoCardProps {
  video: VideoItem;
  layout?: 'grid' | 'horizontal' | 'compact';
  onWatch: (videoId: string, video?: VideoItem) => void;
  onOpenChannel: (channelId: string) => void;
  onSaveWatchLater: (videoId: string) => void;
  onSavePlaylist: (videoId: string) => void;
  onShare: (video: VideoItem) => void;
  onReport: (video: VideoItem) => void;
  onMiniPlayer?: (video: VideoItem) => void;
  onPlayNext?: (videoId: string) => void;
  onAddToQueue?: (videoId: string) => void;
  onNotInterested?: (videoId: string) => void;
  onDontRecommendCreator?: (channelId: string, channelName: string) => void;
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
  onPlayNext,
  onAddToQueue,
  onNotInterested,
  onDontRecommendCreator,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
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

  const reasonsList =
    video.recommendationReasons && video.recommendationReasons.length > 0
      ? video.recommendationReasons
      : video.recommendationReason
      ? [video.recommendationReason]
      : [];
  const hasReasons = reasonsList.length > 0;

  const whyThisVideoControl = hasReasons ? (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setReasonOpen((v) => !v);
        }}
        aria-expanded={reasonOpen}
        aria-label={`Why this video: ${video.title}`}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#536471] dark:text-[#8b98a5] hover:text-[#1d4ed8] dark:hover:text-[#38bdf8] transition-colors cursor-pointer"
      >
        <Info className="w-3 h-3 shrink-0" />
        <span className="underline decoration-dotted underline-offset-2">Why this video?</span>
      </button>
      {reasonOpen && (
        <div
          role="tooltip"
          className="mt-1.5 px-2.5 py-2 rounded-lg bg-[var(--dt-surface)] border border-[var(--dt-border)] shadow-md text-xs text-[var(--dt-text)] flex items-start justify-between gap-2"
        >
          <div className="min-w-0 leading-relaxed">
            <span className="font-semibold text-[#1d4ed8] dark:text-[#38bdf8]">Recommended for you: </span>
            <span>{reasonsList.slice(0, 2).join(' · ')}</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setReasonOpen(false);
            }}
            aria-label="Dismiss recommendation reason"
            className="p-0.5 rounded hover:bg-[var(--dt-surface-hover)] shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  ) : null;

  const thumbnailBox = (
    <div
      className={`relative overflow-hidden bg-[#eff3f4] dark:bg-[#16181c] shrink-0 group ${
        layout === 'horizontal'
          ? 'w-full sm:w-[360px] md:w-[400px] aspect-video rounded-xl'
          : layout === 'compact'
          ? 'w-40 aspect-video rounded-lg'
          : 'w-full aspect-video rounded-none sm:rounded-xl'
      }`}
    >
      <button
        type="button"
        onClick={() => onWatch(video.id, video)}
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
          <div className="w-full h-full flex items-center justify-center bg-black p-4 text-center text-white text-sm font-semibold">
            {video.title}
          </div>
        )}
      </button>

      {video.isLive ? (
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-gradient-to-r from-rose-600 to-pink-600 text-white text-[11px] font-bold tracking-wide flex items-center gap-1 pointer-events-none shadow">
          <Radio className="w-3 h-3" />
          LIVE
        </span>
      ) : video.isShort ? (
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded jio-gradient text-white text-[10px] font-bold tracking-wider flex items-center gap-1 pointer-events-none shadow">
          <Zap className="w-2.5 h-2.5 fill-white" />
          SHORTS
        </span>
      ) : (
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[12px] font-medium font-mono-nums pointer-events-none">
          {formatDuration(video.durationSec || 0)}
        </span>
      )}

      {progressPct > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/25 pointer-events-none">
          <div className="h-full jio-gradient" style={{ width: `${progressPct}%` }} />
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
        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] text-[#0f1419] dark:text-[#e7e9ea] cursor-pointer"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-9 w-56 rounded-xl bg-[var(--dt-surface)] border border-[var(--dt-border)] shadow-2xl py-1.5 z-40 text-sm">
          {hasReasons && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setReasonOpen((v) => !v);
              }}
              className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-[var(--dt-surface-hover)] cursor-pointer text-[#1d4ed8] dark:text-[#38bdf8] font-medium"
            >
              <Info className="w-4 h-4 shrink-0" />
              <span>Why this video?</span>
            </button>
          )}
          {onPlayNext && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onPlayNext(video.id);
              }}
              className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>Play next</span>
            </button>
          )}
          {onAddToQueue && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onAddToQueue(video.id);
              }}
              className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
            >
              <ListMusic className="w-4 h-4" />
              <span>Add to queue</span>
            </button>
          )}
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
          {(onNotInterested || onDontRecommendCreator) && (
            <div className="my-1 border-t border-neutral-200 dark:border-[#3e3e3e]" />
          )}
          {onNotInterested && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onNotInterested(video.id);
              }}
              className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
            >
              <EyeOff className="w-4 h-4" />
              <span>Not interested</span>
            </button>
          )}
          {onDontRecommendCreator && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDontRecommendCreator(video.channelId, video.channelName);
              }}
              className="w-full px-3.5 py-2 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
            >
              <Ban className="w-4 h-4" />
              <span>Don’t recommend creator</span>
            </button>
          )}
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
            onClick={() => onWatch(video.id, video)}
            className="text-left text-[14px] font-semibold leading-snug text-[#0f1419] dark:text-[#e7e9ea] line-clamp-2 hover:underline cursor-pointer"
          >
            {video.title}
          </button>
          <button
            type="button"
            onClick={() => onOpenChannel(video.channelId)}
            className="mt-1 flex items-center gap-1 text-[12px] text-[#536471] dark:text-[#71767b] hover:text-[#0f1419] dark:hover:text-white cursor-pointer"
          >
            <span className="truncate">{video.channelName}</span>
            {video.channelVerified && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#1d4ed8] dark:text-[#38bdf8]" />}
          </button>
          <p className="text-[12px] text-[#536471] dark:text-[#71767b] font-mono-nums">
            {formatViews(video.views)} views · {formatRelativeTime(video.createdAt)}
          </p>
          {whyThisVideoControl}
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
              onClick={() => onWatch(video.id, video)}
              className="text-left text-[18px] font-semibold leading-snug text-[#0f1419] dark:text-[#e7e9ea] line-clamp-2 cursor-pointer"
            >
              {video.title}
            </button>
            <p className="mt-1 text-[12px] text-[#536471] dark:text-[#71767b] font-mono-nums">
              {formatViews(video.views)} views · {formatRelativeTime(video.createdAt)} · {video.language}
            </p>
            <button
              type="button"
              onClick={() => onOpenChannel(video.channelId)}
              className="my-2.5 flex items-center gap-2 text-[13px] text-[#536471] dark:text-[#71767b] hover:text-[#0f1419] dark:hover:text-white cursor-pointer"
            >
              <img
                src={video.channelAvatar}
                alt={video.channelName}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="truncate font-medium">{video.channelName}</span>
              {video.channelVerified && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#1d4ed8] dark:text-[#38bdf8]" />}
            </button>
            <p className="text-[13px] text-[#536471] dark:text-[#71767b] line-clamp-2 leading-relaxed">
              {video.description}
            </p>
            {whyThisVideoControl}
          </div>
          {actionMenu}
        </div>
      </div>
    );
  }

  // Grid Card (mobile edge-to-edge thumbnails, desktop rounded cards)
  return (
    <article className="flex flex-col">
      {thumbnailBox}
      <div className="mt-3 px-3 sm:px-0 flex items-start gap-3">
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
            onClick={() => onWatch(video.id, video)}
            className="text-left text-[15px] sm:text-[16px] font-semibold leading-[1.35] text-[#0f1419] dark:text-[#e7e9ea] line-clamp-2 cursor-pointer"
          >
            {video.title}
          </button>

          <button
            type="button"
            onClick={() => onOpenChannel(video.channelId)}
            className="mt-1 flex items-center gap-1 text-[13px] text-[#536471] dark:text-[#71767b] hover:text-[#0f1419] dark:hover:text-white cursor-pointer"
          >
            <span className="truncate">{video.channelName}</span>
            {video.channelVerified && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#1d4ed8] dark:text-[#38bdf8]" />}
          </button>

          <p className="text-[13px] text-[var(--dt-text-muted)] font-mono-nums">
            {formatViews(video.views)} views · {video.isLive ? 'Streaming live' : formatRelativeTime(video.createdAt)}
          </p>

          {whyThisVideoControl}
        </div>

        {actionMenu}
      </div>
    </article>
  );
};
