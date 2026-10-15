import { useEffect, useState } from 'react';
import { useNotifications } from '../../hooks/useNotifications.js';
import { loadNotificationDetail } from '../../services/notificationService.js';
import Dialog from '../dialog/Dialog.jsx';
import NotificationContent from './NotificationContent.jsx';
import styles from './Notifications.module.css';

export default function NotificationDetail({ id, onClose, readError, onRetryRead }) {
  const { revision } = useNotifications();
  const [result, setResult] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    let active = true;
    loadNotificationDetail(id).then((response) => { if (active) setResult({ ...response, loading: false }); });
    return () => { active = false; };
  }, [id, revision]);
  return <Dialog title="Chi tiết thông báo" onClose={onClose}>
    {readError && <div className={styles.error} role="alert">{readError}<button className={styles.textButton} onClick={onRetryRead}>Thử đánh dấu đã đọc lại</button></div>}
    {result.loading ? <p role="status">Đang tải…</p> : result.error ? <p className={styles.error} role="alert">{result.error}</p>
      : result.data ? <NotificationContent notification={result.data} onAction={onClose} /> : <p>Thông báo đã được thu hồi hoặc không còn khả dụng.</p>}
  </Dialog>;
}
