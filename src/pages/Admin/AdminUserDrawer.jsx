import { useEffect, useState } from 'react';
import { FaLock, FaLockOpen, FaPen } from 'react-icons/fa6';
import {
  getAdminProfileDetail,
  getAdminUserActivity,
  listAdminAuditLog,
} from '../../services/profileService.js';
import { ACCESS_LEVEL_OPTIONS } from '../../services/productLinkService.js';
import Dialog from '../../components/dialog/Dialog.jsx';
import UserAvatar from './AdminUserAvatar.jsx';
import { CopyButton } from './AdminTableParts.jsx';
import { formatDateTime, formatNumber, formatRelative } from './adminUtils.js';
import {
  formatChangeValue,
  getChangeFieldLabel,
  getProfileName,
  getRoleLabel,
  getStatusLabel,
} from './adminUserLabels.js';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';

const GENDER_LABELS = { male: 'Nam', female: 'Nữ', other: 'Khác' };

function getAccessLevelLabel(level) {
  return ACCESS_LEVEL_OPTIONS.find((option) => option.value === (level || ''))?.label || level;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

function InfoRow({ label, children }) {
  return (
    <div className={us.infoRow}>
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  );
}

/**
 * Side panel with a user's full profile, feature usage and admin change history.
 * `summary` is the row from the list, shown immediately while the rest loads.
 */
export default function AdminUserDrawer({ summary, isSelf, onClose, onEdit, onToggleLock }) {
  const [state, setState] = useState({ loading: true, profile: null, activity: null, audit: [], error: '' });

  useEffect(() => {
    let isActive = true;

    Promise.all([
      getAdminProfileDetail(summary.id),
      getAdminUserActivity(summary.id),
      listAdminAuditLog(summary.id),
    ]).then(([profileResult, activityResult, auditResult]) => {
      if (!isActive) return;

      setState({
        loading: false,
        profile: profileResult.data,
        activity: activityResult.data,
        audit: auditResult.data || [],
        error: profileResult.error || activityResult.error || auditResult.error || '',
      });
    });

    return () => { isActive = false; };
  }, [summary.id]);

  const profile = { ...summary, ...(state.profile || {}) };
  const activity = state.activity;
  const isSuspended = profile.status === 'suspended';
  const location = [profile.city, profile.country].filter(Boolean).join(', ');

  return (
    <Dialog title="Chi tiết người dùng" onClose={onClose} variant="drawer">
      <div className={us.drawerIdentity}>
        <UserAvatar profile={profile} size="large" />
        <div>
          <strong>{getProfileName(profile)}</strong>
          <span>{profile.email || 'Chưa có email'}</span>
          <div className={us.badgeRow}>
            <span className={`${styles.badge} ${profile.role === 'admin' ? styles.badgeAdmin : styles.badgeUser}`}>{getRoleLabel(profile.role)}</span>
            <span className={`${styles.badge} ${isSuspended ? styles.badgeSuspended : styles.badgeActive}`}>{getStatusLabel(profile.status)}</span>
            <span className={`${styles.badge} ${profile.is_verified ? styles.badgeActive : styles.badgeDefault}`}>
              {profile.is_verified ? 'Đã xác minh' : 'Chưa xác minh'}
            </span>
          </div>
        </div>
      </div>

      <div className={us.drawerActions}>
        <button type="button" className={styles.actionButton} onClick={() => onEdit(profile)} disabled={isSelf}>
          <FaPen aria-hidden="true" /> Chỉnh sửa
        </button>
        <button type="button" className={styles.actionButton} onClick={() => onToggleLock(profile)} disabled={isSelf}>
          {isSuspended ? <FaLockOpen aria-hidden="true" /> : <FaLock aria-hidden="true" />}
          {isSuspended ? 'Mở khóa' : 'Khóa tài khoản'}
        </button>
      </div>
      {isSelf && <p className={us.mutedNote}>Bạn không thể tự thay đổi vai trò hoặc trạng thái của chính mình.</p>}

      {state.error && <div className={styles.alert} role="alert"><span>{state.error}</span></div>}

      <section className={us.drawerSection}>
        <h4>Tài khoản</h4>
        <dl className={us.infoList}>
          <InfoRow label="ID">
            <span className={us.inlineCode}><code>{profile.id}</code><CopyButton value={profile.id} label="ID" /></span>
          </InfoRow>
          <InfoRow label="Tên đăng nhập">{profile.username}</InfoRow>
          <InfoRow label="Gói / credits">{`${profile.plan || 'free'} · ${formatNumber(profile.credits)} credits`}</InfoRow>
          <InfoRow label="Tham gia">{formatDateTime(profile.created_at)}</InfoRow>
          <InfoRow label="Đăng nhập gần nhất">
            {profile.last_login_at ? `${formatRelative(profile.last_login_at)} · ${formatDateTime(profile.last_login_at)}` : 'Chưa ghi nhận'}
          </InfoRow>
        </dl>
      </section>

      <section className={us.drawerSection}>
        <h4>Hồ sơ</h4>
        {state.loading ? (
          <span className={styles.skeletonLine} aria-hidden="true" />
        ) : (
          <dl className={us.infoList}>
            <InfoRow label="Điện thoại">{profile.phone}</InfoRow>
            <InfoRow label="Giới tính">{GENDER_LABELS[profile.gender] || profile.gender}</InfoRow>
            <InfoRow label="Ngày sinh">{profile.date_of_birth ? formatDate(profile.date_of_birth) : ''}</InfoRow>
            <InfoRow label="Khu vực">{location}</InfoRow>
            <InfoRow label="Địa chỉ">{profile.address}</InfoRow>
            <InfoRow label="Giới thiệu">{profile.bio}</InfoRow>
          </dl>
        )}
      </section>

      <section className={us.drawerSection}>
        <h4>Hoạt động</h4>
        {state.loading ? (
          <span className={styles.skeletonLine} aria-hidden="true" />
        ) : (
          <div className={us.activityGrid}>
            {'watermark_images' in (activity || {}) && (
              <div>
                <span>Ảnh watermark</span>
                <strong>{formatNumber(activity.watermark_images)}</strong>
                <small>{formatNumber(activity.watermark_entries)} lượt · {formatRelative(activity.watermark_last_at)}</small>
              </div>
            )}
            {'quotations' in (activity || {}) && (
              <div>
                <span>Báo giá đã tạo</span>
                <strong>{formatNumber(activity.quotations)}</strong>
                <small>Gần nhất: {formatRelative(activity.quotations_last_at)}</small>
              </div>
            )}
            {'product_links_level' in (activity || {}) && (
              <div>
                <span>Link ảnh SP</span>
                <strong className={us.activityText}>
                  {profile.role === 'admin' ? 'Toàn quyền' : getAccessLevelLabel(activity.product_links_level)}
                </strong>
              </div>
            )}
          </div>
        )}
      </section>

      <section className={us.drawerSection}>
        <h4>Lịch sử thay đổi</h4>
        {state.loading ? (
          <span className={styles.skeletonLine} aria-hidden="true" />
        ) : state.audit.length === 0 ? (
          <p className={us.mutedNote}>Chưa có thay đổi nào do quản trị viên thực hiện.</p>
        ) : (
          <ol className={us.auditList}>
            {state.audit.map((entry) => (
              <li key={entry.id}>
                <div className={us.auditMeta}>
                  <strong>{entry.actor_email || 'Quản trị viên'}</strong>
                  <time dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>{formatRelative(entry.created_at)}</time>
                </div>
                <ul>
                  {Object.entries(entry.changes || {}).map(([field, change]) => (
                    <li key={field}>
                      {getChangeFieldLabel(field)}: {formatChangeValue(field, change?.from)} → <strong>{formatChangeValue(field, change?.to)}</strong>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Dialog>
  );
}
