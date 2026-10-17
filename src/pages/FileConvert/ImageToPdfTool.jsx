import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiDownload, FiFileText, FiTrash2 } from 'react-icons/fi';
import { assertFileKind, FILE_RULES, fitFileBudget, formatBytes, moveItem, nextFileId } from '../../utils/fileConvertChecks.js';
import { buildImagesPdf, computeImagePageLayout, createImagePreview, prepareImageForPdf } from '../../utils/imagesToPdf.js';
import { createSerialQueue } from '../../utils/pdfRender.js';
import FileDropzone from './FileDropzone.jsx';
import SortableFileList from './SortableFileList.jsx';
import TaskStatus from './TaskStatus.jsx';
import { BlockedReason, ChoiceGroup, ResultBox } from './ToolParts.jsx';
import { useConvertTask, useResultFiles } from './useConvertTask.js';
import styles from './FileConvert.module.css';

const RULES = FILE_RULES.image;
const PAGE_SIZES = [
  { value: 'a4', label: 'A4' },
  { value: 'image', label: 'Theo kích thước ảnh' },
];
const ORIENTATIONS = [
  { value: 'auto', label: 'Tự động' },
  { value: 'portrait', label: 'Dọc' },
  { value: 'landscape', label: 'Ngang' },
];
const MARGINS = [
  { value: 0, label: 'Không lề' },
  { value: 5, label: '5 mm' },
  { value: 10, label: '10 mm' },
  { value: 20, label: '20 mm' },
];

function describePage(image, options) {
  const layout = computeImagePageLayout(image, options);
  if (options.pageSize === 'a4') return `A4 ${layout.orientation === 'l' ? 'ngang' : 'dọc'}`;
  return `${Math.round(layout.pageWidth)}×${Math.round(layout.pageHeight)} mm`;
}

