import { useMemo, useState } from 'react';
import { FiDownload, FiScissors } from 'react-icons/fi';
import { baseName, FILE_RULES, formatBytes } from '../../utils/fileConvertChecks.js';
import { extractPdfPages } from '../../utils/pdfEdit.js';
import { formatPageRange, parsePageRange } from '../../utils/pdfPageRange.js';
import FileDropzone from './FileDropzone.jsx';
import PageSelector from './PageSelector.jsx';
import TaskStatus from './TaskStatus.jsx';
import { BlockedReason, PdfSourceCard, ResultBox } from './ToolParts.jsx';
import { useConvertTask, useResultFiles } from './useConvertTask.js';
import { usePdfSource } from './usePdfSource.js';
import styles from './FileConvert.module.css';

const RULES = FILE_RULES.pdf;

export default function SplitPdfTool() {
  const task = useConvertTask();
  const { source, open, close } = usePdfSource(task.run);
  const [rangeText, setRangeText] = useState('');
  const [rejections, setRejections] = useState([]);
  const [results, setResults] = useResultFiles();
  const parsed = useMemo(() => parsePageRange(rangeText, source?.numPages ?? 0), [rangeText, source]);
  const result = results[0];

  function clearOutput() {
    setResults([]);
    task.reset();
  }

  async function openFile([file]) {
    clearOutput();
    setRangeText('');
    await open(file);
  }

  function restart() {
    close();
    clearOutput();
    setRangeText('');
    setRejections([]);
  }

  async function extract() {
    const pages = parsed.pages;
    const file = source.file;
    const extracted = await task.run('Đang trích xuất trang…', () => extractPdfPages(file, pages));
    if (!extracted) return;
    const range = formatPageRange(pages);
    const suffix = range.length > 40 ? `${pages.length}-trang` : `trang-${range.replace(/,/g, '_')}`;
    setResults([{ blob: extracted.blob, name: `${baseName(file.name)}-${suffix}.pdf`, pageCount: extracted.pageCount, range }]);
  }

  const hasRange = Boolean(rangeText.trim());
  const blocked = !source ? '' : source.encrypted
    ? 'PDF được mã hóa (giới hạn chỉnh sửa) nên không thể tách trang. Hãy gỡ bảo vệ rồi thử lại.'
    : !hasRange ? 'Chọn ít nhất một trang.' : parsed.error ? 'Sửa phạm vi trang trước khi xuất.' : '';

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
              showOrder
              disabled={task.busy}
              onChange={(text) => { setRangeText(text); clearOutput(); }}
            />
          </>
        ) : (
          <FileDropzone rules={RULES} disabled={task.busy} title="Kéo thả một file PDF vào đây hoặc bấm để chọn" onFiles={openFile} onReject={setRejections} />
        )}
      </div>

      <aside className={styles.toolSide} aria-label="Tách trang PDF">
        <p className={styles.sideNote}>
          Nhập trang theo dạng <code>1-3,5,8</code>. Trang được xuất theo đúng thứ tự bạn nhập, ví dụ <code>5,1-3</code> đặt trang 5 lên đầu. Chữ ký số của file gốc không còn hiệu lực trong file mới.
        </p>
        {source && !result && (
          <>
            <button type="button" className={styles.primary} disabled={Boolean(blocked) || task.busy} onClick={extract}>
              <FiScissors aria-hidden="true" /> Xuất {parsed.pages.length && !parsed.error ? `${parsed.pages.length} trang` : 'trang đã chọn'} thành PDF
            </button>
            <BlockedReason>{task.busy ? '' : blocked}</BlockedReason>
          </>
        )}
        <TaskStatus task={task} messages={rejections} />
        {result && (
          <ResultBox title="Đã tạo PDF mới" detail={`${result.name} · ${result.pageCount} trang (${result.range}) · ${formatBytes(result.blob.size)}`} onRestart={restart}>
            <a className={styles.primary} href={result.url} download={result.name}>
              <FiDownload aria-hidden="true" /> Tải PDF
            </a>
          </ResultBox>
        )}
      </aside>
    </div>
  );
}
