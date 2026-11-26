import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clapperboard,
  Clock,
  Globe,
  HelpCircle,
  Keyboard,
  Languages,
  LogOut,
  Menu,
  Mic,
  Moon,
  Music2,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Sun,
  User,
  UserCheck,
  Video,
  X,
} from 'lucide-react';
import type { AppPage, NotificationItem, UserProfile } from '../types';
import { apiFetch } from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import { DopTubeLogo } from './DopTubeLogo';

interface SuggestionEntry {
  id?: string;
  query: string;
  previewThumb: string;
}

interface HeaderProps {
  user: UserProfile | null;
  theme: 'dark' | 'light';
  searchQuery: string;
  notifications: NotificationItem[];
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onNavigate: (page: AppPage, param?: string) => void;
  onSearchSubmit: (query: string) => void;
  onOpenAuth: () => void;
  onOpenUpload: () => void;
  onOpenVoiceSearch: () => void;
  onOpenShortcuts: () => void;
  onLogout: () => void;
  onUpdateUserPref: (patch: Partial<{ preferredLanguage: string; restrictedMode: boolean }>) => void;
  onMarkNotificationsRead: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  theme,
  searchQuery,
  notifications,
  onToggleTheme,
  onToggleSidebar,
  onNavigate,
  onSearchSubmit,
  onOpenAuth,
  onOpenUpload,
  onOpenVoiceSearch,
  onOpenShortcuts,
  onLogout,
  onUpdateUserPref,
  onMarkNotificationsRead,
}) => {
  const [inputVal, setInputVal] = useState(searchQuery);
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<SuggestionEntry[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);

  const [createOpen, setCreateOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const searchWrapRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputVal(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (!searchFocused) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ history: SuggestionEntry[]; suggestions: SuggestionEntry[] }>(
          `/api/search/suggestions?q=${encodeURIComponent(inputVal)}`
        );
        if (!cancelled) {
          setHistoryItems(res.history);
          setSuggestions(res.suggestions);
          setActiveIdx(-1);
        }
      } catch {
        // ignore transient suggestion fetch issues
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputVal, searchFocused]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchWrapRef.current && !searchWrapRef.current.contains(target)) setSearchFocused(false);
      if (createRef.current && !createRef.current.contains(target)) setCreateOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const combinedSuggestions: Array<SuggestionEntry & { isHistory: boolean }> = [
    ...historyItems.map((h) => ({ ...h, isHistory: true })),
    ...suggestions
      .filter((s) => !historyItems.some((h) => h.query.toLowerCase() === s.query.toLowerCase()))
      .map((s) => ({ ...s, isHistory: false })),
  ].slice(0, 10);

  const submitQuery = (q: string) => {
    setSearchFocused(false);
    setMobileSearchOpen(false);
    onSearchSubmit(q.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(combinedSuggestions.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(-1, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && combinedSuggestions[activeIdx]) {
        const picked = combinedSuggestions[activeIdx].query;
        setInputVal(picked);
        submitQuery(picked);
      } else {
        submitQuery(inputVal);
      }
    } else if (e.key === 'Escape') {
      setSearchFocused(false);
    }
  };

  const removeHistoryEntry = async (e: React.MouseEvent, id?: string) => {
    e.stopPropagation();
    if (!id) return;
    try {
      await apiFetch(`/api/search/history/${id}`, { method: 'DELETE' });
      setHistoryItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => n.isRead === 0).length;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-white dark:bg-black px-2 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-4 border-b border-[#e5e7eb] dark:border-[#2f3336]">
      {/* Left Zone: Hamburger + DopTube Logo */}
      {!mobileSearchOpen && (
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] text-[#0f1419] dark:text-[#e7e9ea] transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            aria-label="DopTube Home"
            className="py-1 px-0.5 sm:px-1 rounded-lg focus-visible:outline-2 focus-visible:outline-[#0f1419] dark:focus-visible:outline-white cursor-pointer"
          >
            <DopTubeLogo />
          </button>
        </div>
      )}

      {/* Center Zone: Search Bar + Voice Search */}
      <div
        ref={searchWrapRef}
        className={`${
          mobileSearchOpen ? 'flex flex-1' : 'hidden md:flex flex-1 max-w-[640px] mx-auto'
        } items-center gap-2 relative`}
      >
        {mobileSearchOpen && (
          <button
            type="button"
            onClick={() => setMobileSearchOpen(false)}
            aria-label="Close mobile search"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery(inputVal);
          }}
          className="flex flex-1 items-center relative"
        >
          <div
            className={`flex flex-1 items-center h-10 rounded-l-full border transition-colors ${
              searchFocused
                ? 'border-[#0f1419] dark:border-white pl-4'
                : 'border-[#cfd9de] dark:border-[#2f3336] pl-4'
            } bg-[#eff3f4] dark:bg-[#202327]`}
          >
            {searchFocused && <Search className="w-4 h-4 text-[#536471] dark:text-[#71767b] mr-2.5 shrink-0" />}
            <input
              type="text"
              value={inputVal}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search DopTube"
              aria-label="Search DopTube"
              className="w-full bg-transparent text-[15px] text-[#0f1419] dark:text-[#e7e9ea] placeholder:text-[#536471] dark:placeholder:text-[#71767b] focus:outline-none"
            />
            {inputVal && (
              <button
                type="button"
                onClick={() => setInputVal('')}
                aria-label="Clear search query"
                className="w-8 h-8 mr-1 rounded-full flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-[#2f3336] text-[#536471] dark:text-[#71767b] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            aria-label="Search"
            className="h-10 w-14 sm:w-16 rounded-r-full border border-l-0 border-[#cfd9de] dark:border-[#2f3336] bg-[#eff3f4] dark:bg-[#16181c] hover:bg-neutral-200 dark:hover:bg-[#202327] flex items-center justify-center text-[#0f1419] dark:text-[#e7e9ea] transition-colors cursor-pointer shrink-0"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Search Suggestions & History Dropdown */}
          {searchFocused && combinedSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-14 sm:right-16 mt-1.5 rounded-xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] shadow-2xl py-2 z-50 overflow-hidden">
              {combinedSuggestions.map((item, idx) => (
                <div
                  key={`${item.query}-${idx}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInputVal(item.query);
                    submitQuery(item.query);
                  }}
                  className={`flex items-center justify-between gap-3 px-4 py-1.5 cursor-pointer text-[14px] ${
                    activeIdx === idx
                      ? 'bg-neutral-100 dark:bg-[#383838]'
                      : 'hover:bg-neutral-100 dark:hover:bg-[#303030]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {item.isHistory ? (
                      <Clock className="w-4 h-4 text-[#606060] dark:text-[#aaaaaa] shrink-0" />
                    ) : (
                      <Search className="w-4 h-4 text-[#606060] dark:text-[#aaaaaa] shrink-0" />
                    )}
                    <span className="truncate font-medium text-[#0f0f0f] dark:text-[#f1f1f1]">{item.query}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.previewThumb && (
                      <img
                        src={item.previewThumb}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-12 h-7 object-cover rounded"
                      />
                    )}
                    {item.isHistory && item.id && (
                      <button
                        type="button"
                        onMouseDown={(e) => removeHistoryEntry(e, item.id)}
                        className="text-xs text-[#536471] dark:text-[#71767b] hover:text-[#0f1419] dark:hover:text-white hover:underline px-1 cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </form>

        <button
          type="button"
          onClick={onOpenVoiceSearch}
          aria-label="Search with your voice"
          title="Search with your voice"
          className="w-10 h-10 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:bg-neutral-200 dark:hover:bg-[#2f3336] flex items-center justify-center text-[#0f1419] dark:text-[#e7e9ea] transition-colors shrink-0 cursor-pointer"
        >
          <Mic className="w-5 h-5" />
        </button>
      </div>

      {/* Right Zone: Theme Toggle, Mobile Search, Create, Notifications, Profile */}
      {!mobileSearchOpen && (
        <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
          {/* Quick Light / Dark Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] text-[#0f1419] dark:text-[#e7e9ea] transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Mobile Search Trigger */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen(true)}
            aria-label="Open search"
            className="md:hidden w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] cursor-pointer"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* + Create (desktop/tablet; mobile uses bottom nav Upload button) */}
          <div ref={createRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onOpenAuth();
                  return;
                }
                setCreateOpen((v) => !v);
              }}
              aria-label="Create"
              className="h-9 px-3.5 rounded-full bg-[#eff3f4] dark:bg-[#202327] hover:bg-neutral-200 dark:hover:bg-[#2f3336] text-sm font-semibold text-[#0f1419] dark:text-[#e7e9ea] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create</span>
            </button>
            {createOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] shadow-2xl py-2 z-50">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    onOpenUpload();
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-[#eff3f4] dark:hover:bg-[#202327] cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  <span>Upload video</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    onNavigate('music');
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-[#eff3f4] dark:hover:bg-[#202327] cursor-pointer"
                >
                  <Music2 className="w-4 h-4" />
                  <span>DopTube Music</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    onNavigate('studio');
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-[#eff3f4] dark:hover:bg-[#202327] cursor-pointer"
                >
                  <Clapperboard className="w-4 h-4" />
                  <span>DopTube Studio</span>
                </button>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div ref={notifRef} className={!user ? 'hidden sm:block relative' : 'relative'}>
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onOpenAuth();
                  return;
                }
                const next = !notifOpen;
                setNotifOpen(next);
                if (next && unreadCount > 0) onMarkNotificationsRead();
              }}
              aria-label="Notifications"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] relative transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-[10px] font-bold flex items-center justify-center font-mono-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-[#e5e7eb] dark:border-[#2f3336] flex items-center justify-between">
                  <span className="font-semibold text-sm">Notifications</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      onNavigate('settings');
                    }}
                    aria-label="Notification settings"
                    className="p-1.5 rounded-full hover:bg-[#eff3f4] dark:hover:bg-[#202327] cursor-pointer"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-[#e5e7eb] dark:divide-[#2f3336]">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-[#536471] dark:text-[#71767b]">
                      No notifications yet. Subscribe to creators to receive upload alerts.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          if (n.targetVideoId) onNavigate('watch', n.targetVideoId);
                        }}
                        className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-[#eff3f4] dark:hover:bg-[#202327] transition-colors cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#0f1419] dark:text-[#e7e9ea] line-clamp-2">
                            {n.title}
                          </p>
                          <p className="text-xs text-[#536471] dark:text-[#71767b] mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                          <p className="text-[11px] text-[#536471] dark:text-[#71767b] mt-1">
                            {formatRelativeTime(n.createdAt)}
                          </p>
                        </div>
                        {n.thumbnailUrl && (
                          <img
                            src={n.thumbnailUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-20 h-11 object-cover rounded shrink-0"
                          />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Account / Sign In */}
          {!user ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="h-8 sm:h-9 px-3.5 sm:px-4 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black hover:opacity-90 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Sign in</span>
            </button>
          ) : (
            <div ref={accountRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-label="Account menu"
                className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-neutral-300 dark:hover:ring-[#555] transition-all cursor-pointer"
              >
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </button>

              {accountOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl bg-white dark:bg-[#16181c] border border-[#e5e7eb] dark:border-[#2f3336] shadow-2xl py-2 z-50 max-h-[82vh] overflow-y-auto">
                  <div className="px-4 py-3 flex items-start gap-3 border-b border-[#e5e7eb] dark:border-[#2f3336]">
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{user.name}</p>
                      <p className="text-xs text-[#536471] dark:text-[#71767b] truncate">
                        {user.channel?.handle || user.email}
                      </p>
                      {user.channel && (
                        <button
                          type="button"
                          onClick={() => {
                            setAccountOpen(false);
                            onNavigate('channel', user.channel!.id);
                          }}
                          className="text-xs font-semibold text-[#0f1419] dark:text-white hover:underline mt-1 cursor-pointer"
                        >
                          View your channel
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="py-1.5 border-b border-[#e5e7eb] dark:border-[#2f3336]">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onNavigate('you');
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[#eff3f4] dark:hover:bg-[#202327] cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Your You hub</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onOpenAuth();
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[#eff3f4] dark:hover:bg-[#202327] cursor-pointer"
                    >
                      <User className="w-4 h-4" />
                      <span>Switch account</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onLogout();
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[#eff3f4] dark:hover:bg-[#202327] cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign out</span>
                    </button>
                  </div>

                  <div className="py-1.5 border-b border-[#e5e7eb] dark:border-[#2f3336]">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onNavigate('studio');
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[#eff3f4] dark:hover:bg-[#202327] cursor-pointer"
                    >
                      <Clapperboard className="w-4 h-4" />
                      <span>DopTube Studio</span>
                    </button>
                    {user.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAccountOpen(false);
                          onNavigate('admin');
                        }}
                        className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[#eff3f4] dark:hover:bg-[#202327] font-semibold cursor-pointer"
                      >
                        <ShieldAlert className="w-4 h-4" />
                        <span>Admin & AI Analytics</span>
                      </button>
                    )}
                  </div>

                  <div className="py-1.5 border-b border-neutral-200 dark:border-[#3e3e3e]">
                    <button
                      type="button"
                      onClick={onToggleTheme}
                      className="w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        <span>Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextLang = user.preferredLanguage === 'Hindi' ? 'English' : 'Hindi';
                        onUpdateUserPref({ preferredLanguage: nextLang });
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <Languages className="w-4 h-4" />
                        <span>Preferred language: {user.preferredLanguage}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateUserPref({ restrictedMode: !user.restrictedMode })}
                      className="w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <Shield className="w-4 h-4" />
                        <span>Restricted Mode: {user.restrictedMode ? 'On' : 'Off'}</span>
                      </span>
                      {user.restrictedMode && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </button>
                    <div className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 text-[#606060] dark:text-[#aaaaaa]">
                      <Globe className="w-4 h-4" />
                      <span>Location: India</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onOpenShortcuts();
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
                    >
                      <Keyboard className="w-4 h-4" />
                      <span>Keyboard shortcuts</span>
                    </button>
                  </div>

                  <div className="py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onNavigate('settings');
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onNavigate('help');
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-[#3e3e3e] cursor-pointer"
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>Help & Support</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
};
