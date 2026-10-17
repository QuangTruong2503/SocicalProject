import { useRef, useState } from 'react';
import { FiAlertCircle, FiArrowDown, FiArrowUp, FiFile, FiLoader, FiTrash2 } from 'react-icons/fi';
import { formatBytes } from '../../utils/fileConvertChecks.js';
import styles from './FileConvert.module.css';

/**
 * Ordered file list with preview, move up/down, drag-to-reorder and remove.
 *
 * @param {{
 *   items: { id: string, name: string, size: number, thumbUrl?: string, status: 'loading' | 'ready' | 'error', error?: string, meta?: string }[],
 *   label: string, noun: string, disabled?: boolean,
 *   onMove: (from: number, to: number) => void, onRemove: (id: string) => void,
 * }} props
 */
export default function SortableFileList({ items, label, noun, disabled = false, onMove, onRemove }) {
  const listRef = useRef(null);
  const dragIndexRef = useRef(-1);
  const [dropIndex, setDropIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  const canReorder = !disabled && items.length > 1;

  function move(from, to, focusAction) {
    if (to < 0 || to >= items.length) return;
    const item = items[from];
    onMove(from, to);
    setAnnouncement(`Đã chuyển “${item.name}” tới vị trí ${to + 1}/${items.length}.`);
    if (!focusAction) return;
    // Reordering moves the DOM node, which drops focus; put it back on the same control.
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) return;
      const preferred = list.querySelector(`[data-focus="${item.id}-${focusAction}"]`);
      const fallback = list.querySelector(`[data-focus="${item.id}-${focusAction === 'up' ? 'down' : 'up'}"]`);
      (preferred && !preferred.disabled ? preferred : fallback)?.focus();
    });
  }

  function handleDrop(event, index) {
    event.preventDefault();
    const from = dragIndexRef.current;
    dragIndexRef.current = -1;
    setDropIndex(-1);
    if (from >= 0 && from !== index) move(from, index);
  }

  return (
    <>
      <ol className={styles.fileList} aria-label={label} ref={listRef}>
        {items.map((item, index) => (
          <li
            key={item.id}
            className={[styles.fileRow, item.status === 'error' ? styles.fileRowError : '', dropIndex === index ? styles.fileRowDrop : ''].filter(Boolean).join(' ')}
            draggable={canReorder}
            onDragStart={(event) => {
              dragIndexRef.current = index;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', item.id);
            }}
            onDragOver={(event) => {
              if (dragIndexRef.current < 0) return;
              event.preventDefault();
              if (dropIndex !== index) setDropIndex(index);
            }}
            onDragLeave={() => setDropIndex(-1)}
            onDragEnd={() => { dragIndexRef.current = -1; setDropIndex(-1); }}
            onDrop={(event) => handleDrop(event, index)}
          >
            <span className={styles.fileIndex} aria-hidden="true">{index + 1}</span>
            <span className={styles.fileThumb} aria-hidden="true">
              {item.thumbUrl ? <img src={item.thumbUrl} alt="" /> : item.status === 'loading' ? <FiLoader className={styles.spin} /> : item.status === 'error' ? <FiAlertCircle /> : <FiFile />}
            </span>
            <span className={styles.fileInfo}>
              <strong title={item.name}>{item.name}</strong>
              <span className={styles.fileMeta}>
                {formatBytes(item.size)}
                {item.status === 'loading' && ' · Đang kiểm tra…'}
                {item.status === 'ready' && item.meta ? ` · ${item.meta}` : ''}
              </span>
              {item.status === 'error' && <span className={styles.fileError}>{item.error}</span>}
            </span>
            <span className={styles.fileActions}>
              <button
                type="button"
                className={styles.iconButton}
                data-focus={`${item.id}-up`}
                disabled={!canReorder || index === 0}
                onClick={() => move(index, index - 1, 'up')}
                aria-label={`Chuyển ${noun} “${item.name}” lên`}
                title="Chuyển lên"
              >
                <FiArrowUp aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                data-focus={`${item.id}-down`}
                disabled={!canReorder || index === items.length - 1}
                onClick={() => move(index, index + 1, 'down')}
                aria-label={`Chuyển ${noun} “${item.name}” xuống`}
                title="Chuyển xuống"
              >
                <FiArrowDown aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.iconDanger}`}
                disabled={disabled}
                onClick={() => {
                  setAnnouncement(`Đã xóa “${item.name}”.`);
                  onRemove(item.id);
                }}
                aria-label={`Xóa ${noun} “${item.name}”`}
                title="Xóa"
              >
                <FiTrash2 aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <p className={styles.srOnly} aria-live="polite">{announcement}</p>
    </>
  );
}
