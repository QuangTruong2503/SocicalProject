import { useEffect, useRef, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import QuotePreview from './QuotePreview.jsx';
import styles from './QuotePreviewModal.module.css';

const A4_WIDTH_PX = 210 * 3.7795275591;

export default function QuotePreviewModal({ open, onClose, company, quotation }) {
  const frameRef = useRef(null);
  const [scale, setScale] = useState(1);

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

  useEffect(() => {
    if (!open) return undefined;
    const frame = frameRef.current;
    if (!frame) return undefined;
    const update = () => {
      const available = frame.clientWidth;
      setScale(available > 0 ? Math.min(1, available / A4_WIDTH_PX) : 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [open]);

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
        <div ref={frameRef} className={styles.dialogBody}>
          <div
            className={styles.scaleWrap}
            style={{ transform: `scale(${scale})`, width: '210mm', height: scale < 1 ? `${297 * scale}mm` : undefined }}
          >
            <QuotePreview company={company} quotation={quotation} />
          </div>
        </div>
      </div>
    </div>
  );
}