export default function ImageToPdfTool() {
  const task = useConvertTask();
  const [items, setItems] = useState([]);
  const [rejections, setRejections] = useState([]);
  const [options, setOptions] = useState({ pageSize: 'a4', orientation: 'auto', marginMm: 10 });
  const [results, setResults] = useResultFiles();
  const [queue] = useState(createSerialQueue);
  const thumbUrlsRef = useRef(new Map());

  useEffect(() => {
    const thumbUrls = thumbUrlsRef.current;
    return () => {
      queue.clear();
      thumbUrls.forEach((url) => URL.revokeObjectURL(url));
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

    // thumbUrlsRef holds an entry for every image still in the list; previews for removed ones are skipped or revoked.
    added.forEach((item) => {
      thumbUrlsRef.current.set(item.id, '');
      queue.push(async () => {
        if (!thumbUrlsRef.current.has(item.id)) return null;
        await assertFileKind(item.file, RULES.kinds);
        return createImagePreview(item.file);
      }).then((preview) => {
        if (!preview || !thumbUrlsRef.current.has(item.id)) return;
        const url = URL.createObjectURL(preview.blob);
        thumbUrlsRef.current.set(item.id, url);
        updateItem(item.id, { status: 'ready', thumbUrl: url, width: preview.width, height: preview.height });
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

  function changeOption(key, value) {
    setOptions((current) => ({ ...current, [key]: value }));
    clearOutput();
  }

  const listItems = useMemo(() => items.map((item) => ({
    ...item,
    meta: item.status === 'ready' ? `${item.width}×${item.height} px → ${describePage(item, options)}` : '',
  })), [items, options]);

  const loading = items.some((item) => item.status === 'loading');
  const failed = items.filter((item) => item.status === 'error').length;
  const blocked = !items.length ? 'Thêm ít nhất một ảnh.' : loading ? 'Đang kiểm tra ảnh…' : failed ? `Xóa ${failed} ảnh bị lỗi trước khi tạo PDF.` : '';
  const result = results[0];

  async function exportPdf() {
    const snapshot = items;
    const name = snapshot.length === 1 ? `${snapshot[0].name.replace(/\.[^.]+$/, '')}.pdf` : `anh-sang-pdf-${snapshot.length}-trang.pdf`;
    const blob = await task.run('Đang tạo PDF…', ({ signal, progress }) => buildImagesPdf(
      snapshot.map((item) => ({ name: item.name, load: () => prepareImageForPdf(item.file) })),
      options,
      { onProgress: progress, signal },
    ));
    if (blob) setResults([{ blob, name, pageCount: snapshot.length }]);
  }

  return (
    <div className={styles.toolLayout}>
      <div className={styles.toolMain}>
        <FileDropzone
          rules={RULES}
          multiple
          disabled={task.busy}
          compact={items.length > 0}
          title={items.length ? 'Thêm ảnh' : 'Kéo thả ảnh vào đây hoặc bấm để chọn'}
          onFiles={addFiles}
          onReject={setRejections}
        />
        {items.length > 0 && (
          <>
            <div className={styles.listToolbar}>
              <span>{items.length} ảnh · {formatBytes(items.reduce((sum, item) => sum + item.size, 0))}</span>
              <span className={styles.listToolbarActions}>
                <button
                  type="button"
                  className={styles.linkButton}
                  disabled={task.busy || items.length < 2}
                  onClick={() => { setItems((current) => [...current].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))); clearOutput(); }}
                >
                  Sắp xếp theo tên
                </button>
                <button type="button" className={styles.linkButton} disabled={task.busy} onClick={restart}>
                  <FiTrash2 aria-hidden="true" /> Xóa tất cả
                </button>
              </span>
            </div>
            <p className={styles.fieldHint}>Mỗi ảnh là một trang, theo thứ tự trong danh sách. Kéo thả hoặc dùng nút mũi tên để đổi thứ tự.</p>
            <SortableFileList
              items={listItems}
              label="Ảnh sẽ đưa vào PDF"
              noun="ảnh"
              disabled={task.busy}
              onMove={(from, to) => { setItems((current) => moveItem(current, from, to)); clearOutput(); }}
              onRemove={removeItem}
            />
          </>
        )}
      </div>

      <aside className={styles.toolSide} aria-label="Tùy chọn ảnh sang PDF">
        <ChoiceGroup legend="Khổ trang" value={options.pageSize} options={PAGE_SIZES} disabled={task.busy} onChange={(value) => changeOption('pageSize', value)} />
        <ChoiceGroup
          legend="Hướng trang"
          value={options.orientation}
          options={ORIENTATIONS}
          disabled={task.busy || options.pageSize === 'image'}
          hint={options.pageSize === 'image' ? 'Trang theo kích thước ảnh luôn cùng hướng với ảnh.' : 'Tự động: ảnh ngang dùng trang ngang, ảnh dọc dùng trang dọc.'}
          onChange={(value) => changeOption('orientation', value)}
        />
        <ChoiceGroup legend="Lề trang" value={options.marginMm} options={MARGINS} disabled={task.busy} onChange={(value) => changeOption('marginMm', value)} />

        {!result && (
          <>
            <button type="button" className={styles.primary} disabled={Boolean(blocked) || task.busy} onClick={exportPdf}>
              <FiFileText aria-hidden="true" /> Tạo PDF{items.length ? ` (${items.length} trang)` : ''}
            </button>
            <BlockedReason>{task.busy ? '' : blocked}</BlockedReason>
          </>
        )}
        <TaskStatus task={task} messages={rejections} />

        {result && (
          <ResultBox title="Đã tạo PDF" detail={`${result.name} · ${result.pageCount} trang · ${formatBytes(result.blob.size)}`} onRestart={restart}>
            <a className={styles.primary} href={result.url} download={result.name}>
              <FiDownload aria-hidden="true" /> Tải PDF
            </a>
          </ResultBox>
        )}
      </aside>
    </div>
  );
}
