import { useAuth } from '../../hooks/useAuth.js';
import { formatDateTime, formatRelative } from '../../utils/formatters.js';
import { getPlanLabel, getUserAvatarSource, getUserDisplayName } from '../../utils/userProfile.js';
import { getAuthProviderLabel } from './dashboardLabels.js';

const AVATAR_SOURCE_LABELS = {
  upload: 'Ảnh tải lên gần nhất',
  profile: 'URL trong hồ sơ',
  provider: 'Ảnh từ tài khoản đăng nhập',
  none: 'Chưa có',
};

const STATUS_LABELS = { active: 'Hoạt động', suspended: 'Đã khóa' };

/** Read-only summary of the account, shown next to the profile and security forms. */
export default function AccountInfoPanel() {
  const { user, session, profile, latestUpload } = useAuth();
  const sessionExpiry = session?.expires_at ? new Date(session.expires_at * 1000) : null;
  const location = [profile?.city, profile?.country].filter(Boolean).join(', ');
  const lastLogin = profile?.last_login_at || user?.last_sign_in_at;

  const rows = [
    ['Tên đăng nhập', profile?.username || user?.user_metadata?.username || getUserDisplayName(user, profile)],
    ['Họ tên', profile?.full_name || user?.user_metadata?.full_name || 'Chưa cập nhật'],
    ['Email', profile?.email || user?.email || 'Không có email'],
    ['Điện thoại', profile?.phone || 'Chưa cập nhật'],
    ['Khu vực', location || 'Chưa cập nhật'],
    ['Trạng thái', `${STATUS_LABELS[profile?.status || 'active'] || profile?.status} · ${profile?.is_verified ? 'Đã xác minh' : 'Chưa xác minh'}`],
    ['Gói sử dụng', getPlanLabel(profile?.plan)],
    ['Đăng nhập bằng', getAuthProviderLabel(user)],
    ['Nguồn avatar', AVATAR_SOURCE_LABELS[getUserAvatarSource(user, profile, latestUpload)]],
    ['Đăng nhập gần nhất', lastLogin ? `${formatRelative(lastLogin)} · ${formatDateTime(lastLogin)}` : 'Chưa ghi nhận'],
    ['Cập nhật hồ sơ', formatDateTime(profile?.updated_at)],
    ['Phiên hết hạn', sessionExpiry ? formatDateTime(sessionExpiry) : 'Không rõ'],
  ];

  return (
    <section className="dashboard-panel dashboard-info-panel">
      <div className="dashboard-panel-head">
        <div>
          <span className="dashboard-panel-kicker">Tài khoản</span>
          <h3>Thông tin tài khoản</h3>
        </div>
      </div>

      <dl className="dashboard-info-list">
        {rows.map(([label, value]) => (
          <div key={label} className="dashboard-info-item">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
