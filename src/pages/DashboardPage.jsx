import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import imageCompression from 'browser-image-compression';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { uploadImage, fetchCurrentUserUploads } from '../services/uploadService.js';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../utils/userProfile.js';
import '../styles/auth.css';

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

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    user,
    session,
    profile,
    latestUpload,
    logout,
    refreshProfile,
    refreshAvatar,
    isProfileLoading,
    profileError,
    uploadError: authUploadError,
    lastAuthEvent,
  } = useAuth();
  const [uploads, setUploads] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isReloadingUploads, setIsReloadingUploads] = useState(false);

  const displayName = getUserDisplayName(user, profile);
  const avatarUrl = getUserAvatarUrl(user, profile, latestUpload);
  const initials = getUserInitials(user, profile);

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
      hint: lastAuthEvent,
    },
    {
      label: 'Ảnh đã tải lên',
      value: uploads.length,
      hint: isReloadingUploads ? 'Đang đồng bộ...' : 'Từ bảng user_uploads',
    },
    {
      label: 'Trạng thái profile',
      value: profile ? 'Sẵn sàng' : 'Chưa có row',
      hint: isProfileLoading ? 'Đang tải profile...' : 'Đã đồng bộ',
    },
  ]), [isProfileLoading, lastAuthEvent, profile, session, uploads.length, isReloadingUploads]);

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

  return (
    <>
      <Helmet>
        <title>Dashboard - AISEO Tools Suite</title>
        <meta name="description" content="Dashboard sau khi dang nhap thanh cong voi Supabase." />
      </Helmet>

      <div className="dashboard-page">
        <div className="dashboard-orb dashboard-orb-one" aria-hidden="true" />
        <div className="dashboard-orb dashboard-orb-two" aria-hidden="true" />
        <div className="dashboard-gridwash" aria-hidden="true" />

        <div className="dashboard-shell">
          <section className="dashboard-hero">
            <div className="dashboard-hero-copy">
              <div className="dashboard-badge">Phiên đăng nhập</div>

              <div className="dashboard-stat-row">
                {statCards.map((stat) => (
                  <article key={stat.label} className="dashboard-stat-card">
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                    <small>{stat.hint}</small>
                  </article>
                ))}
              </div>

              <div className="dashboard-hero-actions">
                <button type="button" className="dashboard-ghost-btn" onClick={handleRefreshProfile}>
                  Làm mới profile
                </button>
                <button type="button" className="dashboard-solid-btn" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </div>

            <aside className="dashboard-avatar-card">
              <div className="dashboard-avatar-frame">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="dashboard-avatar-image" />
                ) : (
                  <span className="dashboard-avatar-fallback">{initials}</span>
                )}
              </div>
              <div className="dashboard-avatar-copy">
                <h2>{displayName}</h2>
                <p>{profile?.email || user?.email || 'Chưa có email'}</p>
                <div className="dashboard-mini-meta">
                  <span>User ID: {user?.id || 'N/A'}</span>
                  <span>Session: {sessionExpiry ? formatDate(sessionExpiry) : 'Không rõ'}</span>
                </div>
              </div>
            </aside>
          </section>

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

          <div className="dashboard-panels">
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
                  <span>Email</span>
                  <strong>{profile?.email || user?.email || 'Không có email'}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Avatar URL</span>
                  <strong>{latestUpload?.image_url || avatarUrl || 'Chưa có ảnh'}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Session Expires</span>
                  <strong>{sessionExpiry ? formatDate(sessionExpiry) : 'Không rõ'}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Last Auth Event</span>
                  <strong>{lastAuthEvent}</strong>
                </div>
                <div className="dashboard-info-item">
                  <span>Profile State</span>
                  <strong>{isProfileLoading ? 'Đang tải...' : profile ? 'Đã đồng bộ' : 'Chưa có row'}</strong>
                </div>
              </div>
            </section>

            <section className="dashboard-panel dashboard-uploads-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Recent uploads</span>
                  <h3>Ảnh gần đây</h3>
                </div>
                <span className="dashboard-panel-chip">{uploads.length} items</span>
              </div>

              <div className="dashboard-uploads-grid">
                {uploads.length > 0 ? uploads.slice(0, 6).map((item) => (
                  <article key={item.id} className="dashboard-upload-item">
                    <img src={item.image_url} alt={item.file_name || 'Uploaded image'} />
                    <div>
                      <strong>{item.file_name || 'Untitled upload'}</strong>
                      <span>{formatDate(item.created_at)}</span>
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
          </div>
        </div>
      </div>
    </>
  );
}
