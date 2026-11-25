import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  ListPlus,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import type { UserProfile, VideoComment, VideoItem } from '../types';
import { apiFetch } from '../lib/api';
import { formatRelativeTime, formatViews } from '../lib/format';
import { VideoCard } from '../components/VideoCard';
import { VideoPlayer } from '../components/VideoPlayer';

interface WatchViewProps {
  videoId: string;
  user: UserProfile | null;
  onWatch: (videoId: string) => void;
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
  onWatch,
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

  const [commentBody, setCommentBody] = useState('');
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDescExpanded(false);

    Promise.all([
      apiFetch<{ video: VideoItem; related: VideoItem[] }>(`/api/videos/${videoId}`),
      apiFetch<{ comments: VideoComment[] }>(`/api/videos/${videoId}/comments`),
    ])
      .then(([vRes, cRes]) => {
        if (cancelled) return;
        setVideo(vRes.video);
        setRelated(vRes.related);
        setComments(cRes.comments);
      })
      .catch(() => {
        if (!cancelled) setVideo(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

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

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
        <div className="lg:col-span-2 space-y-4">
          <div className="aspect-video rounded-xl bg-neutral-200 dark:bg-[#222222]" />
          <div className="h-6 bg-neutral-200 dark:bg-[#222222] rounded w-3/4" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-neutral-200 dark:bg-[#222222]" />
          ))}
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold">Video unavailable</p>
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-1">This video may have been removed or set to private.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 pb-20">
      {theaterMode && (
        <div className="mb-5">
          <VideoPlayer
            video={video}
            theaterMode
            onToggleTheater={() => setTheaterMode(false)}
            onMinimize={() => onMinimize(video)}
            onProgressSave={handleProgressSave}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Column */}
        <div className="lg:col-span-8 min-w-0">
          {!theaterMode && (
            <VideoPlayer
              video={video}
              onToggleTheater={() => setTheaterMode(true)}
              onMinimize={() => onMinimize(video)}
              onProgressSave={handleProgressSave}
            />
          )}

          <h1 className="mt-3.5 text-[18px] sm:text-[20px] font-bold leading-snug text-[#0f0f0f] dark:text-[#f1f1f1]">
            {video.title}
          </h1>

          {/* Channel Info + Action Controls */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => onOpenChannel(video.channelId)}
                className="w-10 h-10 rounded-full overflow-hidden shrink-0 cursor-pointer"
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
                <p className="text-xs text-[#606060] dark:text-[#aaaaaa] font-mono-nums">
                  {formatViews(video.subscriberCount)} subscribers
                </p>
              </div>
              <button
                type="button"
                onClick={handleSubscribe}
                className={`h-9 px-4 rounded-full text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  video.isSubscribed
                    ? 'bg-neutral-200 dark:bg-[#272727] text-[#0f0f0f] dark:text-[#f1f1f1] hover:bg-neutral-300 dark:hover:bg-[#3f3f3f]'
                    : 'bg-[#0f0f0f] dark:bg-[#f1f1f1] text-white dark:text-[#0f0f0f] hover:opacity-90'
                }`}
              >
                {video.isSubscribed ? 'Subscribed' : 'Subscribe'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Like / Dislike Pill */}
              <div className="inline-flex items-center h-9 rounded-full bg-neutral-100 dark:bg-[#272727] overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleReact('like')}
                  className={`h-full px-3.5 flex items-center gap-2 text-sm font-medium hover:bg-neutral-200 dark:hover:bg-[#3f3f3f] cursor-pointer ${
                    video.userReaction === 'like' ? 'text-[#065fd4] dark:text-[#3ea6ff]' : ''
                  }`}
                >
                  <ThumbsUp className={`w-4 h-4 ${video.userReaction === 'like' ? 'fill-current' : ''}`} />
                  <span className="font-mono-nums">{formatViews(video.likes)}</span>
                </button>
                <span className="w-px h-5 bg-neutral-300 dark:bg-[#444]" />
                <button
                  type="button"
                  onClick={() => handleReact('dislike')}
                  aria-label="Dislike"
                  className={`h-full px-3 flex items-center hover:bg-neutral-200 dark:hover:bg-[#3f3f3f] cursor-pointer ${
                    video.userReaction === 'dislike' ? 'text-[#ff0033]' : ''
                  }`}
                >
                  <ThumbsDown className={`w-4 h-4 ${video.userReaction === 'dislike' ? 'fill-current' : ''}`} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => onShare(video)}
                className="h-9 px-3.5 rounded-full bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3f3f3f] text-sm font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>

              <button
                type="button"
                onClick={handleWatchLater}
                className={`h-9 px-3.5 rounded-full text-sm font-medium flex items-center gap-1.5 cursor-pointer ${
                  video.inWatchLater
                    ? 'bg-[#3ea6ff]/20 text-[#065fd4] dark:text-[#3ea6ff]'
                    : 'bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3f3f3f]'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{video.inWatchLater ? 'Saved' : 'Watch later'}</span>
              </button>

              <button
                type="button"
                onClick={() => (user ? onSavePlaylist(video.id) : onOpenAuth())}
                className="h-9 px-3.5 rounded-full bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3f3f3f] text-sm font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <ListPlus className="w-4 h-4" />
                <span>Save</span>
              </button>

              <button
                type="button"
                onClick={() => onReport(video)}
                aria-label="Report video"
                className="h-9 px-3 rounded-full bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3f3f3f] text-sm font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Flag className="w-4 h-4" />
                <span className="hidden sm:inline">Report</span>
              </button>

              {video.sourceType === 'external' && video.externalOriginalUrl && (
                <a
                  href={video.externalOriginalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-9 px-3.5 rounded-full bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3f3f3f] text-sm font-medium flex items-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Original Source</span>
                </a>
              )}
            </div>
          </div>

          {/* Expandable Description Box */}
          <div className="mt-4 p-3.5 rounded-xl bg-neutral-100 dark:bg-[#272727] text-sm">
            <div className="flex flex-wrap items-center gap-2 font-semibold text-[13px] font-mono-nums mb-1.5">
              <span>{formatViews(video.views)} views</span>
              <span>·</span>
              <span>{formatRelativeTime(video.createdAt)}</span>
              <span>·</span>
              <span>{video.category}</span>
              <span>·</span>
              <span>{video.language}</span>
            </div>
            <p className={`whitespace-pre-line text-[#0f0f0f] dark:text-[#f1f1f1] ${descExpanded ? '' : 'line-clamp-2'}`}>
              {video.description || 'Published on DopTube India.'}
            </p>
            {video.tags.length > 0 && descExpanded && (
              <p className="mt-2.5 text-xs text-[#065fd4] dark:text-[#3ea6ff] flex flex-wrap gap-2">
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
              <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-[#272727] overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold">
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
                  className="w-full pb-2 bg-transparent border-b border-neutral-300 dark:border-[#3e3e3e] focus:border-[#0f0f0f] dark:focus:border-white text-sm focus:outline-none"
                />
                {commentBody.trim() && (
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCommentBody('')}
                      className="h-8 px-3.5 rounded-full text-xs font-medium hover:bg-neutral-200 dark:hover:bg-[#272727] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="h-8 px-4 rounded-full bg-[#065fd4] dark:bg-[#3ea6ff] text-white dark:text-[#0f0f0f] text-xs font-semibold cursor-pointer"
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
                      <span className="font-semibold text-[#0f0f0f] dark:text-[#f1f1f1]">
                        {c.authorHandle || c.authorName}
                      </span>
                      <span className="text-[#606060] dark:text-[#aaaaaa]">{formatRelativeTime(c.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed">{c.body}</p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setReplyTargetId(replyTargetId === c.id ? null : c.id)}
                        className="text-xs font-semibold text-[#606060] dark:text-[#aaaaaa] hover:text-[#0f0f0f] dark:hover:text-white cursor-pointer"
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
                          className="flex-1 pb-1 bg-transparent border-b border-neutral-300 dark:border-[#3e3e3e] text-sm focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => submitReply(c.id)}
                          className="h-7 px-3 rounded-full bg-[#3ea6ff] text-[#0f0f0f] text-xs font-semibold cursor-pointer"
                        >
                          Reply
                        </button>
                      </div>
                    )}

                    {c.replies.length > 0 && (
                      <div className="mt-3 space-y-3 pl-2 border-l border-neutral-200 dark:border-[#303030]">
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
                                <span className="text-[#606060] dark:text-[#aaaaaa]">{formatRelativeTime(r.createdAt)}</span>
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

        {/* Related Videos Column */}
        <aside className="lg:col-span-4 space-y-3">
          <h2 className="text-sm font-bold text-[#606060] dark:text-[#aaaaaa] mb-2">Up next on DopTube</h2>
          {related.map((rv) => (
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
        </aside>
      </div>
    </div>
  );
};
