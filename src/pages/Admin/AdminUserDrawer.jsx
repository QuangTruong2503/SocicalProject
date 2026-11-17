import { useEffect, useRef, useState } from 'react';
import { FaLock, FaLockOpen, FaPen } from 'react-icons/fa6';
import { getManagedUser } from '../../services/userManagementService.js';
import Dialog from '../../components/dialog/Dialog.jsx';
import UnsavedNavigationGuard from '../../components/dialog/UnsavedNavigationGuard.jsx';
import { useAvatarFrames } from '../../hooks/useAvatarFrames.js';
import { frameLayerProps, resolveAvatarFrame } from '../../utils/avatarFrames.js';
import UserAvatar from './AdminUserAvatar.jsx';
import { CopyButton } from './AdminTableParts.jsx';
import { formatDateTime, formatNumber } from './adminUtils.js';
import { getPlanLabel, getProfileName, getRoleLabel, getStatusLabel } from './adminUserLabels.js';
import { USER_SECTIONS, activityLabel, levelLabel, sourceLabel } from './userManagementLabels.js';
import UserPermissionForm from './UserPermissionForm.jsx';
import UserQuotaForm from './UserQuotaForm.jsx';
import UserHistory from './UserHistory.jsx';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';

function Info({ label,children }) { return <div className={us.infoRow}><dt>{label}</dt><dd>{children || '—'}</dd></div>; }
export default function AdminUserDrawer({ summary,isSelf,section='overview',onSectionChange,onClose,onEdit,onToggleLock,onChanged,onOpenUser,reloadToken }) {
  const [state,setState] = useState({ data:null,loading:true,error:'' });
  const [reload,setReload] = useState(0);
  const [dirty,setDirty] = useState(false);
  const [busy,setBusy] = useState(false);
  const [draftVersion,setDraftVersion] = useState(0);
  const dirtyRef = useRef(false);
  const requestRef = useRef(0);
  const identityRef = useRef(null);
  const { frames } = useAvatarFrames();
  useEffect(() => { identityRef.current?.scrollIntoView?.({ block:'start' }); },[section,summary.id]);
  useEffect(() => {
    const request = ++requestRef.current;
    async function load() {
      setState((s) => ({ ...s,loading:true,error:'' }));
      const result = await getManagedUser(summary.id);
      if (request !== requestRef.current) return;
      setState({ data:result.data,loading:false,error:result.error || '' });
    }
    load();
    return () => { requestRef.current += 1; };
  }, [summary.id,reload,reloadToken]);
  useEffect(() => {
    const beforeUnload = (event) => { if (dirtyRef.current) { event.preventDefault();event.returnValue=''; } };
    window.addEventListener('beforeunload',beforeUnload);
    return () => window.removeEventListener('beforeunload',beforeUnload);
  }, []);
  function changeDirty(value) { dirtyRef.current=value;setDirty(value); }
  function guard(action) {
    if (busy) return;
    if (dirtyRef.current && !window.confirm('Có thay đổi chưa lưu. Bỏ các thay đổi và tiếp tục?')) return;
    changeDirty(false);action();
  }
  function saved() { changeDirty(false);setReload((n) => n+1);onChanged?.(); }
  const profile = state.data?.profile || summary;
  const selected = USER_SECTIONS.some((s) => s.id===section) ? section : 'overview';
  return <Dialog title={`Hồ sơ · ${getProfileName(profile)}`} onClose={() => guard(onClose)} variant="drawer" wideDrawer busy={busy}>
    <UnsavedNavigationGuard dirtyRef={dirtyRef} busy={busy} onDiscard={() => { changeDirty(false);setDraftVersion((n) => n+1); }} />
    <div className={us.drawerIdentity} ref={identityRef}>
      <UserAvatar profile={profile} size="large" frameSrc={frameLayerProps(resolveAvatarFrame(profile.avatar_frame_id,frames),{ still:true }).frameSrc} />
      <div><strong>{getProfileName(profile)}</strong><span title={profile.email}>{profile.email || profile.id}</span>
        <div className={us.badgeRow}><span className={styles.badge}>{getRoleLabel(profile.role)}</span><span className={`${styles.badge} ${profile.status==='suspended' ? styles.badgeSuspended : styles.badgeActive}`}>{getStatusLabel(profile.status)}</span></div>
      </div>
    </div>
    <nav className={us.sectionNav} aria-label="Các mục hồ sơ">{USER_SECTIONS.map((s) => <button type="button" key={s.id} disabled={busy} aria-current={selected===s.id ? 'page' : undefined} onClick={() => guard(() => onSectionChange(s.id))}>{s.label}</button>)}</nav>
    {dirty && <p role="status" className={us.mutedNote}>Có thay đổi chưa lưu</p>}
    {state.loading ? <p role="status">Đang tải hồ sơ và quyền…</p> : state.error ? <div role="alert" className={styles.alert}><span>{state.error}</span><button type="button" onClick={() => guard(() => setReload((n) => n+1))}>Tải lại hồ sơ</button></div> : <>
      {selected==='overview' && <>
        <div className={us.drawerActions}>
          <button type="button" className={styles.actionButton} onClick={() => onEdit(profile)} disabled={isSelf}><FaPen aria-hidden="true" />Chỉnh sửa tài khoản</button>
          <button type="button" className={styles.actionButton} onClick={() => onToggleLock(profile)} disabled={isSelf}>{profile.status==='suspended' ? <FaLockOpen /> : <FaLock />}{profile.status==='suspended' ? 'Mở khóa' : 'Khóa tài khoản'}</button>
        </div>
        {isSelf && <p className={us.mutedNote}>Không thể tự đổi vai trò hoặc khóa tài khoản của chính mình. Máy chủ bảo vệ quản trị viên cuối cùng.</p>}
        <section className={us.drawerSection}><h4>Tổng quan</h4><dl className={us.infoList}>
          <Info label="ID"><span className={us.inlineCode}><code>{profile.id}</code><CopyButton value={profile.id} label="ID" /></span></Info>
          <Info label="Tên đăng nhập">{profile.username}</Info>
          <Info label="Xác minh hồ sơ">{profile.is_verified ? 'Đã xác minh hồ sơ' : 'Chưa xác minh hồ sơ'}</Info>
          <Info label="Gói / credits">{getPlanLabel(profile.plan)} · {formatNumber(profile.credits)} credits</Info>
          <Info label="Ngày tham gia">{formatDateTime(profile.created_at)}</Info>
          <Info label="Đăng nhập gần nhất">{profile.last_login_at ? formatDateTime(profile.last_login_at) : 'Chưa có bản ghi đăng nhập'}</Info>
          <Info label="Hoạt động gần nhất">{activityLabel(profile,formatDateTime)}</Info>
          <Info label="Link ảnh hiệu lực">{levelLabel(profile.effective_level)} · {sourceLabel(profile)}</Info>
        </dl><p className={us.mutedNote}>Xác minh hồ sơ là cờ quản trị, không xác nhận email và không tự cấp quyền công cụ. Hoạt động ghi nhận lượt mở trang/tương tác khi tab hiển thị của tài khoản đăng nhập, tối đa mỗi phút; không suy ra từ đăng nhập hay log hết hạn.</p></section>
        <section className={us.drawerSection}><h4>Thông tin hồ sơ</h4><dl className={us.infoList}><Info label="Điện thoại">{profile.phone}</Info><Info label="Ngày sinh">{profile.date_of_birth}</Info><Info label="Giới tính">{({ male:'Nam',female:'Nữ',other:'Khác' })[profile.gender] || profile.gender}</Info><Info label="Khu vực">{[profile.city,profile.country].filter(Boolean).join(', ')}</Info><Info label="Địa chỉ">{profile.address}</Info><Info label="Giới thiệu">{profile.bio}</Info></dl></section>
        {state.data.activity && <section className={us.drawerSection}><h4>Tóm tắt hoạt động công cụ</h4><dl className={us.infoList}>
          {Object.hasOwn(state.data.activity,'watermark_images') && <Info label="Ảnh watermark">{formatNumber(state.data.activity.watermark_images)} ảnh · gần nhất {formatDateTime(state.data.activity.watermark_last_at)}</Info>}
          {Object.hasOwn(state.data.activity,'quotations') && <Info label="Báo giá đã tạo">{formatNumber(state.data.activity.quotations)} báo giá · gần nhất {formatDateTime(state.data.activity.quotations_last_at)}</Info>}
        </dl></section>}
      </>}
      {selected==='permissions' && <section className={us.drawerSection}><h4>Link ảnh sản phẩm</h4><dl className={us.infoList}>
        <Info label="Quyền đã cấp">{levelLabel(profile.direct_level)}</Info><Info label="Quyền hiệu lực">{levelLabel(profile.effective_level)}</Info><Info label="Nguồn quyền">{sourceLabel(profile)}</Info>
        <Info label="Người cấp">{profile.granted_by_name ? `${profile.granted_by_name} · ${profile.granted_by_email || profile.granted_by}` : 'Chưa có bản ghi cấp trực tiếp'}</Info><Info label="Cập nhật quyền">{formatDateTime(profile.access_updated_at)}</Info>
        <Info label="Ghi chú cấp quyền">{profile.access_note || 'Chưa có ghi chú trong lịch sử hiện có'}</Info>
      </dl><UserPermissionForm key={`${profile.id}:${profile.access_updated_at || ''}:${draftVersion}`} rows={[profile]} onSaved={saved} onDirtyChange={changeDirty} onBusyChange={setBusy} onReload={() => guard(() => setReload((n) => n+1))} /></section>}
      {selected==='quota' && <section className={us.drawerSection}><h4>Gói & hạn mức</h4>
        <button type="button" className={styles.actionButton} disabled={isSelf} onClick={() => guard(() => onEdit(profile))}>Chỉnh gói và credits</button>
        <UserQuotaForm key={`${JSON.stringify(state.data.quota.override)}:${draftVersion}`} profile={profile} quota={state.data.quota} onSaved={saved} onDirtyChange={changeDirty} onBusyChange={setBusy} onReload={() => guard(() => setReload((n) => n+1))} />
      </section>}
      {selected==='history' && <UserHistory userId={profile.id} reloadToken={reloadToken} onOpenUser={(id) => guard(() => onOpenUser?.(id))} />}
    </>}
  </Dialog>;
}
