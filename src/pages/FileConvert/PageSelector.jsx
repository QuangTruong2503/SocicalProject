import { useEffect, useId, useRef, useState } from 'react';
import { FiAlertCircle } from 'react-icons/fi';
import { formatPageRange, togglePage } from '../../utils/pdfPageRange.js';
import { renderPageToBlob } from '../../utils/pdfRender.js';
import styles from './FileConvert.module.css';

const THUMB_WIDTH = 240;

/**
 * Page preview rendered once it scrolls near the viewport, through the
 * document's serial queue so only one page renders at a time.
 */
export function PdfThumb({ doc, pageNumber, queue }) {
  const ref = useRef(null);
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let created = '';
    const node = ref.current;

    function start() {
      queue.push(async () => {
        if (!active) return null;
        const { blob } = await renderPageToBlob(doc, pageNumber, { width: THUMB_WIDTH, type: 'image/jpeg', quality: 0.75 });
        return blob;
      }).then((blob) => {
        if (!blob) return;
        created = URL.createObjectURL(blob);
        if (active) setUrl(created);
        else URL.revokeObjectURL(created);
      }).catch(() => {
        if (active) setFailed(true);
      });
    }

    let observer = null;
    if (typeof IntersectionObserver === 'undefined' || !node) {
      start();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      }, { rootMargin: '300px' });
      observer.observe(node);
    }

    return () => {
      active = false;
      observer?.disconnect();
      if (created) URL.revokeObjectURL(created);
    };
  }, [doc, pageNumber, queue]);

  return (
    <span className={styles.pageThumb} ref={ref}>
      {url ? <img src={url} alt="" /> : <span className={styles.pageThumbPlaceholder}>{failed ? 'Lỗi xem trước' : ''}</span>}
    </span>
  );
}

/**
 * Range input ("1-3,5,8") kept in sync with a clickable grid of page previews.
 *
 * @param {{
 *   source: { doc: object, numPages: number, queue: object },
 *   rangeText: string, parsed: { pages: number[], error: string, duplicates: number[] },
 *   onChange: (text: string) => void, disabled?: boolean, showOrder?: boolean,
 * }} props
 */
export default function PageSelector({ source, rangeText, parsed, onChange, disabled = false, showOrder = false }) {
  const inputId = useId();
  const hintId = useId();
  const { doc, numPages, queue } = source;
  const isEmpty = !rangeText.trim();
  const error = isEmpty ? '' : parsed.error;
  const selected = error ? [] : parsed.pages;
  const order = new Map(selected.map((page, index) => [page, index + 1]));
  const allText = numPages === 1 ? '1' : `1-${numPages}`;

  return (
    <div className={styles.pageSelector}>
      <label htmlFor={inputId} className={styles.fieldLabel}>Trang cần chọn</label>
      <div className={styles.rangeRow}>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={rangeText}
          disabled={disabled}
          placeholder="Ví dụ: 1-3,5,8"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className={styles.button} disabled={disabled || rangeText === allText} onClick={() => onChange(allText)}>Chọn tất cả</button>
        <button type="button" className={styles.button} disabled={disabled || isEmpty} onClick={() => onChange('')}>Bỏ chọn</button>
      </div>
      <p id={hintId} className={error ? styles.fieldError : styles.fieldHint} aria-live="polite">
        {error ? <><FiAlertCircle aria-hidden="true" /> {error}</> : isEmpty
          ? `Tài liệu có ${numPages} trang. Nhập số trang hoặc bấm vào ảnh trang bên dưới.`
          : `Đã chọn ${selected.length}/${numPages} trang${showOrder && selected.length > 1 ? ` theo thứ tự: ${formatPageRange(selected)}` : ''}.${parsed.duplicates.length ? ` Bỏ qua trang lặp: ${parsed.duplicates.join(', ')}.` : ''}`}
      </p>

      <ul className={styles.pageGrid} aria-label={`Xem trước ${numPages} trang`}>
        {Array.from({ length: numPages }, (_, index) => {
          const page = index + 1;
          const position = order.get(page);
          return (
            <li key={page}>
              <button
                type="button"
                className={`${styles.pageCard} ${position ? styles.pageCardSelected : ''}`}
                aria-pressed={Boolean(position)}
                aria-label={`Trang ${page}${position ? (showOrder ? `, đã chọn, thứ tự ${position}` : ', đã chọn') : ''}`}
                disabled={disabled}
                onClick={() => onChange(formatPageRange(togglePage(error ? [] : parsed.pages, page)))}
              >
                <PdfThumb doc={doc} pageNumber={page} queue={queue} />
                <span className={styles.pageLabel}>Trang {page}</span>
                {position && <span className={styles.pageBadge} aria-hidden="true">{showOrder ? position : '✓'}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
