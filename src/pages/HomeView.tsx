import React, { useEffect, useRef } from 'react';
import { Loader2, MoreVertical, Zap } from 'lucide-react';
import type { HomepageSection, VideoItem } from '../types';
import { formatViews } from '../lib/format';
import { CategoryBar } from '../components/CategoryBar';
import { VideoCard } from '../components/VideoCard';

interface HomeViewProps {
  videos: VideoItem[];
  shorts: VideoItem[];
  sections: HomepageSection[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  infiniteScrollEnabled: boolean;
  selectedCategory: string;
  selectedLanguage: string;
  onSelectCategory: (cat: string) => void;
  onSelectLanguage: (lang: string) => void;
  onLoadMore: () => void;
  onWatch: (videoId: string) => void;
  onOpenShort: (shortId: string) => void;
  onOpenChannel: (channelId: string) => void;
  onSaveWatchLater: (videoId: string) => void;
  onSavePlaylist: (videoId: string) => void;
  onShare: (video: VideoItem) => void;
  onReport: (video: VideoItem) => void;
  onMiniPlayer: (video: VideoItem) => void;
  onPlayNext: (videoId: string) => void;
  onAddToQueue: (videoId: string) => void;
  onNotInterested: (videoId: string) => void;
  onDontRecommendCreator: (channelId: string, channelName: string) => void;
  onImpressions?: (videoIds: string[]) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  videos,
  shorts,
  sections,
  loading,
  loadingMore,
  hasMore,
  infiniteScrollEnabled,
  selectedCategory,
  selectedLanguage,
  onSelectCategory,
  onSelectLanguage,
  onLoadMore,
  onWatch,
  onOpenShort,
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
  onImpressions,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const reportedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!onImpressions || videos.length === 0) return;
    const fresh = videos.map((v) => v.id).filter((id) => !reportedIdsRef.current.has(id));
    if (fresh.length > 0) {
      fresh.forEach((id) => reportedIdsRef.current.add(id));
      onImpressions(fresh.slice(0, 20));
    }
  }, [videos, onImpressions]);

  useEffect(() => {
    if (!infiniteScrollEnabled || !hasMore || loadingMore) return;
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
  }, [infiniteScrollEnabled, hasMore, loadingMore, onLoadMore]);

  const cardActions = {
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
  };

  const topRow = videos.slice(0, 6);
  const restVideos = videos.slice(6);
  const isFiltered = selectedCategory !== 'All' || selectedLanguage !== 'All';

  return (
    <div className="sm:px-6 pb-24 md:pb-12">
      <div className="px-3 sm:px-0">
        <CategoryBar
          selectedCategory={selectedCategory}
          selectedLanguage={selectedLanguage}
          onSelectCategory={onSelectCategory}
          onSelectLanguage={onSelectLanguage}
        />
      </div>

      {loading ? (
        <div className="mt-4 px-3 sm:px-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="animate-pulse">
              <div className="aspect-video rounded-xl bg-neutral-200 dark:bg-[#222222]" />
              <div className="mt-3 flex gap-3">
                <div className="w-9 h-9 rounded-full bg-neutral-200 dark:bg-[#222222] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-neutral-200 dark:bg-[#222222] rounded w-5/6" />
                  <div className="h-3 bg-neutral-200 dark:bg-[#222222] rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 && shorts.length === 0 ? (
        <div className="my-20 text-center max-w-md mx-auto px-4">
          {isFiltered ? (
            <>
              <p className="text-lg font-semibold">No videos match your filters</p>
              <p className="mt-1 text-sm text-[#606060] dark:text-[#aaaaaa]">
                Try switching back to All categories or All Languages.
              </p>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('All');
                  onSelectLanguage('All');
                }}
                className="mt-4 h-9 px-5 rounded-full bg-[#0f0f0f] dark:bg-[#f1f1f1] text-white dark:text-[#0f0f0f] text-sm font-medium cursor-pointer"
              >
                Reset filters
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">No videos available yet. Check back soon.</p>
              <p className="mt-1.5 text-sm text-[#606060] dark:text-[#aaaaaa]">
                Sign in with Google to upload your own MP4/WebM videos or explore Indian creators once connected.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Conditional AI Sections (Continue watching, Subscriptions, Interest Spotlight, Trending India) */}
          {!isFiltered &&
            sections.slice(0, 2).map((sec) => (
              <section key={sec.id} className="mt-4 mb-7">
                <h2 className="text-base font-bold mb-3 px-3 sm:px-0">{sec.title}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-6">
                  {sec.videos.map((v) => (
                    <VideoCard key={`${sec.id}-${v.id}`} video={v} {...cardActions} />
                  ))}
                </div>
              </section>
            ))}

          {/* Primary Personalized Feed Grid */}
          {topRow.length > 0 && (
            <section className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
              {topRow.map((video) => (
                <VideoCard key={video.id} video={video} {...cardActions} />
              ))}
            </section>
          )}

          {/* Shorts Shelf */}
          {shorts.length > 0 && (
            <section className="my-10 px-3 sm:px-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-[#ff0033] text-white flex items-center justify-center">
                    <Zap className="w-4 h-4 fill-white" />
                  </span>
                  <h2 className="text-[20px] font-bold tracking-tight">Shorts</h2>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {shorts.slice(0, 5).map((s) => (
                  <article key={s.id} className="group">
                    <button
                      type="button"
                      onClick={() => onOpenShort(s.id)}
                      aria-label={`Play Short: ${s.title}`}
                      className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-neutral-200 dark:bg-[#1f1f1f] block cursor-pointer"
                    >
                      <img
                        src={s.thumbnailUrl}
                        alt={s.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                    </button>
                    <div className="mt-2.5 flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onOpenShort(s.id)}
                          className="text-left text-[14px] font-semibold leading-snug line-clamp-2 text-[#0f0f0f] dark:text-[#f1f1f1] cursor-pointer"
                        >
                          {s.title}
                        </button>
                        <p className="mt-1 text-[13px] text-[#606060] dark:text-[#aaaaaa] font-mono-nums">
                          {formatViews(s.views)} views
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onReport(s)}
                        aria-label={`More options for ${s.title}`}
                        className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-[#272727] shrink-0 cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Remaining Infinite-Scroll Personalized Videos */}
          {restVideos.length > 0 && (
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
              {restVideos.map((video) => (
                <VideoCard key={video.id} video={video} {...cardActions} />
              ))}
            </section>
          )}

          {/* Infinite Scroll Sentinel / Manual Load More */}
          <div ref={sentinelRef} className="mt-10 flex flex-col items-center justify-center py-4">
            {loadingMore && (
              <div className="flex items-center gap-2 text-sm text-[#606060] dark:text-[#aaaaaa]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more recommendations...</span>
              </div>
            )}
            {!loadingMore && hasMore && !infiniteScrollEnabled && (
              <button
                type="button"
                onClick={onLoadMore}
                className="h-9 px-6 rounded-full bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3a3a3a] text-sm font-medium cursor-pointer"
              >
                Load more
              </button>
            )}
            {!hasMore && videos.length > 0 && (
              <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">You’re all caught up</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
