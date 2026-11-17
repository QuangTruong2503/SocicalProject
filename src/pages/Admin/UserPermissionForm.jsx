import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { saveUserPermissions } from '../../services/userManagementService.js';
import { ACCESS_LEVEL_OPTIONS } from '../../services/productLinkService.js';
import { getProfileName } from './adminUserLabels.js';
import { levelLabel } from './userManagementLabels.js';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';

export default function UserPermissionForm({ rows, onSaved, onDirtyChange, onCancel, onBusyChange, onReload }) {
  const [level, setLevel] = useState(rows.length === 1 ? rows[0].direct_level || '' : 'viewer');
  const [note, setNote] = useState('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const reviewRef = useRef(null);
  useEffect(() => { if (review) { reviewRef.current?.focus({ preventScroll:true });reviewRef.current?.scrollIntoView?.({ block:'start' }); } },[review]);
  const eligible = rows.filter((row) => row.role !== 'admin');
  const changed = eligible.some((row) => (row.direct_level || '') !== level);
  const updateLevel = (next) => { setLevel(next); setReview(false); onDirtyChange?.(eligible.some((row) => (row.direct_level || '') !== next) || Boolean(note.trim())); };

  async function save() {
    if (busyRef.current || !changed) return;
    busyRef.current = true; setBusy(true); setError(''); onBusyChange?.(true);
    const result = await saveUserPermissions(eligible, level, note);
    busyRef.current = false; setBusy(false); onBusyChange?.(false);
    if (result.error) { setError(result.error); return; }
    onDirtyChange?.(false);
    toast.success(`Đã cập nhật ${result.data.updated_count} tài khoản; ${result.data.unchanged_count} không đổi.`);
    onSaved();
  }
  if (!eligible.length) return <p className={us.mutedNote}>Toàn quyền · Kế thừa từ vai trò Quản trị viên. Để thay đổi quyền hiệu lực, hãy quản lý vai trò hệ thống. Quyền trực tiếp đã lưu được giữ nguyên.</p>;
  return (
    <div className={us.permissionForm} aria-busy={busy}>
      <p>Chỉ thay quyền <strong>Link ảnh sản phẩm</strong> của {eligible.length} tài khoản trong danh sách đã chọn.</p>
      {rows.length !== eligible.length && <p role="status">Loại {rows.length - eligible.length} admin vì quyền kế thừa theo vai trò.</p>}
      <label className={styles.modalField}>Quyền được cấp
        <select aria-label="Quyền được cấp" value={level} disabled={busy || review} onChange={(event) => updateLevel(event.target.value)}>
          {ACCESS_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className={styles.modalField}>Ghi chú (tối đa 200 ký tự)
        <textarea aria-label="Ghi chú cấp quyền" maxLength={200} value={note} disabled={busy || review} onChange={(event) => { setNote(event.target.value);onDirtyChange?.(changed || Boolean(event.target.value.trim())); }} />
      </label>
      {review && <div className={us.reviewBox} ref={reviewRef} tabIndex={-1} role="region" aria-label="Xem lại thay đổi quyền">
        <h4>Xem lại thay đổi quyền</h4>
        <ul>{eligible.map((row) => <li key={row.id}>
          <strong>{getProfileName(row)}</strong> <small>{row.email}</small>
          <div>{levelLabel(row.direct_level)} → <strong>{levelLabel(level)}</strong></div>
          <div>Quyền hiệu lực: {row.status === 'suspended' ? 'Bị chặn do tài khoản đã khóa' : levelLabel(level)}</div>
        </li>)}</ul>
        {note && <p>Ghi chú: {note}</p>}
        <p>Giao dịch áp dụng toàn bộ danh sách. Nếu dữ liệu đã đổi, toàn bộ lô sẽ bị từ chối để bạn tải lại.</p>
      </div>}
      {error && <div className={us.fieldError} role="alert">{error}{onReload && <button type="button" onClick={onReload}>Tải lại quyền</button>}</div>}
      <div className={`${styles.modalActions} ${us.stickyActions}`}>
        <button type="button" disabled={busy} onClick={() => { updateLevel(rows.length === 1 ? rows[0].direct_level || '' : 'viewer'); setNote(''); setError('');onDirtyChange?.(false);onCancel?.(); }}>Hủy</button>
        {review
          ? <><button type="button" disabled={busy} onClick={() => setReview(false)}>Quay lại</button><button type="button" className={styles.primary} disabled={busy || !changed} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu thay đổi quyền'}</button></>
          : <button type="button" className={styles.primary} disabled={busy || !changed} onClick={() => setReview(true)}>Xem lại thay đổi</button>}
      </div>
    </div>
  );
}
