import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { deleteUpload, fetchUserUploadsPage } from '../../services/uploadService.js';

/**
 * Paged list of the signed-in user's uploads (newest first).
 * Deleting an upload also refreshes the avatar, since the newest upload is the avatar.
 * @param {{ pageSize: number, reloadToken?: number }} options
 */
export function useUserUploads({ pageSize, reloadToken = 0 }) {
  const { user, refreshAvatar } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState({ items: [], total: 0, loading: true, loaded: false, error: '' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [localToken, setLocalToken] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;

    async function load() {
      setState((current) => ({ ...current, loading: true }));
      const result = await fetchUserUploadsPage(userId, { limit: pageSize, offset: 0 });

      if (requestId !== requestRef.current) return;

      if (result.error) {
        setState((current) => ({ ...current, loading: false, loaded: true, error: result.error }));
        return;
      }

      setState({ items: result.data.rows, total: result.data.total, loading: false, loaded: true, error: '' });
    }

    load();
  }, [userId, pageSize, reloadToken, localToken]);

  async function loadMore() {
    setLoadingMore(true);
    const result = await fetchUserUploadsPage(userId, { limit: pageSize, offset: state.items.length });
    setLoadingMore(false);

    if (result.error) {
      setState((current) => ({ ...current, error: result.error }));
      return;
    }

    setState((current) => ({
      ...current,
      items: [...current.items, ...result.data.rows.filter((row) => !current.items.some((item) => item.id === row.id))],
      total: result.data.total,
      error: '',
    }));
  }

  /** @returns {Promise<{ error: string | null, warning: string | null }>} */
  async function remove(item) {
    const result = await deleteUpload({ uploadId: item.id, userId, imageUrl: item.image_url });

    if (result.error) {
      return { error: result.error, warning: null };
    }

    const remaining = state.items.filter((upload) => upload.id !== item.id);
    const nextTotal = Math.max(0, state.total - 1);
    setState((current) => ({
      ...current,
      items: current.items.filter((upload) => upload.id !== item.id),
      total: Math.max(0, current.total - 1),
    }));

    // Keep the grid full: pull in the next upload that was not loaded yet.
    const [backfill] = await Promise.all([
      remaining.length < nextTotal
        ? fetchUserUploadsPage(userId, { limit: 1, offset: remaining.length })
        : Promise.resolve(null),
      refreshAvatar(),
    ]);

    if (backfill?.data?.rows?.length) {
      setState((current) => ({
        ...current,
        items: [...current.items, ...backfill.data.rows.filter((row) => !current.items.some((upload) => upload.id === row.id))],
      }));
    }

    return { error: null, warning: result.warning };
  }

  return {
    ...state,
    hasMore: state.items.length < state.total,
    loadingMore,
    loadMore,
    reload: () => setLocalToken((token) => token + 1),
    remove,
  };
}
