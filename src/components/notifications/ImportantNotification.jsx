import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';
import NotificationContent from './NotificationContent.jsx';
import styles from './Notifications.module.css';

export default function ImportantNotification({ notification, onAcknowledge }) {
  const ref = useDialogFocus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function acknowledge() {
    setBusy(true);
    setError('');
    const result = await onAcknowledge(notification.id, true);
    if (result.error) setError(result.error);
    setBusy(false);
  }
  return createPortal(<div className={styles.backdrop}>
    <section ref={ref} className={styles.modal} role="dialog" aria-modal="true" aria-label="Thông báo quan trọng" tabIndex={-1}>
      <NotificationContent notification={notification} />
      <p className={styles.muted}>Vui lòng xác nhận sau khi đọc thông báo này.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button className={styles.primary} onClick={acknowledge} disabled={busy}>
        {busy ? 'Đang xác nhận…' : 'Đã hiểu'}
      </button></div>
    </section>
  </div>, document.body);
}
