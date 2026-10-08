import { useEffect, useState } from 'react';
import { FaClockRotateLeft, FaXmark } from 'react-icons/fa6';
import {
  LOG_ACTION_TONE,
  describeProductLinkLog,
  formatDateTime,
  formatRelativeTime,
  initialsOf,
} from '../../utils/productLinkLog.js';
import styles from './ProductLinks.module.css';

const TONE_CLASS = {
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  primary: styles.tonePrimary,
  neutral: styles.toneNeutral,
};

export default function ProductLinkActivity({
  logs,
  loading,
  hasMore,
  loadingMore,
  currentUserId,
  onlyOthers,
  hideCopies,
  onOnlyOthersChange,
  onHideCopiesChange,
  onLoadMore,
  onSelectCode,
  onClose,
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = logs.filter((log) => (
    (!onlyOthers || log.user_id !== currentUserId)
    && (!hideCopies || log.action !== 'copy')
  ));

  return (
    <aside className={styles.activity} aria-label="Nhật ký hoạt động">
      <div className={styles.activityHead}>
        <h2><FaClockRotateLeft /> Hoạt động</h2>
        <span className={styles.liveDot} title="Cập nhật realtime">Live</span>
        <button type="button" className={`${styles.iconBtn} ${styles.activityClose}`} onClick={onClose} aria-label="Đóng nhật ký">
          <FaXmark />
        </button>
      </div>

      <div className={styles.activityFilters}>
        <label>
          <input type="checkbox" checked={onlyOthers} onChange={(e) => onOnlyOthersChange(e.target.checked)} />
          Chỉ người khác
        </label>
        <label>
          <input type="checkbox" checked={hideCopies} onChange={(e) => onHideCopiesChange(e.target.checked)} />
          Ẩn thao tác copy
        </label>
      </div>

      <ol className={styles.activityList}>
        {loading && <li className={styles.activityEmpty}>Đang tải nhật ký…</li>}
        {!loading && visible.length === 0 && <li className={styles.activityEmpty}>Chưa có hoạt động nào.</li>}
        {visible.map((log) => {
          const { verb, target, extra } = describeProductLinkLog(log);
          const isMe = log.user_id === currentUserId;

          return (
            <li key={log.id} className={styles.activityItem}>
              <span className={`${styles.avatar} ${TONE_CLASS[LOG_ACTION_TONE[log.action]] ?? ''}`} aria-hidden="true">
                {initialsOf(log.actor_name)}
              </span>
              <div className={styles.activityBody}>
                <p>
                  <strong>{isMe ? 'Bạn' : (log.actor_name || 'Không rõ')}</strong>{' '}
                  {verb}{' '}
                  {target && (
                    log.item_code
                      ? <button type="button" className={styles.activityTarget} onClick={() => onSelectCode(log.item_code)}>{target}</button>
                      : <strong>{target}</strong>
                  )}
                </p>
                {extra && <span className={styles.activityExtra}>{extra}</span>}
                <time dateTime={log.created_at} title={formatDateTime(log.created_at)}>
                  {formatRelativeTime(log.created_at, now)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>

      {hasMore && !loading && (
        <button type="button" className={styles.loadMoreBtn} onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Đang tải…' : 'Xem hoạt động cũ hơn'}
        </button>
      )}
    </aside>
  );
}
