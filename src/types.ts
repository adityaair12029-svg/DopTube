export interface ChannelSummary {
  id: string;
  name: string;
  handle: string;
  description?: string;
  avatarUrl: string;
  bannerColor?: string;
  verified?: boolean;
  subscriberCount: number;
  totalResults?: number;
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
  recommendationReason?: string;
  recommendationReasons?: string[];
}

export interface UserPreferences {
  preferredLanguages: string[];
  preferredCategories: string[];
  selectedInterests: string[];
  preferredFormat: string;
  personalizationEnabled: boolean;
  infiniteScrollEnabled: boolean;
  autoplayEnabled: boolean;
  onboardingCompleted: boolean;
}

export interface UserInterest {
  topic: string;
  score: number;
  source: string;
  updatedAt: string;
}

export interface BlockedTopic {
  topic: string;
  createdAt: string;
}

export interface BlockedCreator {
  channelId: string;
  channelName: string;
  createdAt: string;
}

export interface HomepageSection {
  id: string;
  title: string;
  videos: VideoItem[];
}

export interface MusicTrack {
  id: string;
  videoId: string | null;
  channelId: string;
  title: string;
  artistName: string;
  albumName: string;
  audioUrl: string;
  coverUrl: string;
  durationSec: number;
  language: string;
  genre: string;
  likes: number;
  plays: number;
  isLiked?: boolean;
  createdAt: string;
}

export interface MusicMix {
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  tracks: MusicTrack[];
}

export interface RecommendationAnalytics {
  totalImpressions: number;
  totalClicks: number;
  ctrPercent: number;
  completionRatePercent: number;
  notInterestedCount: number;
  dontRecommendCreatorCount: number;
  anomalyFlags: number;
  topTopics: Array<{ topic: string; avgScore: number; usersCount: number }>;
}

export interface DiscoveryIssueInfo {
  code: string;
  status?: number;
  message: string;
  at: string;
}

export interface DiscoveryStatus {
  configured: boolean;
  providers?: string[];
  youtubeConfigured?: boolean;
  issue: DiscoveryIssueInfo | null;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  birthday?: string;
  role: 'user' | 'creator' | 'admin';
  preferredLanguage: string;
  restrictedMode: boolean;
  historyPaused: boolean;
  createdAt: string;
  preferences?: UserPreferences;
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
  | 'you'
  | 'music'
  | 'queue'
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
