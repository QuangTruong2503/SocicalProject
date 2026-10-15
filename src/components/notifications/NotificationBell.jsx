import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaBell } from 'react-icons/fa6';
import { useNotifications } from '../../hooks/useNotifications.js';
import { notificationDate } from '../../utils/notifications.js';
import NotificationDetail from './NotificationDetail.jsx';
import styles from './Notifications.module.css';

export default function NotificationBell() {
  const { items, unread_count: unread, loading, error, refresh, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [operationError, setOperationError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => {
    // Close via browser history as well as clicking a notification action.
    const close = () => { setOpen(false); setSelected(null); };
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, []);
  async function readAll() {
    setBusy(true);
    const result = await markRead();
    setOperationError(result.error || ''); setBusy(false);
  }
  async function view(item) {
    setSelected(item); setOpen(false); setOperationError('');
    if (!item.read_at) {
      const result = await markRead(item.id);
      setOperationError(result.error || '');
    }
  }
  return <div className={styles.bell} ref={ref}>
    <button ref={trigger} className={styles.bellButton} aria-label={`Thông báo, ${unread} chưa đọc`} aria-expanded={open} aria-controls="notification-dropdown"
      onClick={() => { setOpen(!open); if (!open) void refresh(); }}>
      <FaBell aria-hidden="true" />{unread > 0 && <span className={styles.counter}>{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section id="notification-dropdown" className={styles.dropdown} aria-label="Thông báo gần đây">
      <div className={styles.dropdownHead}><strong>Thông báo</strong><button className={styles.textButton} title="Đánh dấu đã đọc tất cả thông báo bình thường" disabled={busy || !unread} onClick={readAll}>Đọc tất cả</button></div>
      {(error || operationError) && <div className={styles.error} role="alert">{error || operationError}<button className={styles.textButton} onClick={refresh}>Thử lại</button></div>}
      {loading && <p className={styles.empty} role="status">Đang tải…</p>}
      {!loading && !error && !items.length && <p className={styles.empty}>Bạn chưa có thông báo.</p>}
      <div className={styles.recentList}>{items.map((item) => <button key={item.id} className={`${styles.recent} ${!item.read_at ? styles.unread : ''}`} onClick={() => view(item)}>
        <span className={styles.dot} aria-label={item.read_at ? 'Đã đọc' : 'Chưa đọc'} />
        <span><strong>{item.title}</strong><small>{item.priority === 'important' ? 'Quan trọng · ' : ''}{notificationDate(item.sent_at)}</small></span>
      </button>)}</div>
      <Link className={styles.dropdownFooter} to="/notifications" onClick={() => setOpen(false)}>Xem tất cả thông báo</Link>
    </section>}
    {selected && <NotificationDetail key={selected.id} id={selected.id} onClose={() => setSelected(null)} readError={operationError} onRetryRead={() => view(selected)} />}
  </div>;
}
