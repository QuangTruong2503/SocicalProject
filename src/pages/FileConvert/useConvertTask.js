import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE = { status: 'idle', label: '', done: 0, total: 0, error: '', notice: '' };

/**
 * One long-running job at a time, with progress, cancel and a guard against
 * starting the same job twice.
 */
export function useConvertTask() {
  const [state, setState] = useState(IDLE);
  const controllerRef = useRef(null);

  const run = useCallback(async (label, job) => {
    if (controllerRef.current) return null;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ ...IDLE, status: 'working', label });

    try {
      const result = await job({
        signal: controller.signal,
        progress: (done, total) => setState((current) => ({ ...current, done, total })),
      });
      controller.signal.throwIfAborted();
      setState((current) => ({ ...current, status: 'done' }));
      return result;
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        setState({ ...IDLE, notice: 'Đã hủy thao tác.' });
      } else {
        // Shown in the UI already; keep the original error for debugging.
        console.warn(error);
        setState({ ...IDLE, status: 'error', error: error?.message || 'Đã xảy ra lỗi không xác định.' });
      }
      return null;
    } finally {
      controllerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);
  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState(IDLE);
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { ...state, busy: state.status === 'working', run, cancel, reset };
}

/**
 * Holds result blobs with object URLs, revoking old URLs on replace/unmount.
 *
 * @returns {[{ blob: Blob, name: string, url: string }[], (items: { blob: Blob, name: string }[]) => void]}
 */
export function useResultFiles() {
  const [results, setResultsState] = useState([]);
  const urlsRef = useRef([]);

  const setResults = useCallback((items) => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    const next = items.map((item) => ({ ...item, url: URL.createObjectURL(item.blob) }));
    urlsRef.current = next.map((item) => item.url);
    setResultsState(next);
  }, []);

  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  return [results, setResults];
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
