import { Link } from 'react-router-dom';
import { notificationDate, safeNotificationUrl } from '../../utils/notifications.js';
import styles from './Notifications.module.css';
import NotificationImage from './NotificationImage.jsx';

export default function NotificationContent({ notification, showAction = true, onAction, previewImage }) {
  const action = safeNotificationUrl(notification.action_url);
  return <div className={styles.content}>
    <span className={`${styles.badge} ${notification.priority === 'important' ? styles.important : ''}`}>
      {notification.priority === 'important' ? 'Quan trọng' : 'Bình thường'}
    </span>
    <h2>{notification.title}</h2>
    {notification.sent_at && <time dateTime={notification.sent_at}>{notificationDate(notification.sent_at)}</time>}
    <NotificationImage path={notification.image_path} url={notification.image_url} previewUrl={previewImage} />
    <p className={styles.body}>{notification.body}</p>
    {showAction && action && (action.startsWith('/')
      ? <Link className={styles.primary} to={action} onClick={onAction}>{notification.action_label || 'Xem chi tiết'}</Link>
      : <a className={styles.primary} href={action} target="_blank" rel="noopener noreferrer" onClick={onAction}>{notification.action_label || 'Xem chi tiết'}</a>)}
  </div>;
}
