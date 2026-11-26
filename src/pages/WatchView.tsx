import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Flag,
  ListMusic,
  ListPlus,
  Play,
  Repeat,
  Share2,
  Shuffle,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import type { UserProfile, VideoComment, VideoItem } from '../types';
import { apiFetch } from '../lib/api';
import { formatRelativeTime, formatViews } from '../lib/format';
import { VideoCard } from '../components/VideoCard';
import { VideoPlayer, type PlayerBehaviorEvent } from '../components/VideoPlayer';

interface WatchViewProps {
  videoId: string;
  user: UserProfile | null;
  autoplayEnabled: boolean;
  autoplayMode: 'recommended' | 'playlist' | 'queue' | 'repeat';
  activePlaylistId: string;
  queue: VideoItem[];
  onToggleAutoplay: () => void;
  onChangeAutoplayMode: (mode: 'recommended' | 'playlist' | 'queue' | 'repeat') => void;
  onQueueChanged: () => void;
  onWatch: (videoId: string, video?: VideoItem) => void;
  onRedirectToShort?: (video: VideoItem) => void;
  onOpenChannel: (channelId: string) => void;
  onOpenAuth: () => void;
  onSavePlaylist: (videoId: string) => void;
  onShare: (video: VideoItem) => void;
  onReport: (video: VideoItem) => void;
  onMinimize: (video: VideoItem) => void;
  onToast: (msg: string) => void;
  onSubscriptionsChanged: () => void;
}

