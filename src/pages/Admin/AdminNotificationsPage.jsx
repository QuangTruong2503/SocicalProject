import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-toastify';
import { adminListProfiles } from '../../services/profileService.js';
import { listAdminNotifications, publishNotification, revokeNotification, saveNotificationDraft } from '../../services/notificationService.js';
import { notificationDate, validateNotification } from '../../utils/notifications.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import NotificationContent from '../../components/notifications/NotificationContent.jsx';
import Dialog from '../../components/dialog/Dialog.jsx';
import styles from '../../components/notifications/Notifications.module.css';

const emptyForm = () => ({ title: '', body: '', priority: 'normal', audience: 'all', target_user_ids: [], image_url: '', action_url: '', action_label: '' });
const statuses = { draft: 'Bản nháp', sent: 'Đã gửi', revoked: 'Đã thu hồi' };

export default function AdminNotificationsPage() {
  const [form, setForm] = useState(emptyForm);
  const [draftId, setDraftId] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [preview, setPreview] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [names, setNames] = useState({});
  const editor = useRef(null);
  useEffect(() => {
    let active = true;
    listAdminNotifications(page * 20).then((result) => {
      if (!active) return;
      setLoading(false); setListError(result.error || '');
      if (result.data) { setRows(result.data.items); setTotal(result.data.total_count); }
    });
    return () => { active = false; };
  }, [page, revision]);
  useEffect(() => {
    if (form.audience !== 'selected') return;
    let active = true;
    adminListProfiles({ search: debounced, status: 'active', limit: 30 }).then((result) => {
      if (!active) return;
      setUsersError(result.error || ''); setUsersLoading(false);
      const matches = result.data?.rows || [];
      setUsers(matches);
      setNames((current) => ({ ...current, ...Object.fromEntries(matches.map((user) => [user.id, user.full_name || user.username || user.email || user.id])) }));
    });
    return () => { active = false; };
  }, [debounced, form.audience]);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const reload = () => setRevision((value) => value + 1);
  function newDraft() { setForm(emptyForm()); setDraftId(null); setError(''); setSearch(''); }
  function edit(row) {
    setDraftId(row.id); setForm(Object.fromEntries(Object.keys(emptyForm()).map((key) => [key, row[key] ?? emptyForm()[key]])));
    setError(''); editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function showPreview(mode) {
    const failure = validateNotification(form);
    if (failure) { setError(failure); return; }
    setError(''); setPreview(mode);
  }
  async function save(send = false) {
    const failure = validateNotification(form);
    if (failure) { setError(failure); return; }
    setBusy(true); setError('');
    const result = await saveNotificationDraft(form, draftId);
    if (result.error) { setError(result.error); setBusy(false); return; }
    setDraftId(result.data);
    if (send) {
      const sent = await publishNotification(result.data);
      if (sent.error) { setError(sent.error); setBusy(false); reload(); return; }
      toast.success(`Đã gửi thông báo tới ${sent.data} người nhận.`);
      newDraft();
    } else { toast.success('Đã lưu bản nháp.'); }
    setPreview(null); setBusy(false); reload();
  }
  async function revoke() {
    setBusy(true);
    const result = await revokeNotification(revoking.id);
    if (result.error) setError(result.error);
    else { toast.success('Đã thu hồi thông báo.'); setRevoking(null); reload(); }
    setBusy(false);
  }
  return <div className={styles.adminPage}>
    <Helmet><title>Quản trị thông báo · AISEO Tools Suite</title></Helmet>
    <div className={styles.pageHead}><div><span className={styles.muted}>QUẢN TRỊ HỆ THỐNG</span><h1>Thông báo đến người dùng</h1>
      <p className={styles.muted}>Gửi cập nhật chung hoặc thông tin dành cho từng người.</p></div></div>
    <section ref={editor} className={styles.editor}>
      <div className={styles.pageHead}><h2>{draftId ? 'Chỉnh sửa bản nháp' : 'Soạn thông báo'}</h2>
        <button className={styles.button} disabled={busy} onClick={newDraft}>Soạn mới</button></div>
      <form onSubmit={(event) => { event.preventDefault(); showPreview('send'); }}>
        <fieldset className={styles.fieldset} disabled={busy}>
          <div className={styles.formGrid}>
            <label>Mức độ<select value={form.priority} onChange={(event) => change('priority', event.target.value)}>
              <option value="normal">Bình thường — hiển thị trong chuông</option><option value="important">Quan trọng — hiển thị modal khi vào website</option>
            </select></label>
            <label>Người nhận<select value={form.audience} onChange={(event) => { change('audience', event.target.value); setUsersLoading(true); }}>
              <option value="all">Tất cả tài khoản đang hoạt động</option><option value="selected">Chọn người nhận cụ thể</option>
            </select></label>
          </div>
          {form.audience === 'selected' && <div className={styles.recipientPicker}>
            <label>Tìm người nhận<input value={search} placeholder="Tìm theo tên, email hoặc ID" onChange={(event) => { setSearch(event.target.value); setUsersLoading(true); }} /></label>
            <div className={styles.chips}>{form.target_user_ids.map((id) => <button key={id} type="button" className={styles.chip} onClick={() => change('target_user_ids', form.target_user_ids.filter((value) => value !== id))}>
              {names[id] || id} <span aria-label="Bỏ chọn">×</span></button>)}</div>
            {usersError && <p role="alert" className={styles.error}>{usersError}</p>}
            {usersLoading && <p role="status" className={styles.muted}>Đang tìm người nhận…</p>}
            <div className={styles.userResults}>{!usersLoading && users.map((user) => <label key={user.id} className={styles.userOption}>
              <input type="checkbox" checked={form.target_user_ids.includes(user.id)} onChange={(event) => change('target_user_ids', event.target.checked
                ? [...form.target_user_ids, user.id] : form.target_user_ids.filter((id) => id !== user.id))} />
              <span>{user.full_name || user.username || user.email}<small>{user.email}</small></span>
            </label>)}{!usersLoading && !users.length && !usersError && <p>Không tìm thấy người dùng.</p>}</div>
            <small className={styles.muted}>Đã chọn {form.target_user_ids.length} người. Hiển thị tối đa 30 kết quả; nhập thêm để thu hẹp tìm kiếm.</small>
          </div>}
          <label>Tiêu đề<input required maxLength={160} value={form.title} onChange={(event) => change('title', event.target.value)} placeholder="Ví dụ: Cập nhật công cụ báo giá" /></label>
          <label>Nội dung<textarea required maxLength={10000} rows={7} value={form.body} onChange={(event) => change('body', event.target.value)} placeholder="Nội dung thông báo tới người dùng…" /></label>
          <label>URL ảnh (tùy chọn)<input type="url" maxLength={2048} placeholder="https://…" value={form.image_url} onChange={(event) => change('image_url', event.target.value)} /></label>
          <div className={styles.formGrid}><label>Liên kết (tùy chọn)<input maxLength={2048} value={form.action_url} placeholder="/bao-gia-minh-triet hoặc https://…" onChange={(event) => change('action_url', event.target.value)} /></label>
            <label>Nhãn nút<input maxLength={80} value={form.action_label} placeholder="Mở công cụ" onChange={(event) => change('action_label', event.target.value)} /></label></div>
          <p className={styles.muted}>{form.priority === 'important'
            ? 'Modal sẽ hiện lần lượt khi người nhận vào website, đến khi bấm “Đã hiểu”. Thông báo vẫn được lưu trong hộp thư.'
            : 'Thông báo xuất hiện trong chuông và hộp thư, không mở modal tự động.'}</p>
          <div className={styles.actions}><button className={styles.button} type="button" onClick={() => showPreview('preview')}>Xem trước</button>
            <button className={styles.button} type="button" onClick={() => save()}>Lưu nháp</button>
            <button className={styles.primary} type="submit">{busy ? 'Đang xử lý…' : 'Xem trước & gửi'}</button></div>
        </fieldset>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
    <section className={styles.history}><div className={styles.pageHead}><h2>Lịch sử thông báo</h2><button className={styles.button} onClick={reload}>Làm mới</button></div>
      {listError && <p className={styles.error} role="alert">{listError}</p>}
      {loading ? <p role="status">Đang tải…</p> : !rows.length ? <p className={styles.empty}>Chưa có thông báo. Hãy tạo bản đầu tiên phía trên.</p> : rows.map((row) => <article className={styles.card} key={row.id}>
        <div><div className={styles.filters}><span className={styles.badge}>{statuses[row.status]}</span>
          <span className={`${styles.badge} ${row.priority === 'important' ? styles.important : ''}`}>{row.priority === 'important' ? 'Quan trọng' : 'Bình thường'}</span></div>
          <h3>{row.title}</h3><small className={styles.muted}>{notificationDate(row.sent_at || row.created_at)} · {row.audience === 'all' ? 'Tất cả tài khoản đang hoạt động khi gửi' : `${row.target_user_ids.length} người được chọn`}</small>
          {row.status !== 'draft' && <p className={styles.stats}>{row.recipient_count} người nhận · {row.read_count} đã đọc{row.priority === 'important' ? ` · ${row.acknowledged_count} đã xác nhận` : ''}</p>}</div>
        <div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => setPreview(row)}>Xem</button>
          {row.status === 'draft' && <button className={styles.primary} disabled={busy} onClick={() => edit(row)}>Chỉnh sửa / Gửi</button>}
          {row.status === 'sent' && <button className={styles.danger} disabled={busy} onClick={() => { setError(''); setRevoking(row); }}>Thu hồi</button>}</div>
      </article>)}
      <div className={styles.pagination}><button className={styles.button} disabled={page === 0 || busy} onClick={() => { setPage(page - 1); setLoading(true); }}>Trước</button>
        <span>Trang {page + 1} · {total} thông báo</span><button className={styles.button} disabled={(page + 1) * 20 >= total || busy} onClick={() => { setPage(page + 1); setLoading(true); }}>Sau</button></div>
    </section>
    {preview && <Dialog title={preview === 'send' ? 'Xem trước và gửi thông báo' : 'Xem trước thông báo'} busy={busy} onClose={() => setPreview(null)}>
      <NotificationContent notification={typeof preview === 'object' ? preview : form} showAction={false} />
      {(typeof preview === 'object' ? preview.action_label : form.action_label) && <p className={styles.muted}>Nút liên kết: {typeof preview === 'object' ? preview.action_label : form.action_label}</p>}
      {preview === 'send' && <><p className={styles.muted}>Gửi tới {form.audience === 'all' ? 'tất cả tài khoản đang hoạt động tại thời điểm gửi' : `${form.target_user_ids.length} người được chọn`}. Nội dung đã gửi sẽ không thể chỉnh sửa.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => setPreview(null)}>Quay lại</button>
          <button className={styles.primary} disabled={busy} onClick={() => save(true)}>{busy ? 'Đang gửi…' : 'Gửi ngay'}</button></div></>}
    </Dialog>}
    {revoking && <Dialog title="Thu hồi thông báo" busy={busy} onClose={() => setRevoking(null)}>
      <p>Thu hồi “{revoking.title}”? Thông báo sẽ được gỡ khỏi hộp thư và modal của người nhận khi dữ liệu được cập nhật.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => setRevoking(null)}>Hủy</button>
        <button className={styles.danger} disabled={busy} onClick={revoke}>{busy ? 'Đang thu hồi…' : 'Thu hồi'}</button></div>
    </Dialog>}
  </div>;
}
