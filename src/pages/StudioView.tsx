import React, { useEffect, useState } from 'react';
import { BarChart3, Edit3, Eye, MessageSquare, Trash2, Upload, Users, Video as VideoIcon } from 'lucide-react';
import type { ChannelSummary, UserProfile, VideoItem } from '../types';
import { apiFetch } from '../lib/api';
import { ALL_CATEGORIES, formatRelativeTime, formatViews, INDIAN_LANGUAGES } from '../lib/format';

interface StudioOverview {
  channel: ChannelSummary;
  stats: {
    totalViews: number;
    totalLikes: number;
    subscribers: number;
    videoCount: number;
    estWatchHours: number;
  };
  videos: VideoItem[];
  jobs: Array<{ id: string; videoTitle: string; stage: string; progress: number; status: string; updated_at: string }>;
  comments: Array<{ id: string; body: string; createdAt: string; authorName: string; videoTitle: string; videoId: string }>;
}

export const StudioView: React.FC<{
  user: UserProfile | null;
  onOpenAuth: () => void;
  onOpenUpload: () => void;
  onWatch: (videoId: string) => void;
  onUserUpdated: (user: UserProfile) => void;
  onToast: (msg: string) => void;
}> = ({ user, onOpenAuth, onOpenUpload, onWatch, onUserUpdated, onToast }) => {
  const [data, setData] = useState<StudioOverview | null>(null);
  const [editing, setEditing] = useState<VideoItem | null>(null);
  const [channelName, setChannelName] = useState('');
  const [channelDesc, setChannelDesc] = useState('');

  const load = () => {
    if (!user) return;
    apiFetch<StudioOverview>('/api/studio/overview')
      .then((res) => {
        setData(res);
        setChannelName(res.channel.name);
        setChannelDesc(res.channel.description || '');
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  if (!user) {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4">
        <h2 className="text-xl font-bold">DopTube Creator Studio</h2>
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mt-2">
          Sign in to upload native videos, inspect FFmpeg HLS jobs, and track Indian audience analytics.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 h-9 px-5 rounded-full bg-[#ff0033] text-white text-sm font-semibold cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-sm text-[#606060] dark:text-[#aaaaaa]">Loading DopTube Studio...</div>;

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await apiFetch(`/api/videos/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editing.title,
          description: editing.description,
          category: editing.category,
          language: editing.language,
          visibility: editing.visibility,
          tags: editing.tags,
        }),
      });
      setEditing(null);
      load();
      onToast('Video details updated');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const deleteVideo = async (id: string) => {
    await apiFetch(`/api/videos/${id}`, { method: 'DELETE' });
    load();
    onToast('Video deleted');
  };

  const saveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/channels/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: channelName, description: channelDesc }),
      });
      onUserUpdated(res.user);
      load();
      onToast('Channel details saved');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update channel.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-20 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">DopTube Studio</h1>
          <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">
            {data.channel.name} ({data.channel.handle})
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenUpload}
          className="h-10 px-5 rounded-full bg-[#ff0033] hover:bg-[#d9002b] text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          Upload video
        </button>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Views', value: formatViews(data.stats.totalViews), icon: Eye },
          { label: 'Subscribers', value: formatViews(data.stats.subscribers), icon: Users },
          { label: 'Est. Watch Time', value: `${data.stats.estWatchHours} hrs`, icon: BarChart3 },
          { label: 'Published Videos', value: String(data.stats.videoCount), icon: VideoIcon },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="p-4 rounded-xl bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#2e2e2e]"
            >
              <div className="flex items-center justify-between text-xs text-[#606060] dark:text-[#aaaaaa] mb-2">
                <span>{kpi.label}</span>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold font-mono-nums">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Videos Table */}
      <section className="rounded-xl border border-neutral-200 dark:border-[#2e2e2e] overflow-hidden">
        <div className="px-4 py-3 bg-neutral-50 dark:bg-[#181818] border-b border-neutral-200 dark:border-[#2e2e2e] font-semibold text-sm">
          Channel Content
        </div>
        {data.videos.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#606060] dark:text-[#aaaaaa]">
            No videos uploaded yet. Click “Upload video” to publish your first MP4/WebM video.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-[#606060] dark:text-[#aaaaaa] border-b border-neutral-200 dark:border-[#2e2e2e]">
                <tr>
                  <th className="py-2.5 px-4">Video</th>
                  <th className="py-2.5 px-3">Visibility</th>
                  <th className="py-2.5 px-3">Language</th>
                  <th className="py-2.5 px-3 text-right">Views</th>
                  <th className="py-2.5 px-3 text-right">Likes</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-[#272727]">
                {data.videos.map((v) => (
                  <tr key={v.id} className="hover:bg-neutral-50 dark:hover:bg-[#1a1a1a]">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-[240px]">
                        <img
                          src={v.thumbnailUrl}
                          alt={v.title}
                          referrerPolicy="no-referrer"
                          className="w-24 h-14 rounded object-cover shrink-0 bg-black"
                        />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onWatch(v.id)}
                            className="font-medium hover:underline text-left line-clamp-1 cursor-pointer"
                          >
                            {v.title}
                          </button>
                          <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">
                            {v.category} · {v.status}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 capitalize">{v.visibility}</td>
                    <td className="py-3 px-3">{v.language}</td>
                    <td className="py-3 px-3 text-right font-mono-nums">{formatViews(v.views)}</td>
                    <td className="py-3 px-3 text-right font-mono-nums">{formatViews(v.likes)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(v)}
                          aria-label={`Edit ${v.title}`}
                          className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-[#2c2c2c] cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteVideo(v.id)}
                          aria-label={`Delete ${v.title}`}
                          className="p-2 rounded-lg hover:bg-red-500/15 text-red-500 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Processing Queue + Channel Customization + Comments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-neutral-200 dark:border-[#2e2e2e] p-5 space-y-4">
          <h2 className="font-semibold text-base">Channel Customization</h2>
          <form onSubmit={saveChannel} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Channel Name</label>
              <input
                type="text"
                required
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Channel Bio</label>
              <textarea
                rows={3}
                value={channelDesc}
                onChange={(e) => setChannelDesc(e.target.value)}
                className="w-full p-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
              />
            </div>
            <button
              type="submit"
              className="h-9 px-4 rounded-full bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f] text-xs font-semibold cursor-pointer"
            >
              Save channel details
            </button>
          </form>

          {data.jobs.length > 0 && (
            <div className="pt-4 border-t border-neutral-200 dark:border-[#2e2e2e]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#606060] dark:text-[#aaaaaa] mb-2">
                FFmpeg Processing Queue
              </h3>
              <div className="space-y-2">
                {data.jobs.map((j) => (
                  <div key={j.id} className="text-xs flex items-center justify-between gap-2 p-2.5 rounded-lg bg-neutral-100 dark:bg-[#181818]">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{j.videoTitle}</p>
                      <p className="text-[#606060] dark:text-[#aaaaaa]">{j.stage}</p>
                    </div>
                    <span className="font-mono-nums font-semibold shrink-0">{j.progress}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 dark:border-[#2e2e2e] p-5">
          <h2 className="font-semibold text-base flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4" />
            Recent Audience Comments
          </h2>
          {data.comments.length === 0 ? (
            <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">No comments on your videos yet.</p>
          ) : (
            <div className="space-y-3">
              {data.comments.map((c) => (
                <div key={c.id} className="p-3 rounded-lg bg-neutral-100 dark:bg-[#181818] text-sm">
                  <div className="flex items-center justify-between text-xs text-[#606060] dark:text-[#aaaaaa] mb-1">
                    <span>{c.authorName} · {c.videoTitle}</span>
                    <span>{formatRelativeTime(c.createdAt)}</span>
                  </div>
                  <p>{c.body}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Inline Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={saveEdit}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#212121] border border-neutral-200 dark:border-[#383838] p-6 space-y-3"
          >
            <h3 className="font-bold text-base">Edit video details</h3>
            <div>
              <label className="block text-xs font-medium mb-1">Title</label>
              <input
                type="text"
                required
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="w-full h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea
                rows={3}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full p-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                className="h-9 px-2 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-xs"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={editing.language}
                onChange={(e) => setEditing({ ...editing, language: e.target.value })}
                className="h-9 px-2 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-xs"
              >
                {INDIAN_LANGUAGES.filter((l) => l !== 'All').map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <select
                value={editing.visibility}
                onChange={(e) => setEditing({ ...editing, visibility: e.target.value })}
                className="h-9 px-2 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-xs"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="h-9 px-4 rounded-full text-sm cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="h-9 px-4 rounded-full bg-[#ff0033] text-white text-sm font-semibold cursor-pointer">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
