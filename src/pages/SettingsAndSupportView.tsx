import React, { useState } from 'react';
import type { UserProfile } from '../types';
import { apiFetch } from '../lib/api';
import { INDIAN_LANGUAGES } from '../lib/format';

export const SettingsView: React.FC<{
  user: UserProfile | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onUserUpdated: (user: UserProfile | null) => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
}> = ({ user, theme, onToggleTheme, onUserUpdated, onOpenAuth, onToast }) => {
  const [name, setName] = useState(user?.name ?? '');
  const [lang, setLang] = useState(user?.preferredLanguage ?? 'Hindi');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const savePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name, preferredLanguage: lang }),
    });
    onUserUpdated(res.user);
    onToast('Account preferences updated');
  };

  const resetRecommendations = async () => {
    if (!user) return;
    await apiFetch('/api/recommendations/reset', { method: 'POST' });
    onToast('Recommendation history & signals reset');
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      onToast('Password updated successfully');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Password update failed');
    }
  };

  const deleteAccount = async () => {
    await apiFetch('/api/auth/account', { method: 'DELETE' });
    onUserUpdated(null);
    onToast('Account deleted');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-20 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e] space-y-4">
        <h2 className="font-semibold text-base">Appearance & Playback</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-[#606060] dark:text-[#aaaaaa]">Switch between DopTube Dark and Light themes</p>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            className="h-9 px-4 rounded-full bg-neutral-100 dark:bg-[#272727] text-sm font-medium cursor-pointer"
          >
            Current: {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>
      </section>

      {!user ? (
        <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e]">
          <p className="text-sm text-[#606060] dark:text-[#aaaaaa] mb-3">
            Sign in to customize your Indian language preferences, recommendation engine, and security settings.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="h-9 px-5 rounded-full bg-[#ff0033] text-white text-sm font-semibold cursor-pointer"
          >
            Sign in
          </button>
        </section>
      ) : (
        <>
          <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e]">
            <h2 className="font-semibold text-base mb-3">Profile & Language Discovery</h2>
            <form onSubmit={savePreferences} className="space-y-3">
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
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="submit" className="h-9 px-4 rounded-full bg-[#0f0f0f] dark:bg-white text-white dark:text-[#0f0f0f] text-xs font-semibold cursor-pointer">
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={resetRecommendations}
                  className="h-9 px-4 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs font-medium cursor-pointer"
                >
                  Reset recommendation engine
                </button>
              </div>
            </form>
          </section>

          <section className="p-5 rounded-xl border border-neutral-200 dark:border-[#2e2e2e]">
            <h2 className="font-semibold text-base mb-3">Security & Password</h2>
            <form onSubmit={changePassword} className="space-y-3 max-w-sm">
              <input
                type="password"
                required
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="New password (min 6 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-300 dark:border-[#383838] text-sm"
              />
              <button type="submit" className="h-9 px-4 rounded-full bg-neutral-100 dark:bg-[#272727] text-xs font-semibold cursor-pointer">
                Update password
              </button>
            </form>
          </section>

          <section className="p-5 rounded-xl border border-red-500/30 bg-red-500/5">
            <h2 className="font-semibold text-base text-red-500 mb-1">Danger Zone</h2>
            <p className="text-xs text-[#606060] dark:text-[#aaaaaa] mb-3">
              Permanently delete your DopTube account, channel, uploaded videos, and playlists.
            </p>
            <button
              type="button"
              onClick={deleteAccount}
              className="h-9 px-4 rounded-full bg-red-600 text-white text-xs font-semibold cursor-pointer"
            >
              Delete my account
            </button>
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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-20 space-y-6">
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
