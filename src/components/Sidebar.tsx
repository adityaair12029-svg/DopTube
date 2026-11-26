import React, { useState } from 'react';
import {
  Baby,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  Clock,
  Download,
  Film,
  Flame,
  FlaskConical,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  History,
  Home,
  ListMusic,
  ListVideo,
  MessageSquarePlus,
  Music2,
  Newspaper,
  PlaySquare,
  Plus,
  Radio,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ThumbsUp,
  Trophy,
  UserSquare2,
  Zap,
} from 'lucide-react';
import type { AppPage, ChannelSummary, UserProfile } from '../types';
import { DopTubeLogo } from './DopTubeLogo';

interface SidebarProps {
  expanded: boolean;
  mobileOpen: boolean;
  currentPage: AppPage;
  activeExploreCategory?: string;
  user: UserProfile | null;
  subscribedChannels: ChannelSummary[];
  onCloseMobile: () => void;
  onNavigate: (page: AppPage, param?: string) => void;
  onSelectCategory: (cat: string) => void;
  onOpenUpload: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  expanded,
  mobileOpen,
  currentPage,
  activeExploreCategory,
  user,
  subscribedChannels,
  onCloseMobile,
  onNavigate,
  onSelectCategory,
  onOpenUpload,
}) => {
  const [showAllSubs, setShowAllSubs] = useState(false);

  const navItemClass = (active: boolean) =>
    `w-full flex items-center gap-5 px-3 h-10 rounded-full text-[14px] transition-colors cursor-pointer whitespace-nowrap ${
      active
        ? 'bg-[#eff3f4] dark:bg-[#16181c] font-bold text-[#0f1419] dark:text-white'
        : 'text-[#0f1419] dark:text-[#e7e9ea] hover:bg-[#eff3f4] dark:hover:bg-[#16181c]'
    }`;

  const renderExpandedContent = (isMobileDrawer = false) => {
    const visibleSubs = showAllSubs ? subscribedChannels : subscribedChannels.slice(0, 6);
    const go = (page: AppPage, param?: string) => {
      onNavigate(page, param);
      if (isMobileDrawer) onCloseMobile();
    };

    return (
      <div className="flex flex-col h-full overflow-y-auto px-3 py-2 text-[#0f1419] dark:text-[#e7e9ea]">
        {isMobileDrawer && (
          <div className="px-2 py-2.5 mb-2 border-b border-[#e5e7eb] dark:border-[#2f3336] flex items-center justify-between">
            <DopTubeLogo />
          </div>
        )}

        {/* Primary */}
        <nav aria-label="Main navigation" className="space-y-0.5 pb-3 border-b border-[#e5e7eb] dark:border-[#2f3336]">
          <button type="button" onClick={() => go('home')} className={navItemClass(currentPage === 'home' && !activeExploreCategory)}>
            <Home className="w-5 h-5 shrink-0" />
            <span>Home</span>
          </button>
          <button type="button" onClick={() => go('shorts')} className={navItemClass(currentPage === 'shorts')}>
            <Zap className="w-5 h-5 shrink-0" />
            <span>Shorts</span>
          </button>
          <button type="button" onClick={() => go('subscriptions')} className={navItemClass(currentPage === 'subscriptions')}>
            <PlaySquare className="w-5 h-5 shrink-0" />
            <span>Subscriptions</span>
          </button>
          <button type="button" onClick={() => go('music')} className={navItemClass(currentPage === 'music')}>
            <Music2 className="w-5 h-5 shrink-0" />
            <span>DopTube Music</span>
          </button>
        </nav>

        {/* Subscriptions List */}
        {subscribedChannels.length > 0 && (
          <div className="py-3 border-b border-[#e5e7eb] dark:border-[#2f3336]">
            <button
              type="button"
              onClick={() => go('subscriptions')}
              className="w-full px-3 pb-2 flex items-center gap-1.5 text-[15px] font-bold hover:opacity-80 transition-opacity cursor-pointer"
            >
              <span>Subscriptions</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="space-y-0.5">
              {visibleSubs.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => go('channel', ch.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 h-10 rounded-full hover:bg-[#eff3f4] dark:hover:bg-[#16181c] text-sm cursor-pointer"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <img
                      src={ch.avatarUrl}
                      alt={ch.name}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-full object-cover shrink-0"
                    />
                    <span className="truncate">{ch.name}</span>
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0f1419] dark:bg-white shrink-0" aria-hidden="true" />
                </button>
              ))}
              {subscribedChannels.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllSubs((v) => !v)}
                  className="w-full flex items-center gap-5 px-3 h-10 rounded-full hover:bg-[#eff3f4] dark:hover:bg-[#16181c] text-sm cursor-pointer"
                >
                  {showAllSubs ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  <span>{showAllSubs ? 'Show less' : 'Show more'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* YOU section */}
        <div className="py-3 border-b border-[#e5e7eb] dark:border-[#2f3336] space-y-0.5">
          <button
            type="button"
            onClick={() => go('you')}
            className="w-full px-3 pb-1.5 flex items-center gap-1.5 text-[15px] font-bold hover:opacity-80 cursor-pointer"
          >
            <span>You</span>
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => (user?.channel ? go('channel', user.channel.id) : go('your-videos'))}
            className={navItemClass(currentPage === 'channel')}
          >
            <UserSquare2 className="w-5 h-5 shrink-0" />
            <span>Your channel</span>
          </button>
          <button type="button" onClick={() => go('history')} className={navItemClass(currentPage === 'history')}>
            <History className="w-5 h-5 shrink-0" />
            <span>History</span>
          </button>
          <button type="button" onClick={() => go('playlists')} className={navItemClass(currentPage === 'playlists')}>
            <ListVideo className="w-5 h-5 shrink-0" />
            <span>Playlists</span>
          </button>
          <button type="button" onClick={() => go('queue')} className={navItemClass(currentPage === 'queue')}>
            <ListMusic className="w-5 h-5 shrink-0" />
            <span>Playback queue</span>
          </button>
          <button type="button" onClick={() => go('watch-later')} className={navItemClass(currentPage === 'watch-later')}>
            <Clock className="w-5 h-5 shrink-0" />
            <span>Watch later</span>
          </button>
          <button type="button" onClick={() => go('liked')} className={navItemClass(currentPage === 'liked')}>
            <ThumbsUp className="w-5 h-5 shrink-0" />
            <span>Liked videos</span>
          </button>
          <button type="button" onClick={() => go('your-videos')} className={navItemClass(currentPage === 'your-videos')}>
            <Clapperboard className="w-5 h-5 shrink-0" />
            <span>Your videos</span>
          </button>
          <button type="button" onClick={() => go('downloads')} className={navItemClass(currentPage === 'downloads')}>
            <Download className="w-5 h-5 shrink-0" />
            <span>Downloads</span>
          </button>
        </div>

        {/* EXPLORE section */}
        <div className="py-3 border-b border-neutral-200 dark:border-[#272727] space-y-0.5">
          <div className="px-3 pb-1.5 text-[15px] font-semibold">Explore</div>
          <button
            type="button"
            onClick={() => go('trending')}
            className={navItemClass(currentPage === 'trending')}
          >
            <Flame className="w-5 h-5 shrink-0" />
            <span>Trending India</span>
          </button>
          {[
            { label: 'Music', icon: Music2, cat: 'Music' },
            { label: 'Movies & Entertainment', icon: Film, cat: 'Entertainment' },
            { label: 'Live', icon: Radio, cat: 'Live' },
            { label: 'Gaming', icon: Gamepad2, cat: 'Gaming' },
            { label: 'Education', icon: GraduationCap, cat: 'Education' },
            { label: 'Cricket & Sports', icon: Trophy, cat: 'Cricket' },
            { label: 'News', icon: Newspaper, cat: 'News' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  onSelectCategory(item.cat);
                  go('home');
                }}
                className={navItemClass(currentPage === 'home' && activeExploreCategory === item.cat)}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* More from DopTube */}
        <div className="py-3 border-b border-[#e5e7eb] dark:border-[#2f3336] space-y-0.5">
          <div className="px-3 pb-1.5 text-[15px] font-bold">More from DopTube</div>
          <button type="button" onClick={() => go('studio')} className={navItemClass(currentPage === 'studio')}>
            <Clapperboard className="w-5 h-5 shrink-0" />
            <span>DopTube Studio</span>
          </button>
          <button type="button" onClick={() => go('music')} className={navItemClass(currentPage === 'music')}>
            <Music2 className="w-5 h-5 shrink-0" />
            <span>DopTube Music</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectCategory('Education');
              go('home');
            }}
            className={navItemClass(false)}
          >
            <Baby className="w-5 h-5 shrink-0" />
            <span>DopTube Kids</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectCategory('Science');
              go('home');
            }}
            className={navItemClass(false)}
          >
            <FlaskConical className="w-5 h-5 shrink-0" />
            <span>DopTube Labs</span>
          </button>
          {user?.role === 'admin' && (
            <button type="button" onClick={() => go('admin')} className={navItemClass(currentPage === 'admin')}>
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span>Admin Console</span>
            </button>
          )}
        </div>

        {/* Settings & Support */}
        <div className="py-3 border-b border-neutral-200 dark:border-[#272727] space-y-0.5">
          <button type="button" onClick={() => go('settings')} className={navItemClass(currentPage === 'settings')}>
            <Settings className="w-5 h-5 shrink-0" />
            <span>Settings</span>
          </button>
          <button type="button" onClick={() => go('help', 'reports')} className={navItemClass(false)}>
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>Report history</span>
          </button>
          <button type="button" onClick={() => go('help')} className={navItemClass(currentPage === 'help')}>
            <HelpCircle className="w-5 h-5 shrink-0" />
            <span>Help</span>
          </button>
          <button type="button" onClick={() => go('help', 'feedback')} className={navItemClass(false)}>
            <MessageSquarePlus className="w-5 h-5 shrink-0" />
            <span>Send feedback</span>
          </button>
        </div>

        <footer className="px-3 py-4 text-[12px] text-[#606060] dark:text-[#717171] space-y-2 leading-relaxed">
          <p className="flex flex-wrap gap-x-2 gap-y-0.5">
            <button type="button" onClick={() => go('help')} className="hover:underline cursor-pointer">About</button>
            <button type="button" onClick={() => go('help', 'copyright')} className="hover:underline cursor-pointer">Copyright</button>
            <button type="button" onClick={() => go('studio')} className="hover:underline cursor-pointer">Creators</button>
            <button type="button" onClick={() => go('settings')} className="hover:underline cursor-pointer">Privacy</button>
          </p>
          <p>© 2026 DopTube India</p>
        </footer>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:block fixed top-14 left-0 bottom-0 z-30 bg-white dark:bg-black border-r border-[#e5e7eb] dark:border-[#2f3336] transition-all duration-150 ${
          expanded ? 'w-60' : 'w-[72px]'
        }`}
      >
        {expanded ? (
          renderExpandedContent(false)
        ) : (
          <nav aria-label="Compact navigation" className="flex flex-col items-center pt-1 px-1 space-y-1">
            {[
              { id: 'home' as AppPage, label: 'Home', aria: 'Home', icon: Home },
              { id: 'shorts' as AppPage, label: 'Shorts', aria: 'Shorts', icon: Zap },
              { id: 'subscriptions' as AppPage, label: 'Subs', aria: 'Subscriptions', icon: PlaySquare },
              { id: 'music' as AppPage, label: 'Music', aria: 'DopTube Music', icon: Music2 },
              { id: 'you' as AppPage, label: 'You', aria: 'You', icon: UserSquare2 },
            ].map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.aria}
                  title={item.aria}
                  onClick={() => onNavigate(item.id)}
                  className={`w-16 py-3.5 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#eff3f4] dark:bg-[#16181c] text-[#0f1419] dark:text-white font-semibold'
                      : 'text-[#0f1419] dark:text-[#e7e9ea] hover:bg-[#eff3f4] dark:hover:bg-[#16181c]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] leading-none font-normal truncate max-w-full px-1">{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={onCloseMobile} />
          <div className="relative w-64 max-w-[80vw] h-full bg-white dark:bg-black border-r border-[#e5e7eb] dark:border-[#2f3336] z-10 shadow-2xl">
            {renderExpandedContent(true)}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation (4-Tab Bar matching mobile screenshots: Home, Shorts, +, You) */}
      <nav
        aria-label="Mobile quick navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white dark:bg-black border-t border-[#e5e7eb] dark:border-[#2f3336] flex items-center justify-around px-2"
      >
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Home"
          className={`flex flex-col items-center gap-0.5 py-1 px-4 cursor-pointer ${
            currentPage === 'home' ? 'text-[#0f1419] dark:text-white font-bold' : 'text-[#536471] dark:text-[#71767b]'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('shorts')}
          aria-label="Shorts"
          className={`flex flex-col items-center gap-0.5 py-1 px-4 cursor-pointer ${
            currentPage === 'shorts' ? 'text-[#0f1419] dark:text-white font-bold' : 'text-[#536471] dark:text-[#71767b]'
          }`}
        >
          <Zap className="w-5 h-5" />
          <span className="text-[10px]">Shorts</span>
        </button>
        <button
          type="button"
          onClick={onOpenUpload}
          aria-label="Upload video"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#eff3f4] dark:bg-[#202327] text-[#0f1419] dark:text-white cursor-pointer"
        >
          <Plus className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('you')}
          aria-label="You"
          className={`flex flex-col items-center gap-0.5 py-1 px-4 cursor-pointer ${
            currentPage === 'you' ? 'text-[#0f1419] dark:text-white font-bold' : 'text-[#536471] dark:text-[#71767b]'
          }`}
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              referrerPolicy="no-referrer"
              className={`w-5 h-5 rounded-full object-cover ${
                currentPage === 'you' ? 'ring-2 ring-[#0f1419] dark:ring-white' : ''
              }`}
            />
          ) : (
            <UserSquare2 className="w-5 h-5" />
          )}
          <span className="text-[10px]">You</span>
        </button>
      </nav>
    </>
  );
};
