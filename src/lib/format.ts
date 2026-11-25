export function formatViews(views: number): string {
  if (views < 1000) return `${views}`;
  if (views < 1_000_000) {
    const val = views / 1000;
    return `${val >= 100 ? Math.round(val) : val.toFixed(1).replace(/\.0$/, '')}K`;
  }
  if (views < 1_000_000_000) {
    const val = views / 1_000_000;
    return `${val >= 100 ? Math.round(val) : val.toFixed(1).replace(/\.0$/, '')}M`;
  }
  const val = views / 1_000_000_000;
  return `${val.toFixed(1).replace(/\.0$/, '')}B`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatRelativeTime(isoDate: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export const HOME_CATEGORIES = [
  'All',
  'Music',
  'Live',
  'Gaming',
  'Mixes',
  'Education',
  'JEE Advanced',
  'Board examinations',
  'Physics',
  'Technology',
  'Cricket',
  'Cooking',
  'Travel',
  'Comedy',
  'Science',
];

export const INDIAN_LANGUAGES = [
  'All',
  'Hindi',
  'English',
  'Tamil',
  'Telugu',
  'Bengali',
  'Marathi',
  'Gujarati',
  'Kannada',
  'Malayalam',
  'Punjabi',
  'Odia',
  'Assamese',
  'Urdu',
];

export const ALL_CATEGORIES = [
  'Education',
  'Entertainment',
  'Technology',
  'Gaming',
  'Music',
  'Sports',
  'Cricket',
  'News',
  'Comedy',
  'Movies',
  'Lifestyle',
  'Cooking',
  'Travel',
  'Science',
  'Agriculture',
  'Business',
  'Devotional',
  'Health and Fitness',
];
