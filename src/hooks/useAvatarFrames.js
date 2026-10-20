import { useEffect, useSyncExternalStore } from 'react';
import { listAvatarFrames } from '../services/avatarFrameService.js';

// One shared copy of the active frame catalog. Every avatar on the page (header,
// dashboard, admin drawer…) resolves its frame id against it, so the catalog is
// fetched once instead of once per avatar.
const INITIAL = { status: 'idle', frames: [], error: '' };
let state = INITIAL;
let requestId = 0;
let pending = null;
const listeners = new Set();

function setState(next) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fetches the catalog again. Calls made while a fetch is running share it. */
export function loadAvatarFrames() {
  if (pending) return pending;

  const id = ++requestId;
  setState({ ...state, status: 'loading', error: '' });
  pending = listAvatarFrames().then((result) => {
    if (id !== requestId) return;
    pending = null;
    setState(result.error
      ? { status: 'error', frames: state.frames, error: result.error }
      : { status: 'ready', frames: result.data, error: '' });
  });
  return pending;
}

export function resetAvatarFrames() {
  requestId += 1;
  pending = null;
  setState(INITIAL);
}

/**
 * @param {boolean} [enabled] Load the catalog on first use (only signed-in users can read it).
 * @returns {{ status: 'idle' | 'loading' | 'ready' | 'error', frames: Array<Object>, error: string, reload: () => Promise<void> }}
 */
export function useAvatarFrames(enabled = true) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);

  useEffect(() => {
    if (enabled && state.status === 'idle') loadAvatarFrames();
  }, [enabled]);

  return { ...snapshot, reload: loadAvatarFrames };
}
