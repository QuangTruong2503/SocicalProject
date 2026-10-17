import { useMemo, useState } from 'react';
import { FiArchive, FiDownload, FiImage } from 'react-icons/fi';
import { baseName, FILE_RULES, formatBytes } from '../../utils/fileConvertChecks.js';
import { parsePageRange } from '../../utils/pdfPageRange.js';
import { fitRenderScale, renderPageToBlob } from '../../utils/pdfRender.js';
import FileDropzone from './FileDropzone.jsx';
import PageSelector from './PageSelector.jsx';
import TaskStatus from './TaskStatus.jsx';
import { BlockedReason, ChoiceGroup, PdfSourceCard, ResultBox } from './ToolParts.jsx';
import { downloadBlob, useConvertTask, useResultFiles } from './useConvertTask.js';
import { usePdfSource } from './usePdfSource.js';
import styles from './FileConvert.module.css';

const RULES = FILE_RULES.pdf;
const FORMATS = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPEG' },
];
const RESOLUTIONS = [
  { value: 72, label: '72 DPI' },
  { value: 150, label: '150 DPI' },
  { value: 200, label: '200 DPI' },
  { value: 300, label: '300 DPI' },
];
// Caps one run at roughly 46 A4 pages at 300 DPI so results stay in memory comfortably.
const MAX_TOTAL_PIXELS = 400_000_000;

