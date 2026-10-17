import { useCallback, useEffect, useRef, useState } from 'react';
import { createSerialQueue, openPdf } from '../../utils/pdfRender.js';

/**
 * The single PDF a tool works on. Opening a new one, `close()` and unmount
 * all destroy the previous PDF.js document and drop its queued previews.
 *
 * @param {(label: string, job: Function) => Promise<any>} run from `useConvertTask`
 */
export function usePdfSource(run) {
  const [source, setSource] = useState(null);
  const sourceRef = useRef(null);

  const close = useCallback(() => {
    const current = sourceRef.current;
    sourceRef.current = null;
    if (current) {
      current.queue.clear();
      void current.destroy();
    }
    setSource(null);
  }, []);

  const open = useCallback(async (file) => {
    close();
    const opened = await run('Đang mở PDF…', async ({ signal }) => {
      const pdf = await openPdf(file);
      try {
        const page = await pdf.doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        page.cleanup();
        signal.throwIfAborted();
        return { ...pdf, file, firstPage: { width: viewport.width, height: viewport.height }, queue: createSerialQueue() };
      } catch (error) {
        await pdf.destroy();
        throw error;
      }
    });
    if (opened) {
      sourceRef.current = opened;
      setSource(opened);
    }
    return opened;
  }, [close, run]);

  useEffect(() => () => {
    sourceRef.current?.queue.clear();
    void sourceRef.current?.destroy();
  }, []);

  return { source, open, close };
}
