import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { FaCheck, FaChevronLeft, FaChevronRight, FaCopy, FaSort, FaSortDown, FaSortUp } from 'react-icons/fa6';
import { formatNumber } from './adminUtils.js';
import styles from './Admin.module.css';

/** Column header that toggles server-side sorting. `sort` is `{ key, desc }`. */
export function SortHeader({ label, sortKey, sort, onSort, align }) {
  const isActive = sort.key === sortKey;
  const Icon = !isActive ? FaSort : sort.desc ? FaSortDown : FaSortUp;

  return (
    <th
      aria-sort={isActive ? (sort.desc ? 'descending' : 'ascending') : 'none'}
      className={align === 'right' ? styles.alignRight : undefined}
    >
      <button
        type="button"
        className={`${styles.sortButton} ${isActive ? styles.sortButtonActive : ''}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon aria-hidden="true" />
      </button>
    </th>
  );
}

export function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  async function handleCopy(event) {
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Không copy được, hãy thử lại.');
    }
  }

  return (
    <button
      type="button"
      className={styles.copyButton}
      onClick={handleCopy}
      title={copied ? 'Đã copy' : `Copy ${label}`}
      aria-label={copied ? 'Đã copy' : `Copy ${label}`}
    >
      {copied ? <FaCheck aria-hidden="true" /> : <FaCopy aria-hidden="true" />}
    </button>
  );
}

export function Pagination({ page, pageSize, totalCount, disabled, onPageChange }) {
  if (totalCount <= pageSize) {
    return null;
  }

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <nav className={styles.pagination} aria-label="Phân trang">
      <span>
        {formatNumber(page * pageSize + 1)}–{formatNumber(Math.min((page + 1) * pageSize, totalCount))} / {formatNumber(totalCount)}
      </span>
      <div>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 0 || disabled} aria-label="Trang trước">
          <FaChevronLeft aria-hidden="true" />
        </button>
        <span>Trang {page + 1}/{pageCount}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page + 1 >= pageCount || disabled} aria-label="Trang sau">
          <FaChevronRight aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
