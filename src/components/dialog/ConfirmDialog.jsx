import Dialog from './Dialog.jsx';
import styles from './Dialog.module.css';

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog title={title} onClose={onCancel} busy={busy}>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel} disabled={busy}>Hủy</button>
        <button
          type="button"
          className={`${styles.button} ${danger ? styles.danger : styles.primary}`}
          onClick={onConfirm}
          disabled={busy}
          data-dialog-initial
        >
          {busy ? 'Đang xử lý...' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
