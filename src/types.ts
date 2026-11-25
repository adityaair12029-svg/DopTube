export interface ChannelSummary {
  id: string;
  name: string;
  handle: string;
  description?: string;
  avatarUrl: string;
  bannerColor?: string;
  verified?: boolean;
  subscriberCount: number;
  isSubscribed?: boolean;
  notifyAll?: number;
}

export interface VideoVariant {
  quality: string;
  resolution: string;
  bitrateKbps: number;
  playlistPath: string;
}

export interface VideoItem {
  id: string;
  channelId: string;
  channelName: string;
  channelHandle: string;
  channelAvatar: string;
  channelVerified: boolean;
  subscriberCount: number;
  title: string;
  description: string;
  category: string;
  language: string;
  tags: string[];
  thumbnailUrl: string;
  videoUrl: string;
  hlsUrl: string | null;
  durationSec: number;
  visibility: string;
  status: string;
  sourceType: 'native' | 'external';
  externalEmbedUrl?: string;
  externalOriginalUrl?: string;
  isShort: boolean;
  isLive: boolean;
  views: number;
  likes: number;
  dislikes: number;
  createdAt: string;
  progressSec?: number;
  watchedAt?: string;
  variants?: VideoVariant[];
  userReaction?: 'like' | 'dislike' | null;
  isSubscribed?: boolean;
  inWatchLater?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: 'user' | 'creator' | 'admin';
  preferredLanguage: string;
  restrictedMode: boolean;
  historyPaused: boolean;
  createdAt: string;
  channel: {
    id: string;
    name: string;
    handle: string;
    description: string;
    subscriberCount: number;
  } | null;
}

export interface CommentReply {
  id: string;
  commentId: string;
  userId: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorAvatar: string;
  authorHandle?: string;
}

export interface VideoComment {
  id: string;
  videoId: string;
  userId: string;
  body: string;
  likes: number;
  createdAt: string;
  authorName: string;
  authorAvatar: string;
  authorHandle?: string;
  replies: CommentReply[];
}

export interface PlaylistItem {
  id: string;
  title: string;
  description: string;
  visibility: string;
  createdAt: string;
  videos: VideoItem[];
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  targetVideoId: string | null;
  thumbnailUrl: string;
  isRead: number;
  createdAt: string;
}

export type AppPage =
  | 'home'
  | 'shorts'
  | 'subscriptions'
  | 'search'
  | 'watch'
  | 'channel'
  | 'history'
  | 'playlists'
  | 'watch-later'
  | 'liked'
  | 'your-videos'
  | 'downloads'
  | 'trending'
  | 'explore'
  | 'studio'
  | 'admin'
  | 'settings'
  | 'help';
