import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import { FaCamera, FaWandMagicSparkles } from 'react-icons/fa6';
import UserAvatar from '../../components/UserAvatar.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useAvatarFrames } from '../../hooks/useAvatarFrames.js';
import { uploadImage } from '../../services/uploadService.js';
import { frameLayerProps, resolveAvatarFrame } from '../../utils/avatarFrames.js';
import { AVATAR_SOURCE_LABELS, AVATAR_UPLOAD_ACCEPT, AVATAR_UPLOAD_HINT, validateAvatarFile } from '../../utils/avatarUpload.js';
import { formatBytes } from '../../utils/fileConvertChecks.js';
import { formatNumber } from '../../utils/formatters.js';
import { getUserAvatarSource, getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../../utils/userProfile.js';
import AvatarFramePicker from './AvatarFramePicker.jsx';
import UploadGallery from './UploadGallery.jsx';
import { useUserUploads } from './useUserUploads.js';
import styles from './Dashboard.module.css';

const RECENT_UPLOADS = 8;
const FRAME_PICKER_ID = 'avatar-frames';

function goToFramePicker() {
  const target = document.getElementById(FRAME_PICKER_ID);
  if (!target) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  const radio = target.querySelector('input[name="avatar-frame"]:checked') || target.querySelector('input[name="avatar-frame"]');
  radio?.focus({ preventScroll: true });
}

export default function AvatarSection({ refreshToken }) {
  const { user, profile, latestUpload, isAvatarReady, refreshAvatar } = useAuth();
  const uploads = useUserUploads({ pageSize: RECENT_UPLOADS, reloadToken: refreshToken });
  const { status: framesStatus, frames } = useAvatarFrames(Boolean(user));
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

  function selectFile(file) {
    const problem = validateAvatarFile(file);
    setMessage('');

    if (problem) {
      setError(problem);
      setSelectedFile(null);
      return;
    }

    setError('');
    setSelectedFile(file);
  }

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: AVATAR_UPLOAD_ACCEPT,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: isUploading,
    onDrop: (accepted, rejected) => {
      const file = accepted[0] ?? rejected[0]?.file;
      if (file) selectFile(file);
    },
  });

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

  const savedFrameId = profile?.avatar_frame_id ?? null;
  const savedFrame = resolveAvatarFrame(savedFrameId, frames);
  const frameLabel = savedFrame?.name
    || (!savedFrameId ? 'Không dùng khung' : framesStatus === 'ready' ? 'Đang ẩn (khung đã ngừng hoạt động)' : '…');

  return (
    <div className={styles.avatarPage}>
      <section
        {...getRootProps({
          className: `dashboard-panel ${styles.avatarHero} ${isDragActive ? styles.avatarHeroDragging : ''}`,
          'aria-labelledby': 'avatar-hero-title',
        })}
      >
        <input {...getInputProps({ id: 'dashboard-avatar-upload', 'aria-label': 'Chọn ảnh đại diện' })} />

        <div className={styles.heroAvatarWrap}>
          <div className={styles.heroAvatar}>
            <UserAvatar
              src={previewUrl || getUserAvatarUrl(user, profile, latestUpload)}
              alt={previewUrl ? 'Ảnh sắp tải lên' : getUserDisplayName(user, profile)}
              initials={getUserInitials(user, profile)}
              isReady={Boolean(previewUrl) || isAvatarReady}
              {...frameLayerProps(savedFrame)}
            />
          </div>
          {previewUrl && <span className={styles.heroPreviewBadge}>Xem trước</span>}
        </div>

        <div className={styles.heroBody}>
          <div>
            <span className="dashboard-panel-kicker">Ảnh đại diện</span>
            <h3 id="avatar-hero-title">Avatar của bạn</h3>
          </div>

          <dl className={styles.heroFacts}>
            <div>
              <dt>Nguồn ảnh</dt>
              <dd>{isAvatarReady ? AVATAR_SOURCE_LABELS[getUserAvatarSource(user, profile, latestUpload)] : '…'}</dd>
            </div>
            <div>
              <dt>Khung</dt>
              <dd>{frameLabel}</dd>
            </div>
          </dl>

          {selectedFile ? (
            <>
              <p className={styles.heroFile}>
                <strong>{selectedFile.name}</strong>
                <span>{formatBytes(selectedFile.size)}</span>
              </p>
              <p className={styles.heroHint}>Đây là bản xem trước, avatar chưa thay đổi. Ảnh được nén nhẹ trước khi tải lên.</p>
              <div className={styles.heroActions}>
                <button type="button" className="dashboard-ghost-btn" onClick={() => setSelectedFile(null)} disabled={isUploading}>
                  Bỏ chọn
                </button>
                <button type="button" className="dashboard-solid-btn" onClick={handleUpload} disabled={isUploading} aria-busy={isUploading}>
                  {isUploading ? 'Đang tải lên…' : 'Cập nhật ảnh'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.heroActions}>
                <button type="button" className="dashboard-solid-btn dashboard-icon-btn" onClick={open} disabled={isUploading}>
                  <FaCamera aria-hidden="true" /> Đổi ảnh
                </button>
                <button type="button" className="dashboard-ghost-btn dashboard-icon-btn" onClick={goToFramePicker}>
                  <FaWandMagicSparkles aria-hidden="true" /> Chọn khung
                </button>
              </div>
              <p className={styles.heroHint}>Hoặc kéo-thả ảnh vào khung này. {AVATAR_UPLOAD_HINT}. Ảnh tải lên mới nhất sẽ là avatar.</p>
            </>
          )}

          {error && <div className="dashboard-inline-error" role="alert">{error}</div>}
          {message && <div className="dashboard-inline-success" role="status">{message}</div>}
        </div>

        {isDragActive && <div className={styles.heroDropOverlay} aria-hidden="true">Thả ảnh vào đây để xem trước</div>}
      </section>

      <AvatarFramePicker id={FRAME_PICKER_ID} />

      <section className={`dashboard-panel ${styles.historyPanel}`} aria-labelledby="avatar-history-title">
        <div className="dashboard-panel-head">
          <div>
            <span className="dashboard-panel-kicker">Lịch sử</span>
            <h3 id="avatar-history-title">Ảnh đã tải lên</h3>
          </div>
          {uploads.total > 0 && (
            <Link to="/dashboard/uploads" className={styles.historyLink}>
              Xem tất cả ({formatNumber(uploads.total)})
            </Link>
          )}
        </div>
        <UploadGallery uploads={uploads} limit={RECENT_UPLOADS} variant="strip" emptyText="Chưa có ảnh nào được tải lên." />
      </section>
    </div>
  );
}
