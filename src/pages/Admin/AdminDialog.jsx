import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { FaXmark } from 'react-icons/fa6';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';
import styles from './Admin.module.css';

/**
 * Accessible modal / side drawer for the admin pages: traps focus, closes on
 * Escape or a backdrop click, and refuses to close while `busy`.
 * Only one AdminDialog should be open at a time.
 */
export default function AdminDialog({ title, onClose, busy = false, variant = 'modal', children }) {
  const dialogRef = useDialogFocus();
  const titleId = useId();
  const isDrawer = variant === 'drawer';

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  return createPortal(
    <div
      className={isDrawer ? styles.drawerBackdrop : styles.modal}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={isDrawer ? styles.drawer : styles.modalBody}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.dialogHead}>
          <h3 id={titleId}>{title}</h3>
          <button type="button" className={styles.dialogClose} onClick={onClose} disabled={busy} aria-label="Đóng">
            <FaXmark aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
