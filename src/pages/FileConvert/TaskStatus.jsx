import { FiAlertCircle, FiInfo, FiLoader } from 'react-icons/fi';
import styles from './FileConvert.module.css';

/** Progress, cancel, error and notice for a `useConvertTask` job. */
export default function TaskStatus({ task, messages = [] }) {
  const percent = task.total ? Math.round((task.done / task.total) * 100) : null;

  return (
    <div className={styles.statusArea}>
      {task.busy && (
        <div className={styles.progress} role="status">
          <div className={styles.progressHead}>
            <span><FiLoader className={styles.spin} aria-hidden="true" /> {task.label}</span>
            {percent !== null && <span>{task.done}/{task.total}</span>}
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label={task.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-valuetext={percent === null ? 'Đang xử lý' : `${percent}%`}
          >
            <span className={percent === null ? styles.progressIndeterminate : ''} style={percent === null ? undefined : { width: `${percent}%` }} />
          </div>
          <button type="button" className={styles.linkButton} onClick={task.cancel}>Hủy</button>
        </div>
      )}
      {task.error && (
        <p className={styles.alert} role="alert"><FiAlertCircle aria-hidden="true" /> <span>{task.error}</span></p>
      )}
      {messages.length > 0 && (
        <div className={styles.alert} role="alert">
          <FiAlertCircle aria-hidden="true" />
          <div>
            <span>Một số file không được thêm:</span>
            <ul>{messages.map((message, index) => <li key={index}>{message}</li>)}</ul>
          </div>
        </div>
      )}
      {task.notice && <p className={styles.notice} role="status"><FiInfo aria-hidden="true" /> <span>{task.notice}</span></p>}
    </div>
  );
}
