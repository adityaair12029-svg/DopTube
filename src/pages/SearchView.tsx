import React from 'react';
import { CheckCircle2, SlidersHorizontal } from 'lucide-react';
import type { ChannelSummary, VideoItem } from '../types';
import { formatViews, INDIAN_LANGUAGES } from '../lib/format';
import { VideoCard } from '../components/VideoCard';

interface SearchViewProps {
  query: string;
  videos: VideoItem[];
  channels: ChannelSummary[];
  loading: boolean;
  sort: 'relevance' | 'date' | 'views';
  duration: 'all' | 'short' | 'medium' | 'long';
  language: string;
  onChangeSort: (s: 'relevance' | 'date' | 'views') => void;
  onChangeDuration: (d: 'all' | 'short' | 'medium' | 'long') => void;
  onChangeLanguage: (l: string) => void;
  onWatch: (videoId: string) => void;
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
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-20">
      {/* Search Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-neutral-200 dark:border-[#272727]">
        <div className="flex items-center gap-2 text-sm text-[#606060] dark:text-[#aaaaaa]">
          <SlidersHorizontal className="w-4 h-4" />
          <span>
            Results for <strong className="text-[#0f0f0f] dark:text-[#f1f1f1]">“{query || 'All videos'}”</strong>
          </span>
          <span className="font-mono-nums">({videos.length})</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Sort search results"
            value={sort}
            onChange={(e) => onChangeSort(e.target.value as 'relevance' | 'date' | 'views')}
            className="h-8 px-2.5 rounded-lg bg-neutral-100 dark:bg-[#272727] text-xs font-medium cursor-pointer"
          >
            <option value="relevance">Sort: Relevance</option>
            <option value="date">Sort: Upload date</option>
            <option value="views">Sort: View count</option>
          </select>

          <select
            aria-label="Filter by duration"
            value={duration}
            onChange={(e) => onChangeDuration(e.target.value as 'all' | 'short' | 'medium' | 'long')}
            className="h-8 px-2.5 rounded-lg bg-neutral-100 dark:bg-[#272727] text-xs font-medium cursor-pointer"
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
            className="h-8 px-2.5 rounded-lg bg-neutral-100 dark:bg-[#272727] text-xs font-medium cursor-pointer"
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
        <div className="mb-6 space-y-3 pb-5 border-b border-neutral-200 dark:border-[#272727]">
          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center justify-between gap-4 p-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#1f1f1f]">
              <button
                type="button"
                onClick={() => onOpenChannel(ch.id)}
                className="flex items-center gap-4 text-left min-w-0 flex-1 cursor-pointer"
              >
                <img
                  src={ch.avatarUrl}
                  alt={ch.name}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-full object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-base font-semibold flex items-center gap-1.5">
                    <span className="truncate">{ch.name}</span>
                    {ch.verified && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  </p>
                  <p className="text-xs text-[#606060] dark:text-[#aaaaaa] font-mono-nums">
                    {ch.handle} · {formatViews(ch.subscriberCount)} subscribers
                  </p>
                  {ch.description && (
                    <p className="text-xs text-[#606060] dark:text-[#aaaaaa] mt-1 line-clamp-1">{ch.description}</p>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onOpenChannel(ch.id)}
                className="h-9 px-4 rounded-full bg-[#0f0f0f] dark:bg-[#f1f1f1] text-white dark:text-[#0f0f0f] text-xs font-semibold shrink-0 cursor-pointer"
              >
                Visit channel
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search Result Video List (Horizontal layout matching screenshot) */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-4 animate-pulse">
              <div className="w-full sm:w-[360px] aspect-video rounded-xl bg-neutral-200 dark:bg-[#222222]" />
              <div className="flex-1 space-y-2.5 py-2">
                <div className="h-5 bg-neutral-200 dark:bg-[#222222] rounded w-3/4" />
                <div className="h-3 bg-neutral-200 dark:bg-[#222222] rounded w-1/3" />
                <div className="h-3 bg-neutral-200 dark:bg-[#222222] rounded w-5/6" />
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg font-semibold">No results found</p>
          <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-1">
            Try different keywords or remove search filters.
          </p>
        </div>
      ) : (
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
      )}
    </div>
  );
};
