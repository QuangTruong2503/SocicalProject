import { supabase } from '../lib/supabase.js';

/**
 * Best-effort delivery of activity events (src/utils/usageEvents.js) to
 * public.usage_log_activity. Never blocks or fails the user's action: events
 * wait in a small queue (memory + localStorage, counts and IDs only) and are
 * retried a few times. Loss is possible and accepted — offline, closed tab,
 * blocked requests, private mode — see docs/usage-logging.md.
 *
 * A resend reuses the event ID, so the server stores it once. An event is only
 * sent under the account it was recorded for: after switching to another
 * account, pending events of the previous one are dropped, never re-attributed.
 */
export const TELEMETRY_LIMITS = Object.freeze({
  maxQueue: 100,
  ttlMs: 24 * 60 * 60 * 1000,
  maxAttempts: 5,
  batchSize: 25,
  flushDelayMs: 1500,
  baseRetryMs: 5_000,
  maxRetryMs: 5 * 60 * 1000,
});

const STORAGE_KEY = 'usage_telemetry_queue_v1';

function readStored(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.event?.eventId === 'string' && Number.isFinite(entry.enqueuedAt))
      : [];
  } catch {
    return [];
  }
}

/**
 * @param {{
 *   send: (events: object[]) => Promise<{ rateLimited?: boolean, retryAfterSeconds?: number }>,
 *   getCurrentUserId: () => Promise<string | null>,
 *   storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
 *   now?: () => number,
 *   schedule?: (callback: () => void, ms: number) => unknown,
 *   cancel?: (handle: unknown) => void,
 *   limits?: typeof TELEMETRY_LIMITS,
 * }} deps
 */
export function createTelemetryQueue({
  send,
  getCurrentUserId,
  storage = null,
  now = Date.now,
  schedule = (callback, ms) => setTimeout(callback, ms),
  cancel = (handle) => clearTimeout(handle),
  limits = TELEMETRY_LIMITS,
}) {
  let entries = readStored(storage);
  let timer = null;
  let flushing = null;
  let disabled = false;

  const persist = () => {
    try {
      if (entries.length) storage?.setItem(STORAGE_KEY, JSON.stringify(entries));
      else storage?.removeItem(STORAGE_KEY);
    } catch {
      // Storage full or blocked: the in-memory queue still works for this page.
    }
  };

  const scheduleFlush = (ms) => {
    if (disabled) return;
    if (timer) cancel(timer);
    timer = schedule(() => {
      timer = null;
      void flush();
    }, Math.max(0, ms));
  };

  const prune = () => {
    const cutoff = now() - limits.ttlMs;
    entries = entries.filter((entry) => entry.enqueuedAt >= cutoff && entry.attempts < limits.maxAttempts);
  };

  async function runFlush() {
    prune();
    if (disabled || !entries.length) {
      persist();
      return;
    }

    let currentUserId;
    try {
      currentUserId = await getCurrentUserId();
    } catch {
      scheduleFlush(limits.baseRetryMs);
      return;
    }

    // Recorded under another account than the one signed in now: drop.
    entries = entries.filter((entry) => !entry.event.subjectUserId || !currentUserId || entry.event.subjectUserId === currentUserId);
    const current = now();
    const due = entries.filter((entry) => entry.nextAt <= current
      && (!entry.event.subjectUserId || entry.event.subjectUserId === currentUserId)).slice(0, limits.batchSize);

    if (!due.length) {
      persist();
      // Waiting for a retry time (or for the account to sign back in, until the TTL).
      const next = entries.filter((entry) => !entry.event.subjectUserId || entry.event.subjectUserId === currentUserId)
        .reduce((min, entry) => Math.min(min, entry.nextAt), Infinity);
      if (Number.isFinite(next)) scheduleFlush(next - current);
      return;
    }

    const sent = new Set(due);
    try {
      const result = await send(due.map((entry) => entry.event));
      if (result?.rateLimited) {
        const wait = Math.max(1, Number(result.retryAfterSeconds) || 60) * 1000;
        due.forEach((entry) => { entry.nextAt = now() + wait; });
      } else {
        // Accepted, duplicate or refused as invalid: nothing more to do for these.
        entries = entries.filter((entry) => !sent.has(entry));
      }
    } catch (error) {
      if (error?.permanent) {
        // The RPC is not deployed (migration not applied): stop for this page.
        disabled = true;
        entries = [];
      } else {
        for (const entry of due) {
          entry.attempts += 1;
          entry.nextAt = now() + Math.min(limits.baseRetryMs * 2 ** (entry.attempts - 1), limits.maxRetryMs);
        }
      }
    }

    prune();
    persist();
    if (entries.length && !disabled) {
      const more = entries.some((entry) => entry.nextAt <= now());
      scheduleFlush(more ? 0 : limits.baseRetryMs);
    }
  }

  function flush() {
    flushing ??= runFlush().catch(() => {}).finally(() => { flushing = null; });
    return flushing;
  }

  return {
    /** Queues an event; returns its ID. Never throws. */
    track(event) {
      try {
        if (disabled || !event?.eventId) return null;
        entries.push({ event, attempts: 0, nextAt: 0, enqueuedAt: now() });
        if (entries.length > limits.maxQueue) entries = entries.slice(entries.length - limits.maxQueue);
        persist();
        scheduleFlush(limits.flushDelayMs);
        return event.eventId;
      } catch {
        return null;
      }
    },
    flush,
    pending: () => entries.map((entry) => ({ ...entry })),
  };
}

async function sendToSupabase(events) {
  const { data, error } = await supabase.rpc('usage_log_activity', { p_events: events });
  if (error) {
    const failure = new Error('usage_log_activity failed');
    // PGRST202: function not found (migration not applied yet).
    failure.permanent = error.code === 'PGRST202';
    throw failure;
  }
  return { rateLimited: Boolean(data?.rate_limited), retryAfterSeconds: data?.retry_after_seconds };
}

function browserStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

let defaultQueue = null;

function getDefaultQueue() {
  if (!defaultQueue) {
    defaultQueue = createTelemetryQueue({
      send: sendToSupabase,
      getCurrentUserId: async () => (await supabase.auth.getSession()).data?.session?.user?.id ?? null,
      storage: browserStorage(),
    });
    if (typeof window !== 'undefined') {
      // Events left from a previous visit, and the next chance after going offline / hiding the tab.
      void defaultQueue.flush();
      window.addEventListener('online', () => void defaultQueue.flush());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void defaultQueue.flush();
      });
    }
  }
  return defaultQueue;
}

/** Records an activity event without waiting; telemetry problems never reach the caller. */
export function trackUsageEvent(event) {
  try {
    return getDefaultQueue().track(event);
  } catch {
    return null;
  }
}

/** For several events of one action (e.g. "Áp dụng tên" over several AI runs). */
export function trackUsageEvents(events) {
  events.forEach(trackUsageEvent);
}
