import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNotifications } from '../hooks/useNotifications.js';
import { loadNotificationInbox } from '../services/notificationService.js';
import { notificationDate } from '../utils/notifications.js';
import NotificationDetail from '../components/notifications/NotificationDetail.jsx';
import styles from '../components/notifications/Notifications.module.css';

export default function NotificationsPage() {
  const { revision, markRead, refresh } = useNotifications();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState({ items: [], total_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let active = true;
    loadNotificationInbox({ offset: page * 20, unreadOnly }).then(({ data, error: failure }) => {
      if (!active) return;
      setError(failure || ''); setLoading(false);
      if (data) {
        setResult(data);
        if (page > 0 && page * 20 >= data.total_count) setPage(Math.max(0, Math.ceil(data.total_count / 20) - 1));
      }
    });
    return () => { active = false; };
  }, [page, unreadOnly, revision]);
  async function read(id = null) {
    setBusy(true);
    const response = await markRead(id);
    setError(response.error || ''); setBusy(false);
  }
  return <div className={styles.page}>
    <Helmet><title>Thông báo · AISEO Tools Suite</title></Helmet>
    <div className={styles.pageHead}><div><span className={styles.muted}>HỘP THƯ CỦA BẠN</span><h1>Thông báo</h1><p className={styles.muted}>Cập nhật và thông tin từ quản trị viên.</p></div>
      <div className={styles.actions}><button className={styles.button} onClick={refresh}>Làm mới</button><button className={styles.primary} onClick={() => read()} disabled={busy}>Đọc tất cả thông báo thường</button></div>
    </div>
    <div className={styles.filters} role="group" aria-label="Lọc thông báo">
      <button className={!unreadOnly ? styles.primary : styles.button} disabled={!unreadOnly} onClick={() => { setUnreadOnly(false); setPage(0); setLoading(true); }}>Tất cả</button>
      <button className={unreadOnly ? styles.primary : styles.button} disabled={unreadOnly} onClick={() => { setUnreadOnly(true); setPage(0); setLoading(true); }}>Chưa đọc</button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <p className={styles.empty} role="status">Đang tải…</p> : !result.items.length ? <p className={styles.empty}>Không có thông báo{unreadOnly ? ' chưa đọc' : ''}.</p> :
      <div className={styles.list}>{result.items.map((item) => <article className={`${styles.card} ${!item.read_at ? styles.unread : ''}`} key={item.id}>
        <div><span className={`${styles.badge} ${item.priority === 'important' ? styles.important : ''}`}>{item.priority === 'important' ? 'Quan trọng' : 'Bình thường'}</span>
          <h2><button className={styles.titleButton} onClick={() => { setSelected(item); if (!item.read_at) void read(item.id); }}>{item.title}</button></h2>
          <p className={styles.excerpt}>{item.body}</p><small className={styles.muted}>{notificationDate(item.sent_at)} · {item.read_at ? 'Đã đọc' : 'Chưa đọc'}</small></div>
        {!item.read_at && <button className={styles.button} disabled={busy} onClick={() => read(item.id)}>Đánh dấu đã đọc</button>}
      </article>)}</div>}
    <div className={styles.pagination}><button className={styles.button} disabled={page === 0} onClick={() => { setPage(page - 1); setLoading(true); }}>Trước</button>
      <span>Trang {page + 1} · {result.total_count} thông báo</span><button className={styles.button} disabled={(page + 1) * 20 >= result.total_count} onClick={() => { setPage(page + 1); setLoading(true); }}>Sau</button></div>
    {selected && <NotificationDetail key={selected.id} id={selected.id} onClose={() => setSelected(null)} readError={error} onRetryRead={() => read(selected.id)} />}
  </div>;
}
