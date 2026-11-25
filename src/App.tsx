import React, { useCallback, useEffect, useState } from 'react';
import type {
  AppPage,
  ChannelSummary,
  HomepageSection,
  MusicTrack,
  NotificationItem,
  PlaylistItem,
  UserProfile,
  VideoItem,
} from './types';
import { apiFetch } from './lib/api';
import { signOutFirebase } from './firebase';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MiniPlayer } from './components/MiniPlayer';
import { MusicMiniPlayer } from './components/MusicMiniPlayer';
import {
  AuthModal,
  OnboardingModal,
  PlaylistModal,
  ReportModal,
  ShareModal,
  ShortcutsModal,
  UploadModal,
  VoiceSearchModal,
} from './components/Modals';
import { HomeView } from './pages/HomeView';
import { SearchView } from './pages/SearchView';
import { WatchView } from './pages/WatchView';
import { ShortsView } from './pages/ShortsView';
import { MusicView } from './pages/MusicView';
import {
  ChannelView,
  HistoryView,
  PlaylistsView,
  QueueView,
  SimpleVideoCollectionView,
  SubscriptionsView,
  YouView,
} from './pages/LibraryViews';
import { StudioView } from './pages/StudioView';
import { AdminView } from './pages/AdminView';
import { HelpAndSupportView, SettingsView } from './pages/SettingsAndSupportView';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('doptube_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [page, setPage] = useState<AppPage>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shorts')) return 'shorts';
    return params.get('watch') ? 'watch' : 'home';
  });
  const [pageParam, setPageParam] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('shorts') || params.get('watch') || '';
  });

  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Personalized Home feed + infinite scroll state
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLanguage, setSelectedLanguage] = useState('All');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [shorts, setShorts] = useState<VideoItem[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [homeNextPageToken, setHomeNextPageToken] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [feedLoading, setFeedLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [shortsNextPageToken, setShortsNextPageToken] = useState('');
  const [shortsHasMore, setShortsHasMore] = useState(false);
  const [shortsLoadingMore, setShortsLoadingMore] = useState(false);

  // Playback, Autoplay & Queue state
  const [queue, setQueue] = useState<VideoItem[]>([]);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [autoplayMode, setAutoplayMode] = useState<'recommended' | 'playlist' | 'queue' | 'repeat'>('recommended');
  const [activePlaylistId, setActivePlaylistId] = useState('');

  // Music Hub & Mini Audio Player state
  const [activeMusicTrack, setActiveMusicTrack] = useState<MusicTrack | null>(null);
  const [musicQueue, setMusicQueue] = useState<MusicTrack[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VideoItem[]>([]);
  const [searchChannels, setSearchChannels] = useState<ChannelSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchNextPageToken, setSearchNextPageToken] = useState('');
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchSort, setSearchSort] = useState<'relevance' | 'date' | 'views'>('relevance');
  const [searchDuration, setSearchDuration] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [searchLanguage, setSearchLanguage] = useState('All');

  // Subscriptions & Notifications
  const [subscribedChannels, setSubscribedChannels] = useState<ChannelSummary[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Modals & Overlays
  const [authOpen, setAuthOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [playlistVideoId, setPlaylistVideoId] = useState<string | null>(null);
  const [shareVideo, setShareVideo] = useState<VideoItem | null>(null);
  const [reportVideo, setReportVideo] = useState<VideoItem | null>(null);
  const [miniPlayerVideo, setMiniPlayerVideo] = useState<VideoItem | null>(null);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? '' : curr));
    }, 3200);
  }, []);

  // Theme sync
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('doptube_theme', theme);
  }, [theme]);

  const loadQueue = useCallback(async () => {
    try {
      const qRes = await apiFetch<{ videos: VideoItem[] }>('/api/queue');
      setQueue(qRes.videos);
    } catch {
      setQueue([]);
    }
  }, []);

  const loadUserContext = useCallback(async () => {
    try {
      const me = await apiFetch<{ user: UserProfile | null }>('/api/auth/me');
      setUser(me.user);
      if (me.user?.preferences) {
        setAutoplayEnabled(me.user.preferences.autoplayEnabled);
        const params = new URLSearchParams(window.location.search);
        if (!me.user.preferences.onboardingCompleted && !params.has('autostart')) {
          setOnboardingOpen(true);
        }
      }
      const subRes = await apiFetch<{ channels: ChannelSummary[] }>('/api/subscriptions');
      setSubscribedChannels(subRes.channels);
      if (me.user) {
        const [notifRes] = await Promise.all([
          apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
          loadQueue(),
        ]);
        setNotifications(notifRes.notifications);
      } else {
        setNotifications([]);
        setQueue([]);
      }
    } catch {
      // ignore initial auth error
    }
  }, [loadQueue]);

  useEffect(() => {
    void loadUserContext();
  }, [loadUserContext]);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const [mainRes, shortsRes] = await Promise.all([
        apiFetch<{
          videos: VideoItem[];
          sections: HomepageSection[];
          nextCursor: number | null;
          nextPageToken?: string | null;
          hasMore: boolean;
        }>(
          `/api/recommendations/home?shorts=0&category=${encodeURIComponent(selectedCategory)}&language=${encodeURIComponent(
            selectedLanguage
          )}&cursor=0&limit=12`
        ),
        apiFetch<{ videos: VideoItem[]; nextPageToken?: string | null; hasMore?: boolean }>('/api/recommendations/shorts'),
      ]);
      setVideos(mainRes.videos);
      setSections(mainRes.sections || []);
      setNextCursor(mainRes.nextCursor ?? null);
      setHomeNextPageToken(mainRes.nextPageToken || '');
      setHasMore(Boolean(mainRes.hasMore));
      setShorts(shortsRes.videos);
      setShortsNextPageToken(shortsRes.nextPageToken || '');
      setShortsHasMore(Boolean(shortsRes.hasMore || shortsRes.nextPageToken));
    } catch {
      setVideos([]);
      setSections([]);
      setNextCursor(null);
      setHomeNextPageToken('');
      setHasMore(false);
    } finally {
      setFeedLoading(false);
    }
  }, [selectedCategory, selectedLanguage]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const tokenQs = homeNextPageToken ? `&pageToken=${encodeURIComponent(homeNextPageToken)}` : '';
      const res = await apiFetch<{
        videos: VideoItem[];
        nextCursor: number | null;
        nextPageToken?: string | null;
        hasMore: boolean;
      }>(
        `/api/recommendations/home?shorts=0&category=${encodeURIComponent(selectedCategory)}&language=${encodeURIComponent(
          selectedLanguage
        )}&cursor=${nextCursor ?? 0}&limit=12${tokenQs}`
      );
      setVideos((prev) => {
        const existing = new Set(prev.map((v) => v.id));
        const appended = res.videos.filter((v) => !existing.has(v.id));
        return [...prev, ...appended];
      });
      setNextCursor(res.nextCursor ?? null);
      setHomeNextPageToken(res.nextPageToken || '');
      setHasMore(Boolean(res.hasMore));
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, nextCursor, homeNextPageToken, selectedCategory, selectedLanguage]);

  const handleLoadMoreShorts = useCallback(async () => {
    if (shortsLoadingMore || !shortsHasMore || !shortsNextPageToken) return;
    setShortsLoadingMore(true);
    try {
      const res = await apiFetch<{
        videos: VideoItem[];
        nextPageToken?: string | null;
        hasMore?: boolean;
      }>(`/api/recommendations/shorts?pageToken=${encodeURIComponent(shortsNextPageToken)}`);
      setShorts((prev) => {
        const existing = new Set(prev.map((s) => s.id));
        const appended = res.videos.filter((s) => !existing.has(s.id));
        return [...prev, ...appended];
      });
      setShortsNextPageToken(res.nextPageToken || '');
      setShortsHasMore(Boolean(res.hasMore || res.nextPageToken));
    } catch {
      setShortsHasMore(false);
    } finally {
      setShortsLoadingMore(false);
    }
  }, [shortsLoadingMore, shortsHasMore, shortsNextPageToken]);

  const executeSearch = useCallback(
    async (q: string, sort = searchSort, duration = searchDuration, lang = searchLanguage) => {
      setSearchLoading(true);
      setSearchNextPageToken('');
      setSearchHasMore(false);
      try {
        const res = await apiFetch<{
          videos: VideoItem[];
          channels: ChannelSummary[];
          nextPageToken?: string | null;
          hasMore?: boolean;
        }>(
          `/api/search?q=${encodeURIComponent(q)}&sort=${sort}&duration=${duration}&language=${encodeURIComponent(lang)}`
        );
        setSearchResults(res.videos);
        setSearchChannels(res.channels);
        setSearchNextPageToken(res.nextPageToken || '');
        setSearchHasMore(Boolean(res.hasMore || res.nextPageToken));
      } catch {
        setSearchResults([]);
        setSearchChannels([]);
        setSearchNextPageToken('');
        setSearchHasMore(false);
      } finally {
        setSearchLoading(false);
      }
    },
    [searchSort, searchDuration, searchLanguage]
  );

  const handleLoadMoreSearch = useCallback(async () => {
    if (searchLoadingMore || !searchHasMore || !searchNextPageToken) return;
    setSearchLoadingMore(true);
    try {
      const res = await apiFetch<{
        videos: VideoItem[];
        nextPageToken?: string | null;
        hasMore?: boolean;
      }>(
        `/api/search?q=${encodeURIComponent(searchQuery)}&sort=${searchSort}&duration=${searchDuration}&language=${encodeURIComponent(
          searchLanguage
        )}&pageToken=${encodeURIComponent(searchNextPageToken)}`
      );
      setSearchResults((prev) => {
        const existing = new Set(prev.map((v) => v.id));
        const appended = res.videos.filter((v) => !existing.has(v.id));
        return [...prev, ...appended];
      });
      setSearchNextPageToken(res.nextPageToken || '');
      setSearchHasMore(Boolean(res.hasMore || res.nextPageToken));
    } catch {
      setSearchHasMore(false);
    } finally {
      setSearchLoadingMore(false);
    }
  }, [searchLoadingMore, searchHasMore, searchNextPageToken, searchQuery, searchSort, searchDuration, searchLanguage]);

  useEffect(() => {
    if (page === 'search') {
      void executeSearch(searchQuery, searchSort, searchDuration, searchLanguage);
    }
  }, [page, searchQuery, searchSort, searchDuration, searchLanguage, executeSearch]);

  const navigateTo = useCallback((nextPage: AppPage, param = '') => {
    setPage(nextPage);
    setPageParam(param);
    if (nextPage === 'watch') {
      setMiniPlayerVideo(null);
      setActiveMusicTrack(null);
      setSidebarExpanded(false);
      window.history.replaceState({}, '', `/?watch=${encodeURIComponent(param)}`);
    } else if (nextPage === 'shorts') {
      setMiniPlayerVideo(null);
      setActiveMusicTrack(null);
      window.history.replaceState({}, '', param ? `/?shorts=${encodeURIComponent(param)}` : '/?shorts=1');
    } else {
      if (nextPage === 'home') {
        setSidebarExpanded(true);
      }
      window.history.replaceState({}, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const openShort = useCallback(
    (shortId: string, shortVideo?: VideoItem) => {
      if (shortVideo) {
        setShorts((prev) => (prev.some((s) => s.id === shortVideo.id) ? prev : [shortVideo, ...prev]));
      }
      navigateTo('shorts', shortId);
    },
    [navigateTo]
  );

  useEffect(() => {
    if (page !== 'shorts' || !pageParam || pageParam === '1') return;
    if (shorts.some((s) => s.id === pageParam)) return;
    let cancelled = false;
    apiFetch<{ video: VideoItem }>(`/api/videos/${encodeURIComponent(pageParam)}`)
      .then((res) => {
        if (cancelled || !res.video) return;
        setShorts((prev) => (prev.some((s) => s.id === res.video.id) ? prev : [res.video, ...prev]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [page, pageParam, shorts]);

  const handleWatch = useCallback(
    (videoId: string, clickedVideo?: VideoItem) => {
      apiFetch('/api/recommendations/click', {
        method: 'POST',
        body: JSON.stringify({ videoId }),
      }).catch(() => {});

      const resolved =
        clickedVideo ||
        videos.find((v) => v.id === videoId) ||
        shorts.find((s) => s.id === videoId) ||
        searchResults.find((v) => v.id === videoId) ||
        queue.find((v) => v.id === videoId) ||
        sections.flatMap((s) => s.videos).find((v) => v.id === videoId);

      if (resolved?.isShort) {
        openShort(videoId, resolved);
        return;
      }
      navigateTo('watch', videoId);
    },
    [navigateTo, openShort, videos, shorts, searchResults, queue, sections]
  );

  const handleImpressions = useCallback((videoIds: string[]) => {
    apiFetch('/api/recommendations/impression', {
      method: 'POST',
      body: JSON.stringify({ videoIds, surface: 'home' }),
    }).catch(() => {});
  }, []);

  const handleToggleSidebar = () => {
    if (window.innerWidth < 768) {
      setMobileMenuOpen((v) => !v);
    } else {
      setSidebarExpanded((v) => !v);
    }
  };

  const handleSaveWatchLater = async (videoId: string) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    try {
      const res = await apiFetch<{ saved: boolean }>(`/api/watch-later/${videoId}`, { method: 'POST' });
      showToast(res.saved ? 'Saved to Watch later' : 'Removed from Watch later');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update Watch later');
    }
  };

  const handleSavePlaylist = (videoId: string) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setPlaylistVideoId(videoId);
  };

  const handlePlayNext = async (videoId: string) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    try {
      await apiFetch('/api/queue', {
        method: 'POST',
        body: JSON.stringify({ videoId, playNext: true }),
      });
      await loadQueue();
      showToast('Added to Play Next in queue');
    } catch {
      showToast('Could not add to queue');
    }
  };

  const handleAddToQueue = async (videoId: string) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    try {
      await apiFetch('/api/queue', {
        method: 'POST',
        body: JSON.stringify({ videoId, playNext: false }),
      });
      await loadQueue();
      showToast('Added to playback queue');
    } catch {
      showToast('Could not add to queue');
    }
  };

  const handleNotInterested = async (videoId: string) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    setSections((prev) => prev.map((sec) => ({ ...sec, videos: sec.videos.filter((v) => v.id !== videoId) })));
    try {
      await apiFetch('/api/events/feedback', {
        method: 'POST',
        body: JSON.stringify({ feedbackType: 'not_interested', videoId }),
      });
      showToast('Video removed from your recommendations');
    } catch {
      // ignore
    }
  };

  const handleDontRecommendCreator = async (channelId: string, channelName: string) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setVideos((prev) => prev.filter((v) => v.channelId !== channelId));
    setSections((prev) =>
      prev.map((sec) => ({ ...sec, videos: sec.videos.filter((v) => v.channelId !== channelId) }))
    );
    try {
      await apiFetch('/api/events/feedback', {
        method: 'POST',
        body: JSON.stringify({ feedbackType: 'dont_recommend_creator', channelId }),
      });
      showToast(`We won’t recommend ${channelName}`);
    } catch {
      // ignore
    }
  };

  const handlePlayPlaylist = (playlist: PlaylistItem) => {
    if (!playlist.videos || playlist.videos.length === 0) return;
    setActivePlaylistId(playlist.id);
    setAutoplayMode('playlist');
    setAutoplayEnabled(true);
    handleWatch(playlist.videos[0].id);
  };

  const handleToggleAutoplay = async () => {
    const next = !autoplayEnabled;
    setAutoplayEnabled(next);
    if (user) {
      await apiFetch('/api/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ autoplayEnabled: next }),
      }).catch(() => {});
    }
    showToast(next ? 'Autoplay enabled' : 'Autoplay paused');
  };

  const handlePlayMusicTrack = (track: MusicTrack, list: MusicTrack[]) => {
    setMiniPlayerVideo(null);
    setActiveMusicTrack(track);
    setMusicQueue(list);
    if (user) {
      apiFetch('/api/music/history', {
        method: 'POST',
        body: JSON.stringify({ trackId: track.id }),
      }).catch(() => {});
    }
  };

  const handleToggleLikeTrack = async (trackId: string) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    try {
      const target = activeMusicTrack?.id === trackId ? activeMusicTrack : musicQueue.find((t) => t.id === trackId);
      const nextLiked = !target?.isLiked;
      await apiFetch(`/api/music/like/${trackId}`, {
        method: 'POST',
        body: JSON.stringify({ liked: nextLiked }),
      });
      setActiveMusicTrack((prev) => (prev && prev.id === trackId ? { ...prev, isLiked: nextLiked } : prev));
      setMusicQueue((prev) => prev.map((t) => (t.id === trackId ? { ...t, isLiked: nextLiked } : t)));
      showToast(nextLiked ? 'Saved to Liked Songs' : 'Removed from Liked Songs');
    } catch {
      showToast('Could not update song like');
    }
  };

  const handleOpenUpload = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setUploadOpen(true);
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    await signOutFirebase().catch(() => {});
    setUser(null);
    setNotifications([]);
    setQueue([]);
    void loadUserContext();
    void loadFeed();
    showToast('Signed out of DopTube');
  };

  const handleUpdateUserPref = async (patch: Partial<{ preferredLanguage: string; restrictedMode: boolean }>) => {
    if (!user) return;
    const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (patch.preferredLanguage) {
      await apiFetch('/api/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ preferredLanguages: [patch.preferredLanguage] }),
      }).catch(() => {});
    }
    setUser(res.user);
    void loadFeed();
    showToast('Preferences updated');
  };

  const commonCardActions = {
    onWatch: handleWatch,
    onOpenChannel: (id: string) => navigateTo('channel', id),
    onSaveWatchLater: handleSaveWatchLater,
    onSavePlaylist: handleSavePlaylist,
    onShare: (v: VideoItem) => setShareVideo(v),
    onReport: (v: VideoItem) => setReportVideo(v),
    onMiniPlayer: (v: VideoItem) => setMiniPlayerVideo(v),
    onPlayNext: handlePlayNext,
    onAddToQueue: handleAddToQueue,
    onNotInterested: handleNotInterested,
    onDontRecommendCreator: handleDontRecommendCreator,
  };

  const mainMarginClass = sidebarExpanded ? 'md:ml-60' : 'md:ml-[72px]';
  const infiniteScrollEnabled = true;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] text-[#0f0f0f] dark:text-[#f1f1f1]">
      <Header
        user={user}
        theme={theme}
        searchQuery={searchQuery}
        notifications={notifications}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onToggleSidebar={handleToggleSidebar}
        onNavigate={navigateTo}
        onSearchSubmit={(q) => {
          setSearchQuery(q);
          navigateTo('search', q);
        }}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenUpload={handleOpenUpload}
        onOpenVoiceSearch={() => setVoiceOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onLogout={handleLogout}
        onUpdateUserPref={handleUpdateUserPref}
        onMarkNotificationsRead={() => {
          apiFetch('/api/notifications/read', { method: 'POST' })
            .then(() => setNotifications((prev) => prev.map((n) => ({ ...n, isRead: 1 }))))
            .catch(() => {});
        }}
      />

      <Sidebar
        expanded={sidebarExpanded}
        mobileOpen={mobileMenuOpen}
        currentPage={page}
        activeExploreCategory={selectedCategory !== 'All' ? selectedCategory : undefined}
        user={user}
        subscribedChannels={subscribedChannels}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onNavigate={navigateTo}
        onSelectCategory={(cat) => setSelectedCategory(cat)}
        onOpenUpload={handleOpenUpload}
      />

      <main className={`pt-14 transition-all duration-150 ${mainMarginClass}`}>
        {page === 'home' && (
          <HomeView
            videos={videos}
            shorts={shorts}
            sections={sections}
            loading={feedLoading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            infiniteScrollEnabled={infiniteScrollEnabled}
            selectedCategory={selectedCategory}
            selectedLanguage={selectedLanguage}
            onSelectCategory={setSelectedCategory}
            onSelectLanguage={setSelectedLanguage}
            onLoadMore={handleLoadMore}
            onOpenShort={(shortId, shortObj) => openShort(shortId, shortObj)}
            onImpressions={handleImpressions}
            {...commonCardActions}
          />
        )}

        {page === 'search' && (
          <SearchView
            query={searchQuery}
            videos={searchResults}
            channels={searchChannels}
            loading={searchLoading}
            loadingMore={searchLoadingMore}
            hasMore={searchHasMore}
            onLoadMore={handleLoadMoreSearch}
            sort={searchSort}
            duration={searchDuration}
            language={searchLanguage}
            onChangeSort={setSearchSort}
            onChangeDuration={setSearchDuration}
            onChangeLanguage={setSearchLanguage}
            {...commonCardActions}
          />
        )}

        {page === 'watch' && (
          <WatchView
            videoId={pageParam}
            user={user}
            autoplayEnabled={autoplayEnabled}
            autoplayMode={autoplayMode}
            activePlaylistId={activePlaylistId}
            queue={queue}
            onToggleAutoplay={handleToggleAutoplay}
            onChangeAutoplayMode={(mode) => setAutoplayMode(mode)}
            onQueueChanged={loadQueue}
            onWatch={handleWatch}
            onRedirectToShort={(v) => openShort(v.id, v)}
            onOpenChannel={(id) => navigateTo('channel', id)}
            onOpenAuth={() => setAuthOpen(true)}
            onSavePlaylist={handleSavePlaylist}
            onShare={(v) => setShareVideo(v)}
            onReport={(v) => setReportVideo(v)}
            onMinimize={(v) => {
              setMiniPlayerVideo(v);
              navigateTo('home');
            }}
            onToast={showToast}
            onSubscriptionsChanged={loadUserContext}
          />
        )}

        {page === 'shorts' && (
          <ShortsView
            shorts={shorts}
            initialShortId={pageParam}
            user={user}
            hasMore={shortsHasMore}
            loadingMore={shortsLoadingMore}
            onLoadMore={handleLoadMoreShorts}
            onSubscriptionsChanged={loadUserContext}
            onOpenAuth={() => setAuthOpen(true)}
            onOpenChannel={(id) => navigateTo('channel', id)}
            onSavePlaylist={handleSavePlaylist}
            onShare={(v) => setShareVideo(v)}
            onToast={showToast}
          />
        )}

        {page === 'music' && (
          <MusicView
            user={user}
            activeTrackId={activeMusicTrack?.id}
            onPlayTrack={handlePlayMusicTrack}
            onToggleLikeTrack={handleToggleLikeTrack}
            onOpenAuth={() => setAuthOpen(true)}
            onToast={showToast}
          />
        )}

        {page === 'you' && (
          <YouView
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            onNavigate={navigateTo}
            onPlayPlaylist={handlePlayPlaylist}
            {...commonCardActions}
          />
        )}

        {page === 'queue' && (
          <QueueView
            user={user}
            queue={queue}
            onOpenAuth={() => setAuthOpen(true)}
            onQueueChanged={loadQueue}
            onToast={showToast}
            {...commonCardActions}
          />
        )}

        {page === 'subscriptions' && (
          <SubscriptionsView user={user} onOpenAuth={() => setAuthOpen(true)} {...commonCardActions} />
        )}

        {page === 'history' && (
          <HistoryView
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            onUserUpdated={setUser}
            onToast={showToast}
            {...commonCardActions}
          />
        )}

        {page === 'playlists' && (
          <PlaylistsView
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            onPlayPlaylist={handlePlayPlaylist}
            onToast={showToast}
            {...commonCardActions}
          />
        )}

        {page === 'watch-later' && (
          <SimpleVideoCollectionView
            title="Watch later"
            endpoint="/api/watch-later"
            requiresAuth
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            {...commonCardActions}
          />
        )}

        {page === 'liked' && (
          <SimpleVideoCollectionView
            title="Liked videos"
            endpoint="/api/liked-videos"
            requiresAuth
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            {...commonCardActions}
          />
        )}

        {page === 'your-videos' && (
          <SimpleVideoCollectionView
            title="Your videos"
            subtitle="Native videos uploaded to your DopTube channel"
            endpoint={user?.channel ? `/api/channels/${user.channel.id}` : '/api/videos?shorts=0'}
            requiresAuth
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            allowNativeDownload
            {...commonCardActions}
          />
        )}

        {page === 'downloads' && (
          <SimpleVideoCollectionView
            title="Offline Downloads"
            subtitle="Download authorized DopTube-hosted MP4 videos for offline viewing"
            endpoint="/api/videos?shorts=0&nativeOnly=1"
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            allowNativeDownload
            {...commonCardActions}
          />
        )}

        {page === 'trending' && (
          <SimpleVideoCollectionView
            title="Trending India"
            subtitle="Most watched videos across India right now"
            endpoint="/api/recommendations/trending?shorts=0"
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            {...commonCardActions}
          />
        )}

        {page === 'channel' && (
          <ChannelView
            channelId={pageParam}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            onSubscriptionsChanged={loadUserContext}
            onToast={showToast}
            {...commonCardActions}
          />
        )}

        {page === 'studio' && (
          <StudioView
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            onOpenUpload={handleOpenUpload}
            onWatch={handleWatch}
            onUserUpdated={setUser}
            onToast={showToast}
          />
        )}

        {page === 'admin' && <AdminView user={user} onToast={showToast} />}

        {page === 'settings' && (
          <SettingsView
            user={user}
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            onUserUpdated={setUser}
            onPreferencesUpdated={() => {
              void loadUserContext();
              void loadFeed();
            }}
            onOpenAuth={() => setAuthOpen(true)}
            onToast={showToast}
          />
        )}

        {page === 'help' && <HelpAndSupportView onToast={showToast} />}
      </main>

      {/* Floating Video Miniplayer */}
      {miniPlayerVideo && page !== 'watch' && !activeMusicTrack && (
        <MiniPlayer
          video={miniPlayerVideo}
          onExpand={(id) => handleWatch(id)}
          onClose={() => setMiniPlayerVideo(null)}
        />
      )}

      {/* Persistent Music Mini Audio Player */}
      <MusicMiniPlayer
        track={activeMusicTrack}
        queue={musicQueue}
        onSelectTrack={(track) => handlePlayMusicTrack(track, musicQueue)}
        onToggleLike={handleToggleLikeTrack}
        onClose={() => setActiveMusicTrack(null)}
      />

      {/* Modals */}
      <AuthModal
        open={authOpen}
        theme={theme}
        onClose={() => setAuthOpen(false)}
        onSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          void loadUserContext();
          void loadFeed();
          showToast(`Signed in as ${loggedInUser.name}`);
        }}
      />

      <OnboardingModal
        open={onboardingOpen}
        initialLanguage={user?.preferredLanguage || 'English'}
        onClose={() => setOnboardingOpen(false)}
        onSaved={(updated) => {
          setUser(updated);
          void loadFeed();
          showToast('Personalized feed ready!');
        }}
      />

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onOpenMusicUpload={() => navigateTo('music')}
        onUploaded={(videoId) => {
          void loadFeed();
          showToast('Video published on DopTube!');
          handleWatch(videoId);
        }}
      />

      <PlaylistModal
        videoId={playlistVideoId}
        onClose={() => setPlaylistVideoId(null)}
        onToast={showToast}
      />

      <ReportModal video={reportVideo} onClose={() => setReportVideo(null)} onToast={showToast} />
      <ShareModal video={shareVideo} onClose={() => setShareVideo(null)} />
      <VoiceSearchModal
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onResult={(q) => {
          setSearchQuery(q);
          navigateTo('search', q);
        }}
      />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-16 md:bottom-6 left-4 md:left-6 z-50 px-4 py-2.5 rounded-lg bg-[#212121] dark:bg-[#f1f1f1] text-white dark:text-[#0f0f0f] text-sm font-medium shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
