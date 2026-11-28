import { getAuthToken } from './api';

export interface QueuedBehaviorEvent {
  eventId: string;
  videoId: string;
  eventType:
    | 'impression'
    | 'click'
    | 'start'
    | 'progress_10'
    | 'progress_25'
    | 'progress_50'
    | 'progress_75'
    | 'completion'
    | 'replay'
    | 'skip'
    | 'abandoned'
    | 'like'
    | 'dislike'
    | 'comment'
    | 'reply'
    | 'share'
    | 'save'
    | 'playlist_add'
    | 'subscribe'
    | 'unsubscribe'
    | 'search'
    | 'not_interested'
    | 'dont_recommend_creator';
  surface?: string;
  progressPct?: number;
  watchDurationSec?: number;
  metadata?: Record<string, unknown>;
}

const SESSION_KEY = 'doptube_behavior_session_id';

function resolveSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const generated = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    return `sess_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export const behaviorSessionId = typeof window !== 'undefined' ? resolveSessionId() : 'sess_ssr';

const MAX_QUEUE_SIZE = 200;
const BATCH_SIZE = 25;
const FLUSH_INTERVAL_MS = 4000;

let queue: QueuedBehaviorEvent[] = [];
const seenIds = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let listenersBound = false;

function makeEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ev_${crypto.randomUUID().slice(0, 12)}`;
  }
  return `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function bindLifecycleListeners() {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushBehaviorEvents(true);
    }
  });

  window.addEventListener('pagehide', () => {
    void flushBehaviorEvents(true);
  });

  window.addEventListener('online', () => {
    if (queue.length > 0) {
      void flushBehaviorEvents(false);
    }
  });
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushBehaviorEvents(false);
  }, FLUSH_INTERVAL_MS);
}

export function enqueueBehaviorEvent(
  event: Omit<QueuedBehaviorEvent, 'eventId'> & { eventId?: string }
): string {
  bindLifecycleListeners();
  if (!event.videoId) return '';

  const eventId = event.eventId || makeEventId();
  if (seenIds.has(eventId)) return eventId;
  seenIds.add(eventId);
  if (seenIds.size > 1000) {
    const first = seenIds.values().next().value;
    if (first) seenIds.delete(first);
  }

  queue.push({ ...event, eventId });
  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(-MAX_QUEUE_SIZE);
  }

  if (queue.length >= BATCH_SIZE) {
    void flushBehaviorEvents(false);
  } else {
    scheduleFlush();
  }
  return eventId;
}

export async function flushBehaviorEvents(keepalive = false): Promise<void> {
  if (flushing || queue.length === 0) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  flushing = true;
  const batch = queue.splice(0, BATCH_SIZE);

  try {
    const token = getAuthToken();
    const res = await fetch('/api/events/batch', {
      method: 'POST',
      credentials: 'include',
      keepalive,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'DopTube',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        events: batch.map((ev) => ({
          ...ev,
          sessionId: behaviorSessionId,
        })),
      }),
    });

    if (!res.ok) {
      queue = [...batch, ...queue].slice(-MAX_QUEUE_SIZE);
    }
  } catch {
    queue = [...batch, ...queue].slice(-MAX_QUEUE_SIZE);
  } finally {
    flushing = false;
    if (queue.length > 0 && !keepalive) {
      scheduleFlush();
    }
  }
}
