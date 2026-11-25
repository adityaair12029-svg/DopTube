import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  EyeOff,
  ListPlus,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Share2,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { UserProfile, VideoComment, VideoItem } from '../types';
import { apiFetch } from '../lib/api';
import { formatViews } from '../lib/format';

interface ShortsViewProps {
  shorts: VideoItem[];
  initialShortId?: string;
  user: UserProfile | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSubscriptionsChanged?: () => void;
  onOpenAuth: () => void;
  onOpenChannel: (channelId: string) => void;
  onSavePlaylist: (videoId: string) => void;
  onShare: (video: VideoItem) => void;
  onToast: (msg: string) => void;
}

export const ShortsView: React.FC<ShortsViewProps> = ({
  shorts,
  initialShortId,
  user,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onSubscriptionsChanged,
  onOpenAuth,
  onOpenChannel,
  onSavePlaylist,
  onShare,
  onToast,
}) => {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [subscribedOverrides, setSubscribedOverrides] = useState<Record<string, boolean>>({});
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const lastWheelTsRef = useRef<number>(0);

  const visibleShorts = shorts.filter((s) => !hiddenIds.has(s.id));

  useEffect(() => {
    if (!initialShortId || visibleShorts.length === 0) return;
    const found = visibleShorts.findIndex((s) => s.id === initialShortId);
    if (found >= 0) setIndex(found);
  }, [initialShortId, visibleShorts.length]);

  const safeIndex = Math.min(index, Math.max(0, visibleShorts.length - 1));
  const current = visibleShorts[safeIndex];

  useEffect(() => {
    if (!current) return;
    setPlaying(true);
    window.history.replaceState({}, '', `/?shorts=${encodeURIComponent(current.id)}`);
    apiFetch('/api/events/watch', {
      method: 'POST',
      body: JSON.stringify({ videoId: current.id, eventType: 'start', progressPct: 0, watchDurationSec: 0 }),
    }).catch(() => {});
  }, [current?.id]);

  // Infinite load more Shorts when user reaches within last 3 items
  useEffect(() => {
    if (!onLoadMore || !hasMore || loadingMore || visibleShorts.length === 0) return;
    if (safeIndex >= visibleShorts.length - 3) {
      onLoadMore();
    }
  }, [safeIndex, visibleShorts.length, hasMore, loadingMore, onLoadMore]);

  useEffect(() => {
    if (!current || !commentsOpen) return;
    apiFetch<{ comments: VideoComment[] }>(`/api/videos/${current.id}/comments`)
      .then((res) => setComments(res.comments))
      .catch(() => {});
  }, [current?.id, commentsOpen]);

  const goNext = () => {
    if (current) {
      apiFetch('/api/events/skip', {
        method: 'POST',
        body: JSON.stringify({ videoId: current.id, watchDurationSec: 3 }),
      }).catch(() => {});
    }
    setIndex((i) => Math.min(visibleShorts.length - 1, i + 1));
  };

  const goPrev = () => {
    setIndex((i) => Math.max(0, i - 1));
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (commentsOpen) return;
    const now = Date.now();
    if (now - lastWheelTsRef.current < 420) return;
    if (Math.abs(e.deltaY) < 28) return;
    lastWheelTsRef.current = now;
    if (e.deltaY > 0) goNext();
    else goPrev();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleShorts.length]);

  if (!current) {
    return (
      <div className="py-20 text-center text-sm text-[#606060] dark:text-[#aaaaaa]">
        No Shorts available yet. Upload a vertical video in DopTube Studio!
      </div>
    );
  }

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

  const handleLike = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    try {
      await apiFetch(`/api/videos/${current.id}/react`, {
        method: 'POST',
        body: JSON.stringify({ reaction: 'like' }),
      });
      apiFetch('/api/events/like', {
        method: 'POST',
        body: JSON.stringify({ videoId: current.id, reaction: 'like' }),
      }).catch(() => {});
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
    } catch {
      onToast('Could not update like.');
    }
  };

  const handleSubscribe = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    try {
      const res = await apiFetch<{ subscribed: boolean }>(`/api/channels/${current.channelId}/subscribe`, {
        method: 'POST',
      });
      setSubscribedOverrides((prev) => ({ ...prev, [current.channelId]: res.subscribed }));
      onSubscriptionsChanged?.();
      onToast(res.subscribed ? `Subscribed to ${current.channelName}` : `Unsubscribed from ${current.channelName}`);
    } catch {
      onToast('Could not update subscription.');
    }
  };

  const handleNotInterested = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    await apiFetch('/api/events/feedback', {
      method: 'POST',
      body: JSON.stringify({ videoId: current.id, feedbackType: 'not_interested' }),
    });
    setHiddenIds((prev) => new Set(prev).add(current.id));
    onToast('We will show fewer Shorts like this');
  };

  const handleBlockCreator = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    await apiFetch('/api/events/feedback', {
      method: 'POST',
      body: JSON.stringify({ videoId: current.id, channelId: current.channelId, feedbackType: 'dont_recommend_creator' }),
    });
    setHiddenIds((prev) => new Set(prev).add(current.id));
    onToast(`Stopped recommending ${current.channelName}`);
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!commentText.trim()) return;
    await apiFetch(`/api/videos/${current.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: commentText.trim() }),
    });
    setCommentText('');
    const res = await apiFetch<{ comments: VideoComment[] }>(`/api/videos/${current.id}/comments`);
    setComments(res.comments);
  };

  const isLiked = likedIds.has(current.id);
  const isSubscribed = subscribedOverrides[current.channelId] ?? Boolean(current.isSubscribed);
  const isFailed = failedIds.has(current.id);

  return (
    <div
      onWheel={handleWheel}
      className="h-[calc(100vh-56px)] flex items-center justify-center gap-4 px-2 sm:px-4 py-2 sm:py-4 pb-16 md:pb-6"
    >
      <div
        onTouchStart={(e) => {
          touchStartYRef.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(e) => {
          const startY = touchStartYRef.current;
          const endY = e.changedTouches[0]?.clientY;
          if (startY !== null && typeof endY === 'number') {
            const delta = startY - endY;
            if (delta > 50) goNext();
            else if (delta < -50) goPrev();
          }
          touchStartYRef.current = null;
        }}
        className="relative h-full max-h-[780px] aspect-[9/16] max-w-full rounded-2xl overflow-hidden bg-black shadow-2xl"
      >
        {isFailed ? (
          <div className="relative w-full h-full flex flex-col items-center justify-center bg-black text-white p-6 text-center">
            <img
              src={current.thumbnailUrl}
              alt={current.title}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover opacity-35"
            />
            <div className="relative z-10 space-y-3">
              <p className="text-sm font-semibold">Unable to load this Short right now.</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFailedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(current.id);
                      return next;
                    })
                  }
                  className="h-8 px-4 rounded-full bg-white text-[#0f0f0f] text-xs font-semibold cursor-pointer"
                >
                  Retry
                </button>
                {safeIndex < visibleShorts.length - 1 && (
                  <button
                    type="button"
                    onClick={goNext}
                    className="h-8 px-4 rounded-full bg-white/20 text-white text-xs font-semibold cursor-pointer"
                  >
                    Next Short
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : current.sourceType === 'external' && current.externalEmbedUrl ? (
          <iframe
            key={current.id}
            src={current.externalEmbedUrl}
            title={current.title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <>
            <video
              key={current.id}
              ref={videoRef}
              src={current.videoUrl}
              poster={current.thumbnailUrl}
              autoPlay
              loop
              muted={muted}
              playsInline
              onClick={togglePlay}
              onError={() => setFailedIds((prev) => new Set(prev).add(current.id))}
              className="w-full h-full object-cover cursor-pointer"
            />

            {/* Top Controls */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? 'Pause Short' : 'Play Short'}
                className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer"
              >
                {playing ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
              </button>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute Short' : 'Mute Short'}
                className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}

        {/* Mobile Quick Prev/Next Pills */}
        <div className="sm:hidden absolute top-14 left-3 flex flex-col gap-2 z-10">
          <button
            type="button"
            disabled={safeIndex === 0}
            onClick={goPrev}
            aria-label="Previous Short"
            className="w-8 h-8 rounded-full bg-black/50 text-white disabled:opacity-30 flex items-center justify-center cursor-pointer"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={safeIndex >= visibleShorts.length - 1}
            onClick={goNext}
            aria-label="Next Short"
            className="w-8 h-8 rounded-full bg-black/50 text-white disabled:opacity-30 flex items-center justify-center cursor-pointer"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom Creator & Caption Scrim */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-white pointer-events-auto">
          <div className="flex items-center flex-wrap gap-2 mb-2 pr-14">
            <button
              type="button"
              onClick={() => onOpenChannel(current.channelId)}
              className="flex items-center gap-2 cursor-pointer min-w-0"
            >
              <img
                src={current.channelAvatar}
                alt={current.channelName}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover shrink-0"
              />
              <span className="text-sm font-semibold truncate max-w-[140px]">
                {current.channelHandle || current.channelName}
              </span>
            </button>
            <button
              type="button"
              onClick={handleSubscribe}
              className={`h-7 px-3 rounded-full text-xs font-semibold cursor-pointer ${
                isSubscribed
                  ? 'bg-white/25 text-white hover:bg-white/35'
                  : 'bg-white text-[#0f0f0f] hover:bg-white/90'
              }`}
            >
              {isSubscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          </div>
          <p className="text-sm font-medium line-clamp-2 pr-14">{current.title}</p>
        </div>

        {/* Right Overlay Actions */}
        <div className="absolute right-2.5 bottom-16 flex flex-col items-center gap-3 text-white">
          <button type="button" onClick={handleLike} aria-label="Like Short" className="flex flex-col items-center gap-1 cursor-pointer">
            <span className={`w-10 h-10 rounded-full flex items-center justify-center ${isLiked ? 'bg-[#ff0033]' : 'bg-black/55'}`}>
              <ThumbsUp className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-mono-nums">{formatViews(current.likes + (isLiked ? 1 : 0))}</span>
          </button>

          <button type="button" onClick={() => setCommentsOpen((v) => !v)} aria-label="Comments" className="flex flex-col items-center gap-1 cursor-pointer">
            <span className="w-10 h-10 rounded-full bg-black/55 flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </span>
            <span className="text-[11px]">Comments</span>
          </button>

          <button
            type="button"
            onClick={() => (user ? onSavePlaylist(current.id) : onOpenAuth())}
            aria-label="Save to playlist"
            className="flex flex-col items-center gap-1 cursor-pointer"
          >
            <span className="w-10 h-10 rounded-full bg-black/55 flex items-center justify-center">
              <ListPlus className="w-4 h-4" />
            </span>
            <span className="text-[11px]">Save</span>
          </button>

          <button type="button" onClick={() => onShare(current)} aria-label="Share Short" className="flex flex-col items-center gap-1 cursor-pointer">
            <span className="w-10 h-10 rounded-full bg-black/55 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </span>
            <span className="text-[11px]">Share</span>
          </button>

          <button type="button" onClick={handleNotInterested} aria-label="Not interested" title="Not interested" className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center cursor-pointer">
            <EyeOff className="w-4 h-4" />
          </button>

          <button type="button" onClick={handleBlockCreator} aria-label="Don't recommend creator" title="Don't recommend creator" className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center cursor-pointer">
            <Ban className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile Bottom Comments Sheet inside frame */}
        {commentsOpen && (
          <div className="md:hidden absolute inset-x-0 bottom-0 h-[62%] bg-white dark:bg-[#212121] text-[#0f0f0f] dark:text-[#f1f1f1] rounded-t-2xl p-4 flex flex-col z-20 shadow-2xl">
            <div className="flex items-center justify-between pb-2.5 border-b border-neutral-200 dark:border-[#383838]">
              <h3 className="font-bold text-sm">Comments</h3>
              <button type="button" onClick={() => setCommentsOpen(false)} aria-label="Close comments" className="p-1 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              {comments.length === 0 ? (
                <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">Be the first to comment on this Short.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="text-xs space-y-0.5">
                    <p className="font-semibold">{c.authorHandle || c.authorName}</p>
                    <p>{c.body}</p>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={postComment} className="pt-2 border-t border-neutral-200 dark:border-[#383838] flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add comment..."
                className="flex-1 h-8 px-2.5 rounded-lg bg-neutral-100 dark:bg-[#121212] text-xs"
              />
              <button type="submit" className="h-8 px-3 rounded-lg bg-[#ff0033] text-white text-xs font-semibold cursor-pointer">
                Post
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Vertical Navigation Controls */}
      <div className="hidden sm:flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={safeIndex === 0}
          onClick={goPrev}
          aria-label="Previous Short"
          className="w-11 h-11 rounded-full bg-neutral-200 dark:bg-[#272727] hover:bg-neutral-300 dark:hover:bg-[#3f3f3f] disabled:opacity-35 flex items-center justify-center cursor-pointer"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
        <span className="text-xs text-center font-mono-nums text-[#606060] dark:text-[#aaaaaa]">
          {safeIndex + 1}/{visibleShorts.length}
        </span>
        <button
          type="button"
          disabled={safeIndex >= visibleShorts.length - 1 && !hasMore}
          onClick={goNext}
          aria-label="Next Short"
          className="w-11 h-11 rounded-full bg-neutral-200 dark:bg-[#272727] hover:bg-neutral-300 dark:hover:bg-[#3f3f3f] disabled:opacity-35 flex items-center justify-center cursor-pointer"
        >
          {loadingMore && safeIndex >= visibleShorts.length - 1 ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <ArrowDown className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Desktop Comments Side Panel */}
      {commentsOpen && (
        <div className="hidden md:flex flex-col w-80 h-full max-h-[780px] rounded-2xl bg-white dark:bg-[#212121] border border-neutral-200 dark:border-[#383838] p-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-[#383838]">
            <h3 className="font-bold text-sm">Comments</h3>
            <button type="button" onClick={() => setCommentsOpen(false)} className="text-xs hover:underline cursor-pointer">
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {comments.length === 0 ? (
              <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">Be the first to comment on this Short.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="text-xs space-y-0.5">
                  <p className="font-semibold">{c.authorHandle || c.authorName}</p>
                  <p className="text-[#0f0f0f] dark:text-[#f1f1f1]">{c.body}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={postComment} className="pt-2 border-t border-neutral-200 dark:border-[#383838] flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add comment..."
              className="flex-1 h-8 px-2.5 rounded-lg bg-neutral-100 dark:bg-[#121212] text-xs"
            />
            <button type="submit" className="h-8 px-3 rounded-lg bg-[#ff0033] text-white text-xs font-semibold cursor-pointer">
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
