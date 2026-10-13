import AdminDialog from './AdminDialog.jsx';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';

export default function AdminConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <AdminDialog title={title} onClose={onCancel} busy={busy}>
      <p className={us.confirmMessage}>{message}</p>
      <div className={styles.modalActions}>
        <button type="button" onClick={onCancel} disabled={busy}>Hủy</button>
        <button
          type="button"
          className={danger ? styles.dangerButton : styles.primary}
          onClick={onConfirm}
          disabled={busy}
          data-dialog-initial
        >
          {busy ? 'Đang xử lý...' : confirmLabel}
        </button>
      </div>
    </AdminDialog>
  );
}
