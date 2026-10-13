import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import imageCompression from 'browser-image-compression';
import UserAvatar from '../../components/UserAvatar.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { uploadImage } from '../../services/uploadService.js';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../../utils/userProfile.js';
import UploadGallery from './UploadGallery.jsx';
import { useUserUploads } from './useUserUploads.js';

const RECENT_UPLOADS = 6;

export default function AvatarSection({ refreshToken }) {
  const { user, profile, latestUpload, isAvatarReady, refreshAvatar } = useAuth();
  const uploads = useUserUploads({ pageSize: RECENT_UPLOADS, reloadToken: refreshToken });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!selectedFile) return undefined;

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl('');
    };
  }, [selectedFile]);

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;

    if (file && !file.type.startsWith('image/')) {
      setError('Vui lòng chọn một file ảnh (PNG, JPG, WEBP…).');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setError('');
    setMessage('');
  }

  async function handleUpload() {
    if (!selectedFile || !user?.id) {
      setError('Vui lòng chọn một ảnh trước khi tải lên.');
      return;
    }

    setIsUploading(true);
    setError('');
    setMessage('');

    try {
      const compressedFile = await imageCompression(selectedFile, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      });

      const uploadFile = compressedFile instanceof File
        ? compressedFile
        : new File([compressedFile], selectedFile.name, { type: compressedFile.type || selectedFile.type || 'image/jpeg' });

      const result = await uploadImage({ userId: user.id, file: uploadFile });

      if (result.error) {
        setError(result.error);
        return;
      }

      setMessage('Ảnh đại diện đã được cập nhật.');
      setSelectedFile(null);
      await refreshAvatar();
      uploads.reload();
    } catch (uploadError) {
      setError(uploadError?.message || 'Không thể xử lý ảnh tải lên.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="dashboard-panels">
      <section className="dashboard-panel dashboard-upload-panel">
        <div className="dashboard-panel-head">
          <div>
            <span className="dashboard-panel-kicker">Ảnh đại diện</span>
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
            disabled={isUploading}
          />

          <div className="dashboard-dropzone-preview">
            {previewUrl ? (
              <img src={previewUrl} alt="Ảnh sắp tải lên" />
            ) : (
              <UserAvatar
                src={getUserAvatarUrl(user, profile, latestUpload)}
                alt={getUserDisplayName(user, profile)}
                initials={getUserInitials(user, profile)}
                isReady={isAvatarReady}
              />
            )}
          </div>

          <div className="dashboard-dropzone-copy">
            <strong>Chọn ảnh để cập nhật avatar</strong>
            <p>Bấm để chọn ảnh. Ảnh được nén nhẹ trước khi tải lên để trang mở nhanh hơn. Ảnh tải lên mới nhất sẽ là avatar của bạn.</p>
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

        {error && <div className="dashboard-inline-error" role="alert">{error}</div>}
        {message && <div className="dashboard-inline-success" role="status">{message}</div>}

        <div className="dashboard-panel-actions">
          <button type="button" className="dashboard-ghost-btn" onClick={() => setSelectedFile(null)} disabled={!selectedFile || isUploading}>
            Bỏ chọn
          </button>
          <button type="button" className="dashboard-solid-btn" onClick={handleUpload} disabled={!selectedFile || isUploading}>
            {isUploading ? 'Đang tải lên...' : 'Cập nhật ảnh'}
          </button>
        </div>
      </section>

      <section className="dashboard-panel dashboard-uploads-panel">
        <div className="dashboard-panel-head">
          <div>
            <span className="dashboard-panel-kicker">Lịch sử</span>
            <h3>Ảnh đã dùng gần đây</h3>
          </div>
          {uploads.total > RECENT_UPLOADS && <Link to="/dashboard/uploads" className="dashboard-panel-chip">Xem tất cả</Link>}
        </div>
        <UploadGallery uploads={uploads} limit={RECENT_UPLOADS} emptyText="Chưa có ảnh nào được tải lên." />
      </section>
    </div>
  );
}
