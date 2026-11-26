import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
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
import type { DiscoveryStatus, UserProfile, VideoComment, VideoItem } from '../types';
import { apiFetch } from '../lib/api';
import { formatViews } from '../lib/format';

interface ShortsViewProps {
  shorts: VideoItem[];
  initialShortId?: string;
  user: UserProfile | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  discoveryStatus?: DiscoveryStatus | null;
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
  discoveryStatus,
  onLoadMore,
  onSubscriptionsChanged,
  onOpenAuth,
  onOpenChannel,
  onSavePlaylist,
  onShare,
  onToast,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [subscribedOverrides, setSubscribedOverrides] = useState<Record<string, boolean>>({});
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentText, setCommentText] = useState('');

  const feedRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const didScrollInitialRef = useRef(false);

  // Strict deduplication + exclude hidden Shorts
  const visibleShorts = useMemo(() => {
    const seen = new Set<string>();
    const out: VideoItem[] = [];
    for (const item of shorts) {
      if (hiddenIds.has(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }, [shorts, hiddenIds]);

  useEffect(() => {
    if (!initialShortId || visibleShorts.length === 0) return;
    const found = visibleShorts.findIndex((s) => s.id === initialShortId);
    if (found >= 0) {
      setActiveIndex(found);
      if (!didScrollInitialRef.current) {
        didScrollInitialRef.current = true;
        requestAnimationFrame(() => {
          slideRefs.current[found]?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        });
      }
    }
  }, [initialShortId, visibleShorts.length]);

  const safeIndex = Math.min(activeIndex, Math.max(0, visibleShorts.length - 1));
  const current = visibleShorts[safeIndex];

  // Track which Short slide is snapped into view using IntersectionObserver
  useEffect(() => {
    const root = feedRef.current;
    if (!root || visibleShorts.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            const idx = Number((entry.target as HTMLElement).dataset.shortIdx);
            if (Number.isFinite(idx)) {
              setActiveIndex(idx);
            }
          }
        }
      },
      { root, threshold: 0.65 }
    );
    slideRefs.current.forEach((node) => {
      if (node) obs.observe(node);
    });
    return () => obs.disconnect();
  }, [visibleShorts.length]);

  useEffect(() => {
    if (!current) return;
    setPlaying(true);
    window.history.replaceState({}, '', `/?shorts=${encodeURIComponent(current.id)}`);
    apiFetch('/api/events/watch', {
      method: 'POST',
      body: JSON.stringify({ videoId: current.id, eventType: 'start', progressPct: 0, watchDurationSec: 0 }),
    }).catch(() => {});
  }, [current?.id]);

  // Auto-load next batch of Shorts when user scrolls near the bottom
  useEffect(() => {
    if (!onLoadMore || !hasMore || loadingMore || visibleShorts.length === 0) return;
    if (safeIndex >= visibleShorts.length - 2) {
      onLoadMore();
    }
  }, [safeIndex, visibleShorts.length, hasMore, loadingMore, onLoadMore]);

  useEffect(() => {
    if (!current || !commentsOpen) return;
    apiFetch<{ comments: VideoComment[] }>(`/api/videos/${current.id}/comments`)
      .then((res) => setComments(res.comments))
      .catch(() => {});
  }, [current?.id, commentsOpen]);

  const scrollToIndex = (targetIdx: number) => {
    const clamped = Math.max(0, Math.min(visibleShorts.length - 1, targetIdx));
    const el = slideRefs.current[clamped];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveIndex(clamped);
  };

  const goNext = () => {
    if (current) {
      apiFetch('/api/events/skip', {
        method: 'POST',
        body: JSON.stringify({ videoId: current.id, watchDurationSec: 3 }),
      }).catch(() => {});
    }
    scrollToIndex(safeIndex + 1);
  };

  const goPrev = () => {
    scrollToIndex(safeIndex - 1);
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
  }, [safeIndex, visibleShorts.length]);

  if (!current) {
    const showDiscoveryNotice =
      discoveryStatus && (!discoveryStatus.configured || Boolean(discoveryStatus.issue));
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4">
        <AlertCircle className="w-8 h-8 mx-auto mb-3 text-[#536471] dark:text-[#71767b]" />
        <p className="text-base font-bold text-[#0f1419] dark:text-[#e7e9ea]">No Shorts available yet</p>
        <p className="text-sm text-[#536471] dark:text-[#71767b] mt-1.5">
          {showDiscoveryNotice
            ? discoveryStatus?.issue?.message ||
              'Configure EXTERNAL_VIDEO_API_KEY on your server to load external Shorts, or upload vertical videos in DopTube Studio.'
            : 'Upload a vertical video under 60 seconds in DopTube Studio to publish the first Short.'}
        </p>
      </div>
    );
  }

  const togglePlay = () => {
    const el = activeVideoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const handleLike = async (target: VideoItem) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    try {
      await apiFetch(`/api/videos/${target.id}/react`, {
        method: 'POST',
        body: JSON.stringify({ reaction: 'like' }),
      });
      apiFetch('/api/events/like', {
        method: 'POST',
        body: JSON.stringify({ videoId: target.id, reaction: 'like' }),
      }).catch(() => {});
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (next.has(target.id)) next.delete(target.id);
        else next.add(target.id);
        return next;
      });
    } catch {
      onToast('Could not update like.');
    }
  };

  const handleSubscribe = async (target: VideoItem) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    try {
      const res = await apiFetch<{ subscribed: boolean }>(`/api/channels/${target.channelId}/subscribe`, {
        method: 'POST',
      });
      setSubscribedOverrides((prev) => ({ ...prev, [target.channelId]: res.subscribed }));
      onSubscriptionsChanged?.();
      onToast(res.subscribed ? `Subscribed to ${target.channelName}` : `Unsubscribed from ${target.channelName}`);
    } catch {
      onToast('Could not update subscription.');
    }
  };

  const handleNotInterested = async (target: VideoItem) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    await apiFetch('/api/events/feedback', {
      method: 'POST',
      body: JSON.stringify({ videoId: target.id, feedbackType: 'not_interested' }),
    });
    setHiddenIds((prev) => new Set(prev).add(target.id));
    onToast('We will show fewer Shorts like this');
  };

  const handleBlockCreator = async (target: VideoItem) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    await apiFetch('/api/events/feedback', {
      method: 'POST',
      body: JSON.stringify({
        videoId: target.id,
        channelId: target.channelId,
        feedbackType: 'dont_recommend_creator',
      }),
    });
    setHiddenIds((prev) => new Set(prev).add(target.id));
    onToast(`Stopped recommending ${target.channelName}`);
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

  return (
    <div className="h-[calc(100dvh-7.25rem)] md:h-[calc(100vh-56px)] bg-white dark:bg-black flex items-center justify-center gap-4 px-2 sm:px-4">
      {/* Real Vertical Scroll-Snap Shorts Container */}
      <div
        ref={feedRef}
        className="h-full w-full max-w-[430px] overflow-y-auto snap-y snap-mandatory no-scrollbar rounded-2xl bg-black border border-[#e5e7eb] dark:border-[#2f3336]"
      >
        {visibleShorts.map((item, idx) => {
          const isCurrent = idx === safeIndex;
          const shouldMountMedia = Math.abs(idx - safeIndex) <= 1;
          const isLiked = likedIds.has(item.id);
          const isSubscribed = subscribedOverrides[item.channelId] ?? Boolean(item.isSubscribed);
          const isFailed = failedIds.has(item.id);

          return (
            <div
              key={item.id}
              data-short-idx={idx}
              ref={(el) => {
                slideRefs.current[idx] = el;
              }}
              className="relative h-full w-full snap-start snap-always flex items-center justify-center overflow-hidden bg-black"
            >
              {isFailed ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center bg-black text-white p-6 text-center">
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
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
                            next.delete(item.id);
                            return next;
                          })
                        }
                        className="h-8 px-4 rounded-full bg-white text-black text-xs font-bold cursor-pointer"
                      >
                        Retry
                      </button>
                      {idx < visibleShorts.length - 1 && (
                        <button
                          type="button"
                          onClick={goNext}
                          className="h-8 px-4 rounded-full bg-white/20 text-white text-xs font-bold cursor-pointer"
                        >
                          Next Short
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : !shouldMountMedia ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : item.sourceType === 'external' && item.externalEmbedUrl ? (
                <iframe
                  key={item.id}
                  src={isCurrent ? item.externalEmbedUrl : undefined}
                  title={item.title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <>
                  <video
                    key={item.id}
                    ref={(el) => {
                      if (isCurrent) activeVideoRef.current = el;
                    }}
                    src={item.videoUrl}
                    poster={item.thumbnailUrl}
                    autoPlay={isCurrent}
                    loop
                    muted={muted || !isCurrent}
                    playsInline
                    onClick={togglePlay}
                    onError={() => setFailedIds((prev) => new Set(prev).add(item.id))}
                    className="w-full h-full object-cover cursor-pointer"
                  />

                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={playing ? 'Pause Short' : 'Play Short'}
                      className="w-9 h-9 rounded-full bg-black/60 text-white border border-white/15 flex items-center justify-center cursor-pointer"
                    >
                      {playing ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMuted((m) => !m)}
                      aria-label={muted ? 'Unmute Short' : 'Mute Short'}
                      className="w-9 h-9 rounded-full bg-black/60 text-white border border-white/15 flex items-center justify-center cursor-pointer"
                    >
                      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>
                </>
              )}

              {/* Bottom Creator & Caption Scrim */}
              <div className="absolute inset-x-0 bottom-0 p-4 pr-16 bg-gradient-to-t from-black/95 via-black/55 to-transparent text-white pointer-events-auto">
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => onOpenChannel(item.channelId)}
                    className="flex items-center gap-2 cursor-pointer min-w-0"
                  >
                    <img
                      src={item.channelAvatar}
                      alt={item.channelName}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-white/20 shrink-0"
                    />
                    <span className="text-sm font-bold truncate max-w-[130px]">
                      {item.channelHandle || item.channelName}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubscribe(item)}
                    className={`h-7 px-3.5 rounded-full text-xs font-bold cursor-pointer shrink-0 ${
                      isSubscribed
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'bg-white text-black hover:bg-[#e7e9ea]'
                    }`}
                  >
                    {isSubscribed ? 'Subscribed' : 'Subscribe'}
                  </button>
                </div>
                <p className="text-sm font-medium line-clamp-2">{item.title}</p>
              </div>

              {/* Right Overlay Actions */}
              <div className="absolute right-2.5 bottom-24 flex flex-col items-center gap-2.5 text-white">
                <button
                  type="button"
                  onClick={() => handleLike(item)}
                  aria-label="Like Short"
                  className="flex flex-col items-center gap-1 cursor-pointer"
                >
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                      isLiked ? 'bg-white text-black border-white' : 'bg-black/65 text-white border-white/15'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-mono-nums">{formatViews(item.likes + (isLiked ? 1 : 0))}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCommentsOpen((v) => !v)}
                  aria-label="Comments"
                  className="flex flex-col items-center gap-1 cursor-pointer"
                >
                  <span className="w-10 h-10 rounded-full bg-black/65 border border-white/15 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4" />
                  </span>
                  <span className="text-[11px]">Comments</span>
                </button>

                <button
                  type="button"
                  onClick={() => (user ? onSavePlaylist(item.id) : onOpenAuth())}
                  aria-label="Save to playlist"
                  className="flex flex-col items-center gap-1 cursor-pointer"
                >
                  <span className="w-10 h-10 rounded-full bg-black/65 border border-white/15 flex items-center justify-center">
                    <ListPlus className="w-4 h-4" />
                  </span>
                  <span className="text-[11px]">Save</span>
                </button>

                <button
                  type="button"
                  onClick={() => onShare(item)}
                  aria-label="Share Short"
                  className="flex flex-col items-center gap-1 cursor-pointer"
                >
                  <span className="w-10 h-10 rounded-full bg-black/65 border border-white/15 flex items-center justify-center">
                    <Share2 className="w-4 h-4" />
                  </span>
                  <span className="text-[11px]">Share</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNotInterested(item)}
                  aria-label="Not interested"
                  title="Not interested"
                  className="w-9 h-9 rounded-full bg-black/65 border border-white/15 flex items-center justify-center cursor-pointer"
                >
                  <EyeOff className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleBlockCreator(item)}
                  aria-label="Don't recommend creator"
                  title="Don't recommend creator"
                  className="w-9 h-9 rounded-full bg-black/65 border border-white/15 flex items-center justify-center cursor-pointer"
                >
                  <Ban className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Vertical Prev/Next Controls */}
      <div className="hidden sm:flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={safeIndex === 0}
          onClick={goPrev}
          aria-label="Previous Short"
          className="w-11 h-11 rounded-full bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] hover:bg-[#e5e7eb] dark:hover:bg-[#202327] disabled:opacity-35 flex items-center justify-center cursor-pointer"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
        <span className="text-xs text-center font-mono-nums text-[#536471] dark:text-[#71767b]">
          {safeIndex + 1}/{visibleShorts.length}
        </span>
        <button
          type="button"
          disabled={safeIndex >= visibleShorts.length - 1 && !hasMore}
          onClick={goNext}
          aria-label="Next Short"
          className="w-11 h-11 rounded-full bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] hover:bg-[#e5e7eb] dark:hover:bg-[#202327] disabled:opacity-35 flex items-center justify-center cursor-pointer"
        >
          {loadingMore && safeIndex >= visibleShorts.length - 1 ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <ArrowDown className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Comments Side Panel / Mobile Drawer */}
      {commentsOpen && (
        <div className="fixed md:static inset-x-0 bottom-14 md:inset-auto z-30 flex flex-col w-full md:w-80 h-[55vh] md:h-full md:max-h-[780px] rounded-t-2xl md:rounded-2xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] p-4 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#e5e7eb] dark:border-[#2f3336]">
            <h3 className="font-bold text-sm">Comments</h3>
            <button
              type="button"
              onClick={() => setCommentsOpen(false)}
              aria-label="Close comments"
              className="p-1 rounded-full hover:bg-[#eff3f4] dark:hover:bg-[#202327] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {comments.length === 0 ? (
              <p className="text-xs text-[#536471] dark:text-[#71767b]">Be the first to comment on this Short.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="text-xs space-y-0.5">
                  <p className="font-semibold">{c.authorHandle || c.authorName}</p>
                  <p className="text-[#0f1419] dark:text-[#e7e9ea]">{c.body}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={postComment} className="pt-2 border-t border-[#e5e7eb] dark:border-[#2f3336] flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add comment..."
              className="flex-1 h-9 px-3 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-xs focus:outline-none"
            />
            <button
              type="submit"
              className="h-9 px-4 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-xs font-bold cursor-pointer"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
