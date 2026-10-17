import { useId } from 'react';
import { FiCheckCircle, FiFileText, FiRepeat, FiRotateCcw } from 'react-icons/fi';
import { formatBytes } from '../../utils/fileConvertChecks.js';
import styles from './FileConvert.module.css';

/** Radio group drawn as a segmented control; arrow keys move between options. */
export function ChoiceGroup({ legend, value, options, onChange, disabled = false, hint }) {
  const name = useId();
  const hintId = useId();
  return (
    <fieldset className={styles.choiceGroup} disabled={disabled} aria-describedby={hint ? hintId : undefined}>
      <legend className={styles.fieldLabel}>{legend}</legend>
      <div className={styles.choices}>
        {options.map((option) => (
          <label key={String(option.value)} className={`${styles.choice} ${option.value === value ? styles.choiceActive : ''}`}>
            <input
              type="radio"
              name={name}
              value={String(option.value)}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {hint && <p id={hintId} className={styles.fieldHint}>{hint}</p>}
    </fieldset>
  );
}

/** Success card with the download actions and a "start over" button. */
export function ResultBox({ title, detail, children, onRestart, restartDisabled = false }) {
  return (
    <section className={styles.result} aria-live="polite" aria-label="Kết quả">
      <p className={styles.resultTitle}><FiCheckCircle aria-hidden="true" /> {title}</p>
      {detail && <p className={styles.resultDetail}>{detail}</p>}
      <div className={styles.resultActions}>
        {children}
        <button type="button" className={styles.button} onClick={onRestart} disabled={restartDisabled}>
          <FiRotateCcw aria-hidden="true" /> Bắt đầu lại
        </button>
      </div>
    </section>
  );
}

/** The opened PDF with a button to pick another one. */
export function PdfSourceCard({ source, disabled = false, onClose }) {
  return (
    <div className={styles.sourceCard}>
      <FiFileText className={styles.sourceIcon} aria-hidden="true" />
      <span className={styles.fileInfo}>
        <strong title={source.file.name}>{source.file.name}</strong>
        <span className={styles.fileMeta}>{formatBytes(source.file.size)} · {source.numPages} trang</span>
      </span>
      <button type="button" className={styles.button} disabled={disabled} onClick={onClose}>
        <FiRepeat aria-hidden="true" /> Chọn file khác
      </button>
    </div>
  );
}

/** Explains why the main action is disabled. */
export function BlockedReason({ children }) {
  return children ? <p className={styles.fieldHint}>{children}</p> : null;
}
