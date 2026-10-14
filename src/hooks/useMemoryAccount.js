import { useCallback, useEffect, useRef, useState } from 'react';
import { loadMemoryAccount, saveMemoryAccount } from '../services/memoryGameService.js';
import { mergeDocuments, normalizeDocument } from '../utils/memoryGame.js';
import { writeMemoryDocument } from '../utils/memoryGameStorage.js';

export function useMemoryAccount(userId, document, dispatch) {
  const documentRef = useRef(document);
  const versionRef = useRef(null);
  const syncedAtRef = useRef(-1);
  const busyRef = useRef(false);
  const blockedRef = useRef(false);
  const controllerRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [remoteGame, setRemoteGame] = useState(null);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    documentRef.current = document;
    const saved = writeMemoryDocument(userId, document);
    // Storage failures should not interrupt an in-memory game.
    if (!saved) queueMicrotask(() => setStorageAvailable(false));
  }, [document, userId]);

  const synchronize = useCallback(async () => {
    if (busyRef.current || blockedRef.current || controllerRef.current?.signal.aborted) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    const signal = controllerRef.current?.signal;
    busyRef.current = signal;
    try {
      if (versionRef.current === null) {
        const loaded = await loadMemoryAccount(signal);
        if (signal?.aborted) return;
        if (loaded.error) { setStatus(loaded.unavailable ? 'unavailable' : 'offline'); return; }
        versionRef.current = loaded.data.version;
        const remote = normalizeDocument(loaded.data.document);
        const local = documentRef.current;
        const differentGame = remote.active && local.active && remote.active.id !== local.active.id;
        const active = local.active ?? remote.active;
        const merged = mergeDocuments(local, remote, active);
        documentRef.current = merged;
        dispatch({ type: 'merge-document', document: merged });
        if (differentGame) {
          blockedRef.current = true;
          setRemoteGame(remote.active);
          setStatus('conflict');
          return;
        }
      }
      const candidate = documentRef.current;
      if (candidate.updatedAt === syncedAtRef.current) return;
      setStatus('saving');
      const result = await saveMemoryAccount(candidate, versionRef.current, signal);
      if (signal?.aborted) return;
      if (result.conflict) {
        const loaded = await loadMemoryAccount(signal);
        if (signal?.aborted) return;
        if (loaded.error) { setStatus('offline'); return; }
        versionRef.current = loaded.data.version;
        const remote = normalizeDocument(loaded.data.document);
        const local = documentRef.current;
        const merged = mergeDocuments(local, remote);
        documentRef.current = merged;
        dispatch({ type: 'merge-document', document: merged });
        blockedRef.current = true;
        setRemoteGame(remote.active);
        setStatus('conflict');
      } else if (result.error) {
        setStatus(result.unavailable ? 'unavailable' : 'offline');
      } else {
        versionRef.current = result.data.version;
        syncedAtRef.current = candidate.updatedAt;
        setStatus('synced');
      }
    } finally {
      if (busyRef.current === signal) busyRef.current = false;
    }
  }, [dispatch]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    synchronize();
    const interval = window.setInterval(synchronize, 8000);
    window.addEventListener('online', synchronize);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('online', synchronize);
      // A pending request from a StrictMode cleanup must not block the next mount.
      busyRef.current = false;
    };
  }, [synchronize]);

  // Save a finished result promptly; regular progress is batched every eight seconds.
  const latestResult = document.history[0]?.id;
  useEffect(() => { if (latestResult) synchronize(); }, [latestResult, synchronize]);

  const resolveConflict = useCallback((useRemote) => {
    const local = documentRef.current;
    const next = { ...local, active: useRemote ? remoteGame : local.active, updatedAt: Date.now() };
    documentRef.current = next;
    dispatch({ type: 'document', document: next });
    if (useRemote && remoteGame) dispatch({ type: 'restore', game: remoteGame, now: Date.now() });
    blockedRef.current = false;
    setRemoteGame(null);
    setStatus('saving');
    synchronize();
  }, [dispatch, remoteGame, synchronize]);

  return { status, storageAvailable, remoteGame, synchronize, resolveConflict };
}
