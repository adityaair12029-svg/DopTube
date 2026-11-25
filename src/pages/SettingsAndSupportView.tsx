import React, { useEffect, useState } from 'react';
import { Ban, Download, Moon, Plus, RotateCcw, Sparkles, Sun, Trash2, X } from 'lucide-react';
import type { BlockedCreator, BlockedTopic, UserInterest, UserPreferences, UserProfile } from '../types';
import { apiFetch } from '../lib/api';
import { INDIAN_LANGUAGES } from '../lib/format';

export const SettingsView: React.FC<{
  user: UserProfile | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onUserUpdated: (user: UserProfile | null) => void;
  onPreferencesUpdated: () => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
}> = ({ user, theme, onToggleTheme, onUserUpdated, onPreferencesUpdated, onOpenAuth, onToast }) => {
  const [name, setName] = useState(user?.name ?? '');
  const [lang, setLang] = useState(user?.preferredLanguage ?? 'Hindi');
  const [prefs, setPrefs] = useState<UserPreferences | null>(user?.preferences ?? null);
  const [interests, setInterests] = useState<UserInterest[]>([]);
  const [blockedTopics, setBlockedTopics] = useState<BlockedTopic[]>([]);
  const [blockedCreators, setBlockedCreators] = useState<BlockedCreator[]>([]);
  const [newInterest, setNewInterest] = useState('');
  const [newBlockedTopic, setNewBlockedTopic] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadPreferences = () => {
    if (!user) return;
    apiFetch<{
      preferences: UserPreferences;
      interests: UserInterest[];
      blockedTopics: BlockedTopic[];
      blockedCreators: BlockedCreator[];
    }>('/api/preferences')
      .then((res) => {
        setPrefs(res.preferences);
        setInterests(res.interests);
        setBlockedTopics(res.blockedTopics);
        setBlockedCreators(res.blockedCreators);
      })
      .catch(() => {});
  };

  useEffect(() => {
    setName(user?.name ?? '');
    setLang(user?.preferredLanguage ?? 'Hindi');
    setPrefs(user?.preferences ?? null);
    loadPreferences();
  }, [user?.id]);

  const patchPref = async (patch: Partial<UserPreferences>) => {
    if (!user) return;
    const res = await apiFetch<{ preferences: UserPreferences }>('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setPrefs(res.preferences);
    onPreferencesUpdated();
  };

  const saveProfileAndLang = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const [profileRes] = await Promise.all([
      apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, preferredLanguage: lang }),
      }),
      apiFetch<{ preferences: UserPreferences }>('/api/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ preferredLanguages: [lang] }),
      }),
    ]);
    onUserUpdated(profileRes.user);
    onPreferencesUpdated();
    onToast('Profile & language preferences updated');
  };

  const updateInterestScore = async (topic: string, score: number) => {
    setInterests((prev) => prev.map((item) => (item.topic === topic ? { ...item, score } : item)));
    const res = await apiFetch<{ interests: UserInterest[] }>('/api/preferences/interests', {
      method: 'POST',
      body: JSON.stringify({ topic, score }),
    });
    setInterests(res.interests);
    onPreferencesUpdated();
  };

  const addInterestTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInterest.trim()) return;
    const res = await apiFetch<{ interests: UserInterest[] }>('/api/preferences/interests', {
      method: 'POST',
      body: JSON.stringify({ topic: newInterest.trim(), score: 80 }),
    });
    setInterests(res.interests);
    setNewInterest('');
    onPreferencesUpdated();
    onToast('Interest topic added');
  };

  const addBlockedTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newBlockedTopic.trim().length < 2) return;
    await apiFetch('/api/blocked-topics', {
      method: 'POST',
      body: JSON.stringify({ topic: newBlockedTopic.trim() }),
    });
    setNewBlockedTopic('');
    loadPreferences();
    onPreferencesUpdated();
    onToast('Topic blocked from recommendations');
  };

  const unblockTopic = async (topic: string) => {
    await apiFetch(`/api/blocked-topics/${encodeURIComponent(topic)}`, { method: 'DELETE' });
    setBlockedTopics((prev) => prev.filter((t) => t.topic !== topic));
    onPreferencesUpdated();
    onToast(`Unblocked ${topic}`);
  };

  const unblockCreator = async (channelId: string) => {
    await apiFetch(`/api/blocked-creators/${channelId}`, { method: 'DELETE' });
    setBlockedCreators((prev) => prev.filter((c) => c.channelId !== channelId));
    onPreferencesUpdated();
    onToast('Creator unblocked');
  };

  const clearWatchHistory = async () => {
    await apiFetch('/api/users/me/watch-history', { method: 'DELETE' });
    onPreferencesUpdated();
    onToast('Watch history cleared');
  };

  const resetRecommendations = async () => {
    if (!user) return;
    await apiFetch('/api/recommendations/reset', { method: 'POST' });
    loadPreferences();
    onPreferencesUpdated();
    onToast('Recommendation history & AI signals reset');
  };

  const exportUserData = async () => {
    const data = await apiFetch<Record<string, unknown>>('/api/users/me/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'doptube-my-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onToast('Downloaded your DopTube data archive');
  };

  const deleteAccount = async () => {
    await apiFetch('/api/auth/account', { method: 'DELETE' });
    onUserUpdated(null);
    setConfirmDelete(false);
    onToast('Account deleted');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Appearance & Playback */}
      <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e] space-y-4">
        <h2 className="font-semibold text-base">Appearance & Playback</h2>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">Switch between DopTube Dark and Light themes</p>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            className="h-9 px-4 rounded-full bg-neutral-100 dark:bg-[#272727] hover:bg-neutral-200 dark:hover:bg-[#383838] text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</span>
          </button>
        </div>

        {user && prefs && (
          <>
            <div className="flex items-center justify-between gap-4 pt-3 border-t border-neutral-200 dark:border-[#272727]">
              <div>
                <p className="text-sm font-medium">Infinite Scroll Feed</p>
                <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">Automatically load more recommended videos while scrolling</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.infiniteScrollEnabled}
                onClick={() => patchPref({ infiniteScrollEnabled: !prefs.infiniteScrollEnabled })}
                className={`h-8 px-4 rounded-full text-xs font-semibold cursor-pointer ${
                  prefs.infiniteScrollEnabled
                    ? 'bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f]'
                    : 'bg-neutral-100 dark:bg-[#272727]'
                }`}
              >
                {prefs.infiniteScrollEnabled ? 'Enabled' : 'Manual load'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 pt-3 border-t border-neutral-200 dark:border-[#272727]">
              <div>
                <p className="text-sm font-medium">Autoplay Next Video</p>
                <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">Automatically play the next recommended or queued video after 5s countdown</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.autoplayEnabled}
                onClick={() => patchPref({ autoplayEnabled: !prefs.autoplayEnabled })}
                className={`h-8 px-4 rounded-full text-xs font-semibold cursor-pointer ${
                  prefs.autoplayEnabled
                    ? 'bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f]'
                    : 'bg-neutral-100 dark:bg-[#272727]'
                }`}
              >
                {prefs.autoplayEnabled ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 pt-3 border-t border-neutral-200 dark:border-[#272727]">
              <div>
                <p className="text-sm font-medium">Restricted Mode</p>
                <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">Hide potentially mature content from feeds and search</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={user.restrictedMode}
                onClick={async () => {
                  const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
                    method: 'PATCH',
                    body: JSON.stringify({ restrictedMode: !user.restrictedMode }),
                  });
                  onUserUpdated(res.user);
                  onPreferencesUpdated();
                  onToast(`Restricted Mode ${res.user.restrictedMode ? 'enabled' : 'disabled'}`);
                }}
                className={`h-8 px-4 rounded-full text-xs font-semibold cursor-pointer ${
                  user.restrictedMode
                    ? 'bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f]'
                    : 'bg-neutral-100 dark:bg-[#272727]'
                }`}
              >
                {user.restrictedMode ? 'On' : 'Off'}
              </button>
            </div>
          </>
        )}
      </section>

      {!user ? (
        <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e]">
          <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mb-3">
            Sign in with Google to customize your Indian language preferences, DopTube AI topic weights, blocked topics/creators, and data privacy controls.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="h-9 px-5 rounded-full bg-[#ff0033] text-white text-sm font-semibold cursor-pointer"
          >
            Sign in with Google
          </button>
        </section>
      ) : (
        <>
          {/* Profile & Language */}
          <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e]">
            <h2 className="font-semibold text-base mb-3">Profile & Language Discovery</h2>
            <form onSubmit={saveProfileAndLang} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Preferred Indian Language</label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
                >
                  {INDIAN_LANGUAGES.filter((l) => l !== 'All').map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="h-9 px-4 rounded-full bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f] text-xs font-semibold cursor-pointer"
              >
                Save profile & language
              </button>
            </form>
          </section>

          {/* AI Personalization & Interest Profile */}
          <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e] space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#ff0033]" />
                  <span>AI Personalization & Interest Weights</span>
                </h2>
                <p className="text-xs text-[#606060] dark:text-[#aaaaaa] mt-0.5">
                  Adjust topic scores or turn off personalization to see non-personalized trending feeds.
                </p>
              </div>
              {prefs && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.personalizationEnabled}
                  onClick={() => patchPref({ personalizationEnabled: !prefs.personalizationEnabled })}
                  className={`h-8 px-4 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                    prefs.personalizationEnabled
                      ? 'bg-[#ff0033] text-white'
                      : 'bg-neutral-100 dark:bg-[#272727]'
                  }`}
                >
                  {prefs.personalizationEnabled ? 'Personalized' : 'Paused'}
                </button>
              )}
            </div>

            <form onSubmit={addInterestTopic} className="flex gap-2">
              <input
                type="text"
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                placeholder="Add topic (e.g. Physics, Cricket, Carnatic Music)..."
                className="flex-1 h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
              />
              <button
                type="submit"
                className="h-9 px-4 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add topic
              </button>
            </form>

            {interests.length === 0 ? (
              <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">
                No interest weights recorded yet. Watch videos or add a topic above.
              </p>
            ) : (
              <div className="space-y-3">
                {interests.map((item) => (
                  <div key={item.topic} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{item.topic}</span>
                      <span className="font-mono-nums text-[#606060] dark:text-[#aaaaaa]">{item.score}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={item.score}
                      onChange={(e) => updateInterestScore(item.topic, Number(e.target.value))}
                      className="w-full accent-[#ff0033] cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Blocked Topics */}
            <div className="pt-4 border-t border-neutral-200 dark:border-[#272727] space-y-2.5">
              <p className="text-sm font-medium">Blocked Topics</p>
              <form onSubmit={addBlockedTopic} className="flex gap-2">
                <input
                  type="text"
                  value={newBlockedTopic}
                  onChange={(e) => setNewBlockedTopic(e.target.value)}
                  placeholder="Block a topic from your recommendations..."
                  className="flex-1 h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
                />
                <button
                  type="submit"
                  className="h-9 px-4 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs font-semibold cursor-pointer"
                >
                  Block
                </button>
              </form>
              {blockedTopics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {blockedTopics.map((bt) => (
                    <span
                      key={bt.topic}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs"
                    >
                      <span>{bt.topic}</span>
                      <button
                        type="button"
                        onClick={() => unblockTopic(bt.topic)}
                        aria-label={`Unblock ${bt.topic}`}
                        className="hover:text-red-500 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Blocked Creators */}
            {blockedCreators.length > 0 && (
              <div className="pt-4 border-t border-neutral-200 dark:border-[#272727] space-y-2">
                <p className="text-sm font-medium">Hidden Creators</p>
                <div className="space-y-1.5">
                  {blockedCreators.map((bc) => (
                    <div
                      key={bc.channelId}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-100 dark:bg-[#1a1a1a] text-xs"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <Ban className="w-3.5 h-3.5 text-[#ff0033]" />
                        {bc.channelName}
                      </span>
                      <button
                        type="button"
                        onClick={() => unblockCreator(bc.channelId)}
                        className="text-[#065fd4] dark:text-[#3ea6ff] font-medium hover:underline cursor-pointer"
                      >
                        Allow again
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Data & Privacy Controls */}
          <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e] space-y-3">
            <h2 className="font-semibold text-base">Data & Privacy</h2>
            <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">
              DopTube stores only explicit behavior signals you control. Manage, export, or reset your data anytime.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={clearWatchHistory}
                className="h-9 px-4 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear watch history</span>
              </button>
              <button
                type="button"
                onClick={resetRecommendations}
                className="h-9 px-4 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset AI recommendation signals</span>
              </button>
              <button
                type="button"
                onClick={exportUserData}
                className="h-9 px-4 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download my data (JSON)</span>
              </button>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="p-5 rounded-xl border border-red-500/30 bg-red-500/5">
            <h2 className="font-semibold text-base text-red-500 mb-1">Danger Zone</h2>
            <p className="text-xs text-[#606060] dark:text-[#aaaaaa] mb-3">
              Permanently delete your DopTube account, channel, uploaded videos, playlists, and recommendation profile.
            </p>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="h-9 px-4 rounded-full bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Delete my account
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={deleteAccount}
                  className="h-9 px-4 rounded-full bg-red-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm permanent deletion
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-9 px-4 rounded-full bg-neutral-200 dark:bg-[#272727] text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export const HelpAndSupportView: React.FC<{ onToast: (msg: string) => void }> = ({ onToast }) => {
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);

  const submitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    setSent(true);
    setFeedback('');
    onToast('Thank you! Feedback received by DopTube India.');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6">
      <h1 className="text-2xl font-bold">DopTube Help, Copyright & Support</h1>

      <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e] space-y-2 text-sm">
        <h2 className="font-semibold text-base">Creator Ownership & Indian Legal Compliance</h2>
        <p className="text-[#606060] dark:text-[#aaaaaa]">
          DopTube respects the Information Technology Act and Copyright Act of India. Creators must only upload original or duly licensed content. Rights holders can file a formal takedown notice from any video’s Report menu.
        </p>
      </section>

      <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e]">
        <h2 className="font-semibold text-base mb-3">Send Platform Feedback</h2>
        {sent && (
          <p className="mb-3 text-xs text-emerald-500 font-medium">
            Your feedback has been logged with the DopTube product team.
          </p>
        )}
        <form onSubmit={submitFeedback} className="space-y-3">
          <textarea
            rows={4}
            required
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Share a bug report, Indian language request, or feature idea..."
            className="w-full p-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
          />
          <button
            type="submit"
            className="h-9 px-5 rounded-full bg-[#ff0033] text-white text-sm font-semibold cursor-pointer"
          >
            Send feedback
          </button>
        </form>
      </section>
    </div>
  );
};
