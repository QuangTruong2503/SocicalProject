import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Navigate, NavLink, useNavigate, useParams } from 'react-router-dom';
import {
  FaArrowsRotate,
  FaBell,
  FaCamera,
  FaCrown,
  FaGaugeHigh,
  FaImages,
  FaRightFromBracket,
  FaShieldHalved,
  FaUser,
  FaXmark,
} from 'react-icons/fa6';
import UserAvatar from '../../components/UserAvatar.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useAvatarFrames } from '../../hooks/useAvatarFrames.js';
import { frameLayerProps, resolveAvatarFrame } from '../../utils/avatarFrames.js';
import { getPlanLabel, getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../../utils/userProfile.js';
import AvatarSection from './AvatarSection.jsx';
import OverviewSection from './OverviewSection.jsx';
import ProfileSection from './ProfileSection.jsx';
import SecuritySection from './SecuritySection.jsx';
import UploadsSection from './UploadsSection.jsx';
import styles from './Dashboard.module.css';
import '../../styles/auth.css';

const SECTIONS = [
  { id: 'overview', label: 'Tổng quan', title: 'Tổng quan', icon: FaGaugeHigh, Component: OverviewSection },
  { id: 'profile', label: 'Hồ sơ', title: 'Hồ sơ cá nhân', icon: FaUser, Component: ProfileSection },
  { id: 'security', label: 'Bảo mật', title: 'Bảo mật', icon: FaShieldHalved, Component: SecuritySection },
  { id: 'avatar', label: 'Avatar', title: 'Ảnh đại diện', icon: FaCamera, Component: AvatarSection },
  { id: 'uploads', label: 'Ảnh đã tải', title: 'Ảnh đã tải lên', icon: FaImages, Component: UploadsSection },
];

/** Problems from AuthContext, worded for the user. A profile error with a profile loaded is only a warning. */
function getAccountNotices({ profile, profileError, uploadError }) {
  const notices = [];

  if (profileError) {
    notices.push(profile
      ? { id: `profile-warning:${profileError}`, tone: 'warning', text: profileError, retry: 'profile' }
      : { id: `profile-error:${profileError}`, tone: 'error', text: `Không tải được hồ sơ: ${profileError}`, retry: 'profile' });
  }

  if (uploadError) {
    notices.push({ id: `avatar-error:${uploadError}`, tone: 'error', text: `Không tải được ảnh đại diện: ${uploadError}`, retry: 'avatar' });
  }

  return notices;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const {
    user,
    profile,
    latestUpload,
    isAvatarReady,
    logout,
    refreshProfile,
    refreshAvatar,
    profileError,
    uploadError,
  } = useAuth();
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState([]);
  const [logoutError, setLogoutError] = useState('');
  const { frames: avatarFrames } = useAvatarFrames(Boolean(user));

  const activeSection = SECTIONS.find((item) => item.id === (section || 'overview'));

  if (!activeSection) {
    return <Navigate to="/dashboard/overview" replace />;
  }

  const displayName = getUserDisplayName(user, profile);
  const notices = getAccountNotices({ profile, profileError, uploadError })
    .concat(logoutError ? [{ id: `logout:${logoutError}`, tone: 'error', text: logoutError }] : [])
    .filter((notice) => !dismissed.includes(notice.id));
  const SectionComponent = activeSection.Component;

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([refreshProfile(), refreshAvatar()]);
    setDismissed([]);
    setRefreshToken((token) => token + 1);
    setIsRefreshing(false);
  }

  async function handleRetry(target) {
    if (target === 'avatar') await refreshAvatar();
    else await refreshProfile();
  }

  async function handleLogout() {
    const result = await logout();

    if (result.error) {
      setLogoutError(result.error);
      return;
    }

    navigate('/auth', { replace: true });
  }

  return (
    <>
      <Helmet>
        <title>{`${activeSection.title} · Tài khoản · AISEO Tools Suite`}</title>
        <meta name="description" content="Quản lý tài khoản, hồ sơ, bảo mật và ảnh đã tải lên." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="dashboard-page dashboard-page-v2">
        <div className="dashboard-shell dashboard-shell-v2">
          <aside className="dashboard-sidebar">
            <div className="dashboard-sidebar-profile">
              <div className="dashboard-sidebar-avatar">
                <UserAvatar
                  src={getUserAvatarUrl(user, profile, latestUpload)}
                  alt={displayName}
                  initials={getUserInitials(user, profile)}
                  isReady={isAvatarReady}
                  {...frameLayerProps(resolveAvatarFrame(profile?.avatar_frame_id, avatarFrames))}
                />
              </div>
              <div className="dashboard-sidebar-identity">
                <strong>{displayName}</strong>
                <span>{profile?.email || user?.email || 'Chưa có email'}</span>
              </div>
              <span className="dashboard-plan-chip" title="Gói sử dụng">
                <FaCrown aria-hidden="true" />
                {getPlanLabel(profile?.plan)}
              </span>
            </div>

            <nav className="dashboard-sidebar-nav" aria-label="Mục tài khoản">
              <NavLink to="/notifications" className="dashboard-sidebar-link"><FaBell aria-hidden="true" />Thông báo</NavLink>
              {SECTIONS.map((item) => (
                <NavLink
                  key={item.id}
                  to={`/dashboard/${item.id}`}
                  className={() => `dashboard-sidebar-link ${activeSection.id === item.id ? 'active' : ''}`}
                  aria-current={activeSection.id === item.id ? 'page' : undefined}
                  end
                >
                  <item.icon aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <button type="button" className="dashboard-sidebar-logout" onClick={handleLogout}>
              <FaRightFromBracket aria-hidden="true" />
              Đăng xuất
            </button>
          </aside>

          <main className="dashboard-main">
            <div className="dashboard-topbar">
              <div>
                <span className="dashboard-panel-kicker">{activeSection.title}</span>
                <h1>Xin chào, {displayName}</h1>
              </div>
              <div className="dashboard-topbar-actions">
                <button
                  type="button"
                  className="dashboard-ghost-btn dashboard-icon-btn"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-busy={isRefreshing}
                >
                  <FaArrowsRotate aria-hidden="true" className={isRefreshing ? styles.spin : undefined} />
                  {isRefreshing ? 'Đang làm mới…' : 'Làm mới'}
                </button>
                {activeSection.id !== 'avatar' && (
                  <NavLink to="/dashboard/avatar" className="dashboard-solid-btn dashboard-icon-btn">
                    <FaCamera aria-hidden="true" />
                    Tải ảnh mới
                  </NavLink>
                )}
              </div>
            </div>

            {notices.map((notice) => (
              <div
                key={notice.id}
                className={`${styles.notice} ${notice.tone === 'warning' ? styles.noticeWarning : styles.noticeError}`}
                role={notice.tone === 'error' ? 'alert' : 'status'}
              >
                <span>{notice.text}</span>
                <div>
                  {notice.retry && (
                    <button type="button" onClick={() => handleRetry(notice.retry)}>Thử lại</button>
                  )}
                  <button
                    type="button"
                    className={styles.noticeClose}
                    onClick={() => setDismissed((current) => [...current, notice.id])}
                    aria-label="Ẩn thông báo"
                  >
                    <FaXmark aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}

            <SectionComponent key={activeSection.id} refreshToken={refreshToken} />
          </main>
        </div>
      </div>
    </>
  );
}
