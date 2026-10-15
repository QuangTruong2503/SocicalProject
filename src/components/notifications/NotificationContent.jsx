import { Link } from 'react-router-dom';
import { notificationDate, safeNotificationUrl } from '../../utils/notifications.js';
import styles from './Notifications.module.css';

export default function NotificationContent({ notification, showAction = true, onAction }) {
  const image = safeNotificationUrl(notification.image_url, true);
  const action = safeNotificationUrl(notification.action_url);
  return <div className={styles.content}>
    <span className={`${styles.badge} ${notification.priority === 'important' ? styles.important : ''}`}>
      {notification.priority === 'important' ? 'Quan trọng' : 'Bình thường'}
    </span>
    <h2>{notification.title}</h2>
    {notification.sent_at && <time dateTime={notification.sent_at}>{notificationDate(notification.sent_at)}</time>}
    {image && <img className={styles.image} src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
    <p className={styles.body}>{notification.body}</p>
    {showAction && action && (action.startsWith('/')
      ? <Link className={styles.primary} to={action} onClick={onAction}>{notification.action_label || 'Xem chi tiết'}</Link>
      : <a className={styles.primary} href={action} target="_blank" rel="noopener noreferrer" onClick={onAction}>{notification.action_label || 'Xem chi tiết'}</a>)}
  </div>;
}
