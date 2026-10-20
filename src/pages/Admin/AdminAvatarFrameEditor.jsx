import { useEffect, useRef, useState } from 'react';
import { FaImage, FaPause, FaPlay, FaUpload } from 'react-icons/fa6';
import Dialog from '../../components/dialog/Dialog.jsx';
import { FramePreview } from './AdminAvatarFrameParts.jsx';
import { adminSaveAvatarFrame, discardFrameUploads, uploadFrameFile } from '../../services/avatarFrameService.js';
import {
  AVATAR_FRAME_ACCEPT,
  AVATAR_FRAME_NAME_LIMIT,
  AVATAR_FRAME_RULES,
  createFallbackCandidate,
  describeFrameMeta,
} from '../../utils/avatarFrames.js';
import { formatNumber } from '../../utils/formatters.js';
import styles from './Admin.module.css';
import fs from './AdminAvatarFrames.module.css';

const RETRY_CODES = new Set(['40001', 'P0002', '42501']);

function MetaList({ rows, caption }) {
  if (!rows.length) return null;
  return (
    <div className={fs.meta2}>
      <span>{caption}</span>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Add / edit dialog. Files are checked when picked: in the browser, then uploaded
 * and inspected by the server (only server-recorded files can be saved). Uploads
 * that end up unused — replaced, or the dialog closed — are removed again.
 */
export default function AdminAvatarFrameEditor({ frame, onClose, onSaved, onConflict }) {
  const [name, setName] = useState(frame?.name ?? '');
  const [isActive, setIsActive] = useState(frame?.is_active ?? true);
  const [image, setImage] = useState(null);
  const [fallback, setFallback] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [showStill, setShowStill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const imageInput = useRef(null);
  const fallbackInput = useRef(null);
  const pending = useRef(new Set());
  const objectUrls = useRef(new Set());
  const imageToken = useRef(0);
  const fallbackToken = useRef(0);
  const lock = useRef(false);

  useEffect(() => {
    const uploads = pending.current;
    const urls = objectUrls.current;
    return () => {
      // Closing (or leaving the page) drops every file that was not saved.
      discardFrameUploads([...uploads]);
      uploads.clear();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const localUrl = (blob) => {
    const url = URL.createObjectURL(blob);
    objectUrls.current.add(url);
    return url;
  };

  const drop = (path) => {
    if (!path) return;
    pending.current.delete(path);
    discardFrameUploads([path]);
  };

  async function uploadFallback(file, source, extra = {}, token = ++fallbackToken.current) {
    setFallback({ status: 'uploading', source, fileName: file.name, localUrl: localUrl(file), ...extra });
    const result = await uploadFrameFile(file, { requireStatic: true });
    if (token !== fallbackToken.current) {
      if (result.data) drop(result.data.path);
      return;
    }
    if (result.error) {
      setFallback({ status: 'error', source, error: result.error });
      return;
    }
    pending.current.add(result.data.path);
    setFallback((current) => ({ ...current, status: 'ready', path: result.data.path, info: result.data.info }));
  }

  async function handleImage(file) {
    if (!file || lock.current) return;
    const token = ++imageToken.current;
    drop(image?.path);
    setFormError('');
    setShowStill(false);
    setImage({ status: 'uploading', fileName: file.name, localUrl: localUrl(file) });

    const result = await uploadFrameFile(file);
    if (token !== imageToken.current) {
      if (result.data) drop(result.data.path);
      return;
    }
    if (result.error) {
      setImage({ status: 'error', fileName: file.name, error: result.error });
      return;
    }
    pending.current.add(result.data.path);
    setImage((current) => ({ ...current, status: 'ready', path: result.data.path, info: result.data.info }));

    if (result.data.info.frame_type !== 'animated') {
      fallbackToken.current += 1;
      drop(fallback?.path);
      setFallback(null);
      return;
    }

    // A new animation gets a fresh still unless the admin already picked one for it.
    if (fallback?.source === 'upload' && fallback.path) return;
    drop(fallback?.path);
    const fallbackRun = ++fallbackToken.current;
    setFallback({ status: 'generating', source: 'auto' });
    const candidate = await createFallbackCandidate(file, result.data.local).catch(() => null);
    if (fallbackRun !== fallbackToken.current) return;
    if (!candidate) {
      setFallback({ status: 'error', source: 'auto', error: 'Không tự tạo được ảnh dự phòng trên trình duyệt này. Hãy tải một ảnh tĩnh lên.' });
      return;
    }
    await uploadFallback(new File([candidate.blob], 'anh-du-phong.png', { type: 'image/png' }), 'auto', { frameIndex: candidate.frameIndex, picked: candidate.picked }, fallbackRun);
  }

  async function handleFallback(file) {
    if (!file || lock.current) return;
    drop(fallback?.path);
    setFormError('');
    await uploadFallback(file, 'upload');
  }

  // What the frame will be after saving.
  const newImage = image?.status === 'ready' ? image : null;
  const type = newImage?.info.frame_type ?? frame?.frame_type ?? 'static';
  const keepsSavedFallback = Boolean(frame?.fallback_url) && type === 'animated' && (!newImage || frame.image_source === 'storage');
  const readyFallback = fallback?.status === 'ready' ? fallback : null;
  const hasFallback = Boolean(readyFallback) || keepsSavedFallback;
  const imageUrl = newImage?.localUrl ?? (image ? '' : frame?.image_url ?? '');
  const fallbackUrl = readyFallback?.localUrl ?? (keepsSavedFallback && !fallback ? frame.fallback_url : '');
  const working = image?.status === 'uploading' || ['uploading', 'generating'].includes(fallback?.status);
  const needsFallback = type === 'animated' && !hasFallback;
  const canSave = Boolean(name.trim()) && !working && !busy && (Boolean(frame) || Boolean(newImage));

  const previewProps = type === 'animated'
    ? (showStill ? { frameSrc: fallbackUrl } : { frameSrc: imageUrl, frameFallbackSrc: fallbackUrl || imageUrl, frameAnimate: playing })
    : { frameSrc: imageUrl };

  async function save(event) {
    event.preventDefault();
    if (!canSave || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFormError('');
    try {
      const result = await adminSaveAvatarFrame({
        frame,
        name,
        isActive: isActive && !needsFallback,
        imagePath: newImage?.path ?? null,
        fallbackPath: type === 'animated' ? readyFallback?.path ?? null : null,
      });
      if (result.error) {
        if (RETRY_CODES.has(result.code)) onConflict(result.error);
        else setFormError(result.error);
        return;
      }
      // The saved files now belong to the frame; anything else pending is dropped on close.
      pending.current.delete(newImage?.path);
      pending.current.delete(readyFallback?.path);
      onSaved(result, Boolean(frame));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const imageMeta = newImage ? describeFrameMeta(newImage.info) : describeFrameMeta(frame);

  return (
    <Dialog title={frame ? `Sửa khung · ${frame.name}` : 'Thêm khung avatar'} onClose={() => { if (!lock.current) onClose(); }} busy={busy} variant="wide">
      <form className={fs.editor} onSubmit={save}>
        <div className={fs.editorFields}>
          <label className={styles.modalField}>
            Tên khung
            <input type="text" value={name} maxLength={AVATAR_FRAME_NAME_LIMIT} required disabled={busy} onChange={(event) => setName(event.target.value)} />
          </label>

          <div className={styles.modalField}>
            <span>Ảnh khung{frame ? ' (để trống nếu giữ ảnh hiện tại)' : ''}</span>
            <input ref={imageInput} type="file" accept={AVATAR_FRAME_ACCEPT} hidden data-role="frame-image"
              onChange={(event) => { handleImage(event.target.files?.[0]); event.target.value = ''; }} />
            <button type="button" className={`${styles.actionButton} ${fs.fileButton}`} onClick={() => imageInput.current?.click()} disabled={busy || image?.status === 'uploading'}>
              <FaUpload aria-hidden="true" /> {image ? 'Chọn ảnh khác' : frame ? 'Đổi ảnh' : 'Chọn PNG / APNG / WebP'}
            </button>
            {image?.status === 'uploading' && <small role="status">Đang tải lên và kiểm tra “{image.fileName}” trên máy chủ…</small>}
            {image?.status === 'error' && <small role="alert" className={fs.fileError}>{image.fileName}: {image.error}</small>}
            {newImage && <small role="status" className={fs.fileOk}>✓ {newImage.fileName} đã được máy chủ kiểm tra.</small>}
          </div>

          <MetaList rows={imageMeta} caption={newImage ? 'Đã xác thực trên máy chủ' : 'Thông tin đã lưu'} />

          {type === 'animated' && (
            <div className={styles.modalField}>
              <span>Ảnh tĩnh dự phòng (bắt buộc với khung động)</span>
              <input ref={fallbackInput} type="file" accept="image/png,image/webp" hidden data-role="frame-fallback"
                onChange={(event) => { handleFallback(event.target.files?.[0]); event.target.value = ''; }} />
              <div className={fs.fallbackRow}>
                <span className={fs.fallbackThumb}>
                  {fallbackUrl ? <img src={fallbackUrl} alt="Ảnh dự phòng" /> : <FaImage aria-hidden="true" />}
                </span>
                <div>
                  {fallback?.status === 'generating' && <small role="status">Đang tạo ảnh dự phòng từ khung hình rõ nhất…</small>}
                  {fallback?.status === 'uploading' && <small role="status">Đang kiểm tra ảnh dự phòng trên máy chủ…</small>}
                  {fallback?.status === 'error' && <small role="alert" className={fs.fileError}>{fallback.error}</small>}
                  {readyFallback && (
                    <small className={fs.fileOk} role="status">
                      ✓ {readyFallback.source === 'auto'
                        ? `Tự tạo từ frame ${readyFallback.frameIndex + 1}${readyFallback.picked === 'first' ? ' (frame đầu)' : ' (nhiều chi tiết nhất)'}. Hãy xem trước; có thể thay bằng ảnh khác.`
                        : `${readyFallback.fileName} đã được máy chủ kiểm tra.`}
                    </small>
                  )}
                  {!fallback && keepsSavedFallback && <small>Đang dùng ảnh dự phòng đã lưu.</small>}
                  {needsFallback && !working && <small role="alert" className={fs.fileError}>Chưa có ảnh dự phòng: khung chỉ lưu được ở trạng thái tắt.</small>}
                  <button type="button" className={styles.actionButton} onClick={() => fallbackInput.current?.click()} disabled={busy || working}>
                    <FaUpload aria-hidden="true" /> {hasFallback ? 'Thay ảnh dự phòng' : 'Tải ảnh dự phòng'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <ul className={fs.rules}>
            {AVATAR_FRAME_RULES.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>

          <label className={styles.modalCheckbox}>
            <input type="checkbox" checked={isActive && !needsFallback} disabled={busy || needsFallback} onChange={(event) => setIsActive(event.target.checked)} />
            Bật cho người dùng chọn
          </label>
          {frame && frame.is_active && !isActive && frame.usage_count > 0 && (
            <p className={fs.warning}>{formatNumber(frame.usage_count)} tài khoản đang dùng khung này sẽ thấy avatar không khung cho đến khi bật lại.</p>
          )}
          {frame && newImage && frame.usage_count > 0 && (
            <p className={fs.warning}>Ảnh mới áp dụng ngay cho {formatNumber(frame.usage_count)} tài khoản đang dùng khung này.</p>
          )}
        </div>

        <div className={fs.editorPreview} aria-label="Xem trước khung">
          <div className={fs.previewStage}>
            <FramePreview {...previewProps} size="large" />
            <FramePreview {...previewProps} size="large" photo={false} />
          </div>
          <div className={`${fs.previewStage} ${fs.previewStageDark}`}>
            <FramePreview {...previewProps} size="large" />
            <FramePreview {...previewProps} photo={false} />
          </div>
          {type === 'animated' && (
            <div className={fs.previewControls}>
              <button type="button" className={styles.actionButton} onClick={() => setPlaying((value) => !value)} disabled={showStill} aria-pressed={!playing}>
                {playing ? <FaPause aria-hidden="true" /> : <FaPlay aria-hidden="true" />} {playing ? 'Tạm dừng' : 'Phát'}
              </button>
              <button type="button" className={styles.actionButton} onClick={() => setShowStill((value) => !value)} disabled={!fallbackUrl} aria-pressed={showStill}>
                <FaImage aria-hidden="true" /> {showStill ? 'Xem chuyển động' : 'Xem ảnh dự phòng'}
              </button>
            </div>
          )}
          <small>{imageUrl ? 'Xem trước với ảnh mẫu và chữ viết tắt, trên nền sáng và tối. Khi tạm dừng sẽ hiện ảnh dự phòng.' : 'Chọn ảnh để xem trước khung.'}</small>
        </div>

        {formError && <p className={`${styles.alert} ${fs.editorError}`} role="alert">{formError}</p>}

        <div className={`${styles.modalActions} ${fs.editorActions}`}>
          <button type="button" onClick={() => { if (!lock.current) onClose(); }} disabled={busy}>Hủy</button>
          <button type="submit" className={styles.primary} disabled={!canSave}>
            {busy ? 'Đang lưu…' : frame ? 'Lưu thay đổi' : 'Thêm khung'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
