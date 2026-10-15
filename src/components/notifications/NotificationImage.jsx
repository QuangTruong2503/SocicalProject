import { useEffect, useState } from 'react';
import { signNotificationImage } from '../../services/notificationImageService.js';
import { safeNotificationUrl } from '../../utils/notifications.js';
import styles from './Notifications.module.css';

export default function NotificationImage({ path, url, previewUrl }) {
  const [signed, setSigned] = useState(null);
  const [retry, setRetry] = useState(0);
  const [failedSrc, setFailedSrc] = useState('');
  useEffect(() => {
    if (!path || previewUrl) return;
    let active = true;
    const load = async () => {
      const result = await signNotificationImage(path);
      if (active) { setSigned({ path, ...result }); setFailedSrc(''); }
    };
    void load();
    const interval = setInterval(load, 240000);
    return () => { active = false; clearInterval(interval); };
  }, [path, previewUrl, retry]);
  const src = previewUrl || (path ? (signed?.path === path ? signed.data : '') : safeNotificationUrl(url, true));
  const error = !previewUrl && path && signed?.path === path && signed.error;
  if (!path && !url && !previewUrl) return null;
  if (error || (src && failedSrc === src)) return <p className={styles.error} role="status">Không tải được ảnh thông báo.
    {path && <button type="button" className={styles.textButton} onClick={() => setRetry((value) => value + 1)}>Tải lại ảnh</button>}</p>;
  return src ? <img className={styles.image} src={src} alt="Ảnh thông báo" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />
    : <p className={styles.muted} role="status">Đang tải ảnh…</p>;
}
