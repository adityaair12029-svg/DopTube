import React, { useCallback, useEffect, useState } from 'react';
import type { AppPage, ChannelSummary, NotificationItem, UserProfile, VideoItem } from './types';
import { apiFetch } from './lib/api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MiniPlayer } from './components/MiniPlayer';
import {
  AuthModal,
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
import {
  ChannelView,
  HistoryView,
  PlaylistsView,
  SimpleVideoCollectionView,
  SubscriptionsView,
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
    return params.get('watch') ? 'watch' : 'home';
  });
  const [pageParam, setPageParam] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('watch') || '';
  });

  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Home feed state
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLanguage, setSelectedLanguage] = useState('All');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [shorts, setShorts] = useState<VideoItem[]>([]);
  const [continueWatching, setContinueWatching] = useState<VideoItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VideoItem[]>([]);
  const [searchChannels, setSearchChannels] = useState<ChannelSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSort, setSearchSort] = useState<'relevance' | 'date' | 'views'>('relevance');
  const [searchDuration, setSearchDuration] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [searchLanguage, setSearchLanguage] = useState('All');

  // Subscriptions & Notifications
  const [subscribedChannels, setSubscribedChannels] = useState<ChannelSummary[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Modals & Overlays
  const [authOpen, setAuthOpen] = useState(false);
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

  const loadUserContext = useCallback(async () => {
    try {
      const me = await apiFetch<{ user: UserProfile | null }>('/api/auth/me');
      setUser(me.user);
      const subRes = await apiFetch<{ channels: ChannelSummary[] }>('/api/subscriptions');
      setSubscribedChannels(subRes.channels);
      if (me.user) {
        const [notifRes, histRes] = await Promise.all([
          apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
          apiFetch<{ videos: VideoItem[] }>('/api/history'),
        ]);
        setNotifications(notifRes.notifications);
        setContinueWatching(histRes.videos.filter((v) => (v.progressSec ?? 0) > 10));
      } else {
        setNotifications([]);
        setContinueWatching([]);
      }
    } catch {
      // ignore initial auth error
    }
  }, []);

  useEffect(() => {
    void loadUserContext();
  }, [loadUserContext]);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const [mainRes, shortsRes] = await Promise.all([
        apiFetch<{ videos: VideoItem[] }>(
          `/api/videos?shorts=0&category=${encodeURIComponent(selectedCategory)}&language=${encodeURIComponent(selectedLanguage)}`
        ),
        apiFetch<{ videos: VideoItem[] }>('/api/videos?shorts=1'),
      ]);
      setVideos(mainRes.videos);
      setShorts(shortsRes.videos);
    } catch {
      setVideos([]);
    } finally {
      setFeedLoading(false);
    }
  }, [selectedCategory, selectedLanguage]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const executeSearch = useCallback(
    async (q: string, sort = searchSort, duration = searchDuration, lang = searchLanguage) => {
      setSearchLoading(true);
      try {
        const res = await apiFetch<{ videos: VideoItem[]; channels: ChannelSummary[] }>(
          `/api/search?q=${encodeURIComponent(q)}&sort=${sort}&duration=${duration}&language=${encodeURIComponent(lang)}`
        );
        setSearchResults(res.videos);
        setSearchChannels(res.channels);
      } catch {
        setSearchResults([]);
        setSearchChannels([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [searchSort, searchDuration, searchLanguage]
  );

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
      setSidebarExpanded(false);
      window.history.replaceState({}, '', `/?watch=${encodeURIComponent(param)}`);
    } else {
      if (nextPage === 'home') {
        setSidebarExpanded(true);
      }
      window.history.replaceState({}, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
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

  const handleOpenUpload = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setUploadOpen(true);
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setNotifications([]);
    setContinueWatching([]);
    void loadUserContext();
    showToast('Signed out of DopTube');
  };

  const handleUpdateUserPref = async (patch: Partial<{ preferredLanguage: string; restrictedMode: boolean }>) => {
    if (!user) return;
    const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setUser(res.user);
    void loadFeed();
    showToast('Preferences updated');
  };

  const commonCardActions = {
    onWatch: (id: string) => navigateTo('watch', id),
    onOpenChannel: (id: string) => navigateTo('channel', id),
    onSaveWatchLater: handleSaveWatchLater,
    onSavePlaylist: handleSavePlaylist,
    onShare: (v: VideoItem) => setShareVideo(v),
    onReport: (v: VideoItem) => setReportVideo(v),
    onMiniPlayer: (v: VideoItem) => setMiniPlayerVideo(v),
  };

  const mainMarginClass =
    page === 'watch'
      ? sidebarExpanded
        ? 'md:ml-60'
        : 'md:ml-[72px]'
      : sidebarExpanded
      ? 'md:ml-60'
      : 'md:ml-[72px]';

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
            continueWatching={continueWatching}
            loading={feedLoading}
            selectedCategory={selectedCategory}
            selectedLanguage={selectedLanguage}
            onSelectCategory={setSelectedCategory}
            onSelectLanguage={setSelectedLanguage}
            onOpenShort={(shortId) => navigateTo('shorts', shortId)}
            {...commonCardActions}
          />
        )}

        {page === 'search' && (
          <SearchView
            query={searchQuery}
            videos={searchResults}
            channels={searchChannels}
            loading={searchLoading}
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
            onWatch={(id) => navigateTo('watch', id)}
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
            onOpenAuth={() => setAuthOpen(true)}
            onOpenChannel={(id) => navigateTo('channel', id)}
            onShare={(v) => setShareVideo(v)}
            onToast={showToast}
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
          <PlaylistsView user={user} onOpenAuth={() => setAuthOpen(true)} onToast={showToast} {...commonCardActions} />
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
            endpoint="/api/videos?trending=1&shorts=0"
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
            onWatch={(id) => navigateTo('watch', id)}
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
            onOpenAuth={() => setAuthOpen(true)}
            onToast={showToast}
          />
        )}

        {page === 'help' && <HelpAndSupportView onToast={showToast} />}
      </main>

      {/* Floating Miniplayer */}
      {miniPlayerVideo && page !== 'watch' && (
        <MiniPlayer
          video={miniPlayerVideo}
          onExpand={(id) => navigateTo('watch', id)}
          onClose={() => setMiniPlayerVideo(null)}
        />
      )}

      {/* Modals */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          void loadUserContext();
          void loadFeed();
          showToast(`Signed in as ${loggedInUser.name}`);
        }}
      />

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(videoId) => {
          void loadFeed();
          showToast('Video published on DopTube!');
          navigateTo('watch', videoId);
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
