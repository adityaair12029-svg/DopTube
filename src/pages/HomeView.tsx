import React, { useEffect, useRef } from 'react';
import { AlertCircle, Loader2, MoreVertical, Upload, Zap } from 'lucide-react';
import type { DiscoveryStatus, HomepageSection, UserProfile, VideoItem } from '../types';
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
  homeFeedTab: 'for_you' | 'following';
  onChangeHomeFeedTab: (tab: 'for_you' | 'following') => void;
  discoveryStatus?: DiscoveryStatus | null;
  followingMeta?: { empty?: boolean; requiresAuth?: boolean };
  user: UserProfile | null;
  selectedCategory: string;
  selectedLanguage: string;
  onSelectCategory: (cat: string) => void;
  onSelectLanguage: (lang: string) => void;
  onLoadMore: () => void;
  onOpenAuth: () => void;
  onOpenUpload: () => void;
  onWatch: (videoId: string, video?: VideoItem) => void;
  onOpenShort: (shortId: string, shortVideo?: VideoItem) => void;
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
  homeFeedTab,
  onChangeHomeFeedTab,
  discoveryStatus,
  followingMeta,
  user,
  selectedCategory,
  selectedLanguage,
  onSelectCategory,
  onSelectLanguage,
  onLoadMore,
  onOpenAuth,
  onOpenUpload,
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
    if (!hasMore || loadingMore) return;
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
  }, [hasMore, loadingMore, onLoadMore]);

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

  const topRow = videos.slice(0, 4);
  const restVideos = videos.slice(4);
  const isFiltered = selectedCategory !== 'All' || selectedLanguage !== 'All';
  const showDiscoveryNotice =
    discoveryStatus && (!discoveryStatus.configured || Boolean(discoveryStatus.issue));

  return (
    <div className="sm:px-6 pb-24 md:pb-12">
      {/* X/Twitter Style Top Timeline Tabs (For you / Following) with JioHotstar underline */}
      <div
        role="tablist"
        aria-label="Home feed timeline"
        className="grid grid-cols-2 border-b border-[#e5e7eb] dark:border-[#1e2638] bg-white/90 dark:bg-[#050814]/90 backdrop-blur-sm"
      >
        {(
          [
            ['for_you', 'For you'],
            ['following', 'Following'],
          ] as const
        ).map(([id, label]) => {
          const active = homeFeedTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChangeHomeFeedTab(id)}
              className="relative h-12 flex items-center justify-center hover:bg-[#eff3f4]/70 dark:hover:bg-[#101524] transition-colors cursor-pointer"
            >
              <span
                className={`text-[15px] ${
                  active
                    ? 'font-bold text-[#0f1419] dark:text-white'
                    : 'font-medium text-[#536471] dark:text-[#8b98a5]'
                }`}
              >
                {label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-16 h-[3px] rounded-full jio-gradient" />
              )}
            </button>
          );
        })}
      </div>

      {homeFeedTab === 'for_you' && (
        <div className="px-3 sm:px-0">
          <CategoryBar
            selectedCategory={selectedCategory}
            selectedLanguage={selectedLanguage}
            onSelectCategory={onSelectCategory}
            onSelectLanguage={onSelectLanguage}
          />
        </div>
      )}

      {/* Honest Server Discovery Diagnostics Banner */}
      {showDiscoveryNotice && videos.length > 0 && (
        <div className="mx-3 sm:mx-0 mt-3 p-3 rounded-xl border border-[#e5e7eb] dark:border-[#2f3336] bg-[#eff3f4]/60 dark:bg-[#16181c] flex items-start gap-2.5 text-xs text-[#536471] dark:text-[#71767b]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#0f1419] dark:text-white" />
          <p>
            {discoveryStatus?.issue?.message ||
              'External video discovery is not configured on this server (missing EXTERNAL_VIDEO_API_KEY). Showing DopTube-hosted creator uploads only.'}
          </p>
        </div>
      )}

      {loading ? (
        <div className="mt-4 px-3 sm:px-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="animate-pulse">
              <div className="aspect-video rounded-xl bg-[#eff3f4] dark:bg-[#16181c]" />
              <div className="mt-3 flex gap-3">
                <div className="w-9 h-9 rounded-full bg-[#eff3f4] dark:bg-[#16181c] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[#eff3f4] dark:bg-[#16181c] rounded w-5/6" />
                  <div className="h-3 bg-[#eff3f4] dark:bg-[#16181c] rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : homeFeedTab === 'following' && followingMeta?.requiresAuth ? (
        <div className="my-20 text-center max-w-md mx-auto px-4">
          <p className="text-lg font-bold text-[#0f1419] dark:text-[#e7e9ea]">
            Sign in to see creators you follow
          </p>
          <p className="mt-1.5 text-sm text-[#536471] dark:text-[#71767b]">
            Subscribe to Indian creators on DopTube and their latest videos will appear here.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="mt-5 h-10 px-6 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
          >
            Sign in
          </button>
        </div>
      ) : homeFeedTab === 'following' && (followingMeta?.empty || videos.length === 0) ? (
        <div className="my-20 text-center max-w-md mx-auto px-4">
          <p className="text-lg font-bold text-[#0f1419] dark:text-[#e7e9ea]">
            You aren&apos;t following any creators yet
          </p>
          <p className="mt-1.5 text-sm text-[#536471] dark:text-[#71767b]">
            Explore &ldquo;For you&rdquo; to discover Indian creators and subscribe to fill your Following feed.
          </p>
          <button
            type="button"
            onClick={() => onChangeHomeFeedTab('for_you')}
            className="mt-5 h-10 px-6 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
          >
            Browse For you
          </button>
        </div>
      ) : videos.length === 0 && shorts.length === 0 ? (
        <div className="my-16 text-center max-w-lg mx-auto px-4">
          {isFiltered ? (
            <>
              <p className="text-lg font-bold">No videos match your filters</p>
              <p className="mt-1.5 text-sm text-[#536471] dark:text-[#71767b]">
                Try switching back to All categories or All Languages.
              </p>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('All');
                  onSelectLanguage('All');
                }}
                className="mt-5 h-10 px-6 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
              >
                Reset filters
              </button>
            </>
          ) : showDiscoveryNotice ? (
            <div className="p-6 rounded-2xl border border-[#e5e7eb] dark:border-[#2f3336] bg-[#eff3f4]/50 dark:bg-[#16181c] space-y-3">
              <AlertCircle className="w-8 h-8 mx-auto text-[#0f1419] dark:text-white" />
              <p className="text-lg font-bold text-[#0f1419] dark:text-[#e7e9ea]">
                Video discovery key required on server
              </p>
              <p className="text-sm text-[#536471] dark:text-[#71767b] leading-relaxed">
                {discoveryStatus?.issue?.message ||
                  'Set EXTERNAL_VIDEO_API_KEY (YouTube Data API v3 key) in your server / Vercel Environment Variables and redeploy to load external discovery feeds.'}
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-2.5">
                {user ? (
                  <button
                    type="button"
                    onClick={onOpenUpload}
                    className="h-10 px-5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload video to DopTube</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="h-10 px-6 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
                  >
                    Sign in to upload
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p className="text-lg font-bold">No videos available yet</p>
              <p className="mt-1.5 text-sm text-[#536471] dark:text-[#71767b]">
                Sign in with Google to upload your own MP4/WebM videos to DopTube Studio.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Conditional AI Sections (Continue watching, Subscriptions, Interest Spotlight, Trending India) */}
          {homeFeedTab === 'for_you' &&
            !isFiltered &&
            sections.slice(0, 2).map((sec) => (
              <section key={sec.id} className="mt-4 mb-7">
                <h2 className="text-base font-bold mb-3 px-3 sm:px-0 text-[#0f1419] dark:text-[#e7e9ea]">
                  {sec.title}
                </h2>
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
          {homeFeedTab === 'for_you' && shorts.length > 0 && (
            <section className="my-10 px-3 sm:px-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg jio-gradient text-white flex items-center justify-center shadow-[0_2px_10px_rgba(236,72,153,0.35)]">
                    <Zap className="w-4 h-4 fill-current" />
                  </span>
                  <h2 className="text-[20px] font-bold tracking-tight text-[#0f1419] dark:text-[#e7e9ea]">
                    Shorts
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {shorts.slice(0, 5).map((s) => (
                  <article key={s.id} className="group">
                    <button
                      type="button"
                      onClick={() => onOpenShort(s.id, s)}
                      aria-label={`Play Short: ${s.title}`}
                      className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] block cursor-pointer"
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
                          onClick={() => onOpenShort(s.id, s)}
                          className="text-left text-[14px] font-semibold leading-snug line-clamp-2 text-[#0f1419] dark:text-[#e7e9ea] cursor-pointer"
                        >
                          {s.title}
                        </button>
                        <p className="mt-1 text-[13px] text-[#536471] dark:text-[#71767b] font-mono-nums">
                          {formatViews(s.views)} views
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onReport(s)}
                        aria-label={`More options for ${s.title}`}
                        className="p-1 rounded-full hover:bg-[#eff3f4] dark:hover:bg-[#16181c] shrink-0 cursor-pointer"
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
            <section className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
              {restVideos.map((video) => (
                <VideoCard key={video.id} video={video} {...cardActions} />
              ))}
            </section>
          )}

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} className="mt-10 flex flex-col items-center justify-center py-4">
            {loadingMore && (
              <div className="flex items-center gap-2 text-sm text-[#536471] dark:text-[#71767b]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more recommendations...</span>
              </div>
            )}
            {!hasMore && videos.length > 0 && (
              <p className="text-xs text-[#536471] dark:text-[#71767b]">You’re all caught up</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
