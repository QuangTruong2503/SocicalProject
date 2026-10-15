import { supabase } from '../lib/supabase.js';

async function call(name, params) {
  try {
    const { data, error } = await supabase.rpc(name, params);
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') return { data: null, code: error.code, error: 'Chức năng thông báo chưa được thiết lập trên máy chủ.' };
      return { data: null, code: error.code, error: ['22023', '42501', '22P02'].includes(error.code)
        ? (error.code === '22P02' ? 'Danh sách người nhận không hợp lệ.' : error.message)
        : 'Không thể xử lý thông báo. Vui lòng thử lại.' };
    }
    return { data, error: null };
  } catch { return { data: null, code: 'NETWORK', error: 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.' }; }
}

export const loadNotificationInbox = ({ limit = 20, offset = 0, unreadOnly = false } = {}) =>
  call('notification_inbox', { p_limit: limit, p_offset: offset, p_unread_only: unreadOnly });
export const markNotificationRead = (id = null, acknowledge = false) =>
  call('notification_mark_read', { p_id: id, p_acknowledge: acknowledge });
export const loadNotificationDetail = (id) => call('notification_detail', { p_id: id });
export const saveNotificationDraft = (document, id = null) => call('admin_notification_save', { p_document: document, p_id: id });
export const publishNotification = (id) => call('admin_notification_publish', { p_id: id });
export const revokeNotification = (id) => call('admin_notification_revoke', { p_id: id });
export const listAdminNotifications = (offset = 0) => call('admin_notification_list', { p_limit: 20, p_offset: offset });

export function subscribeNotifications(userId, onChange) {
  const channel = supabase.channel(`notifications:${userId}`, { config: { private: true } })
    .on('broadcast', { event: 'changed' }, onChange)
    .subscribe((status) => { if (status === 'SUBSCRIBED') onChange(); });
  return () => { void supabase.removeChannel(channel); };
}
