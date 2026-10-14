import { useRef } from 'react';
import { FaCloudArrowUp, FaTrash, FaUpload } from 'react-icons/fa6';

/**
 * One shared company image (logo / stamp / bank QR). Only admins can change it;
 * `localAsset` is an image still stored only on this device from before v2.
 */
export default function AssetImageUploader({
  label, hint, asset, canManage, busy, localAsset, onUpload, onClear, onUseLocal, styles,
}) {
  const fileRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onUpload(file);
  };

  return (
    <div className={styles.uploader}>
      <span className={styles.uploaderLabel}>{label}</span>
      <div className={styles.uploaderRow}>
        {asset?.url
          ? <img className={styles.uploaderPreview} src={asset.url} alt={label} />
          : <div className={styles.uploaderPlaceholder}>{busy ? 'Đang tải…' : 'Chưa có ảnh'}</div>}
        <div className={styles.uploaderActions}>
          {canManage && (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
              <FaUpload /> {asset?.url ? 'Đổi ảnh' : 'Tải ảnh lên'}
            </button>
          )}
          {canManage && asset?.url && (
            <button type="button" className={styles.danger} onClick={onClear} disabled={busy}><FaTrash /> Xóa</button>
          )}
          {canManage && !asset?.url && localAsset && (
            <button type="button" onClick={onUseLocal} disabled={busy} title={localAsset.name}>
              <FaCloudArrowUp /> Dùng ảnh đã lưu trên máy này
            </button>
          )}
          {asset?.name && <small className={styles.uploaderFileName}>{asset.name}</small>}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={handleChange} />
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
