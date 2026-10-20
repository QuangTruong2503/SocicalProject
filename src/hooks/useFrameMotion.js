import { useEffect, useState, useSyncExternalStore } from 'react';

// Shared motion state for animated avatar frames. However many avatars are on
// the page, there is one prefers-reduced-motion listener, one visibilitychange
// listener and one IntersectionObserver; each is attached while something uses it.

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const listeners = new Set();
let detach = null;
let snapshot = { reducedMotion: false, hidden: false };

function read() {
  const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (reducedMotion !== snapshot.reducedMotion || hidden !== snapshot.hidden) snapshot = { reducedMotion, hidden };
  return snapshot;
}

function notify() {
  read();
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  if (!detach && typeof window !== 'undefined') {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
    media?.addEventListener?.('change', notify);
    document.addEventListener('visibilitychange', notify);
    detach = () => {
      media?.removeEventListener?.('change', notify);
      document.removeEventListener('visibilitychange', notify);
    };
    read();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && detach) {
      detach();
      detach = null;
    }
  };
}

/** @returns {{ reducedMotion: boolean, hidden: boolean }} Updates live when either setting changes. */
export function useMotionPreferences() {
  return useSyncExternalStore(subscribe, read, () => snapshot);
}

let observer = null;
const watched = new Map();

function observe(element, onChange) {
  if (typeof IntersectionObserver !== 'function') return () => {};
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) watched.get(entry.target)?.(entry.isIntersecting);
    }, { rootMargin: '64px' });
  }
  watched.set(element, onChange);
  observer.observe(element);
  return () => {
    observer?.unobserve(element);
    watched.delete(element);
    if (!watched.size) {
      observer?.disconnect();
      observer = null;
    }
  };
}

/**
 * Whether the element is on (or near) the screen. Only observes while `enabled`;
 * without IntersectionObserver it reports true.
 */
export function useInViewport(element, enabled) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled || !element) return undefined;
    return observe(element, setVisible);
  }, [element, enabled]);

  return enabled ? visible : true;
}
