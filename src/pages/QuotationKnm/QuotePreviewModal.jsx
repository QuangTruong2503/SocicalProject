import { useEffect } from 'react';
import { FaXmark } from 'react-icons/fa6';
import QuoteLivePreview from './QuoteLivePreview.jsx';
import styles from './QuotePreviewModal.module.css';

export default function QuotePreviewModal({ open, onClose, company, quotation }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <p className={styles.dialogLabel}>XEM TRƯỚC A4</p>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng xem trước">
            <FaXmark /> Đóng xem trước
          </button>
        </div>
        <div className={styles.dialogBody}>
          <QuoteLivePreview company={company} quotation={quotation} />
        </div>
      </div>
    </div>
  );
}
