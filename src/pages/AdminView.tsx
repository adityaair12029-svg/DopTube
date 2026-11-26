import React, { useEffect, useState } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import type { RecommendationAnalytics, UserProfile } from '../types';
import { apiFetch } from '../lib/api';

interface AdminOverview {
  metrics: {
    totalUsers: number;
    totalVideos: number;
    openReports: number;
    pendingClaims: number;
  };
  users: Array<{ id: string; name: string; email: string; role: 'user' | 'creator' | 'admin'; preferredLanguage: string }>;
  reports: Array<{ id: string; target_type: string; target_id: string; reason: string; status: string; reporterName: string | null }>;
  copyrightClaims: Array<{ id: string; video_id: string; videoTitle: string; claimant_name: string; reason: string; status: string }>;
  auditLogs: Array<{ id: string; action: string; target_type: string; target_id: string; created_at: string }>;
}

export const AdminView: React.FC<{ user: UserProfile | null; onToast: (msg: string) => void }> = ({ user, onToast }) => {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [aiAnalytics, setAiAnalytics] = useState<RecommendationAnalytics | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    if (!user || user.role !== 'admin') return;
    Promise.all([
      apiFetch<AdminOverview>('/api/admin/overview'),
      apiFetch<RecommendationAnalytics>('/api/analytics/recommendations').catch(() => null),
    ])
      .then(([overview, analytics]) => {
        setData(overview);
        setAiAnalytics(analytics);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Admin access denied.'));
  };

  useEffect(() => {
    load();
  }, [user?.id, user?.role]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4">
        <ShieldCheck className="w-10 h-10 mx-auto text-[#0f1419] dark:text-white mb-3" />
        <h2 className="text-xl font-bold">Administrator Access Required</h2>
        <p className="text-sm text-[#536471] dark:text-[#71767b] mt-2">
          {error || 'Sign in with your Google Admin account (doptails@gmail.com) to access moderation, AI recommendation analytics, and audit tools.'}
        </p>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-sm">Loading admin console...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-24 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">DopTube Admin & Moderation Console</h1>
        <p className="text-sm text-[#536471] dark:text-[#71767b]">
          Role-protected trust, safety, copyright compliance, AI recommendation monitoring, and platform auditing.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Registered Users', data.metrics.totalUsers],
          ['Indexed Videos', data.metrics.totalVideos],
          ['Open Reports', data.metrics.openReports],
          ['Pending Copyright Claims', data.metrics.pendingClaims],
        ].map(([label, val]) => (
          <div key={String(label)} className="p-4 rounded-2xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336]">
            <p className="text-xs text-[#536471] dark:text-[#71767b]">{label}</p>
            <p className="text-2xl font-bold font-mono-nums mt-1">{val}</p>
          </div>
        ))}
      </div>

      {/* AI Recommendation Engine Analytics */}
      {aiAnalytics && (
        <section className="rounded-2xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-bold text-base">AI Recommendation Engine Analytics</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              ['Total Impressions', aiAnalytics.totalImpressions],
              ['Clicks', aiAnalytics.totalClicks],
              ['CTR', `${aiAnalytics.ctrPercent}%`],
              ['Completion Rate', `${aiAnalytics.completionRatePercent}%`],
              ['Not Interested', aiAnalytics.notInterestedCount],
              ['Creator Blocks', aiAnalytics.dontRecommendCreatorCount],
              ['Anomaly Flags', aiAnalytics.anomalyFlags],
            ].map(([label, val]) => (
              <div key={String(label)} className="p-3 rounded-xl bg-[#eff3f4] dark:bg-black border border-[#e5e7eb] dark:border-[#2f3336]">
                <p className="text-[11px] text-[#536471] dark:text-[#71767b]">{label}</p>
                <p className="text-lg font-bold font-mono-nums mt-0.5">{val}</p>
              </div>
            ))}
          </div>

          {aiAnalytics.topTopics.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#536471] dark:text-[#71767b] mb-2">Top User Interests</p>
              <div className="flex flex-wrap gap-2">
                {aiAnalytics.topTopics.map((topic) => (
                  <span
                    key={topic.topic}
                    className="px-3 py-1 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-xs font-medium"
                  >
                    {topic.topic} · avg {topic.avgScore}% ({topic.usersCount} users)
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Content Reports Queue */}
        <section className="rounded-2xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] p-5 space-y-3">
          <h2 className="font-bold text-base">Moderation Reports</h2>
          {data.reports.length === 0 ? (
            <p className="text-sm text-[#536471] dark:text-[#71767b]">No user reports filed.</p>
          ) : (
            data.reports.map((r) => (
              <div key={r.id} className="p-3 rounded-lg bg-[#eff3f4] dark:bg-black flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold">{r.reason}</p>
                  <p className="text-[#536471] dark:text-[#71767b]">
                    {r.target_type} ({r.target_id}) · Status: {r.status}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/reports/${r.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'resolved' }),
                      });
                      load();
                      onToast('Report resolved');
                    }}
                    className="px-2.5 py-1 rounded bg-emerald-600 text-white cursor-pointer"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/reports/${r.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'dismissed' }),
                      });
                      load();
                      onToast('Report dismissed');
                    }}
                    className="px-2.5 py-1 rounded bg-[#e5e7eb] dark:bg-[#202327] cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        {/* Copyright Claims */}
        <section className="rounded-2xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] p-5 space-y-3">
          <h2 className="font-bold text-base">Copyright Takedown Claims</h2>
          {data.copyrightClaims.length === 0 ? (
            <p className="text-sm text-[#536471] dark:text-[#71767b]">No active copyright claims.</p>
          ) : (
            data.copyrightClaims.map((c) => (
              <div key={c.id} className="p-3 rounded-lg bg-[#eff3f4] dark:bg-black space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold">{c.claimant_name}</span>
                  <span>{c.status}</span>
                </div>
                <p className="text-[#536471] dark:text-[#71767b]">Video: {c.videoTitle || c.video_id}</p>
                <p>{c.reason}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/copyright/${c.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'upheld_takedown', takedown: true }),
                      });
                      load();
                      onToast('Video taken down under copyright policy');
                    }}
                    className="px-3 py-1 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black font-bold cursor-pointer"
                  >
                    Takedown Video
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/copyright/${c.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'rejected', takedown: false }),
                      });
                      load();
                      onToast('Claim rejected');
                    }}
                    className="px-3 py-1 rounded-full bg-[#e5e7eb] dark:bg-[#202327] cursor-pointer"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {/* User Management & Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] p-5">
          <h2 className="font-bold text-base mb-3">Users & Role Permissions</h2>
          <div className="divide-y divide-[#e5e7eb] dark:divide-[#2f3336] max-h-72 overflow-y-auto">
            {data.users.map((u) => (
              <div key={u.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-[#536471] dark:text-[#71767b]">{u.email} · {u.preferredLanguage}</p>
                </div>
                <select
                  value={u.role}
                  onChange={async (e) => {
                    await apiFetch(`/api/admin/users/${u.id}/role`, {
                      method: 'PATCH',
                      body: JSON.stringify({ role: e.target.value }),
                    });
                    load();
                    onToast('User role updated');
                  }}
                  className="h-7 px-2 rounded bg-[#eff3f4] dark:bg-[#202327]"
                >
                  <option value="user">user</option>
                  <option value="creator">creator</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] p-5">
          <h2 className="font-bold text-base mb-3">Security Audit Logs</h2>
          <div className="space-y-2 max-h-72 overflow-y-auto text-xs font-mono-nums">
            {data.auditLogs.map((log) => (
              <div key={log.id} className="p-2 rounded bg-[#eff3f4] dark:bg-black flex justify-between gap-2">
                <span>{log.action} ({log.target_type})</span>
                <span className="text-[#536471] dark:text-[#71767b]">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
