import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { loadNotificationInbox, markNotificationRead, subscribeNotifications } from '../services/notificationService.js';
import { NotificationContext } from './notificationContext.js';
import ImportantNotification from '../components/notifications/ImportantNotification.jsx';

const EMPTY = { items: [], unread_count: 0, pending: null };

function NotificationSession({ userId, children }) {
  const [inbox, setInbox] = useState(EMPTY);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const location = useLocation();
  const refresh = useCallback(async () => {
    if (!userId) return;
    const request = ++sequence.current;
    const result = await loadNotificationInbox({ limit: 8 });
    if (request !== sequence.current) return;
    setLoading(false);
    setError(result.error || '');
    if (!result.error) setInbox(result.data || EMPTY);
    // Keep unacknowledged content during transient network errors, clear it on revoked access.
    else if (result.code === '42501') setInbox(EMPTY);
    setRevision((value) => value + 1);
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let timer;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); };
    const unsubscribe = subscribeNotifications(userId, schedule);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    schedule();
    // Fallback for disconnected sockets; also synchronizes reads made on another device.
    const interval = setInterval(onVisible, 30000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      sequence.current += 1;
      clearTimeout(timer); clearInterval(interval); unsubscribe();
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, refresh]);
  const markRead = useCallback(async (id = null, acknowledge = false) => {
    const result = await markNotificationRead(id, acknowledge);
    if (!result.error) {
      if (acknowledge) setInbox((current) => ({ ...current, pending: current.pending?.id === id ? null : current.pending }));
      await refresh();
    }
    return result;
  }, [refresh]);
  return <NotificationContext.Provider value={{ ...inbox, loading, error, revision, refresh, markRead }}>
    {children}
    {userId && inbox.pending && !location.pathname.startsWith('/auth') &&
      <ImportantNotification key={inbox.pending.id} notification={inbox.pending} onAcknowledge={markRead} />}
  </NotificationContext.Provider>;
}

export default function NotificationProvider({ children }) {
  const { user, profile, isInitializing } = useAuth();
  const userId = !isInitializing && profile?.status !== 'suspended' ? user?.id : null;
  return <NotificationSession key={userId || 'signed-out'} userId={userId}>{children}</NotificationSession>;
}
