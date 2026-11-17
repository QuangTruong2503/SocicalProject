import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { saveUserQuota } from '../../services/userManagementService.js';
import { getPlanLabel } from './adminUserLabels.js';
import { formatNumber } from './adminUtils.js';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';

const limitLabel = (value) => value == null ? 'Không giới hạn' : `${formatNumber(value)} ảnh`;
const parseLimit = (value) => value.trim() === '' ? null : Number(value);
export default function UserQuotaForm({ profile, quota, onSaved, onDirtyChange, onBusyChange, onReload }) {
  const override = quota.override;
  const initial = { daily: String(override?.daily_image_limit ?? ''), monthly: String(override?.monthly_image_limit ?? ''), unlimited: override?.unlimited || false, note: override?.note || '' };
  const [form, setForm] = useState(initial);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const reviewRef = useRef(null);
  useEffect(() => { if (review) { reviewRef.current?.focus({ preventScroll:true });reviewRef.current?.scrollIntoView?.({ block:'start' }); } },[review]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  function update(key, value) {
    const next = { ...form, [key]: value }; setForm(next); setReview(null);
    onDirtyChange?.(JSON.stringify(next) !== JSON.stringify(initial));
  }
  function preview(remove = false) {
    const value = remove ? null : { daily_image_limit: parseLimit(form.daily), monthly_image_limit: parseLimit(form.monthly), unlimited: form.unlimited, note: form.note.trim() || null };
    if (value && [value.daily_image_limit, value.monthly_image_limit].some((n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 2147483647))) {
      setError('Hạn mức phải là số nguyên từ 0 đến 2.147.483.647; để trống để kế thừa.'); return;
    }
    setError(''); setReview({ value }); onDirtyChange?.(true);
  }
  async function save() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); onBusyChange?.(true);
    const result = await saveUserQuota(profile.id, override, review.value);
    busyRef.current = false; setBusy(false); onBusyChange?.(false);
    if (result.error) { setError(result.error); return; }
    onDirtyChange?.(false); toast.success(review.value ? 'Đã lưu ngoại lệ cá nhân.' : 'Đã trở về mặc định của gói.'); onSaved();
  }
  return <div className={us.permissionForm} aria-busy={busy}>
    <p>Gói <strong>{getPlanLabel(profile.plan)}</strong> · {formatNumber(profile.credits)} credits</p>
    <p role="status">{quota.enforced ? 'Đang cưỡng chế hạn mức ngày/tháng.' : 'Hạn mức chung CHƯA BẬT: ngoại lệ được lưu nhưng chưa được cưỡng chế.'}</p>
    <dl className={us.infoList}>
      <div className={us.infoRow}><dt>Mặc định theo gói</dt><dd>{limitLabel(quota.defaults?.daily_image_limit)} / ngày · {limitLabel(quota.defaults?.monthly_image_limit)} / tháng</dd></div>
      <div className={us.infoRow}><dt>Hạn mức hiệu lực</dt><dd>{limitLabel(quota.effective.daily_limit)} / ngày · {limitLabel(quota.effective.monthly_limit)} / tháng</dd></div>
      <div className={us.infoRow}><dt>Nguồn</dt><dd>{({ override_unlimited: 'Ngoại lệ: không giới hạn', override: 'Ngoại lệ cá nhân; ô trống kế thừa gói', plan: 'Mặc định của gói', none: 'Không giới hạn theo cấu hình hiện tại' })[quota.effective.source]}</dd></div>
      <div className={us.infoRow}><dt>Ảnh đã gửi trong kỳ</dt><dd>{formatNumber(quota.used.daily)} ngày {quota.period_day} · {formatNumber(quota.used.monthly)} tháng {quota.period_month} · giờ Việt Nam</dd></div>
    </dl>
    <p><Link to="/admin/usage?tab=config">Xem cấu hình chung và mặc định theo gói</Link></p>
    <p>Ô trống = kế thừa gói · 0 = không cho gửi thêm ảnh · Không giới hạn = bỏ cả hai hạn mức. Usage không bị đặt lại khi thay đổi.</p>
    <div className={us.formGrid}>
      <label className={styles.modalField}>Ảnh / ngày<input aria-label="Ngoại lệ ảnh mỗi ngày" type="number" min="0" value={form.daily} disabled={busy || Boolean(review) || form.unlimited} onChange={(e) => update('daily',e.target.value)} /></label>
      <label className={styles.modalField}>Ảnh / tháng<input aria-label="Ngoại lệ ảnh mỗi tháng" type="number" min="0" value={form.monthly} disabled={busy || Boolean(review) || form.unlimited} onChange={(e) => update('monthly',e.target.value)} /></label>
    </div>
    <label className={styles.modalCheckbox}><input type="checkbox" checked={form.unlimited} disabled={busy || Boolean(review)} onChange={(e) => update('unlimited',e.target.checked)} />Không giới hạn cá nhân</label>
    <label className={styles.modalField}>Ghi chú<textarea aria-label="Ghi chú hạn mức" maxLength={200} value={form.note} disabled={busy || Boolean(review)} onChange={(e) => update('note',e.target.value)} /></label>
    {review && <div className={us.reviewBox} ref={reviewRef} tabIndex={-1} role="region" aria-label="Xem lại ngoại lệ AI"><h4>Xem lại ngoại lệ AI</h4>
      <p>Hiện tại: {override ? `${limitLabel(override.daily_image_limit)} / ngày; ${limitLabel(override.monthly_image_limit)} / tháng; ${override.unlimited ? 'không giới hạn' : 'kế thừa ô trống'}` : 'Kế thừa mặc định của gói'}</p>
      <p>Sau khi lưu: {review.value ? review.value.unlimited ? 'Không giới hạn cá nhân' : `${review.value.daily_image_limit ?? 'Theo gói'} / ngày; ${review.value.monthly_image_limit ?? 'Theo gói'} / tháng` : 'Xóa bản ghi ngoại lệ, kế thừa mặc định hiện tại và các thay đổi gói sau này.'}</p>
    </div>}
    {error && <div role="alert" className={us.fieldError}>{error}{onReload && <button type="button" onClick={onReload}>Tải lại hạn mức</button>}</div>}
    <div className={`${styles.modalActions} ${us.stickyActions}`}>
      <button type="button" disabled={busy} onClick={() => { setForm(initial);setReview(null);setError('');onDirtyChange?.(false); }}>Hủy</button>
      {override && !review && <button type="button" disabled={busy} onClick={() => preview(true)}>Xóa ngoại lệ / Dùng mặc định của gói</button>}
      {review ? <><button type="button" disabled={busy} onClick={() => { setReview(null);onDirtyChange?.(dirty); }}>Quay lại</button><button type="button" className={styles.primary} disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu thay đổi hạn mức'}</button></>
        : <button type="button" className={styles.primary} disabled={busy || (!dirty && Boolean(override))} onClick={() => preview()}>Xem lại hạn mức</button>}
    </div>
  </div>;
}