export default function PdfToImageTool() {
  const task = useConvertTask();
  const { source, open, close } = usePdfSource(task.run);
  const [rangeText, setRangeText] = useState('');
  const [rejections, setRejections] = useState([]);
  const [format, setFormat] = useState('image/png');
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(85);
  const [results, setResults] = useResultFiles();
  const [zipping, setZipping] = useState(false);
  const parsed = useMemo(() => parsePageRange(rangeText, source?.numPages ?? 0), [rangeText, source]);

  function clearOutput() {
    setResults([]);
    task.reset();
  }

  async function openFile([file]) {
    clearOutput();
    const opened = await open(file);
    setRangeText(opened ? (opened.numPages === 1 ? '1' : `1-${opened.numPages}`) : '');
  }

  function restart() {
    close();
    clearOutput();
    setRangeText('');
    setRejections([]);
  }

  const estimate = useMemo(() => {
    if (!source) return null;
    const { width, height } = source.firstPage;
    const fitted = fitRenderScale(width, height, dpi / 72);
    const pixelWidth = Math.floor(width * fitted.scale);
    const pixelHeight = Math.floor(height * fitted.scale);
    return { pixelWidth, pixelHeight, limited: fitted.limited, maxPages: Math.max(1, Math.floor(MAX_TOTAL_PIXELS / (pixelWidth * pixelHeight))) };
  }, [source, dpi]);

  const selectedCount = parsed.error ? 0 : parsed.pages.length;
  const blocked = !source ? ''
    : !rangeText.trim() ? 'Chọn ít nhất một trang.'
      : parsed.error ? 'Sửa phạm vi trang trước khi chuyển.'
        : selectedCount > estimate.maxPages ? `Ở ${dpi} DPI chỉ chuyển tối đa ${estimate.maxPages} trang mỗi lần. Hãy chọn ít trang hơn hoặc giảm độ phân giải.` : '';

  async function convert() {
    const pages = [...parsed.pages].sort((a, b) => a - b);
    const doc = source.doc;
    const base = baseName(source.file.name);
    const digits = String(source.numPages).length;
    const extension = format === 'image/png' ? 'png' : 'jpg';
    const settings = { scale: dpi / 72, type: format, quality: quality / 100 };

    const files = await task.run(`Đang chuyển ${pages.length} trang…`, async ({ signal, progress }) => {
      const output = [];
      for (const [index, page] of pages.entries()) {
        const image = await renderPageToBlob(doc, page, { ...settings, signal });
        output.push({ ...image, page, name: `${base}-trang-${String(page).padStart(digits, '0')}.${extension}` });
        progress(index + 1, pages.length);
      }
      return output;
    });
    if (files) setResults(files);
  }

  async function downloadZip() {
    if (zipping) return;
    setZipping(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      results.forEach((item) => zip.file(item.name, item.blob));
      // Images are already compressed; storing them keeps zipping fast.
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      downloadBlob(blob, `${baseName(source.file.name)}-anh.zip`);
    } catch (error) {
      console.warn(error);
      setRejections([`Không tạo được file ZIP: ${error.message}. Hãy tải từng ảnh.`]);
    } finally {
      setZipping(false);
    }
  }

  const totalSize = results.reduce((sum, item) => sum + item.blob.size, 0);
  const limitedResult = results.some((item) => item.limited);

  return (
    <div className={styles.toolLayout}>
      <div className={styles.toolMain}>
        {source ? (
          <>
            <PdfSourceCard source={source} disabled={task.busy} onClose={restart} />
            <PageSelector
              source={source}
              rangeText={rangeText}
              parsed={parsed}
              disabled={task.busy}
              onChange={(text) => { setRangeText(text); clearOutput(); }}
            />
          </>
        ) : (
          <FileDropzone rules={RULES} disabled={task.busy} title="Kéo thả một file PDF vào đây hoặc bấm để chọn" onFiles={openFile} onReject={setRejections} />
        )}
      </div>

      <aside className={styles.toolSide} aria-label="Tùy chọn PDF sang ảnh">
        <ChoiceGroup legend="Định dạng ảnh" value={format} options={FORMATS} disabled={task.busy} onChange={(value) => { setFormat(value); clearOutput(); }}
          hint={format === 'image/png' ? 'PNG giữ nét chữ sắc, dung lượng lớn hơn.' : 'JPEG nhẹ hơn, phù hợp trang có ảnh chụp.'} />
        <ChoiceGroup legend="Độ phân giải" value={dpi} options={RESOLUTIONS} disabled={task.busy} onChange={(value) => { setDpi(value); clearOutput(); }}
          hint={estimate ? `Trang 1 khoảng ${estimate.pixelWidth}×${estimate.pixelHeight} px${estimate.limited ? ' (đã giảm để vừa giới hạn bộ nhớ trình duyệt)' : ''}.` : '150 DPI phù hợp xem trên màn hình, 300 DPI để in.'} />
        <div className={styles.field}>
          <label htmlFor="pdf-image-quality" className={styles.fieldLabel}>Chất lượng JPEG: {quality}%</label>
          <input
            id="pdf-image-quality"
            className={styles.range}
            type="range"
            min={50}
            max={100}
            step={5}
            value={quality}
            disabled={task.busy || format !== 'image/jpeg'}
            aria-valuetext={`${quality}%`}
            onChange={(event) => { setQuality(Number(event.target.value)); clearOutput(); }}
          />
          {format !== 'image/jpeg' && <p className={styles.fieldHint}>Chỉ áp dụng cho JPEG.</p>}
        </div>

        {source && !results.length && (
          <>
            <button type="button" className={styles.primary} disabled={Boolean(blocked) || task.busy} onClick={convert}>
              <FiImage aria-hidden="true" /> Chuyển {selectedCount ? `${selectedCount} trang` : 'trang đã chọn'} sang {format === 'image/png' ? 'PNG' : 'JPEG'}
            </button>
            <BlockedReason>{task.busy ? '' : blocked}</BlockedReason>
          </>
        )}
        <TaskStatus task={task} messages={rejections} />

        {results.length > 0 && (
          <ResultBox
            title={`Đã tạo ${results.length} ảnh`}
            detail={`Tổng ${formatBytes(totalSize)}${limitedResult ? ' · Một số trang quá lớn nên đã giảm độ phân giải.' : ''}`}
            onRestart={restart}
            restartDisabled={zipping}
          >
            {results.length > 1 ? (
              <button type="button" className={styles.primary} disabled={zipping} onClick={downloadZip}>
                <FiArchive aria-hidden="true" /> {zipping ? 'Đang nén…' : 'Tải tất cả (.zip)'}
              </button>
            ) : (
              <a className={styles.primary} href={results[0].url} download={results[0].name}>
                <FiDownload aria-hidden="true" /> Tải ảnh
              </a>
            )}
          </ResultBox>
        )}
        {results.length > 1 && (
          <ul className={styles.outputList} aria-label="Ảnh đã tạo">
            {results.map((item) => (
              <li key={item.name}>
                <span className={styles.fileInfo}>
                  <strong title={item.name}>{item.name}</strong>
                  <span className={styles.fileMeta}>{item.width}×{item.height} px · {formatBytes(item.blob.size)}</span>
                </span>
                <a className={styles.iconButton} href={item.url} download={item.name} aria-label={`Tải ảnh trang ${item.page}`} title="Tải ảnh">
                  <FiDownload aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
