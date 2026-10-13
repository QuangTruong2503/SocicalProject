import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { FaXmark } from 'react-icons/fa6';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';
import styles from './Dialog.module.css';

const PANEL_CLASS = {
  modal: styles.panel,
  wide: `${styles.panel} ${styles.panelWide}`,
  drawer: styles.drawer,
};

/**
 * Accessible modal / side drawer: traps focus, closes on Escape or a backdrop
 * click, and refuses to close while `busy`. Only one Dialog should be open at a time.
 * @param {{ title: string, onClose: () => void, busy?: boolean, variant?: 'modal' | 'wide' | 'drawer', children: React.ReactNode }} props
 */
export default function Dialog({ title, onClose, busy = false, variant = 'modal', children }) {
  const dialogRef = useDialogFocus();
  const titleId = useId();

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
      className={variant === 'drawer' ? styles.drawerBackdrop : styles.backdrop}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={PANEL_CLASS[variant] || styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.head}>
          <h3 id={titleId}>{title}</h3>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Đóng">
            <FaXmark aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
