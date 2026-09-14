import styles from './Quotation.module.css';

export default function ConfirmModal({
  open, title = 'Xác nhận', message,
  confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', danger,
  onConfirm, onCancel,
}) {
  if (!open) return null;
  return (
    <div className={styles.modal} onClick={onCancel}>
      <div className={styles.confirmBody} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h3 id="confirm-modal-title">{title}</h3>
        <p>{message}</p>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.outlineAction} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" autoFocus className={danger ? `${styles.outlineAction} ${styles.danger}` : styles.primary} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
