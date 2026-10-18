/**
 * Batch download of watermark results — as one ZIP (streamed to a file the
 * user picked when the File System Access API is available) or one file per
 * image. Reports exactly how far it got, so the page can tell the user and
 * record an honest usage event:
 *   prepared  — images resized / added to the ZIP,
 *   delivered — images handed to the browser download or written to the file,
 *   delivery  — 'browser_handoff' (the browser only confirms it started the
 *               download) or 'file_written' (stream closed successfully).
 * Never throws: an error is returned in `error`, with the `stage` it happened in.
 *
 * @param {{
 *   items: Array<{ blob: Blob }>, names: string[], method: 'zip' | 'direct',
 *   prepare: (item: { blob: Blob }) => Promise<Blob>, fileHandle?: FileSystemFileHandle | null,
 *   task: { cancelled: boolean }, triggerDownload: (blob: Blob, name: string) => void,
 *   loadZip: () => Promise<any>, streamZip: (zip: any, handle: any, isCancelled: () => boolean) => Promise<boolean>,
 *   zipName: () => string, onProgress?: (progress: { phase: 'zip-add' | 'zip-pack' | 'direct', done: number, total: number }) => void,
 *   pause?: (ms: number) => Promise<void>,
 * }} input
 */
export async function runBatchDownload({
  items,
  names,
  method,
  prepare,
  fileHandle = null,
  task,
  triggerDownload,
  loadZip,
  streamZip,
  zipName,
  onProgress,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const total = items.length;
  const outcome = { prepared: 0, delivered: 0, outputFiles: 0, delivery: null, cancelled: false, error: null, stage: 'prepare' };

  try {
    if (method === 'zip') {
      const JSZip = await loadZip();
      const zip = new JSZip();

      for (let index = 0; index < total; index += 1) {
        if (task.cancelled) break;
        zip.file(names[index], await prepare(items[index]));
        outcome.prepared = index + 1;
        onProgress?.({ phase: 'zip-add', done: index + 1, total });
      }

      if (!task.cancelled) {
        onProgress?.({ phase: 'zip-pack', done: total, total });

        if (fileHandle) {
          outcome.stage = 'write';
          const completed = await streamZip(zip, fileHandle, () => task.cancelled);
          if (completed) {
            Object.assign(outcome, { delivered: total, outputFiles: 1, delivery: 'file_written' });
          } else {
            task.cancelled = true;
          }
        } else {
          outcome.stage = 'pack';
          const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
          if (!task.cancelled) {
            triggerDownload(zipBlob, zipName());
            Object.assign(outcome, { delivered: total, outputFiles: 1, delivery: 'browser_handoff' });
          }
        }
      }
    } else {
      for (let index = 0; index < total; index += 1) {
        if (task.cancelled) break;
        const blob = await prepare(items[index]);
        outcome.prepared = index + 1;
        triggerDownload(blob, names[index]);
        Object.assign(outcome, { delivered: index + 1, outputFiles: index + 1, delivery: 'browser_handoff' });
        onProgress?.({ phase: 'direct', done: index + 1, total });
        await pause(80);
      }
    }
  } catch (error) {
    outcome.error = error;
  }

  outcome.cancelled = !outcome.error && task.cancelled;
  return outcome;
}
