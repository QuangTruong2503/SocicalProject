import { useRef } from 'react';
import { FaTrash, FaUpload } from 'react-icons/fa6';

export default function AssetImageUploader({ label, hint, url, fileName, onUpload, onClear, styles }) {
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
        {url
          ? <img className={styles.uploaderPreview} src={url} alt={label} />
          : <div className={styles.uploaderPlaceholder}>Chưa có ảnh</div>}
        <div className={styles.uploaderActions}>
          <button type="button" onClick={() => fileRef.current?.click()}>
            <FaUpload /> {url ? 'Đổi ảnh' : 'Tải ảnh lên'}
          </button>
          {url && <button type="button" className={styles.danger} onClick={onClear}><FaTrash /> Xóa</button>}
          {fileName && <small className={styles.uploaderFileName}>{fileName}</small>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleChange} />
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
