import React, { useEffect, useState } from 'react';
import { Check, Copy, FileVideo, ImagePlus, Mic, Plus, Share2, ShieldAlert, Sparkles, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { PlaylistItem, UserProfile, VideoItem } from '../types';
import { apiFetch, uploadWithProgress } from '../lib/api';
import { ALL_CATEGORIES, INDIAN_LANGUAGES } from '../lib/format';

export { XAuthModal as AuthModal } from './XAuthModal';

export const OnboardingModal: React.FC<{
  open: boolean;
  initialLanguage?: string;
  onClose: () => void;
  onSaved: (user: UserProfile) => void;
}> = ({ open, initialLanguage = 'English', onClose, onSaved }) => {
  const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
  const [selected, setSelected] = useState<string[]>(['Education', 'Technology', 'Music']);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const topics = [
    'Education',
    'Music',
    'Gaming',
    'Technology',
    'Cricket',
    'Comedy',
    'Cooking',
    'Travel',
    'Science',
    'News',
    'Movies',
    'Business',
  ];

  const toggleTopic = (t: string) => {
    setSelected((prev) => (prev.includes(t) ? prev.filter((item) => item !== t) : [...prev, t]));
  };

  const submit = async (skip = false) => {
    setSaving(true);
    try {
      await apiFetch('/api/preferences/interests', {
        method: 'POST',
        body: JSON.stringify({
          interests: skip ? [] : selected,
          preferredLanguage,
          onboardingCompleted: true,
        }),
      });
      const me = await apiFetch<{ user: UserProfile | null }>('/api/auth/me');
      if (me.user) onSaved(me.user);
      onClose();
    } catch {
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-black border border-[#e5e7eb] dark:border-[#2f3336] p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0f1419] dark:text-white mb-1">
              <Sparkles className="w-4 h-4" />
              <span>DopTube AI Personalization</span>
            </div>
            <h2 className="text-xl font-bold">Customize your Indian feed</h2>
            <p className="text-sm text-[#536471] dark:text-[#71767b] mt-0.5">
              Pick your preferred language and topics so DopTube starts recommending relevant videos immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={() => submit(true)}
            aria-label="Skip personalization"
            className="p-1.5 rounded-full hover:bg-[#eff3f4] dark:hover:bg-[#16181c] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5">Preferred Language</label>
          <select
            value={preferredLanguage}
            onChange={(e) => setPreferredLanguage(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
          >
            {INDIAN_LANGUAGES.filter((l) => l !== 'All').map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-xs font-semibold mb-2">Choose topics you enjoy</p>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => {
              const active = selected.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => toggleTopic(topic)}
                  className={`h-8 px-3.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#0f1419] text-white dark:bg-white dark:text-black'
                      : 'bg-[#eff3f4] dark:bg-[#202327] hover:bg-neutral-200 dark:hover:bg-[#2f3336]'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => submit(true)}
            className="text-xs font-medium text-[#536471] dark:text-[#71767b] hover:underline cursor-pointer"
          >
            Skip for now
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => submit(false)}
            className="h-9 px-5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-semibold cursor-pointer"
          >
            {saving ? 'Saving...' : 'Build my feed'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const UploadModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onUploaded: (videoId: string) => void;
  onOpenMusicUpload?: () => void;
}> = ({ open, onClose, onUploaded, onOpenMusicUpload }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Education');
  const [language, setLanguage] = useState('Hindi');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [isShort, setIsShort] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [processingStage, setProcessingStage] = useState('');
  const [processingPct, setProcessingPct] = useState(0);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      setError('Please select a video file (MP4, WebM, or MOV).');
      return;
    }
    setError('');
    setUploading(true);
    setUploadPct(0);

    try {
      const fd = new FormData();
      fd.append('video', videoFile);
      if (thumbFile) fd.append('thumbnail', thumbFile);
      fd.append('title', title);
      fd.append('description', description);
      fd.append('category', category);
      fd.append('language', language);
      fd.append('tags', tags);
      fd.append('visibility', visibility);
      fd.append('isShort', isShort ? 'true' : 'false');

      const { videoId } = await uploadWithProgress('/api/videos/upload', fd, setUploadPct);
      setProcessingStage('Queued for FFmpeg HLS transcoding...');

      const poll = async () => {
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 750));
          const st = await apiFetch<{ stage: string; progress: number; status: string; video_status: string }>(
            `/api/videos/${videoId}/status`
          );
          setProcessingStage(st.stage);
          setProcessingPct(st.progress);
          if (st.status === 'completed' || st.video_status === 'published') {
            setUploading(false);
            onUploaded(videoId);
            onClose();
            return;
          }
        }
        setUploading(false);
        onUploaded(videoId);
        onClose();
      };
      await poll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-black border border-[#e5e7eb] dark:border-[#2f3336] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-[#383838] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Upload video to DopTube</h2>
            {onOpenMusicUpload && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMusicUpload();
                }}
                className="text-xs text-[#536471] dark:text-[#71767b] hover:text-[#0f1419] dark:hover:text-white hover:underline cursor-pointer"
              >
                Want to upload an MP3/M4A audio track to DopTube Music instead?
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload dialog"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-[#383838] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleUpload} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Video File Picker */}
          <label className="block border-2 border-dashed border-[#e5e7eb] dark:border-[#2f3336] rounded-xl p-6 text-center cursor-pointer hover:border-[#0f1419] dark:hover:border-white transition-colors">
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setVideoFile(file);
                if (file && !title) {
                  setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
                }
              }}
            />
            <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-[#2c2c2c] mx-auto flex items-center justify-center mb-2">
              {videoFile ? <FileVideo className="w-6 h-6 text-[#0f1419] dark:text-white" /> : <Upload className="w-6 h-6" />}
            </div>
            <p className="text-sm font-medium">
              {videoFile ? `${videoFile.name} (${(videoFile.size / (1024 * 1024)).toFixed(2)} MB)` : 'Select MP4, WebM, or MOV video file'}
            </p>
            <p className="text-xs text-[#606060] dark:text-[#aaaaaa] mt-1">
              Processed automatically with FFmpeg for adaptive 360p & 720p HLS streaming
            </p>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Title *</label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add a clear title describing your video"
                className="w-full h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell viewers about your video..."
                className="w-full p-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
              >
                {INDIAN_LANGUAGES.filter((l) => l !== 'All').map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'unlisted' | 'private')}
                className="w-full h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Tags (comma separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. physics, jee, hindi"
                className="w-full h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Custom Thumbnail (optional)</label>
              <label className="h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-xs flex items-center gap-2 cursor-pointer">
                <ImagePlus className="w-4 h-4 shrink-0" />
                <span className="truncate">{thumbFile ? thumbFile.name : 'Auto-generate from video'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="flex items-center pt-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isShort}
                  onChange={(e) => setIsShort(e.target.checked)}
                  className="w-4 h-4 accent-[#0f1419] dark:accent-white"
                />
                <span>Publish as DopTube Short (vertical)</span>
              </label>
            </div>
          </div>

          {uploading && (
            <div className="p-4 rounded-xl bg-neutral-100 dark:bg-[#181818] space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>{processingStage || 'Uploading video bytes...'}</span>
                <span className="font-mono-nums">{processingStage ? `${processingPct}%` : `${uploadPct}%`}</span>
              </div>
              <div className="h-2 rounded-full bg-neutral-300 dark:bg-[#333] overflow-hidden">
                <div
                  className="h-full bg-[#0f1419] dark:bg-white transition-all duration-200"
                  style={{ width: `${processingStage ? processingPct : uploadPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="h-9 px-4 rounded-full text-sm font-medium hover:bg-neutral-100 dark:hover:bg-[#333] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="h-9 px-5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-60 cursor-pointer"
            >
              {uploading ? 'Processing...' : 'Publish Video'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const PlaylistModal: React.FC<{
  videoId: string | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}> = ({ videoId, onClose, onToast }) => {
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!videoId) return;
    apiFetch<{ playlists: PlaylistItem[] }>('/api/playlists')
      .then((res) => setPlaylists(res.playlists))
      .catch(() => {});
  }, [videoId]);

  if (!videoId) return null;

  const toggleVideoInPlaylist = async (pl: PlaylistItem) => {
    const exists = pl.videos.some((v) => v.id === videoId);
    try {
      if (exists) {
        await apiFetch(`/api/playlists/${pl.id}/videos/${videoId}`, { method: 'DELETE' });
        setPlaylists((prev) =>
          prev.map((p) => (p.id === pl.id ? { ...p, videos: p.videos.filter((v) => v.id !== videoId) } : p))
        );
        onToast(`Removed from ${pl.title}`);
      } else {
        await apiFetch(`/api/playlists/${pl.id}/videos`, {
          method: 'POST',
          body: JSON.stringify({ videoId }),
        });
        const refreshed = await apiFetch<{ playlists: PlaylistItem[] }>('/api/playlists');
        setPlaylists(refreshed.playlists);
        onToast(`Saved to ${pl.title}`);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Playlist update failed.');
    }
  };

  const createAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim().length < 2) return;
    setLoading(true);
    try {
      const created = await apiFetch<{ id: string }>('/api/playlists', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim(), visibility: 'private' }),
      });
      await apiFetch(`/api/playlists/${created.id}/videos`, {
        method: 'POST',
        body: JSON.stringify({ videoId }),
      });
      setNewTitle('');
      const refreshed = await apiFetch<{ playlists: PlaylistItem[] }>('/api/playlists');
      setPlaylists(refreshed.playlists);
      onToast('Created playlist and saved video.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to create playlist.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-black border border-[#e5e7eb] dark:border-[#2f3336] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base">Save video to...</h3>
          <button type="button" onClick={onClose} aria-label="Close playlist modal" className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-[#383838] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto mb-4">
          {playlists.length === 0 ? (
            <p className="text-sm text-[#606060] dark:text-[#aaaaaa]">No playlists yet. Create one below.</p>
          ) : (
            playlists.map((pl) => {
              const checked = pl.videos.some((v) => v.id === videoId);
              return (
                <label key={pl.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-[#2c2c2c] cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleVideoInPlaylist(pl)}
                    className="w-4 h-4 accent-[#0f1419] dark:accent-white"
                  />
                  <span className="flex-1 truncate">{pl.title}</span>
                  <span className="text-xs text-[#606060] dark:text-[#aaaaaa] font-mono-nums">{pl.videos.length}</span>
                </label>
              );
            })
          )}
        </div>

        <form onSubmit={createAndAdd} className="flex gap-2 pt-3 border-t border-neutral-200 dark:border-[#383838]">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New playlist name..."
            className="flex-1 h-9 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f] text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
        </form>
      </div>
    </div>
  );
};

export const ReportModal: React.FC<{
  video: VideoItem | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}> = ({ video, onClose, onToast }) => {
  const [tab, setTab] = useState<'report' | 'copyright'>('report');
  const [reason, setReason] = useState('Misleading or spam content');
  const [details, setDetails] = useState('');
  const [claimantName, setClaimantName] = useState('');
  const [claimantEmail, setClaimantEmail] = useState('');
  const [error, setError] = useState('');

  if (!video) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (tab === 'report') {
        await apiFetch('/api/reports', {
          method: 'POST',
          body: JSON.stringify({ targetType: 'video', targetId: video.id, reason, details }),
        });
        onToast('Report submitted to DopTube Trust & Safety.');
      } else {
        await apiFetch('/api/copyright', {
          method: 'POST',
          body: JSON.stringify({ videoId: video.id, claimantName, claimantEmail, reason: details }),
        });
        onToast('Copyright claim logged for review.');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-black border border-[#e5e7eb] dark:border-[#2f3336] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#0f1419] dark:text-white" />
            Report or Copyright Claim
          </h3>
          <button type="button" onClick={onClose} aria-label="Close report modal" className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-[#383838] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2 mb-4 p-1 rounded-lg bg-neutral-100 dark:bg-[#161616]">
          <button
            type="button"
            onClick={() => setTab('report')}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
              tab === 'report' ? 'bg-white dark:bg-[#2c2c2c] shadow-sm' : 'text-[#606060] dark:text-[#aaaaaa]'
            }`}
          >
            Content Report
          </button>
          <button
            type="button"
            onClick={() => setTab('copyright')}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
              tab === 'copyright' ? 'bg-white dark:bg-[#2c2c2c] shadow-sm' : 'text-[#606060] dark:text-[#aaaaaa]'
            }`}
          >
            Copyright Takedown
          </button>
        </div>

        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <form onSubmit={submit} className="space-y-3">
          {tab === 'report' ? (
            <div>
              <label className="block text-xs font-medium mb-1">Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
              >
                <option>Misleading or spam content</option>
                <option>Harassment or hate speech</option>
                <option>Harmful or dangerous acts</option>
                <option>Child safety concern</option>
                <option>Incorrect language or metadata</option>
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium mb-1">Rights Holder Name / Organization</label>
                <input
                  type="text"
                  required
                  value={claimantName}
                  onChange={(e) => setClaimantName(e.target.value)}
                  placeholder="Full legal name or studio"
                  className="w-full h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Contact Email</label>
                <input
                  type="email"
                  required
                  value={claimantEmail}
                  onChange={(e) => setClaimantEmail(e.target.value)}
                  placeholder="legal@organization.in"
                  className="w-full h-10 px-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium mb-1">
              {tab === 'copyright' ? 'Copyrighted Work Description *' : 'Additional details (optional)'}
            </label>
            <textarea
              rows={3}
              required={tab === 'copyright'}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide context or timestamps..."
              className="w-full p-3 rounded-lg bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-full text-sm hover:bg-neutral-100 dark:hover:bg-[#333] cursor-pointer">
              Cancel
            </button>
            <button type="submit" className="h-9 px-4 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-semibold cursor-pointer">
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const ShareModal: React.FC<{
  video: VideoItem | null;
  onClose: () => void;
}> = ({ video, onClose }) => {
  const [copied, setCopied] = useState(false);
  if (!video) return null;

  const shareUrl = `${window.location.origin}/?watch=${encodeURIComponent(video.id)}`;

  const copyLink = async () => {
    let success = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        success = true;
      }
    } catch {
      success = false;
    }

    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0b0f19] border border-[#e5e7eb] dark:border-[#2f3336] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <motion.span
              animate={copied ? { scale: [1, 1.2, 1], rotate: [0, -8, 0] } : { scale: 1, rotate: 0 }}
              transition={{ duration: 0.35 }}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                copied ? 'jio-gradient text-white' : 'bg-[#eff3f4] dark:bg-[#16181c] text-[#0f1419] dark:text-white'
              }`}
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span
                    key="hdr-check"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <Check className="w-4 h-4" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="hdr-share"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Share2 className="w-4 h-4" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.span>
            <h3 className="font-bold text-base">Share video</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close share dialog" className="p-1.5 rounded-full hover:bg-[#eff3f4] dark:hover:bg-[#1c2333] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm font-medium mb-3 line-clamp-2">{video.title}</p>
        <div className="flex items-center gap-2 p-2 rounded-xl bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336]">
          <input
            type="text"
            readOnly
            aria-label="Share URL"
            value={shareUrl}
            className="flex-1 bg-transparent text-xs font-mono-nums focus:outline-none px-1"
          />
          <motion.button
            type="button"
            onClick={copyLink}
            whileTap={{ scale: 0.92 }}
            animate={copied ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ duration: 0.28 }}
            aria-label={copied ? 'Copied link' : 'Copy share link'}
            className={`h-8 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              copied
                ? 'jio-gradient text-white shadow-md shadow-blue-600/25'
                : 'bg-[#0f1419] dark:bg-white text-white dark:text-black'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="btn-copied"
                  initial={{ scale: 0.4, rotate: -30, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied</span>
                </motion.span>
              ) : (
                <motion.span
                  key="btn-copy"
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export const VoiceSearchModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onResult: (query: string) => void;
}> = ({ open, onClose, onResult }) => {
  const [status, setStatus] = useState('Listening...');
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    if (!open) return;
    setTranscript('');
    const SpeechRec = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setStatus('Microphone speech recognition unavailable in this browser. Tap a quick topic below:');
      return;
    }

    const rec = new SpeechRec() as {
      lang: string;
      interimResults: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang = 'en-IN';
    rec.interimResults = true;
    setStatus('Speak now...');

    rec.onresult = (evt) => {
      const text = evt.results[0]?.[0]?.transcript ?? '';
      setTranscript(text);
      if (text.trim()) {
        setTimeout(() => {
          onResult(text.trim());
          onClose();
        }, 450);
      }
    };
    rec.onerror = () => {
      setStatus('Could not access microphone. Tap a quick topic below:');
    };
    try {
      rec.start();
    } catch {
      setStatus('Tap a quick topic below:');
    }
    return () => {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-black border border-[#e5e7eb] dark:border-[#2f3336] p-6 text-center relative shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close voice search" className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-[#383838] cursor-pointer">
          <X className="w-4 h-4" />
        </button>

        <div className="w-20 h-20 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black mx-auto flex items-center justify-center mb-4">
          <Mic className="w-9 h-9" />
        </div>
        <h3 className="text-lg font-bold mb-1">DopTube Voice Search</h3>
        <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mb-4">{transcript || status}</p>

        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {['Physics JEE', 'Indie Music', 'Cricket Highlights', 'Indian Tech', 'Street Food'].map((phrase) => (
            <button
              key={phrase}
              type="button"
              onClick={() => {
                onResult(phrase);
                onClose();
              }}
              className="px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-[#2f2f2f] hover:bg-neutral-200 dark:hover:bg-[#3f3f3f] text-xs font-medium cursor-pointer"
            >
              “{phrase}”
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ShortcutsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  if (!open) return null;
  const rows = [
    ['Space / K', 'Play or pause video'],
    ['J / Left Arrow', 'Rewind 5 seconds'],
    ['L / Right Arrow', 'Fast-forward 5 seconds'],
    ['M', 'Mute or unmute audio'],
    ['C', 'Toggle subtitles / captions'],
    ['T', 'Toggle theater mode'],
    ['F', 'Toggle fullscreen'],
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-black border border-[#e5e7eb] dark:border-[#2f3336] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base">Keyboard shortcuts</h3>
          <button type="button" onClick={onClose} aria-label="Close shortcuts dialog" className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-[#383838] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="divide-y divide-neutral-200 dark:divide-[#383838]">
          {rows.map(([key, desc]) => (
            <div key={key} className="py-2.5 flex items-center justify-between text-sm">
              <span className="text-[#606060] dark:text-[#aaaaaa]">{desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-[#eff3f4] dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] font-mono-nums text-xs">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