export const WatchView: React.FC<WatchViewProps> = ({
  videoId,
  user,
  autoplayEnabled,
  autoplayMode,
  activePlaylistId,
  queue,
  onToggleAutoplay,
  onChangeAutoplayMode,
  onQueueChanged,
  onWatch,
  onRedirectToShort,
  onOpenChannel,
  onOpenAuth,
  onSavePlaylist,
  onShare,
  onReport,
  onMinimize,
  onToast,
  onSubscriptionsChanged,
}) => {
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [related, setRelated] = useState<VideoItem[]>([]);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [theaterMode, setTheaterMode] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [relatedFilter, setRelatedFilter] = useState<'all' | 'creator' | 'related'>('all');

  // Autoplay 5-second countdown state
  const [nextUp, setNextUp] = useState<{ video: VideoItem; countdown: number } | null>(null);
  const startWatchTsRef = useRef<number>(Date.now());
  const completedRef = useRef<boolean>(false);

  const [commentBody, setCommentBody] = useState('');
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDescExpanded(false);
    setNextUp(null);
    startWatchTsRef.current = Date.now();
    completedRef.current = false;

    Promise.all([
      apiFetch<{ video: VideoItem; related: VideoItem[] }>(`/api/videos/${videoId}`),
      apiFetch<{ comments: VideoComment[] }>(`/api/videos/${videoId}/comments`),
      apiFetch<{ videos: VideoItem[] }>(`/api/recommendations/related/${videoId}`).catch(() => ({ videos: [] })),
    ])
      .then(([vRes, cRes, recRelated]) => {
        if (cancelled) return;
        if (vRes.video?.isShort && onRedirectToShort) {
          onRedirectToShort(vRes.video);
          return;
        }
        setVideo(vRes.video);
        setRelated(recRelated.videos.length > 0 ? recRelated.videos : vRes.related);
        setComments(cRes.comments);
      })
      .catch(() => {
        if (!cancelled) setVideo(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      // Emit skip event if viewer exits quickly (< 12s) without completing
      const watchedSec = Math.floor((Date.now() - startWatchTsRef.current) / 1000);
      if (!completedRef.current && watchedSec > 1 && watchedSec < 12) {
        apiFetch('/api/events/skip', {
          method: 'POST',
          body: JSON.stringify({ videoId, watchDurationSec: watchedSec }),
        }).catch(() => {});
      }
      cancelled = true;
    };
  }, [videoId, onRedirectToShort]);

  // Countdown tick for Next Video Autoplay
  useEffect(() => {
    if (!nextUp) return;
    if (nextUp.countdown <= 0) {
      const targetVideo = nextUp.video;
      setNextUp(null);
      onWatch(targetVideo.id, targetVideo);
      return;
    }
    const timer = setTimeout(() => {
      setNextUp((prev) => (prev ? { ...prev, countdown: prev.countdown - 1 } : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [nextUp, onWatch]);

  const handleEndedNext = useCallback(async () => {
    if (!autoplayEnabled || !video) return;
    try {
      const res = await apiFetch<{ nextVideo: VideoItem | null; source: string }>(
        `/api/recommendations/next-video?currentVideoId=${encodeURIComponent(video.id)}&mode=${encodeURIComponent(
          autoplayMode
        )}&playlistId=${encodeURIComponent(activePlaylistId)}`
      );
      if (res.nextVideo) {
        setNextUp({ video: res.nextVideo, countdown: 5 });
      }
    } catch {
      const fallback = related.find((r) => r.id !== video.id);
      if (fallback) setNextUp({ video: fallback, countdown: 5 });
    }
  }, [autoplayEnabled, autoplayMode, activePlaylistId, video, related]);

  const handleBehaviorEvent = useCallback(
    (eventType: PlayerBehaviorEvent, progressPct: number, watchDurationSec: number) => {
      if (!video) return;
      if (eventType === 'completion') completedRef.current = true;
      apiFetch('/api/events/watch', {
        method: 'POST',
        body: JSON.stringify({ videoId: video.id, eventType, progressPct, watchDurationSec }),
      }).catch(() => {});
    },
    [video]
  );

  const handleReact = async (reaction: 'like' | 'dislike') => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!video) return;
    try {
      const next = video.userReaction === reaction ? 'none' : reaction;
      const res = await apiFetch<{ userReaction: 'like' | 'dislike' | null; likes: number; dislikes: number }>(
        `/api/videos/${video.id}/react`,
        { method: 'POST', body: JSON.stringify({ reaction: next }) }
      );
      setVideo((prev) => (prev ? { ...prev, ...res } : prev));
      if (next !== 'none') {
        apiFetch('/api/events/like', {
          method: 'POST',
          body: JSON.stringify({ videoId: video.id, reaction: next }),
        }).catch(() => {});
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const handleSubscribe = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!video) return;
    try {
      const res = await apiFetch<{ subscribed: boolean; subscriberCount: number }>(
        `/api/channels/${video.channelId}/subscribe`,
        { method: 'POST' }
      );
      setVideo((prev) => (prev ? { ...prev, isSubscribed: res.subscribed, subscriberCount: res.subscriberCount } : prev));
      onSubscriptionsChanged();
      onToast(res.subscribed ? `Subscribed to ${video.channelName}` : `Unsubscribed from ${video.channelName}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Subscription update failed.');
    }
  };

  const handleWatchLater = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!video) return;
    try {
      const res = await apiFetch<{ saved: boolean }>(`/api/watch-later/${video.id}`, { method: 'POST' });
      setVideo((prev) => (prev ? { ...prev, inWatchLater: res.saved } : prev));
      onToast(res.saved ? 'Saved to Watch later' : 'Removed from Watch later');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed.');
    }
  };

  const handleProgressSave = (progressSec: number) => {
    if (!user || !video) return;
    apiFetch('/api/history', {
      method: 'POST',
      body: JSON.stringify({ videoId: video.id, progressSec }),
    }).catch(() => {});
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!video || !commentBody.trim()) return;
    try {
      await apiFetch(`/api/videos/${video.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      setCommentBody('');
      const refreshed = await apiFetch<{ comments: VideoComment[] }>(`/api/videos/${video.id}/comments`);
      setComments(refreshed.comments);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to post comment.');
    }
  };

  const submitReply = async (commentId: string) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!video || !replyBody.trim()) return;
    try {
      await apiFetch(`/api/comments/${commentId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      setReplyTargetId(null);
      setReplyBody('');
      const refreshed = await apiFetch<{ comments: VideoComment[] }>(`/api/videos/${video.id}/comments`);
      setComments(refreshed.comments);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to post reply.');
    }
  };

  const shuffleQueue = async () => {
    if (queue.length < 2) return;
    const shuffled = [...queue].sort(() => Math.random() - 0.5).map((v) => v.id);
    await apiFetch('/api/queue/reorder', {
      method: 'PUT',
      body: JSON.stringify({ videoIds: shuffled }),
    });
    onQueueChanged();
    onToast('Queue shuffled');
  };

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
        <div className="lg:col-span-2 space-y-4">
          <div className="aspect-video rounded-xl bg-[#eff3f4] dark:bg-[#16181c]" />
          <div className="h-6 bg-[#eff3f4] dark:bg-[#16181c] rounded w-3/4" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-[#eff3f4] dark:bg-[#16181c]" />
          ))}
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="py-20 text-center px-4">
        <p className="text-lg font-bold">Video unavailable</p>
        <p className="text-sm text-[#536471] dark:text-[#71767b] mt-1">
          This video may have been removed, set to private, or temporarily failed to load.
        </p>
        <button
          type="button"
          onClick={() => onWatch(videoId)}
          className="mt-4 h-9 px-5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-xs font-bold cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const filteredRelated = related.filter((rv) => {
    if (relatedFilter === 'creator') return rv.channelId === video.channelId;
    if (relatedFilter === 'related') return rv.category === video.category;
    return true;
  });

  const playerNode = (
    <div className="relative">
      <VideoPlayer
        video={video}
        theaterMode={theaterMode}
        onToggleTheater={() => setTheaterMode((v) => !v)}
        onMinimize={() => onMinimize(video)}
        onProgressSave={handleProgressSave}
        onBehaviorEvent={handleBehaviorEvent}
        onEndedNext={handleEndedNext}
      />

      {/* 5-Second Autoplay Next Video Countdown Overlay */}
      {nextUp && (
        <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:rounded-xl">
          <div className="w-full max-w-sm rounded-2xl bg-[#16181c] text-white border border-[#2f3336] p-4 space-y-3 shadow-2xl">
            <p className="text-xs font-bold tracking-wider text-white font-mono-nums">
              NEXT VIDEO IN {nextUp.countdown}
            </p>
            <div className="flex items-center gap-3">
              <img
                src={nextUp.video.thumbnailUrl}
                alt={nextUp.video.title}
                referrerPolicy="no-referrer"
                className="w-28 aspect-video rounded-lg object-cover shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold line-clamp-2">{nextUp.video.title}</p>
                <p className="text-xs text-[#71767b] truncate mt-0.5">{nextUp.video.channelName}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNextUp(null)}
                className="h-8 px-4 rounded-full bg-[#202327] hover:bg-[#2f3336] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = nextUp.video;
                  setNextUp(null);
                  onWatch(target.id, target);
                }}
                className="h-8 px-4 rounded-full bg-white text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Play now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto sm:px-6 sm:py-4 pb-24">
      {theaterMode && <div className="mb-5">{playerNode}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Column */}
        <div className="lg:col-span-8 min-w-0">
          {!theaterMode && playerNode}

          <div className="px-3 sm:px-0">
            <h1 className="mt-3.5 text-[18px] sm:text-[20px] font-bold leading-snug text-[#0f1419] dark:text-[#e7e9ea]">
              {video.title}
            </h1>

            {/* Channel Info + Action Controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenChannel(video.channelId)}
                  className="w-10 h-10 rounded-full overflow-hidden shrink-0 cursor-pointer border border-[#e5e7eb] dark:border-[#2f3336]"
                >
                  <img
                    src={video.channelAvatar}
                    alt={video.channelName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
                <div className="min-w-0 mr-2">
                  <button
                    type="button"
                    onClick={() => onOpenChannel(video.channelId)}
                    className="font-semibold text-[15px] flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <span className="truncate">{video.channelName}</span>
                    {video.channelVerified && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                  <p className="text-xs text-[#536471] dark:text-[#71767b] font-mono-nums">
                    {formatViews(video.subscriberCount)} subscribers
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSubscribe}
                  className={`h-9 px-4 rounded-full text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    video.isSubscribed
                      ? 'bg-[#eff3f4] dark:bg-[#202327] text-[#0f1419] dark:text-[#e7e9ea] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336]'
                      : 'bg-[#0f1419] dark:bg-white text-white dark:text-black hover:opacity-90'
                  }`}
                >
                  {video.isSubscribed ? 'Subscribed' : 'Subscribe'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Like / Dislike Pill */}
                <div className="inline-flex items-center h-9 rounded-full bg-[#eff3f4] dark:bg-[#202327] border border-[#e5e7eb] dark:border-[#2f3336] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleReact('like')}
                    className={`h-full px-3.5 flex items-center gap-2 text-sm font-medium hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336] cursor-pointer ${
                      video.userReaction === 'like' ? 'font-bold text-[#0f1419] dark:text-white' : ''
                    }`}
                  >
                    <ThumbsUp className={`w-4 h-4 ${video.userReaction === 'like' ? 'fill-current' : ''}`} />
                    <span className="font-mono-nums">{formatViews(video.likes)}</span>
                  </button>
                  <span className="w-px h-5 bg-[#d0d7de] dark:bg-[#2f3336]" />
                  <button
                    type="button"
                    onClick={() => handleReact('dislike')}
                    aria-label="Dislike"
                    className={`h-full px-3 flex items-center hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336] cursor-pointer ${
                      video.userReaction === 'dislike' ? 'font-bold text-[#0f1419] dark:text-white' : ''
                    }`}
                  >
                    <ThumbsDown className={`w-4 h-4 ${video.userReaction === 'dislike' ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    apiFetch('/api/events/share', {
                      method: 'POST',
                      body: JSON.stringify({ videoId: video.id }),
                    }).catch(() => {});
                    onShare(video);
                  }}
                  className="h-9 px-3.5 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336] text-sm font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>

                <button
                  type="button"
                  onClick={handleWatchLater}
                  className={`h-9 px-3.5 rounded-full text-sm font-medium flex items-center gap-1.5 cursor-pointer ${
                    video.inWatchLater
                      ? 'bg-[#0f1419] dark:bg-white text-white dark:text-black font-bold'
                      : 'bg-[#eff3f4] dark:bg-[#202327] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336]'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>{video.inWatchLater ? 'Saved' : 'Watch later'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => (user ? onSavePlaylist(video.id) : onOpenAuth())}
                  className="h-9 px-3.5 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336] text-sm font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <ListPlus className="w-4 h-4" />
                  <span>Save</span>
                </button>

                <button
                  type="button"
                  onClick={() => onReport(video)}
                  aria-label="Report video"
                  className="h-9 px-3 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336] text-sm font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Flag className="w-4 h-4" />
                  <span className="hidden sm:inline">Report</span>
                </button>
              </div>
            </div>

            {/* Expandable Description Box */}
            <div className="mt-4 p-3.5 rounded-xl bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm">
              <div className="flex flex-wrap items-center gap-2 font-semibold text-[13px] font-mono-nums mb-1.5">
                <span>{formatViews(video.views)} views</span>
                <span>·</span>
                <span>{formatRelativeTime(video.createdAt)}</span>
                <span>·</span>
                <span>{video.category}</span>
                <span>·</span>
                <span>{video.language}</span>
              </div>
              <p className={`whitespace-pre-line text-[#0f1419] dark:text-[#e7e9ea] ${descExpanded ? '' : 'line-clamp-2'}`}>
                {video.description || 'Streaming on DopTube India.'}
              </p>
              {video.tags.length > 0 && descExpanded && (
                <p className="mt-2.5 text-xs text-[#536471] dark:text-[#71767b] flex flex-wrap gap-2">
                  {video.tags.map((tag) => (
                    <span key={tag}>#{tag.replace(/\s+/g, '')}</span>
                  ))}
                </p>
              )}
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-1.5 text-xs font-semibold hover:underline cursor-pointer"
              >
                {descExpanded ? 'Show less' : '...more'}
              </button>
            </div>

            {/* Comments Section */}
            <section className="mt-6">
              <h2 className="text-lg font-bold mb-4 font-mono-nums">{comments.length} Comments</h2>

              <form onSubmit={submitComment} className="flex items-start gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-[#eff3f4] dark:bg-[#16181c] overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold">
                  {user ? (
                    <img src={user.avatarUrl} alt={user.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    'DT'
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={commentBody}
                    onFocus={() => {
                      if (!user) onOpenAuth();
                    }}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full pb-2 bg-transparent border-b border-[#e5e7eb] dark:border-[#2f3336] focus:border-[#0f1419] dark:focus:border-white text-sm focus:outline-none"
                  />
                  {commentBody.trim() && (
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setCommentBody('')}
                        className="h-8 px-3.5 rounded-full text-xs font-medium hover:bg-[#eff3f4] dark:hover:bg-[#16181c] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="h-8 px-4 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-xs font-bold cursor-pointer"
                      >
                        Comment
                      </button>
                    </div>
                  )}
                </div>
              </form>

              <div className="space-y-5">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-3">
                    <img
                      src={c.authorAvatar}
                      alt={c.authorName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-[#0f1419] dark:text-[#e7e9ea]">
                          {c.authorHandle || c.authorName}
                        </span>
                        <span className="text-[#536471] dark:text-[#71767b]">{formatRelativeTime(c.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed">{c.body}</p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setReplyTargetId(replyTargetId === c.id ? null : c.id)}
                          className="text-xs font-semibold text-[#536471] dark:text-[#71767b] hover:text-[#0f1419] dark:hover:text-white cursor-pointer"
                        >
                          Reply
                        </button>
                      </div>

                      {replyTargetId === c.id && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            placeholder="Add a reply..."
                            className="flex-1 pb-1 bg-transparent border-b border-[#e5e7eb] dark:border-[#2f3336] text-sm focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => submitReply(c.id)}
                            className="h-7 px-3 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-xs font-bold cursor-pointer"
                          >
                            Reply
                          </button>
                        </div>
                      )}

                      {c.replies.length > 0 && (
                        <div className="mt-3 space-y-3 pl-2 border-l border-[#e5e7eb] dark:border-[#2f3336]">
                          {c.replies.map((r) => (
                            <div key={r.id} className="flex items-start gap-2.5">
                              <img
                                src={r.authorAvatar}
                                alt={r.authorName}
                                referrerPolicy="no-referrer"
                                className="w-6 h-6 rounded-full object-cover shrink-0"
                              />
                              <div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="font-semibold">{r.authorHandle || r.authorName}</span>
                                  <span className="text-[#536471] dark:text-[#71767b]">{formatRelativeTime(r.createdAt)}</span>
                                </div>
                                <p className="text-sm mt-0.5">{r.body}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Up Next / Queue / Related Videos Column */}
        <aside className="lg:col-span-4 px-3 sm:px-0 space-y-4">
          {/* Autoplay & Mode Controls */}
          <div className="p-3.5 rounded-xl bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Up next on DopTube</span>
              <button
                type="button"
                onClick={onToggleAutoplay}
                aria-pressed={autoplayEnabled}
                className={`h-7 px-3 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                  autoplayEnabled
                    ? 'bg-[#0f1419] dark:bg-white text-white dark:text-black'
                    : 'bg-white dark:bg-[#202327] text-[#536471] dark:text-[#71767b]'
                }`}
              >
                Autoplay: {autoplayEnabled ? 'On' : 'Off'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['recommended', 'Recommended'],
                  ['queue', 'Queue'],
                  ['playlist', 'Playlist'],
                  ['repeat', 'Repeat'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChangeAutoplayMode(m)}
                  className={`h-7 px-2.5 rounded-full text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                    autoplayMode === m
                      ? 'bg-[#0f1419] dark:bg-white text-white dark:text-black'
                      : 'bg-white dark:bg-[#202327] text-[#536471] dark:text-[#e7e9ea]'
                  }`}
                >
                  {m === 'repeat' && <Repeat className="w-3 h-3" />}
                  {m === 'queue' && <ListMusic className="w-3 h-3" />}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Active Queue Panel */}
          {queue.length > 0 && (
            <div className="p-3.5 rounded-xl border border-[#e5e7eb] dark:border-[#2f3336] space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#606060] dark:text-[#aaaaaa]">
                  Queue ({queue.length})
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={shuffleQueue}
                    className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-[#272727] cursor-pointer"
                    title="Shuffle queue"
                    aria-label="Shuffle queue"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch('/api/queue', { method: 'DELETE' });
                      onQueueChanged();
                    }}
                    className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-[#272727] text-red-500 cursor-pointer"
                    title="Clear queue"
                    aria-label="Clear queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {queue.map((qv) => (
                  <div key={qv.id} className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onWatch(qv.id, qv)}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left hover:underline cursor-pointer"
                    >
                      <img
                        src={qv.thumbnailUrl}
                        alt={qv.title}
                        referrerPolicy="no-referrer"
                        className="w-16 aspect-video rounded object-cover shrink-0"
                      />
                      <span className="truncate font-medium">{qv.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/queue/${qv.id}`, { method: 'DELETE' });
                        onQueueChanged();
                      }}
                      aria-label={`Remove ${qv.title} from queue`}
                      className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-[#333] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Video Filter Chips */}
          <div className="flex items-center gap-2">
            {(
              [
                ['all', 'All'],
                ['creator', `From ${video.channelName}`],
                ['related', 'Related'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setRelatedFilter(val)}
                className={`h-8 px-3.5 rounded-full text-xs font-semibold truncate max-w-[160px] cursor-pointer ${
                  relatedFilter === val
                    ? 'bg-[#0f1419] dark:bg-white text-white dark:text-black'
                    : 'bg-[#eff3f4] dark:bg-[#202327] text-[#0f1419] dark:text-[#e7e9ea]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Related List */}
          <div className="space-y-3">
            {filteredRelated.map((rv) => (
              <VideoCard
                key={rv.id}
                video={rv}
                layout="compact"
                onWatch={onWatch}
                onOpenChannel={onOpenChannel}
                onSaveWatchLater={async (rid) => {
                  if (!user) {
                    onOpenAuth();
                    return;
                  }
                  const res = await apiFetch<{ saved: boolean }>(`/api/watch-later/${rid}`, { method: 'POST' });
                  onToast(res.saved ? 'Saved to Watch later' : 'Removed from Watch later');
                }}
                onSavePlaylist={onSavePlaylist}
                onShare={onShare}
                onReport={onReport}
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
