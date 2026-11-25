import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Pause, Play, Plus, Trash2 } from 'lucide-react';
import type { ChannelSummary, PlaylistItem, UserProfile, VideoItem } from '../types';
import { apiFetch } from '../lib/api';
import { formatViews } from '../lib/format';
import { VideoCard } from '../components/VideoCard';

interface CommonCardProps {
  onWatch: (videoId: string) => void;
  onOpenChannel: (channelId: string) => void;
  onSaveWatchLater: (videoId: string) => void;
  onSavePlaylist: (videoId: string) => void;
  onShare: (video: VideoItem) => void;
  onReport: (video: VideoItem) => void;
}

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
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-2">
          Sign in to see updates from your favourite Indian creators on DopTube.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-9 px-5 rounded-full bg-[#065fd4] dark:bg-[#3ea6ff] text-white dark:text-[#0f0f0f] text-sm font-semibold cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-4 pb-20">
      <h1 className="text-xl font-bold mb-4">Subscriptions</h1>
      {channels.length > 0 && (
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-4 mb-6 border-b border-neutral-200 dark:border-[#272727]">
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
                className="w-14 h-14 rounded-full object-cover group-hover:ring-2 ring-[#ff0033]"
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
        <h2 className="text-xl font-bold">Keep track of what you watch</h2>
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-2">Watch history isn’t viewable when signed out.</p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-9 px-5 rounded-full bg-[#065fd4] dark:bg-[#3ea6ff] text-white dark:text-[#0f0f0f] text-sm font-semibold cursor-pointer"
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-20">
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
    onToast: (msg: string) => void;
  }
> = ({ user, onOpenAuth, onToast, ...cardProps }) => {
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [newTitle, setNewTitle] = useState('');

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
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-2">Sign in to view or build custom DopTube playlists.</p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-9 px-5 rounded-full bg-[#065fd4] dark:bg-[#3ea6ff] text-white dark:text-[#0f0f0f] text-sm font-semibold cursor-pointer"
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
      body: JSON.stringify({ title: newTitle.trim(), visibility: 'private' }),
    });
    setNewTitle('');
    load();
    onToast('Playlist created');
  };

  return (
    <div className="px-4 sm:px-6 py-4 pb-20 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Playlists</h1>
        <form onSubmit={createPlaylist} className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New playlist title..."
            className="h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#1f1f1f] border border-neutral-300 dark:border-[#383838] text-sm"
          />
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
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">No playlists yet. Create one above or save any video to a playlist.</p>
      ) : (
        <div className="space-y-8">
          {playlists.map((pl) => (
            <section key={pl.id} className="pb-6 border-b border-neutral-200 dark:border-[#272727]">
              <h2 className="text-lg font-semibold mb-3">
                {pl.title} <span className="text-xs font-normal text-[#606060] dark:text-[#aaaaaa] font-mono-nums">({pl.videos.length} videos)</span>
              </h2>
              {pl.videos.length === 0 ? (
                <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">No videos added yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {pl.videos.map((v) => (
                    <VideoCard key={v.id} video={v} {...cardProps} />
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

  useEffect(() => {
    if (requiresAuth && !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<{ videos: VideoItem[] }>(endpoint)
      .then((res) => setVideos(res.videos))
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, [endpoint, user?.id, requiresAuth]);

  if (requiresAuth && !user) {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-2">Sign in to access your {title.toLowerCase()}.</p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-9 px-5 rounded-full bg-[#065fd4] dark:bg-[#3ea6ff] text-white dark:text-[#0f0f0f] text-sm font-semibold cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-4 pb-20">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-1">{subtitle}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">Loading...</p>
      ) : videos.length === 0 ? (
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] py-10">No videos found in {title}.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
          {videos.map((v) => (
            <div key={v.id} className="space-y-2">
              <VideoCard video={v} {...cardProps} />
              {allowNativeDownload && v.sourceType === 'native' && (
                <a
                  href={v.videoUrl}
                  download={`${v.id}.mp4`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#065fd4] dark:text-[#3ea6ff] hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download MP4 (Authorized DopTube Host)
                </a>
              )}
            </div>
          ))}
        </div>
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

  useEffect(() => {
    setLoading(true);
    apiFetch<{ channel: ChannelSummary; videos: VideoItem[] }>(`/api/channels/${channelId}`)
      .then((res) => {
        setChannel(res.channel);
        setVideos(res.videos);
      })
      .catch(() => setChannel(null))
      .finally(() => setLoading(false));
  }, [channelId]);

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

  return (
    <div className="pb-20">
      <div className="h-32 sm:h-48 w-full" style={{ backgroundColor: channel.bannerColor || '#1f1f23' }} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-[#272727]">
          <div className="flex items-center gap-4">
            <img
              src={channel.avatarUrl}
              alt={channel.name}
              referrerPolicy="no-referrer"
              className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-white dark:border-[#0f0f0f] -mt-10 sm:-mt-14"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-1.5">
                {channel.name}
                {channel.verified && <CheckCircle2 className="w-5 h-5" />}
              </h1>
              <p className="text-xs sm:text-sm text-[#606060] dark:text-[#aaaaaa] font-mono-nums">
                {channel.handle} · {formatViews(channel.subscriberCount)} subscribers · {videos.length} videos
              </p>
              {channel.description && (
                <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-1.5 max-w-2xl">{channel.description}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={toggleSub}
            className={`h-10 px-6 rounded-full text-sm font-semibold shrink-0 cursor-pointer ${
              channel.isSubscribed
                ? 'bg-neutral-200 dark:bg-[#272727] text-[#0f0f0f] dark:text-[#f1f1f1]'
                : 'bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f]'
            }`}
          >
            {channel.isSubscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>

        <div className="mt-6">
          <h2 className="text-base font-bold mb-4">Videos</h2>
          {videos.length === 0 ? (
            <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">No public videos uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
              {videos.map((v) => (
                <VideoCard key={v.id} video={v} {...cardProps} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
