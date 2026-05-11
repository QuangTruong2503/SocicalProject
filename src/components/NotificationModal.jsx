import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/NotificationModal.css';

function safeReadIds(storageKey) {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function safeSaveIds(storageKey, ids) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // Ignore storage errors so the modal still works without persistence.
  }
}

export default function NotificationModal({
  notification,
  storageKey = 'read_notifications',
  onAcknowledge,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const readIds = useMemo(() => safeReadIds(storageKey), [storageKey]);
  const isRead = !!notification?.id && readIds.includes(notification.id);

  useEffect(() => {
    if (!notification || !notification.id) {
      setIsVisible(false);
      return;
    }

    setIsVisible(!isRead);
  }, [notification, isRead]);

  useEffect(() => {
    if (!isVisible) return;

    document.body.classList.add('notification-modal-open');
    return () => {
      document.body.classList.remove('notification-modal-open');
    };
  }, [isVisible]);

  const handleAcknowledge = () => {
    if (!notification?.id) return;

    const nextIds = Array.from(new Set([...readIds, notification.id]));
    safeSaveIds(storageKey, nextIds);
    setIsVisible(false);
    onAcknowledge?.(notification);
  };

  if (!isVisible || !notification?.id || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="notification-modal-backdrop" role="presentation">
      <section
        className="notification-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-modal-title"
      >
        {notification.imageUrl && (
          <div className="notification-modal-image-wrap">
            <img
              className="notification-modal-image"
              src={notification.imageUrl}
              alt={notification.title || 'Thông báo'}
            />
          </div>
        )}

        <div className="notification-modal-body">
          <div className="notification-modal-id">ID: {notification.id}</div>
          <h2 id="notification-modal-title" className="notification-modal-title">
            {notification.title}
          </h2>
          <div className="notification-modal-content">
            {notification.content}
          </div>

          <div className="notification-modal-actions">
            <button
              type="button"
              className="notification-modal-button"
              onClick={handleAcknowledge}
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
