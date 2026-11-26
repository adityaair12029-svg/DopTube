import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  Heart,
  History,
  ListMusic,
  ListVideo,
  Loader2,
  Music2,
  Pause,
  Play,
  Plus,
  Settings,
  Shuffle,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type { AppPage, ChannelSummary, PlaylistItem, UserProfile, VideoItem } from '../types';
import { apiFetch } from '../lib/api';
import { formatViews } from '../lib/format';
import { VideoCard } from '../components/VideoCard';

interface CommonCardProps {
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

export const YouView: React.FC<
  CommonCardProps & {
    user: UserProfile | null;
    onOpenAuth: () => void;
    onNavigate: (page: AppPage, param?: string) => void;
    onPlayPlaylist?: (playlist: PlaylistItem) => void;
  }
> = ({ user, onOpenAuth, onNavigate, onWatch, onPlayPlaylist }) => {
  const [historyVideos, setHistoryVideos] = useState<VideoItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [watchLaterCount, setWatchLaterCount] = useState(0);
  const [likedCount, setLikedCount] = useState(0);
  const [likedPreview, setLikedPreview] = useState<string>('');
  const [libraryFilter, setLibraryFilter] = useState<
    'recents' | 'downloaded' | 'playlists' | 'watch-later' | 'liked' | 'music'
  >('recents');

  useEffect(() => {
    if (!user) {
      setHistoryVideos([]);
      setPlaylists([]);
      setWatchLaterCount(0);
      setLikedCount(0);
      setLikedPreview('');
      return;
    }
    Promise.all([
      apiFetch<{ videos: VideoItem[] }>('/api/history').catch(() => ({ videos: [] })),
      apiFetch<{ playlists: PlaylistItem[] }>('/api/playlists').catch(() => ({ playlists: [] })),
      apiFetch<{ videos: VideoItem[] }>('/api/watch-later').catch(() => ({ videos: [] })),
      apiFetch<{ videos: VideoItem[] }>('/api/liked-videos').catch(() => ({ videos: [] })),
    ]).then(([hRes, pRes, wlRes, lkRes]) => {
      setHistoryVideos(hRes.videos.slice(0, 10));
      setPlaylists(pRes.playlists);
      setWatchLaterCount(wlRes.videos.length);
      setLikedCount(lkRes.videos.length);
      setLikedPreview(lkRes.videos[0]?.thumbnailUrl || '');
    });
  }, [user?.id]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] mx-auto flex items-center justify-center">
          <UserCheck className="w-8 h-8 text-[#0f1419] dark:text-white" />
        </div>
        <h1 className="text-2xl font-bold">Your DopTube Hub</h1>
        <p className="text-sm text-[#536471] dark:text-[#71767b]">
          Sign in to view your history, saved playlists, liked videos, Watch later, and AI personalization controls.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={onOpenAuth}
            className="h-10 px-6 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="h-10 px-5 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-sm font-semibold cursor-pointer"
          >
            Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-24 space-y-6">
      {/* Top Account Switch & Quick Settings Row */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenAuth}
          className="h-8 px-3.5 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <span>Accounts</span>
          <ChevronRight className="w-3.5 h-3.5 rotate-90" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          aria-label="Open Settings"
          className="h-8 px-3 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </div>

      {/* Profile Identity Header */}
      <div className="flex items-center gap-4">
        <img
          src={user.avatarUrl}
          alt={user.name}
          referrerPolicy="no-referrer"
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border border-[#e5e7eb] dark:border-[#2f3336]"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{user.name}</h1>
          <p className="text-xs sm:text-sm text-[#536471] dark:text-[#71767b] truncate">
            {user.channel?.handle || user.email} · {user.preferredLanguage}
          </p>
        </div>
      </div>

      {/* Primary Action Pills */}
      <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => (user.channel ? onNavigate('channel', user.channel.id) : onNavigate('studio'))}
          className="h-9 px-5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-xs sm:text-sm font-bold shrink-0 cursor-pointer"
        >
          View channel
        </button>
        <button
          type="button"
          onClick={() => onNavigate('studio')}
          className="h-9 px-5 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336] text-xs sm:text-sm font-semibold shrink-0 cursor-pointer"
        >
          DopTube Studio
        </button>
        <button
          type="button"
          onClick={() => onNavigate('queue')}
          className="h-9 px-4 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336] text-xs sm:text-sm font-semibold shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <ListMusic className="w-4 h-4" />
          <span>Queue</span>
        </button>
      </div>

      {/* History Horizontal Carousel */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="flex items-center gap-1 text-lg font-bold hover:opacity-80 cursor-pointer"
          >
            <span>History</span>
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="h-7 px-3 rounded-full border border-[#e5e7eb] dark:border-[#2f3336] text-xs font-semibold cursor-pointer"
          >
            View all
          </button>
        </div>

        {historyVideos.length === 0 ? (
          <p className="text-xs text-[#536471] dark:text-[#71767b] py-3">
            Videos you watch on DopTube will appear here.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {historyVideos.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onWatch(v.id, v)}
                className="w-40 shrink-0 text-left group cursor-pointer"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336]">
                  <img
                    src={v.thumbnailUrl}
                    alt={v.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  {v.progressSec && v.durationSec > 0 ? (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
                      <div
                        className="h-full bg-white"
                        style={{ width: `${Math.min(100, Math.round((v.progressSec / v.durationSec) * 100))}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs font-semibold line-clamp-2 leading-snug">{v.title}</p>
                <p className="text-[11px] text-[#606060] dark:text-[#aaaaaa] truncate">{v.channelName}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Library Filter Chips */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Library</h2>
          <button
            type="button"
            onClick={() => onNavigate('playlists')}
            className="h-7 px-3 rounded-full border border-neutral-300 dark:border-[#383838] text-xs font-medium cursor-pointer"
          >
            Manage playlists
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {(
            [
              ['recents', 'Recents'],
              ['downloaded', 'Downloaded'],
              ['playlists', 'Playlists'],
              ['watch-later', 'Watch later'],
              ['liked', 'Liked videos'],
              ['music', 'Music'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setLibraryFilter(id);
                if (id === 'downloaded') onNavigate('downloads');
                if (id === 'music') onNavigate('music');
              }}
              className={`h-8 px-3.5 rounded-lg text-xs font-medium shrink-0 cursor-pointer ${
                libraryFilter === id
                  ? 'bg-[#0f0f0f] text-white dark:bg-white dark:text-[#0f0f0f]'
                  : 'bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3a3a3a]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stacked Library Rows */}
        <div className="space-y-3">
          {(libraryFilter === 'recents' || libraryFilter === 'liked') && (
            <div className="flex items-center gap-3.5 p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] transition-colors">
              <button
                type="button"
                onClick={() => onNavigate('liked')}
                className="relative w-32 aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-emerald-600/80 to-teal-900 shrink-0 cursor-pointer"
              >
                {likedPreview ? (
                  <img
                    src={likedPreview}
                    alt="Liked videos"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    <Heart className="w-6 h-6" />
                  </div>
                )}
                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono-nums">
                  {likedCount}
                </span>
              </button>
              <button type="button" onClick={() => onNavigate('liked')} className="flex-1 text-left cursor-pointer">
                <p className="text-sm font-semibold">Liked videos</p>
                <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">Private · {likedCount} videos</p>
              </button>
            </div>
          )}

          {(libraryFilter === 'recents' || libraryFilter === 'watch-later') && (
            <div className="flex items-center gap-3.5 p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] transition-colors">
              <button
                type="button"
                onClick={() => onNavigate('watch-later')}
                className="relative w-32 aspect-video rounded-xl overflow-hidden bg-neutral-200 dark:bg-[#272727] shrink-0 flex items-center justify-center cursor-pointer"
              >
                <Clock className="w-6 h-6" />
                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono-nums">
                  {watchLaterCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('watch-later')}
                className="flex-1 text-left cursor-pointer"
              >
                <p className="text-sm font-semibold">Watch later</p>
                <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">Private · {watchLaterCount} videos</p>
              </button>
            </div>
          )}

          {(libraryFilter === 'recents' || libraryFilter === 'playlists') &&
            playlists.map((pl) => (
              <div
                key={pl.id}
                className="flex items-center gap-3.5 p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => (pl.videos.length > 0 && onPlayPlaylist ? onPlayPlaylist(pl) : onNavigate('playlists'))}
                  className="relative w-32 aspect-video rounded-xl overflow-hidden bg-neutral-200 dark:bg-[#272727] shrink-0 cursor-pointer"
                >
                  {pl.videos[0]?.thumbnailUrl ? (
                    <img
                      src={pl.videos[0].thumbnailUrl}
                      alt={pl.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ListVideo className="w-6 h-6 text-[#606060] dark:text-[#aaaaaa]" />
                    </div>
                  )}
                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono-nums">
                    {pl.videos.length}
                  </span>
                </button>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => onNavigate('playlists')}
                    className="text-left block w-full cursor-pointer"
                  >
                    <p className="text-sm font-semibold truncate">{pl.title}</p>
                    <p className="text-xs text-[#606060] dark:text-[#aaaaaa] capitalize">
                      {pl.visibility} · Playlist · {pl.videos.length} videos
                    </p>
                  </button>
                </div>
                {pl.videos.length > 0 && onPlayPlaylist && (
                  <button
                    type="button"
                    onClick={() => onPlayPlaylist(pl)}
                    className="h-8 px-3 rounded-full bg-neutral-200 dark:bg-[#2a2a2a] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Play
                  </button>
                )}
              </div>
            ))}

          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('music')}
              className="p-3.5 rounded-2xl bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] hover:bg-[#e5e7eb] dark:hover:bg-[#202327] flex items-center gap-3 text-left cursor-pointer"
            >
              <Music2 className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">DopTube Music</p>
                <p className="text-xs text-[#536471] dark:text-[#71767b]">Stream audio tracks, mixes & uploads</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('downloads')}
              className="p-3.5 rounded-2xl bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] hover:bg-[#e5e7eb] dark:hover:bg-[#202327] flex items-center gap-3 text-left cursor-pointer"
            >
              <Download className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Downloads & Native MP4s</p>
                <p className="text-xs text-[#536471] dark:text-[#71767b]">Authorized DopTube offline downloads</p>
              </div>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export const SubscriptionsView: React.FC<
  CommonCardProps & {
    user: UserProfile | null;
    onOpenAuth: () => void;
  }
> = ({ user, onOpenAuth, ...cardProps }) => {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ channels: ChannelSummary[]; videos: VideoItem[] }>('/api/subscriptions')
      .then((res) => {
        setChannels(res.channels);
        setVideos(res.videos);
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (!user) {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4">
        <h2 className="text-xl font-bold">Don’t miss new videos</h2>
        <p className="text-sm text-[#536471] dark:text-[#71767b] mt-2">
          Sign in to see updates from your favourite Indian creators on DopTube.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-10 px-6 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-4 pb-24">
      <h1 className="text-xl font-bold mb-4">Subscriptions</h1>
      {channels.length > 0 && (
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-4 mb-6 border-b border-[#e5e7eb] dark:border-[#2f3336]">
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => cardProps.onOpenChannel(ch.id)}
              className="flex flex-col items-center gap-1.5 w-20 shrink-0 cursor-pointer group"
            >
              <img
                src={ch.avatarUrl}
                alt={ch.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover group-hover:ring-2 ring-[#0f1419] dark:ring-white"
              />
              <span className="text-xs font-medium truncate w-full text-center">{ch.name}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">Loading subscription feed...</p>
      ) : videos.length === 0 ? (
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">
          No videos from your subscriptions yet. Explore Indian channels to subscribe.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} {...cardProps} />
          ))}
        </div>
      )}
    </div>
  );
};

export const HistoryView: React.FC<
  CommonCardProps & {
    user: UserProfile | null;
    onOpenAuth: () => void;
    onUserUpdated: (user: UserProfile) => void;
    onToast: (msg: string) => void;
  }
> = ({ user, onOpenAuth, onUserUpdated, onToast, ...cardProps }) => {
  const [tab, setTab] = useState<'watch' | 'search'>('watch');
  const [watchItems, setWatchItems] = useState<VideoItem[]>([]);
  const [searchItems, setSearchItems] = useState<Array<{ id: string; query: string; searchedAt: string }>>([]);

  const load = async () => {
    if (!user) return;
    const [wRes, sRes] = await Promise.all([
      apiFetch<{ videos: VideoItem[] }>('/api/history'),
      apiFetch<{ history: Array<{ id: string; query: string; searchedAt: string }> }>('/api/search/history'),
    ]);
    setWatchItems(wRes.videos);
    setSearchItems(sRes.history);
  };

  useEffect(() => {
    load().catch(() => {});
  }, [user?.id]);

  if (!user) {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4">
        <History className="w-10 h-10 mx-auto text-[#606060] dark:text-[#aaaaaa] mb-3" />
        <h2 className="text-xl font-bold">Keep track of what you watch</h2>
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-2">Watch history isn’t viewable when signed out.</p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-9 px-5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  const clearWatch = async () => {
    await apiFetch('/api/history', { method: 'DELETE' });
    setWatchItems([]);
    onToast('Watch history cleared');
  };

  const clearSearch = async () => {
    await apiFetch('/api/search/history', { method: 'DELETE' });
    setSearchItems([]);
    onToast('Search history cleared');
  };

  const togglePause = async () => {
    const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ historyPaused: !user.historyPaused }),
    });
    onUserUpdated(res.user);
    onToast(res.user.historyPaused ? 'History paused' : 'History resumed');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">History</h1>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setTab('watch')}
              className={`h-8 px-4 rounded-lg text-sm font-medium cursor-pointer ${
                tab === 'watch'
                  ? 'bg-[#0f0f0f] text-white dark:bg-white dark:text-[#0f0f0f]'
                  : 'bg-neutral-100 dark:bg-[#272727]'
              }`}
            >
              Watch history ({watchItems.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('search')}
              className={`h-8 px-4 rounded-lg text-sm font-medium cursor-pointer ${
                tab === 'search'
                  ? 'bg-[#0f0f0f] text-white dark:bg-white dark:text-[#0f0f0f]'
                  : 'bg-neutral-100 dark:bg-[#272727]'
              }`}
            >
              Search history ({searchItems.length})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={togglePause}
            className="h-9 px-3.5 rounded-full bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3f3f3f] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            {user.historyPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{user.historyPaused ? 'Resume history' : 'Pause history'}</span>
          </button>
          <button
            type="button"
            onClick={tab === 'watch' ? clearWatch : clearSearch}
            className="h-9 px-3.5 rounded-full bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3f3f3f] text-xs font-medium flex items-center gap-1.5 text-red-500 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear all {tab === 'watch' ? 'watch' : 'search'} history</span>
          </button>
        </div>
      </div>

      {tab === 'watch' ? (
        watchItems.length === 0 ? (
          <p className="text-sm text-[#606060] dark:text-[#aaaaaa] py-10">Your watch history is empty.</p>
        ) : (
          <div className="space-y-4">
            {watchItems.map((v) => (
              <div key={v.id} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <VideoCard video={v} layout="horizontal" {...cardProps} />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/history/${v.id}`, { method: 'DELETE' });
                    setWatchItems((prev) => prev.filter((item) => item.id !== v.id));
                  }}
                  aria-label={`Remove ${v.title} from history`}
                  className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-[#272727] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : searchItems.length === 0 ? (
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] py-10">Your search history is empty.</p>
      ) : (
        <div className="divide-y divide-neutral-200 dark:divide-[#272727]">
          {searchItems.map((s) => (
            <div key={s.id} className="py-3 flex items-center justify-between">
              <span className="text-sm font-medium">{s.query}</span>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/search/history/${s.id}`, { method: 'DELETE' });
                  setSearchItems((prev) => prev.filter((item) => item.id !== s.id));
                }}
                className="text-xs text-[#606060] dark:text-[#aaaaaa] hover:text-red-500 cursor-pointer"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const PlaylistsView: React.FC<
  CommonCardProps & {
    user: UserProfile | null;
    onOpenAuth: () => void;
    onPlayPlaylist?: (playlist: PlaylistItem) => void;
    onToast: (msg: string) => void;
  }
> = ({ user, onOpenAuth, onPlayPlaylist, onToast, ...cardProps }) => {
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newVisibility, setNewVisibility] = useState<'private' | 'unlisted' | 'public'>('private');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const load = () => {
    if (!user) return;
    apiFetch<{ playlists: PlaylistItem[] }>('/api/playlists')
      .then((res) => setPlaylists(res.playlists))
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  if (!user) {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4">
        <h2 className="text-xl font-bold">Create and organize playlists</h2>
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-2">
          Sign in with Google to build custom playlists, reorder videos, and queue playback.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-9 px-5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  const createPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim().length < 2) return;
    await apiFetch('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ title: newTitle.trim(), visibility: newVisibility }),
    });
    setNewTitle('');
    load();
    onToast('Playlist created');
  };

  const renamePlaylist = async (playlistId: string) => {
    if (editTitle.trim().length < 2) return;
    await apiFetch(`/api/playlists/${playlistId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: editTitle.trim() }),
    });
    setEditingId(null);
    load();
    onToast('Playlist renamed');
  };

  const changeVisibility = async (playlistId: string, visibility: 'public' | 'unlisted' | 'private') => {
    await apiFetch(`/api/playlists/${playlistId}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
    });
    load();
    onToast(`Playlist set to ${visibility}`);
  };

  const deletePlaylist = async (playlistId: string) => {
    await apiFetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    onToast('Playlist deleted');
  };

  const moveVideo = async (pl: PlaylistItem, idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= pl.videos.length) return;
    const nextVideos = [...pl.videos];
    const [moved] = nextVideos.splice(idx, 1);
    nextVideos.splice(targetIdx, 0, moved);
    setPlaylists((prev) => prev.map((p) => (p.id === pl.id ? { ...p, videos: nextVideos } : p)));
    await apiFetch(`/api/playlists/${pl.id}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ videoIds: nextVideos.map((v) => v.id) }),
    });
  };

  const removeVideo = async (playlistId: string, videoId: string) => {
    await apiFetch(`/api/playlists/${playlistId}/videos/${videoId}`, { method: 'DELETE' });
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, videos: p.videos.filter((v) => v.id !== videoId) } : p))
    );
    onToast('Removed video from playlist');
  };

  return (
    <div className="px-4 sm:px-6 py-4 pb-24 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Playlists</h1>
        <form onSubmit={createPlaylist} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New playlist title..."
            className="h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#1f1f1f] border border-neutral-300 dark:border-[#383838] text-sm"
          />
          <select
            value={newVisibility}
            onChange={(e) => setNewVisibility(e.target.value as 'private' | 'unlisted' | 'public')}
            className="h-9 px-2.5 rounded-lg bg-neutral-100 dark:bg-[#1f1f1f] border border-neutral-300 dark:border-[#383838] text-xs"
          >
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
          <button
            type="submit"
            className="h-9 px-4 rounded-full bg-[#0f0f0f] dark:bg-[#f1f1f1] text-white dark:text-[#0f0f0f] text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
        </form>
      </div>

      {playlists.length === 0 ? (
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">
          No playlists yet. Create one above or save any video to a playlist.
        </p>
      ) : (
        <div className="space-y-8">
          {playlists.map((pl) => (
            <section key={pl.id} className="pb-6 border-b border-neutral-200 dark:border-[#272727]">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                {editingId === pl.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-8 px-3 rounded-lg bg-neutral-100 dark:bg-[#1f1f1f] border border-neutral-300 dark:border-[#383838] text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => renamePlaylist(pl.id)}
                      className="h-8 px-3 rounded-full bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded-full hover:bg-neutral-200 dark:hover:bg-[#272727] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{pl.title}</h2>
                    <span className="text-xs text-[#606060] dark:text-[#aaaaaa] font-mono-nums">
                      ({pl.videos.length} videos)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(pl.id);
                        setEditTitle(pl.title);
                      }}
                      aria-label={`Rename ${pl.title}`}
                      className="p-1.5 rounded-full hover:bg-neutral-200 dark:hover:bg-[#272727] cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {pl.videos.length > 0 && onPlayPlaylist && (
                    <button
                      type="button"
                      onClick={() => onPlayPlaylist(pl)}
                      className="h-8 px-3.5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Play all
                    </button>
                  )}
                  <select
                    value={pl.visibility}
                    onChange={(e) => changeVisibility(pl.id, e.target.value as 'public' | 'unlisted' | 'private')}
                    className="h-8 px-2.5 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-xs font-medium"
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => deletePlaylist(pl.id)}
                    className="h-8 px-3 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:text-red-500 text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {pl.videos.length === 0 ? (
                <p className="text-xs text-[#536471] dark:text-[#71767b]">No videos added yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {pl.videos.map((v, idx) => (
                    <div key={v.id} className="space-y-2">
                      <VideoCard video={v} {...cardProps} />
                      <div className="flex items-center justify-between px-1 text-xs">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveVideo(pl, idx, -1)}
                            aria-label="Move up"
                            className="p-1.5 rounded-full bg-[#eff3f4] dark:bg-[#202327] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === pl.videos.length - 1}
                            onClick={() => moveVideo(pl, idx, 1)}
                            aria-label="Move down"
                            className="p-1.5 rounded-full bg-[#eff3f4] dark:bg-[#202327] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVideo(pl.id, v.id)}
                          className="text-xs text-[#536471] dark:text-[#71767b] hover:text-red-500 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export const QueueView: React.FC<
  CommonCardProps & {
    user: UserProfile | null;
    queue: VideoItem[];
    onOpenAuth: () => void;
    onQueueChanged: () => void;
    onToast: (msg: string) => void;
  }
> = ({ user, queue, onOpenAuth, onQueueChanged, onToast, ...cardProps }) => {
  if (!user) {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4">
        <ListMusic className="w-10 h-10 mx-auto text-[#0f1419] dark:text-white mb-3" />
        <h2 className="text-xl font-bold">Playback Queue</h2>
        <p className="text-sm text-[#536471] dark:text-[#71767b] mt-2">
          Sign in to save videos to your Up Next playback queue across sessions.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-10 px-6 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  const moveItem = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= queue.length) return;
    const ids = queue.map((v) => v.id);
    const [item] = ids.splice(idx, 1);
    ids.splice(target, 0, item);
    await apiFetch('/api/queue/reorder', {
      method: 'PUT',
      body: JSON.stringify({ videoIds: ids }),
    });
    onQueueChanged();
  };

  const shuffleQueue = async () => {
    if (queue.length < 2) return;
    const ids = [...queue.map((v) => v.id)].sort(() => Math.random() - 0.5);
    await apiFetch('/api/queue/reorder', {
      method: 'PUT',
      body: JSON.stringify({ videoIds: ids }),
    });
    onQueueChanged();
    onToast('Queue shuffled');
  };

  const clearQueue = async () => {
    await apiFetch('/api/queue', { method: 'DELETE' });
    onQueueChanged();
    onToast('Queue cleared');
  };

  const removeFromQueue = async (videoId: string) => {
    await apiFetch(`/api/queue/${videoId}`, { method: 'DELETE' });
    onQueueChanged();
    onToast('Removed from queue');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Playback Queue</h1>
          <p className="text-sm text-[#536471] dark:text-[#71767b]">
            {queue.length} queued videos ready for continuous autoplay
          </p>
        </div>

        {queue.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cardProps.onWatch(queue[0].id, queue[0])}
              className="h-9 px-4 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Play queue
            </button>
            <button
              type="button"
              onClick={shuffleQueue}
              className="h-9 px-3.5 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Shuffle
            </button>
            <button
              type="button"
              onClick={clearQueue}
              className="h-9 px-3.5 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-red-500 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336]">
          <Sparkles className="w-8 h-8 mx-auto text-[#0f1419] dark:text-white mb-2" />
          <p className="text-sm font-medium">Your queue is empty</p>
          <p className="text-xs text-[#536471] dark:text-[#71767b] mt-1">
            Use “Play next” or “Add to queue” from any video’s menu to build your Up Next list.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((v, idx) => (
            <div key={v.id} className="flex items-start gap-2">
              <div className="flex flex-col items-center gap-1 pt-2">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveItem(idx, -1)}
                  aria-label="Move up in queue"
                  className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-[#272727] disabled:opacity-30 cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-mono-nums text-[#606060] dark:text-[#aaaaaa]">{idx + 1}</span>
                <button
                  type="button"
                  disabled={idx === queue.length - 1}
                  onClick={() => moveItem(idx, 1)}
                  aria-label="Move down in queue"
                  className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-[#272727] disabled:opacity-30 cursor-pointer"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <VideoCard video={v} layout="horizontal" {...cardProps} />
              </div>
              <button
                type="button"
                onClick={() => removeFromQueue(v.id)}
                aria-label={`Remove ${v.title} from queue`}
                className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-[#272727] text-red-500 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const SimpleVideoCollectionView: React.FC<
  CommonCardProps & {
    title: string;
    subtitle?: string;
    endpoint: string;
    requiresAuth?: boolean;
    user: UserProfile | null;
    onOpenAuth: () => void;
    allowNativeDownload?: boolean;
  }
> = ({ title, subtitle, endpoint, requiresAuth, user, onOpenAuth, allowNativeDownload, ...cardProps }) => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string>('');
  const [hasMoreServer, setHasMoreServer] = useState(false);
  const [visibleCount, setVisibleCount] = useState(16);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (requiresAuth && !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setVisibleCount(16);
    setNextPageToken('');
    setHasMoreServer(false);
    apiFetch<{ videos: VideoItem[]; nextPageToken?: string | null; hasMore?: boolean }>(endpoint)
      .then((res) => {
        if (cancelled) return;
        setVideos(res.videos || []);
        setNextPageToken(res.nextPageToken || '');
        setHasMoreServer(Boolean(res.nextPageToken || res.hasMore));
      })
      .catch(() => {
        if (!cancelled) setVideos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, user?.id, requiresAuth]);

  const loadMoreCollection = useCallback(async () => {
    if (visibleCount < videos.length) {
      setVisibleCount((c) => c + 16);
      return;
    }
    if (!hasMoreServer || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const sep = endpoint.includes('?') ? '&' : '?';
      const res = await apiFetch<{ videos: VideoItem[]; nextPageToken?: string | null; hasMore?: boolean }>(
        `${endpoint}${sep}pageToken=${encodeURIComponent(nextPageToken)}`
      );
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        const appended = (res.videos || []).filter((v) => !seen.has(v.id));
        return [...prev, ...appended];
      });
      setVisibleCount((c) => c + 16);
      setNextPageToken(res.nextPageToken || '');
      setHasMoreServer(Boolean(res.nextPageToken || res.hasMore));
    } catch {
      setHasMoreServer(false);
    } finally {
      setLoadingMore(false);
    }
  }, [endpoint, hasMoreServer, loadingMore, nextPageToken, videos.length, visibleCount]);

  useEffect(() => {
    if (loading || loadingMore) return;
    if (visibleCount >= videos.length && !hasMoreServer) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreCollection();
        }
      },
      { rootMargin: '250px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading, loadingMore, visibleCount, videos.length, hasMoreServer, loadMoreCollection]);

  if (requiresAuth && !user) {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-2">Sign in with Google to access your {title.toLowerCase()}.</p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-9 px-5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  const displayedVideos = videos.slice(0, visibleCount);

  return (
    <div className="px-4 sm:px-6 py-4 pb-24">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-1">{subtitle}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">Loading...</p>
      ) : videos.length === 0 ? (
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] py-10">No videos available yet. Check back soon.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
            {displayedVideos.map((v) => (
              <div key={v.id} className="space-y-2">
                <VideoCard video={v} {...cardProps} />
                {allowNativeDownload && v.sourceType === 'native' && (
                  <a
                    href={v.videoUrl}
                    download={`${v.id}.mp4`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0f1419] dark:text-white hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download MP4 (Authorized DopTube Host)
                  </a>
                )}
              </div>
            ))}
          </div>

          <div ref={sentinelRef} className="mt-8 flex items-center justify-center py-4">
            {loadingMore && (
              <div className="flex items-center gap-2 text-sm text-[#606060] dark:text-[#aaaaaa]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more videos...</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export const ChannelView: React.FC<
  CommonCardProps & {
    channelId: string;
    user: UserProfile | null;
    onOpenAuth: () => void;
    onSubscriptionsChanged: () => void;
    onToast: (msg: string) => void;
  }
> = ({ channelId, user, onOpenAuth, onSubscriptionsChanged, onToast, ...cardProps }) => {
  const [channel, setChannel] = useState<ChannelSummary | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [tab, setTab] = useState<'all' | 'videos' | 'shorts'>('all');
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVideos([]);
    setNextPageToken('');
    setHasMore(false);
    setTotalResults(0);
    setTab('all');

    apiFetch<{
      channel: ChannelSummary;
      videos: VideoItem[];
      nextPageToken?: string | null;
      hasMore?: boolean;
      totalResults?: number;
    }>(`/api/channels/${channelId}`)
      .then((res) => {
        if (cancelled) return;
        setChannel(res.channel);
        setVideos(res.videos || []);
        setNextPageToken(res.nextPageToken || '');
        setHasMore(Boolean(res.hasMore && res.nextPageToken));
        setTotalResults(res.totalResults ?? res.channel.totalResults ?? (res.videos || []).length);
      })
      .catch(() => {
        if (!cancelled) setChannel(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const loadMoreChannelVideos = useCallback(async () => {
    if (loadingMore || !hasMore || !nextPageToken) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch<{
        videos: VideoItem[];
        nextPageToken?: string | null;
        hasMore?: boolean;
        totalResults?: number;
      }>(`/api/channels/${channelId}?pageToken=${encodeURIComponent(nextPageToken)}`);
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        const appended = (res.videos || []).filter((v) => !seen.has(v.id));
        return [...prev, ...appended];
      });
      setNextPageToken(res.nextPageToken || '');
      setHasMore(Boolean(res.hasMore && res.nextPageToken));
      if (res.totalResults) setTotalResults(res.totalResults);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [channelId, hasMore, loadingMore, nextPageToken]);

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreChannelVideos();
        }
      },
      { rootMargin: '300px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading, loadingMore, hasMore, loadMoreChannelVideos]);

  if (loading) return <div className="p-8 text-sm text-[#606060] dark:text-[#aaaaaa]">Loading channel...</div>;
  if (!channel) return <div className="p-8 text-sm">Channel not found.</div>;

  const toggleSub = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const res = await apiFetch<{ subscribed: boolean; subscriberCount: number }>(`/api/channels/${channel.id}/subscribe`, {
      method: 'POST',
    });
    setChannel((prev) => (prev ? { ...prev, isSubscribed: res.subscribed, subscriberCount: res.subscriberCount } : prev));
    onSubscriptionsChanged();
    onToast(res.subscribed ? `Subscribed to ${channel.name}` : `Unsubscribed from ${channel.name}`);
  };

  const fullVideos = videos.filter((v) => !v.isShort);
  const shortVideos = videos.filter((v) => v.isShort);
  const filteredVideos = tab === 'videos' ? fullVideos : tab === 'shorts' ? shortVideos : videos;
  const displayedTotal = Math.max(totalResults, videos.length);

  return (
    <div className="pb-24">
      <div className="h-32 sm:h-48 w-full bg-[#eff3f4] dark:bg-[#16181c] border-b border-[#e5e7eb] dark:border-[#2f3336]" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e5e7eb] dark:border-[#2f3336]">
          <div className="flex items-center gap-4">
            <img
              src={channel.avatarUrl}
              alt={channel.name}
              referrerPolicy="no-referrer"
              className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-white dark:border-black -mt-10 sm:-mt-14"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-1.5">
                {channel.name}
                {channel.verified && <CheckCircle2 className="w-5 h-5" />}
              </h1>
              <p className="text-xs sm:text-sm text-[#536471] dark:text-[#71767b] font-mono-nums">
                {channel.handle} · {formatViews(channel.subscriberCount)} subscribers · {formatViews(displayedTotal)} videos
              </p>
              {channel.description && (
                <p className="text-sm text-[#536471] dark:text-[#71767b] mt-1.5 max-w-2xl">{channel.description}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={toggleSub}
            className={`h-10 px-6 rounded-full text-sm font-bold shrink-0 cursor-pointer ${
              channel.isSubscribed
                ? 'bg-[#eff3f4] dark:bg-[#202327] text-[#0f1419] dark:text-[#e7e9ea]'
                : 'bg-[#0f1419] dark:bg-white text-white dark:text-black'
            }`}
          >
            {channel.isSubscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>

        {/* All / Videos / Shorts Filter Tabs */}
        <div className="mt-5 flex items-center gap-2 border-b border-[#e5e7eb] dark:border-[#2f3336] pb-3">
          {(
            [
              ['all', `All (${videos.length})`],
              ['videos', `Videos (${fullVideos.length})`],
              ['shorts', `Shorts (${shortVideos.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`h-9 px-4 rounded-full text-sm font-bold cursor-pointer ${
                tab === id
                  ? 'bg-[#0f1419] text-white dark:bg-white dark:text-black'
                  : 'bg-[#eff3f4] dark:bg-[#202327] text-[#0f1419] dark:text-[#e7e9ea] hover:bg-[#e5e7eb] dark:hover:bg-[#2f3336]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {filteredVideos.length === 0 ? (
            <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">
              {hasMore ? 'Loading more creator uploads...' : 'No public videos in this tab yet.'}
            </p>
          ) : tab === 'shorts' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredVideos.map((v) => (
                <article key={v.id} className="group">
                  <button
                    type="button"
                    onClick={() => cardProps.onWatch(v.id, v)}
                    className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-neutral-200 dark:bg-[#1f1f1f] block cursor-pointer"
                  >
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                  </button>
                  <button
                    type="button"
                    onClick={() => cardProps.onWatch(v.id, v)}
                    className="mt-2 text-left text-sm font-semibold line-clamp-2 cursor-pointer"
                  >
                    {v.title}
                  </button>
                  <p className="text-xs text-[#606060] dark:text-[#aaaaaa] font-mono-nums">
                    {formatViews(v.views)} views
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
              {filteredVideos.map((v) => (
                <VideoCard key={v.id} video={v} {...cardProps} />
              ))}
            </div>
          )}

          {/* Infinite Scroll Sentinel for All Creator Uploads */}
          <div ref={sentinelRef} className="mt-10 flex flex-col items-center justify-center py-4">
            {loadingMore && (
              <div className="flex items-center gap-2 text-sm text-[#606060] dark:text-[#aaaaaa]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more creator videos...</span>
              </div>
            )}
            {!hasMore && videos.length > 0 && (
              <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">
                Showing all {videos.length} loaded uploads
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
