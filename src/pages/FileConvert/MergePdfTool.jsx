import { useCallback, useEffect, useRef, useState } from 'react';
import { FiDownload, FiLayers, FiTrash2 } from 'react-icons/fi';
import { FILE_RULES, fitFileBudget, formatBytes, moveItem, nextFileId } from '../../utils/fileConvertChecks.js';
import { mergePdfs } from '../../utils/pdfEdit.js';
import { createSerialQueue, openPdf, renderPageToBlob } from '../../utils/pdfRender.js';
import FileDropzone from './FileDropzone.jsx';
import SortableFileList from './SortableFileList.jsx';
import TaskStatus from './TaskStatus.jsx';
import { BlockedReason, ResultBox } from './ToolParts.jsx';
import { useConvertTask, useResultFiles } from './useConvertTask.js';
import styles from './FileConvert.module.css';

const RULES = FILE_RULES.pdfMerge;

/** Page count + first-page preview; the PDF.js document is closed right after. */
async function inspectPdf(file) {
  const pdf = await openPdf(file);
  try {
    if (pdf.encrypted) throw new Error('PDF được mã hóa (giới hạn chỉnh sửa) nên không thể gộp. Hãy gỡ bảo vệ rồi thử lại.');
    let thumb = null;
    try {
      thumb = (await renderPageToBlob(pdf.doc, 1, { width: 240, type: 'image/jpeg', quality: 0.75 })).blob;
    } catch {
      // The file is still usable without a preview.
    }
    return { numPages: pdf.numPages, thumb };
  } finally {
    await pdf.destroy();
  }
}

export default function MergePdfTool() {
  const task = useConvertTask();
  const [items, setItems] = useState([]);
  const [rejections, setRejections] = useState([]);
  const [results, setResults] = useResultFiles();
  const [queue] = useState(createSerialQueue);
  const thumbUrlsRef = useRef(new Map());

  useEffect(() => {
    const thumbUrls = thumbUrlsRef.current;
    return () => {
      queue.clear();
      thumbUrls.forEach((url) => url && URL.revokeObjectURL(url));
      thumbUrls.clear();
    };
  }, [queue]);

  const { reset: resetTask } = task;
  const clearOutput = useCallback(() => {
    setResults([]);
    resetTask();
  }, [setResults, resetTask]);

  const updateItem = useCallback((id, patch) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const addFiles = useCallback((files) => {
    clearOutput();
    const { accepted, messages } = fitFileBudget(files, items.map((item) => item.file), RULES);
    if (messages.length) setRejections((previous) => [...previous, ...messages]);
    const added = accepted.map((file) => ({ id: nextFileId(), file, name: file.name, size: file.size, status: 'loading' }));
    setItems((current) => [...current, ...added]);

    added.forEach((item) => {
      thumbUrlsRef.current.set(item.id, '');
      queue.push(() => (thumbUrlsRef.current.has(item.id) ? inspectPdf(item.file) : null)).then((info) => {
        if (!info || !thumbUrlsRef.current.has(item.id)) return;
        const url = info.thumb ? URL.createObjectURL(info.thumb) : '';
        thumbUrlsRef.current.set(item.id, url);
        updateItem(item.id, { status: 'ready', numPages: info.numPages, thumbUrl: url || undefined });
      }).catch((error) => {
        if (thumbUrlsRef.current.has(item.id)) updateItem(item.id, { status: 'error', error: error.message });
      });
    });
  }, [clearOutput, items, queue, updateItem]);

  function removeItem(id) {
    const url = thumbUrlsRef.current.get(id);
    if (url) URL.revokeObjectURL(url);
    thumbUrlsRef.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
    clearOutput();
  }

  function restart() {
    queue.clear();
    thumbUrlsRef.current.forEach((url) => url && URL.revokeObjectURL(url));
    thumbUrlsRef.current.clear();
    setItems([]);
    setRejections([]);
    clearOutput();
  }

  const listItems = items.map((item) => ({ ...item, meta: item.status === 'ready' ? `${item.numPages} trang` : '' }));
  const loading = items.some((item) => item.status === 'loading');
  const failed = items.filter((item) => item.status === 'error').length;
  const totalPages = items.reduce((sum, item) => sum + (item.numPages || 0), 0);
  const blocked = items.length < 2 ? 'Cần ít nhất 2 file PDF.' : loading ? 'Đang kiểm tra file…' : failed ? `Xóa ${failed} file bị lỗi trước khi gộp.` : '';
  const result = results[0];

  async function merge() {
    const files = items.map((item) => item.file);
    const merged = await task.run('Đang gộp PDF…', ({ signal, progress }) => mergePdfs(files, { onProgress: progress, signal }));
    if (merged) setResults([{ blob: merged.blob, name: `gop-${files.length}-file-pdf.pdf`, pageCount: merged.pageCount }]);
  }

  return (
    <div className={styles.toolLayout}>
      <div className={styles.toolMain}>
        <FileDropzone
          rules={RULES}
          multiple
          disabled={task.busy}
          compact={items.length > 0}
          title={items.length ? 'Thêm file PDF' : 'Kéo thả các file PDF vào đây hoặc bấm để chọn'}
          onFiles={addFiles}
          onReject={setRejections}
        />
        {items.length > 0 && (
          <>
            <div className={styles.listToolbar}>
              <span>{items.length} file · {totalPages} trang · {formatBytes(items.reduce((sum, item) => sum + item.size, 0))}</span>
              <button type="button" className={styles.linkButton} disabled={task.busy} onClick={restart}>
                <FiTrash2 aria-hidden="true" /> Xóa tất cả
              </button>
            </div>
            <p className={styles.fieldHint}>File PDF được nối theo thứ tự từ trên xuống. Kéo thả hoặc dùng nút mũi tên để đổi thứ tự.</p>
            <SortableFileList
              items={listItems}
              label="File PDF sẽ gộp"
              noun="file"
              disabled={task.busy}
              onMove={(from, to) => { setItems((current) => moveItem(current, from, to)); clearOutput(); }}
              onRemove={removeItem}
            />
          </>
        )}
      </div>

      <aside className={styles.toolSide} aria-label="Gộp PDF">
        <p className={styles.sideNote}>
          Các trang được sao chép nguyên vẹn. Dấu trang (bookmark), biểu mẫu điền được và chữ ký số của file gốc có thể không còn sau khi gộp; dung lượng không được nén thêm.
        </p>
        {!result && (
          <>
            <button type="button" className={styles.primary} disabled={Boolean(blocked) || task.busy} onClick={merge}>
              <FiLayers aria-hidden="true" /> Gộp {items.length >= 2 ? `${items.length} file` : 'PDF'}
            </button>
            <BlockedReason>{task.busy ? '' : blocked}</BlockedReason>
          </>
        )}
        <TaskStatus task={task} messages={rejections} />
        {result && (
          <ResultBox title="Đã gộp PDF" detail={`${result.name} · ${result.pageCount} trang · ${formatBytes(result.blob.size)}`} onRestart={restart}>
            <a className={styles.primary} href={result.url} download={result.name}>
              <FiDownload aria-hidden="true" /> Tải PDF
            </a>
          </ResultBox>
        )}
      </aside>
    </div>
  );
}
