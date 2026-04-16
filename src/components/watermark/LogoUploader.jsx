import React, { useEffect, useRef } from 'react';
import { saveLogo, loadLogo, clearLogo } from '../../hooks/useIndexedDB';

export default function LogoUploader({ logoUrl, logoName, onLogoChange }) {
  const fileRef = useRef();

  // Load logo from IndexedDB on mount
  useEffect(() => {
    loadLogo()
      .then((result) => {
        if (result) onLogoChange(result.url, result.name);
      })
      .catch(() => {});
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await saveLogo(file);
      const url = URL.createObjectURL(file);
      onLogoChange(url, file.name);
    } catch {
      alert('Không thể lưu logo vào IndexedDB.');
    }
  };

  const handleClear = async () => {
    await clearLogo();
    onLogoChange(null, null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="wm-logo-uploader">
      <div className="wm-section-label">
        <i className="bi bi-shield-check me-2" />
        Logo Watermark
      </div>

      {logoUrl ? (
        <div className="wm-logo-preview-wrap">
          <div className="wm-logo-preview">
            <img src={logoUrl} alt="logo" />
          </div>
          <div className="wm-logo-info">
            <span className="wm-logo-name" title={logoName}>
              <i className="bi bi-check-circle-fill text-success me-1" />
              {logoName}
            </span>
            <small className="text-muted d-block mb-2">Đã lưu vào thiết bị</small>
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm wm-btn-outline"
                onClick={() => fileRef.current?.click()}
              >
                <i className="bi bi-arrow-repeat me-1" />
                Thay đổi
              </button>
              <button className="btn btn-sm wm-btn-danger-ghost" onClick={handleClear}>
                <i className="bi bi-trash3" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="wm-dropzone" onClick={() => fileRef.current?.click()}>
          <i className="bi bi-image-alt wm-dropzone-icon" />
          <p className="mb-1 fw-semibold">Chọn file logo</p>
          <small className="text-muted">PNG, SVG, WebP – nền trong suốt tốt nhất</small>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
}