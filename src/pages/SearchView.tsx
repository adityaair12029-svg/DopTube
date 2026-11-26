import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Loader2, SlidersHorizontal } from 'lucide-react';
import type { ChannelSummary, DiscoveryStatus, VideoItem } from '../types';
import { formatViews, INDIAN_LANGUAGES } from '../lib/format';
import { VideoCard } from '../components/VideoCard';

interface SearchViewProps {
  query: string;
  videos: VideoItem[];
  channels: ChannelSummary[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  discoveryStatus?: DiscoveryStatus | null;
  onLoadMore?: () => void;
  sort: 'relevance' | 'date' | 'views';
  duration: 'all' | 'short' | 'medium' | 'long';
  language: string;
  onChangeSort: (s: 'relevance' | 'date' | 'views') => void;
  onChangeDuration: (d: 'all' | 'short' | 'medium' | 'long') => void;
  onChangeLanguage: (l: string) => void;
  onWatch: (videoId: string, video?: VideoItem) => void;
  onOpenChannel: (channelId: string) => void;
  onSaveWatchLater: (videoId: string) => void;
  onSavePlaylist: (videoId: string) => void;
  onShare: (video: VideoItem) => void;
  onReport: (video: VideoItem) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  query,
  videos,
  channels,
  loading,
  loadingMore = false,
  hasMore = false,
  discoveryStatus,
  onLoadMore,
  sort,
  duration,
  language,
  onChangeSort,
  onChangeDuration,
  onChangeLanguage,
  onWatch,
  onOpenChannel,
  onSaveWatchLater,
  onSavePlaylist,
  onShare,
  onReport,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onLoadMore || !hasMore || loadingMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '250px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loading, onLoadMore]);

  const showDiscoveryNotice =
    discoveryStatus && (!discoveryStatus.configured || Boolean(discoveryStatus.issue));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-20">
      {/* Search Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-[#e5e7eb] dark:border-[#2f3336]">
        <div className="flex items-center gap-2 text-sm text-[#536471] dark:text-[#71767b]">
          <SlidersHorizontal className="w-4 h-4" />
          <span>
            Results for <strong className="text-[#0f1419] dark:text-[#e7e9ea]">“{query || 'All videos'}”</strong>
          </span>
          <span className="font-mono-nums">({videos.length})</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Sort search results"
            value={sort}
            onChange={(e) => onChangeSort(e.target.value as 'relevance' | 'date' | 'views')}
            className="h-8 px-3 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-xs font-medium cursor-pointer"
          >
            <option value="relevance">Sort: Relevance</option>
            <option value="date">Sort: Upload date</option>
            <option value="views">Sort: View count</option>
          </select>

          <select
            aria-label="Filter by duration"
            value={duration}
            onChange={(e) => onChangeDuration(e.target.value as 'all' | 'short' | 'medium' | 'long')}
            className="h-8 px-3 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-xs font-medium cursor-pointer"
          >
            <option value="all">Duration: Any</option>
            <option value="short">Under 4 minutes</option>
            <option value="medium">4 - 20 minutes</option>
            <option value="long">Over 20 minutes</option>
          </select>

          <select
            aria-label="Filter by language"
            value={language}
            onChange={(e) => onChangeLanguage(e.target.value)}
            className="h-8 px-3 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-xs font-medium cursor-pointer"
          >
            {INDIAN_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l === 'All' ? 'All Languages' : l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Matching Creator Channels */}
      {channels.length > 0 && (
        <div className="mb-6 space-y-3 pb-5 border-b border-[#e5e7eb] dark:border-[#2f3336]">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="flex items-center justify-between gap-4 p-3 rounded-xl hover:bg-[#eff3f4] dark:hover:bg-[#16181c]"
            >
              <button
                type="button"
                onClick={() => onOpenChannel(ch.id)}
                className="flex items-center gap-4 text-left min-w-0 flex-1 cursor-pointer"
              >
                <img
                  src={ch.avatarUrl}
                  alt={ch.name}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-full object-cover shrink-0 border border-[#e5e7eb] dark:border-[#2f3336]"
                />
                <div className="min-w-0">
                  <p className="text-base font-semibold flex items-center gap-1.5 text-[#0f1419] dark:text-[#e7e9ea]">
                    <span className="truncate">{ch.name}</span>
                    {ch.verified && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  </p>
                  <p className="text-xs text-[#536471] dark:text-[#71767b] font-mono-nums">
                    {ch.handle} · {formatViews(ch.subscriberCount)} subscribers
                  </p>
                  {ch.description && (
                    <p className="text-xs text-[#536471] dark:text-[#71767b] mt-1 line-clamp-1">{ch.description}</p>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onOpenChannel(ch.id)}
                className="h-9 px-4 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-xs font-bold shrink-0 cursor-pointer"
              >
                Visit channel
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search Result Video List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-4 animate-pulse">
              <div className="w-full sm:w-[360px] aspect-video rounded-xl bg-[#eff3f4] dark:bg-[#16181c]" />
              <div className="flex-1 space-y-2.5 py-2">
                <div className="h-5 bg-[#eff3f4] dark:bg-[#16181c] rounded w-3/4" />
                <div className="h-3 bg-[#eff3f4] dark:bg-[#16181c] rounded w-1/3" />
                <div className="h-3 bg-[#eff3f4] dark:bg-[#16181c] rounded w-5/6" />
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="py-16 text-center max-w-lg mx-auto">
          {showDiscoveryNotice && discoveryStatus?.issue ? (
            <div className="p-6 rounded-2xl border border-[#e5e7eb] dark:border-[#2f3336] bg-[#eff3f4]/50 dark:bg-[#16181c] space-y-2.5">
              <AlertCircle className="w-7 h-7 mx-auto text-[#0f1419] dark:text-white" />
              <p className="text-base font-bold text-[#0f1419] dark:text-[#e7e9ea]">
                {discoveryStatus.issue.code === 'quota_exceeded'
                  ? 'External video quota temporarily reached'
                  : 'No videos matched right now'}
              </p>
              <p className="text-sm text-[#536471] dark:text-[#71767b]">
                {discoveryStatus.issue.message}
              </p>
            </div>
          ) : (
            <>
              <p className="text-lg font-bold">No results found</p>
              <p className="text-sm text-[#536471] dark:text-[#71767b] mt-1">
                Try different keywords or remove search filters.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-5">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                layout="horizontal"
                onWatch={onWatch}
                onOpenChannel={onOpenChannel}
                onSaveWatchLater={onSaveWatchLater}
                onSavePlaylist={onSavePlaylist}
                onShare={onShare}
                onReport={onReport}
              />
            ))}
          </div>

          <div ref={sentinelRef} className="mt-8 flex flex-col items-center justify-center py-4">
            {loadingMore && (
              <div className="flex items-center gap-2 text-sm text-[#536471] dark:text-[#71767b]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more results...</span>
              </div>
            )}
            {!hasMore && videos.length > 0 && (
              <p className="text-xs text-[#536471] dark:text-[#71767b]">End of search results</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
