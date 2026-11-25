import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, MessageCircle, Pause, Play, Share2, ThumbsUp, Volume2, VolumeX } from 'lucide-react';
import type { UserProfile, VideoComment, VideoItem } from '../types';
import { apiFetch } from '../lib/api';
import { formatViews } from '../lib/format';

interface ShortsViewProps {
  shorts: VideoItem[];
  initialShortId?: string;
  user: UserProfile | null;
  onOpenAuth: () => void;
  onOpenChannel: (channelId: string) => void;
  onShare: (video: VideoItem) => void;
  onToast: (msg: string) => void;
}

export const ShortsView: React.FC<ShortsViewProps> = ({
  shorts,
  initialShortId,
  user,
  onOpenAuth,
  onOpenChannel,
  onShare,
  onToast,
}) => {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!initialShortId || shorts.length === 0) return;
    const found = shorts.findIndex((s) => s.id === initialShortId);
    if (found >= 0) setIndex(found);
  }, [initialShortId, shorts]);

  const current = shorts[index];

  useEffect(() => {
    if (!current || !commentsOpen) return;
    apiFetch<{ comments: VideoComment[] }>(`/api/videos/${current.id}/comments`)
      .then((res) => setComments(res.comments))
      .catch(() => {});
  }, [current?.id, commentsOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(shorts.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shorts.length]);

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

  return (
    <div className="h-[calc(100vh-56px)] flex items-center justify-center gap-4 px-4 py-4 pb-20 md:pb-6">
      <div className="relative h-full max-h-[780px] aspect-[9/16] rounded-2xl overflow-hidden bg-black shadow-2xl">
        {current.sourceType === 'external' && current.externalEmbedUrl ? (
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

        {/* Bottom Creator & Caption Scrim */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-white">
          <div className="flex items-center gap-2.5 mb-2">
            <button
              type="button"
              onClick={() => onOpenChannel(current.channelId)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <img
                src={current.channelAvatar}
                alt={current.channelName}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover"
              />
              <span className="text-sm font-semibold">{current.channelHandle}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenChannel(current.channelId)}
              className="h-7 px-3 rounded-full bg-white text-[#0f0f0f] text-xs font-semibold cursor-pointer"
            >
              Visit
            </button>
          </div>
          <p className="text-sm font-medium line-clamp-2 pr-12">{current.title}</p>
        </div>

        {/* Right Overlay Actions */}
        <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 text-white">
          <button type="button" onClick={handleLike} className="flex flex-col items-center gap-1 cursor-pointer">
            <span className={`w-11 h-11 rounded-full flex items-center justify-center ${isLiked ? 'bg-[#ff0033]' : 'bg-black/55'}`}>
              <ThumbsUp className="w-5 h-5" />
            </span>
            <span className="text-xs font-mono-nums">{formatViews(current.likes + (isLiked ? 1 : 0))}</span>
          </button>

          <button type="button" onClick={() => setCommentsOpen((v) => !v)} className="flex flex-col items-center gap-1 cursor-pointer">
            <span className="w-11 h-11 rounded-full bg-black/55 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </span>
            <span className="text-xs">Comments</span>
          </button>

          <button type="button" onClick={() => onShare(current)} className="flex flex-col items-center gap-1 cursor-pointer">
            <span className="w-11 h-11 rounded-full bg-black/55 flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </span>
            <span className="text-xs">Share</span>
          </button>
        </div>
      </div>

      {/* Vertical Navigation Controls */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          aria-label="Previous Short"
          className="w-11 h-11 rounded-full bg-neutral-200 dark:bg-[#272727] hover:bg-neutral-300 dark:hover:bg-[#3f3f3f] disabled:opacity-35 flex items-center justify-center cursor-pointer"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
        <span className="text-xs text-center font-mono-nums text-[#606060] dark:text-[#aaaaaa]">
          {index + 1}/{shorts.length}
        </span>
        <button
          type="button"
          disabled={index === shorts.length - 1}
          onClick={() => setIndex((i) => Math.min(shorts.length - 1, i + 1))}
          aria-label="Next Short"
          className="w-11 h-11 rounded-full bg-neutral-200 dark:bg-[#272727] hover:bg-neutral-300 dark:hover:bg-[#3f3f3f] disabled:opacity-35 flex items-center justify-center cursor-pointer"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      </div>

      {/* Comments Side Panel */}
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
