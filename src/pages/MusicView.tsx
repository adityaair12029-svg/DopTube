import React, { useEffect, useState } from 'react';
import { Disc3, Heart, Library, ListMusic, Music2, Play, Plus, Radio, Sparkles, Upload, X } from 'lucide-react';
import type { MusicMix, MusicTrack, UserProfile } from '../types';
import { apiFetch } from '../lib/api';
import { INDIAN_LANGUAGES } from '../lib/format';

interface MusicViewProps {
  user: UserProfile | null;
  activeTrackId?: string;
  onPlayTrack: (track: MusicTrack, list: MusicTrack[]) => void;
  onToggleLikeTrack: (trackId: string) => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
}

type MusicTab = 'home' | 'explore' | 'library' | 'recent' | 'liked' | 'mixes';

export const MusicView: React.FC<MusicViewProps> = ({
  user,
  activeTrackId,
  onPlayTrack,
  onToggleLikeTrack,
  onOpenAuth,
  onToast,
}) => {
  const [tab, setTab] = useState<MusicTab>('home');
  const [language, setLanguage] = useState('All');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [mixes, setMixes] = useState<MusicMix[]>([]);
  const [recentTracks, setRecentTracks] = useState<MusicTrack[]>([]);
  const [likedTracks, setLikedTracks] = useState<MusicTrack[]>([]);
  const [uploadedTracks, setUploadedTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [albumName, setAlbumName] = useState('');
  const [trackLang, setTrackLang] = useState('Hindi');
  const [genre, setGenre] = useState('Indie Pop');
  const [uploading, setUploading] = useState(false);

  const loadMusic = async () => {
    setLoading(true);
    try {
      const homeRes = await apiFetch<{ tracks: MusicTrack[]; mixes: MusicMix[]; recentlyPlayed: MusicTrack[] }>(
        `/api/music/home?language=${encodeURIComponent(language)}`
      );
      setTracks(homeRes.tracks);
      setMixes(homeRes.mixes);
      setRecentTracks(homeRes.recentlyPlayed);

      if (user) {
        const libRes = await apiFetch<{ liked: MusicTrack[]; uploaded: MusicTrack[] }>('/api/music/library');
        setLikedTracks(libRes.liked);
        setUploadedTracks(libRes.uploaded);
      } else {
        setLikedTracks([]);
        setUploadedTracks([]);
      }
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMusic();
  }, [language, user?.id]);

  const handleUploadTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) {
      onToast('Please pick an MP3, M4A, WAV, or WebM audio file');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('audio', audioFile);
      if (coverFile) fd.append('cover', coverFile);
      fd.append('title', title);
      fd.append('artistName', artistName);
      fd.append('albumName', albumName || 'Single');
      fd.append('language', trackLang);
      fd.append('genre', genre);

      await apiFetch('/api/music/upload', { method: 'POST', body: fd });
      setUploadOpen(false);
      setAudioFile(null);
      setCoverFile(null);
      setTitle('');
      setArtistName('');
      setAlbumName('');
      onToast('Track published on DopTube Music');
      void loadMusic();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Audio upload failed');
    } finally {
      setUploading(false);
    }
  };

  const renderTrackList = (list: MusicTrack[], emptyMsg: string) => {
    if (loading) {
      return <p className="text-sm text-[#606060] dark:text-[#aaaaaa] py-8">Loading DopTube Music...</p>;
    }
    if (list.length === 0) {
      return (
        <div className="py-12 text-center rounded-2xl border border-dashed border-neutral-300 dark:border-[#333] px-4">
          <Music2 className="w-9 h-9 mx-auto text-[#ff0033] mb-2" />
          <p className="text-sm font-semibold">{emptyMsg}</p>
          <p className="text-xs text-[#606060] dark:text-[#aaaaaa] mt-1">
            Upload your original MP3/M4A/WAV audio or native Music videos directly to DopTube.
          </p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-neutral-200 dark:divide-[#262626] rounded-2xl border border-neutral-200 dark:border-[#2e2e2e] overflow-hidden">
        {list.map((t, idx) => {
          const isCurrent = t.id === activeTrackId;
          return (
            <div
              key={t.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
                isCurrent ? 'bg-[#ff0033]/10' : 'hover:bg-neutral-100 dark:hover:bg-[#1d1d1d]'
              }`}
            >
              <button
                type="button"
                onClick={() => onPlayTrack(t, list)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
              >
                <span className="w-5 text-xs font-mono-nums text-[#606060] dark:text-[#aaaaaa] shrink-0">{idx + 1}</span>
                <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-neutral-200 dark:bg-[#272727]">
                  <img src={t.coverUrl} alt={t.title} className="w-full h-full object-cover" />
                  <span className="absolute inset-0 bg-black/35 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play className="w-4 h-4 text-white fill-white" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-[#ff0033]' : ''}`}>{t.title}</p>
                  <p className="text-xs text-[#606060] dark:text-[#aaaaaa] truncate">
                    {t.artistName} · {t.language} · {t.plays} plays
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => (user ? onToggleLikeTrack(t.id) : onOpenAuth())}
                aria-label={`Like ${t.title}`}
                className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-[#2c2c2c] cursor-pointer"
              >
                <Heart className={`w-4 h-4 ${t.isLiked ? 'fill-[#ff0033] text-[#ff0033]' : 'text-[#606060] dark:text-[#aaaaaa]'}`} />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 pb-28 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-[#ff0033] text-white flex items-center justify-center shrink-0">
            <Disc3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">DopTube Music</h1>
            <p className="text-xs sm:text-sm text-[#606060] dark:text-[#aaaaaa]">
              Independent Indian audio streaming for DopTube-hosted tracks & Music creators
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Filter music by language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-9 px-3 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs font-medium"
          >
            {INDIAN_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l === 'All' ? 'All Languages' : l}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => (user ? setUploadOpen(true) : onOpenAuth())}
            className="h-9 px-4 rounded-full bg-[#ff0033] hover:bg-[#d9002b] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Audio</span>
          </button>
        </div>
      </div>

      {/* Music Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {(
          [
            ['home', 'Home', Music2],
            ['explore', 'Explore', Radio],
            ['library', 'Library', Library],
            ['recent', 'Recently Played', ListMusic],
            ['liked', 'Liked Songs', Heart],
            ['mixes', 'Auto Mixes', Sparkles],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-9 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              tab === id
                ? 'bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f]'
                : 'bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#3a3a3a]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'home' && (
        <div className="space-y-6">
          {mixes.length > 0 && (
            <section>
              <h2 className="text-base font-bold mb-3">Regional Auto Mixes</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {mixes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => m.tracks[0] && onPlayTrack(m.tracks[0], m.tracks)}
                    className="p-3 rounded-2xl bg-neutral-100 dark:bg-[#1c1c1c] hover:bg-neutral-200 dark:hover:bg-[#262626] text-left transition-colors cursor-pointer"
                  >
                    <img src={m.coverUrl} alt={m.title} className="w-full aspect-square rounded-xl object-cover mb-2.5" />
                    <p className="text-sm font-bold truncate">{m.title}</p>
                    <p className="text-xs text-[#606060] dark:text-[#aaaaaa] truncate">{m.subtitle}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-base font-bold mb-3">All DopTube-Hosted Tracks</h2>
            {renderTrackList(tracks, 'No audio tracks uploaded yet.')}
          </section>
        </div>
      )}

      {tab === 'explore' && renderTrackList(tracks, 'No tracks available in this language yet.')}

      {tab === 'library' &&
        (user ? (
          <div className="space-y-6">
            <section>
              <h2 className="text-base font-bold mb-3">Your Uploaded Tracks ({uploadedTracks.length})</h2>
              {renderTrackList(uploadedTracks, 'You have not uploaded any audio tracks yet.')}
            </section>
            <section>
              <h2 className="text-base font-bold mb-3">Liked Songs ({likedTracks.length})</h2>
              {renderTrackList(likedTracks, 'Songs you like appear here.')}
            </section>
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mb-3">Sign in with Google to access your DopTube Music library.</p>
            <button type="button" onClick={onOpenAuth} className="h-9 px-5 rounded-full bg-[#ff0033] text-white text-sm font-semibold cursor-pointer">
              Sign in
            </button>
          </div>
        ))}

      {tab === 'recent' &&
        (user
          ? renderTrackList(recentTracks, 'No recently played audio tracks yet.')
          : renderTrackList([], 'Sign in to track your recently played music.'))}

      {tab === 'liked' &&
        (user
          ? renderTrackList(likedTracks, 'No liked songs yet.')
          : renderTrackList([], 'Sign in to view your liked songs.'))}

      {tab === 'mixes' &&
        (mixes.length === 0 ? (
          renderTrackList([], 'Auto Mixes appear automatically once DopTube audio tracks are published.')
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mixes.map((m) => (
              <div key={m.id} className="p-4 rounded-2xl border border-neutral-200 dark:border-[#2e2e2e] space-y-3">
                <div className="flex items-center gap-3">
                  <img src={m.coverUrl} alt={m.title} className="w-16 h-16 rounded-xl object-cover" />
                  <div>
                    <h3 className="font-bold text-base">{m.title}</h3>
                    <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">{m.subtitle}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => m.tracks[0] && onPlayTrack(m.tracks[0], m.tracks)}
                  className="w-full h-9 rounded-full bg-[#ff0033] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  Play Mix
                </button>
              </div>
            ))}
          </div>
        ))}

      {/* Audio Track Upload Modal */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#212121] border border-neutral-200 dark:border-[#383838] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Upload Audio to DopTube Music</h2>
              <button type="button" onClick={() => setUploadOpen(false)} aria-label="Close audio upload" className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-[#383838] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUploadTrack} className="space-y-3.5">
              <label className="block border-2 border-dashed border-neutral-300 dark:border-[#3e3e3e] rounded-xl p-4 text-center cursor-pointer hover:border-[#ff0033]">
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setAudioFile(f);
                    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
                  }}
                />
                <Upload className="w-6 h-6 mx-auto mb-1 text-[#ff0033]" />
                <p className="text-xs font-medium">{audioFile ? audioFile.name : 'Select MP3, M4A, WAV, or WebM audio file'}</p>
              </label>

              <input
                type="text"
                required
                minLength={2}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Track Title *"
                className="w-full h-10 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  placeholder="Artist Name"
                  className="h-10 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
                />
                <input
                  type="text"
                  value={albumName}
                  onChange={(e) => setAlbumName(e.target.value)}
                  placeholder="Album / Single"
                  className="h-10 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={trackLang}
                  onChange={(e) => setTrackLang(e.target.value)}
                  className="h-10 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
                >
                  {INDIAN_LANGUAGES.filter((l) => l !== 'All').map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="Genre"
                  className="h-10 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
                />
              </div>

              <label className="block text-xs text-[#606060] dark:text-[#aaaaaa]">
                Cover Art (optional):
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-xs"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setUploadOpen(false)} className="h-9 px-4 rounded-full text-xs font-medium cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="h-9 px-5 rounded-full bg-[#ff0033] text-white text-xs font-semibold cursor-pointer"
                >
                  {uploading ? 'Uploading...' : 'Publish Track'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
