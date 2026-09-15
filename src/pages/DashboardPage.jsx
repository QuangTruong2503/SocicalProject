import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import imageCompression from 'browser-image-compression';
import { Navigate, NavLink, useNavigate, useParams } from 'react-router-dom';
import {
  FaArrowsRotate,
  FaCamera,
  FaCircleUser,
  FaCrown,
  FaGaugeHigh,
  FaImages,
  FaKey,
  FaRightFromBracket,
  FaShieldHalved,
  FaTrash,
  FaUser,
  FaXmark,
} from 'react-icons/fa6';
import { useAuth } from '../hooks/useAuth.js';
import { uploadImage, fetchCurrentUserUploads, deleteUpload } from '../services/uploadService.js';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../utils/userProfile.js';
import '../styles/auth.css';

const PLAN_CREDIT_LIMITS = {
  free: 10,
};

function formatDate(value) {
  if (!value) {
    return 'Không rõ';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Không rõ';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getInitialProfileForm(profile, user) {
  return {
    username: profile?.username || user?.user_metadata?.username || '',
    full_name: profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '',
    email: profile?.email || user?.email || '',
    phone: profile?.phone || '',
    bio: profile?.bio || '',
    date_of_birth: profile?.date_of_birth || '',
    gender: profile?.gender || '',
    country: profile?.country || '',
    city: profile?.city || '',
    address: profile?.address || '',
    avatar_url: profile?.avatar_url || '',
  };
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getAuthProviderLabel(user) {
  const providers = user?.app_metadata?.providers;

  if (Array.isArray(providers) && providers.length > 0) {
    return providers.map((provider) => (provider === 'email' ? 'Email' : provider)).join(', ');
  }

  return user?.app_metadata?.provider || 'Không rõ';
}

const dashboardSections = [
  { id: 'overview', label: 'Tổng quan', path: '/dashboard/overview', icon: FaGaugeHigh },
  { id: 'profile', label: 'Hồ sơ', path: '/dashboard/profile', icon: FaUser },
  { id: 'security', label: 'Bảo mật', path: '/dashboard/security', icon: FaShieldHalved },
  { id: 'avatar', label: 'Avatar', path: '/dashboard/avatar', icon: FaCamera },
  { id: 'uploads', label: 'Ảnh đã tải', path: '/dashboard/uploads', icon: FaImages },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const {
    user,
    session,
    profile,
    latestUpload,
    logout,
    refreshProfile,
    refreshAvatar,
    updateProfile,
    updatePassword,
    isProfileLoading,
    profileError,
    uploadError: authUploadError,
  } = useAuth();
  const [uploads, setUploads] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isReloadingUploads, setIsReloadingUploads] = useState(false);
  const [profileForm, setProfileForm] = useState(() => getInitialProfileForm(profile, user));
  const [profileMessage, setProfileMessage] = useState('');
  const [profileFormError, setProfileFormError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [previewUpload, setPreviewUpload] = useState(null);
  const [deletingUploadId, setDeletingUploadId] = useState(null);

  const displayName = getUserDisplayName(user, profile);
  const avatarUrl = getUserAvatarUrl(user, profile, latestUpload);
  const initials = getUserInitials(user, profile);
  const providerLabel = getAuthProviderLabel(user);
  const activeSection = section || 'overview';
  const isKnownSection = dashboardSections.some((item) => item.id === activeSection);

  const sessionExpiry = useMemo(() => (
    session?.expires_at ? new Date(session.expires_at * 1000) : null
  ), [session?.expires_at]);

  useEffect(() => {
    let isActive = true;

    async function loadUploads() {
      if (!user?.id) {
        setUploads([]);
        return;
      }

      setIsReloadingUploads(true);
      const result = await fetchCurrentUserUploads(user.id);

      if (!isActive) {
        return;
      }

      if (result.error) {
        setUploadError(result.error);
        setUploads([]);
        setIsReloadingUploads(false);
        return;
      }

      setUploads(result.data ?? []);
      setIsReloadingUploads(false);
    }

    loadUploads();

    return () => {
      isActive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    setProfileForm(getInitialProfileForm(profile, user));
  }, [profile, user]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const statCards = useMemo(() => ([
    {
      label: 'Phiên đăng nhập',
      value: session ? 'Hoạt động' : 'Chưa có',
      icon: <FaKey aria-hidden="true" />,
    },
    {
      label: 'Ảnh đã tải lên',
      value: isReloadingUploads ? '...' : uploads.length,
      icon: <FaImages aria-hidden="true" />,
    },
    {
      label: 'Trạng thái profile',
      value: isProfileLoading ? 'Đang tải...' : profile ? 'Sẵn sàng' : 'Chưa có row',
      icon: <FaCircleUser aria-hidden="true" />,
    },
    {
      label: 'Gói hiện tại',
      value: profile?.plan || 'free',
      icon: <FaCrown aria-hidden="true" />,
    },
  ]), [isProfileLoading, profile, session, uploads.length, isReloadingUploads]);

  const creditsInfo = useMemo(() => {
    const plan = profile?.plan || 'free';
    const credits = profile?.credits ?? 10;
    const limit = PLAN_CREDIT_LIMITS[plan] || Math.max(credits, 10);
    const percent = limit > 0 ? Math.min(100, Math.max(0, (credits / limit) * 100)) : 0;

    return { plan, credits, limit, percent };
  }, [profile?.plan, profile?.credits]);

  async function handleLogout() {
    const result = await logout();

    if (result.error) {
      setUploadError(result.error);
      return;
    }

    navigate('/auth', { replace: true });
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError('');
    setUploadMessage('');
  }

  async function handleUploadAvatar() {
    if (!selectedFile || !user?.id) {
      setUploadError('Vui lòng chọn một ảnh trước khi tải lên.');
      return;
    }

    setIsUploading(true);
    setUploadError('');
    setUploadMessage('');

    try {
      const compressedFile = await imageCompression(selectedFile, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      });

      const uploadFile = compressedFile instanceof File
        ? compressedFile
        : new File(
          [compressedFile],
          selectedFile.name,
          { type: compressedFile.type || selectedFile.type || 'image/jpeg' },
        );

      const result = await uploadImage({
        userId: user.id,
        file: uploadFile,
      });

      if (result.error) {
        setUploadError(result.error);
        setIsUploading(false);
        return;
      }

      setUploadMessage('Ảnh đại diện đã được cập nhật.');
      setSelectedFile(null);
      await refreshAvatar();

      const uploadsResult = await fetchCurrentUserUploads(user.id);
      if (!uploadsResult.error) {
        setUploads(uploadsResult.data ?? []);
      }
    } catch (error) {
      setUploadError(error?.message || 'Không thể xử lý ảnh tải lên.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteUpload(item) {
    if (!user?.id || !item?.id) {
      return;
    }

    const confirmed = window.confirm('Xóa ảnh này khỏi danh sách?');
    if (!confirmed) {
      return;
    }

    setDeletingUploadId(item.id);
    setUploadError('');

    const result = await deleteUpload({ uploadId: item.id, userId: user.id, imageUrl: item.image_url });

    setDeletingUploadId(null);

    if (result.error) {
      setUploadError(result.error);
      return;
    }

    setUploads((prev) => prev.filter((upload) => upload.id !== item.id));
    setPreviewUpload((prev) => (prev?.id === item.id ? null : prev));
  }

  async function handleRefreshProfile() {
    setUploadError('');
    setUploadMessage('');
    await refreshProfile();
    await refreshAvatar();

    if (user?.id) {
      const uploadsResult = await fetchCurrentUserUploads(user.id);
      if (!uploadsResult.error) {
        setUploads(uploadsResult.data ?? []);
      }
    }
  }

  function updateProfileField(field, value) {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setProfileFormError('');
    setProfileMessage('');
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();

    const nextEmail = profileForm.email.trim().toLowerCase();

    if (!validateEmail(nextEmail)) {
      setProfileFormError('Email không đúng định dạng.');
      return;
    }

    if (profileForm.username.trim() && profileForm.username.trim().length < 3) {
      setProfileFormError('Username phải có ít nhất 3 ký tự.');
      return;
    }

    setIsSavingProfile(true);
    setProfileFormError('');
    setProfileMessage('');

    const result = await updateProfile({
      username: profileForm.username.trim() || null,
      full_name: profileForm.full_name.trim() || null,
      email: nextEmail,
      phone: profileForm.phone.trim() || null,
      bio: profileForm.bio.trim() || null,
      date_of_birth: profileForm.date_of_birth || null,
      gender: profileForm.gender || null,
      country: profileForm.country.trim() || null,
      city: profileForm.city.trim() || null,
      address: profileForm.address.trim() || null,
      avatar_url: profileForm.avatar_url.trim() || null,
    });

    setIsSavingProfile(false);

    if (result.error) {
      setProfileFormError(result.error);
      return;
    }

    setProfileMessage('Thông tin cá nhân đã được cập nhật.');
  }

  function updatePasswordField(field, value) {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
    setPasswordError('');
    setPasswordMessage('');
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsChangingPassword(true);
    setPasswordError('');
    setPasswordMessage('');

    const result = await updatePassword({
      password: passwordForm.newPassword,
      currentPassword: passwordForm.currentPassword || undefined,
    });

    setIsChangingPassword(false);

    if (result.error) {
      setPasswordError(result.error);
      return;
    }

    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setPasswordMessage('Mật khẩu đã được cập nhật. Bạn có thể dùng email/password để đăng nhập lần sau.');
  }

  if (!isKnownSection) {
    return <Navigate to="/dashboard/overview" replace />;
  }

  return (
    <>
      <Helmet>
        <title>Dashboard - AISEO Tools Suite</title>
        <meta name="description" content="Dashboard sau khi dang nhap thanh cong voi Supabase." />
      </Helmet>

      <div className="dashboard-page dashboard-page-v2">
        <div className="dashboard-shell dashboard-shell-v2">
          <aside className="dashboard-sidebar">
            <div className="dashboard-sidebar-profile">
              <div className="dashboard-sidebar-avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="dashboard-sidebar-identity">
                <strong>{displayName}</strong>
                <span>{profile?.email || user?.email || 'Chưa có email'}</span>
              </div>
              <span className="dashboard-plan-chip">
                <FaCrown aria-hidden="true" />
                {creditsInfo.plan}
              </span>
            </div>

            <nav className="dashboard-sidebar-nav" aria-label="Dashboard sections">
              {dashboardSections.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className={({ isActive }) => `dashboard-sidebar-link ${isActive || activeSection === item.id ? 'active' : ''}`}
                    end
                  >
                    <Icon aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            <button type="button" className="dashboard-sidebar-logout" onClick={handleLogout}>
              <FaRightFromBracket aria-hidden="true" />
              Đăng xuất
            </button>
          </aside>

          <main className="dashboard-main">
            <div className="dashboard-topbar">
              <div>
                <span className="dashboard-panel-kicker">Dashboard</span>
                <h1>Xin chào, {displayName}</h1>
              </div>
              <div className="dashboard-topbar-actions">
                <button type="button" className="dashboard-ghost-btn dashboard-icon-btn" onClick={handleRefreshProfile}>
                  <FaArrowsRotate aria-hidden="true" />
                  Làm mới
                </button>
                <NavLink to="/dashboard/avatar" className="dashboard-solid-btn dashboard-icon-btn">
                  <FaCamera aria-hidden="true" />
                  Tải ảnh mới
                </NavLink>
              </div>
            </div>

            {(uploadError || authUploadError || profileError) && (
              <div className="dashboard-alert dashboard-alert-error">
                {uploadError || authUploadError || profileError}
              </div>
            )}

            {uploadMessage && (
              <div className="dashboard-alert dashboard-alert-success">
                {uploadMessage}
              </div>
            )}

            <div className="dashboard-stats-grid">
              {statCards.map((stat) => (
                <article key={stat.label} className="dashboard-stat-card-v2">
                  <span className="dashboard-stat-icon">
                    {stat.icon}
                  </span>
                  <div>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                </article>
              ))}
            </div>

            {activeSection === 'overview' && (
              <div className="dashboard-credit-card">
                <div className="dashboard-credit-head">
                  <span className="dashboard-panel-kicker">Quota</span>
                  <strong>{creditsInfo.credits} / {creditsInfo.limit} credits còn lại</strong>
                </div>
                <div className="dashboard-credit-track">
                  <div className="dashboard-credit-fill" style={{ width: `${creditsInfo.percent}%` }} />
                </div>
              </div>
            )}

            <div className="dashboard-panels">
            {activeSection === 'profile' && (
            <section className="dashboard-panel dashboard-profile-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Personal profile</span>
                  <h3>Cập nhật thông tin cá nhân</h3>
                </div>
                <span className="dashboard-panel-chip">{isSavingProfile ? 'Đang lưu...' : 'Editable'}</span>
              </div>

              <form className="dashboard-form" onSubmit={handleProfileSubmit}>
                <div className="dashboard-form-grid">
                  <label className="dashboard-form-field">
                    <span>Username</span>
                    <input
                      type="text"
                      value={profileForm.username}
                      onChange={(event) => updateProfileField('username', event.target.value)}
                      disabled={isSavingProfile}
                      autoComplete="username"
                    />
                  </label>

                  <label className="dashboard-form-field">
                    <span>Họ tên</span>
                    <input
                      type="text"
                      value={profileForm.full_name}
                      onChange={(event) => updateProfileField('full_name', event.target.value)}
                      disabled={isSavingProfile}
                      autoComplete="name"
                    />
                  </label>

                  <label className="dashboard-form-field">
                    <span>Email hiển thị</span>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(event) => updateProfileField('email', event.target.value)}
                      disabled={isSavingProfile}
                      autoComplete="email"
                    />
                  </label>

                  <label className="dashboard-form-field">
                    <span>Số điện thoại</span>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(event) => updateProfileField('phone', event.target.value)}
                      disabled={isSavingProfile}
                      autoComplete="tel"
                    />
                  </label>

                  <label className="dashboard-form-field">
                    <span>Ngày sinh</span>
                    <input
                      type="date"
                      value={profileForm.date_of_birth}
                      onChange={(event) => updateProfileField('date_of_birth', event.target.value)}
                      disabled={isSavingProfile}
                    />
                  </label>

                  <label className="dashboard-form-field">
                    <span>Giới tính</span>
                    <select
                      value={profileForm.gender}
                      onChange={(event) => updateProfileField('gender', event.target.value)}
                      disabled={isSavingProfile}
                    >
                      <option value="">Chưa chọn</option>
                      <option value="female">Nữ</option>
                      <option value="male">Nam</option>
                      <option value="other">Khác</option>
                      <option value="prefer_not_to_say">Không muốn chia sẻ</option>
                    </select>
                  </label>

                  <label className="dashboard-form-field">
                    <span>Quốc gia</span>
                    <input
                      type="text"
                      value={profileForm.country}
                      onChange={(event) => updateProfileField('country', event.target.value)}
                      disabled={isSavingProfile}
                      autoComplete="country-name"
                    />
                  </label>

                  <label className="dashboard-form-field">
                    <span>Thành phố</span>
                    <input
                      type="text"
                      value={profileForm.city}
                      onChange={(event) => updateProfileField('city', event.target.value)}
                      disabled={isSavingProfile}
                      autoComplete="address-level2"
                    />
                  </label>
                </div>

                <label className="dashboard-form-field">
                  <span>Địa chỉ</span>
                  <input
                    type="text"
                    value={profileForm.address}
                    onChange={(event) => updateProfileField('address', event.target.value)}
                    disabled={isSavingProfile}
                    autoComplete="street-address"
                  />
                </label>

                <label className="dashboard-form-field">
                  <span>Avatar URL</span>
                  <input
                    type="url"
                    value={profileForm.avatar_url}
                    onChange={(event) => updateProfileField('avatar_url', event.target.value)}
                    disabled={isSavingProfile}
                    placeholder="https://..."
                  />
                </label>

                <label className="dashboard-form-field">
                  <span>Giới thiệu</span>
                  <textarea
                    value={profileForm.bio}
                    onChange={(event) => updateProfileField('bio', event.target.value)}
                    disabled={isSavingProfile}
                    rows={4}
                    maxLength={500}
                  />
                </label>

                {profileFormError && <div className="dashboard-inline-error">{profileFormError}</div>}
                {profileMessage && <div className="dashboard-inline-success">{profileMessage}</div>}

                <div className="dashboard-panel-actions">
                  <button type="button" className="dashboard-ghost-btn" onClick={() => setProfileForm(getInitialProfileForm(profile, user))} disabled={isSavingProfile}>
                    Hoàn tác
                  </button>
                  <button type="submit" className="dashboard-solid-btn" disabled={isSavingProfile}>
                    {isSavingProfile ? 'Đang lưu...' : 'Lưu hồ sơ'}
                  </button>
                </div>
              </form>
            </section>
            )}

            {activeSection === 'security' && (
            <section className="dashboard-panel dashboard-security-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Security</span>
                  <h3>Đổi mật khẩu</h3>
                </div>
                <span className="dashboard-panel-chip">{providerLabel}</span>
              </div>

              <form className="dashboard-form" onSubmit={handlePasswordSubmit}>
                <p className="dashboard-panel-note">
                  Tài khoản Google vẫn có thể đặt mật khẩu để đăng nhập bằng email/password ở những lần sau.
                  Nếu trước đó bạn chưa có mật khẩu, hãy để trống ô mật khẩu hiện tại.
                </p>

                <label className="dashboard-form-field">
                  <span>Mật khẩu hiện tại</span>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) => updatePasswordField('currentPassword', event.target.value)}
                    disabled={isChangingPassword}
                    autoComplete="current-password"
                    placeholder="Bỏ trống nếu đăng nhập Google"
                  />
                </label>

                <label className="dashboard-form-field">
                  <span>Mật khẩu mới</span>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) => updatePasswordField('newPassword', event.target.value)}
                    disabled={isChangingPassword}
                    autoComplete="new-password"
                  />
                </label>

                <label className="dashboard-form-field">
                  <span>Xác nhận mật khẩu mới</span>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => updatePasswordField('confirmPassword', event.target.value)}
                    disabled={isChangingPassword}
                    autoComplete="new-password"
                  />
                </label>

                {passwordError && <div className="dashboard-inline-error">{passwordError}</div>}
                {passwordMessage && <div className="dashboard-inline-success">{passwordMessage}</div>}

                <div className="dashboard-panel-actions">
                  <button
                    type="submit"
                    className="dashboard-solid-btn"
                    disabled={isChangingPassword}
                  >
                    {isChangingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                  </button>
                </div>
              </form>
            </section>
            )}

            {activeSection === 'avatar' && (
            <section className="dashboard-panel dashboard-upload-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Avatar upload</span>
                  <h3>Tải ảnh đại diện mới</h3>
                </div>
                <span className="dashboard-panel-chip">{isUploading ? 'Đang tải...' : 'PNG / JPG / WEBP'}</span>
              </div>

              <label className="dashboard-dropzone" htmlFor="dashboard-avatar-upload">
                <input
                  id="dashboard-avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="dashboard-file-input"
                />

                <div className="dashboard-dropzone-preview">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview upload" />
                  ) : avatarUrl ? (
                    <img src={avatarUrl} alt="Current avatar" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                <div className="dashboard-dropzone-copy">
                  <strong>Chọn ảnh để cập nhật avatar</strong>
                  <p>
                    Kéo thả hoặc bấm để chọn ảnh. Mình sẽ nén ảnh nhẹ trước khi upload để dashboard tải nhanh hơn.
                  </p>
                </div>
              </label>

              <div className="dashboard-upload-meta">
                <div>
                  <span>File</span>
                  <strong>{selectedFile?.name || 'Chưa chọn file'}</strong>
                </div>
                <div>
                  <span>Kích thước</span>
                  <strong>{selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : '—'}</strong>
                </div>
              </div>

              <div className="dashboard-panel-actions">
                <button
                  type="button"
                  className="dashboard-ghost-btn"
                  onClick={() => setSelectedFile(null)}
                  disabled={!selectedFile || isUploading}
                >
                  Xóa chọn
                </button>
                <button
                  type="button"
                  className="dashboard-solid-btn"
                  onClick={handleUploadAvatar}
                  disabled={!selectedFile || isUploading}
                >
                  {isUploading ? 'Đang upload...' : 'Cập nhật ảnh'}
                </button>
              </div>
            </section>
            )}

            {['overview', 'profile', 'security'].includes(activeSection) && (
            <section className="dashboard-panel dashboard-info-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Account details</span>
                  <h3>Thông tin phiên và profile</h3>
                </div>
              </div>

              <div className="dashboard-info-list">
                <div className="dashboard-info-item">
                  <span>Username</span>
                  <strong>{profile?.username || user?.user_metadata?.username || displayName}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Họ tên</span>
                  <strong>{profile?.full_name || user?.user_metadata?.full_name || 'Chưa cập nhật'}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Email</span>
                  <strong>{profile?.email || user?.email || 'Không có email'}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Điện thoại</span>
                  <strong>{profile?.phone || 'Chưa cập nhật'}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Vị trí</span>
                  <strong>{[profile?.city, profile?.country].filter(Boolean).join(', ') || 'Chưa cập nhật'}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Trạng thái</span>
                  <strong>{profile?.status || 'active'} · {profile?.is_verified ? 'Đã xác minh' : 'Chưa xác minh'}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Gói sử dụng</span>
                  <strong>{profile?.plan || 'free'} · {profile?.credits ?? 10} credits</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Avatar URL</span>
                  <strong>{profile?.avatar_url || latestUpload?.image_url || avatarUrl || 'Chưa có ảnh'}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Cập nhật lần cuối</span>
                  <strong>{formatDate(profile?.updated_at)}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Phiên hết hạn</span>
                  <strong>{sessionExpiry ? formatDate(sessionExpiry) : 'Không rõ'}</strong>
                </div>
              </div>
            </section>
            )}

            {['overview', 'avatar', 'uploads'].includes(activeSection) && (
            <section className="dashboard-panel dashboard-uploads-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Recent uploads</span>
                  <h3>Ảnh gần đây</h3>
                </div>
                <span className="dashboard-panel-chip">{uploads.length} items</span>
              </div>

              <div className="dashboard-uploads-grid-v2">
                {uploads.length > 0 ? uploads.slice(0, 9).map((item) => (
                  <article key={item.id} className="dashboard-upload-thumb">
                    <img
                      src={item.image_url}
                      alt={item.file_name || 'Uploaded image'}
                      onClick={() => setPreviewUpload(item)}
                    />
                    <div className="dashboard-upload-thumb-actions">
                      <button
                        type="button"
                        title="Xem nhanh"
                        onClick={() => setPreviewUpload(item)}
                      >
                        <FaImages aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title="Xóa ảnh"
                        onClick={() => handleDeleteUpload(item)}
                        disabled={deletingUploadId === item.id}
                      >
                        <FaTrash aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                )) : (
                  <div className="dashboard-empty-state">
                    <strong>Chưa có ảnh nào</strong>
                    <p>Tải ảnh đầu tiên của bạn lên để chúng ta có một avatar thật đẹp.</p>
                  </div>
                )}
              </div>
            </section>
            )}
            </div>
          </main>
        </div>
      </div>

      {previewUpload && (
        <div className="dashboard-lightbox" role="dialog" aria-modal="true" onClick={() => setPreviewUpload(null)}>
          <div className="dashboard-lightbox-content" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="dashboard-lightbox-close" onClick={() => setPreviewUpload(null)}>
              <FaXmark aria-hidden="true" />
            </button>
            <img src={previewUpload.image_url} alt={previewUpload.file_name || 'Uploaded image'} />
            <div className="dashboard-lightbox-meta">
              <strong>{previewUpload.file_name || 'Untitled upload'}</strong>
              <span>{formatDate(previewUpload.created_at)}</span>
            </div>
            <button
              type="button"
              className="dashboard-solid-btn"
              onClick={() => handleDeleteUpload(previewUpload)}
              disabled={deletingUploadId === previewUpload.id}
            >
              <FaTrash aria-hidden="true" />
              Xóa ảnh
            </button>
          </div>
        </div>
      )}
    </>
  );
}
