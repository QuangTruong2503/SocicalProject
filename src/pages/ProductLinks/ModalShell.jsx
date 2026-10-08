import { useEffect } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';
import styles from './ProductLinks.module.css';

export default function ModalShell({ title, description, wide = false, busy = false, onClose, footer, children }) {
  const dialogRef = useDialogFocus(true);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  return (
    <div className={styles.modal} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div
        ref={dialogRef}
        className={`${styles.modalBody} ${wide ? styles.modalWide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pl-modal-title"
      >
        <header className={styles.modalHead}>
          <div>
            <h3 id="pl-modal-title">{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} disabled={busy} aria-label="Đóng"><FaXmark /></button>
        </header>
        {children}
        {footer && <footer className={styles.modalActions}>{footer}</footer>}
      </div>
    </div>
  );
}
