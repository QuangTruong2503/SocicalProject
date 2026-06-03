import React, { useEffect, useRef } from 'react';
import { saveLogo, loadLogo, clearLogo } from '../../hooks/useIndexedDB';
import '../../styles/LogoUploader.css';

export default function LogoUploader({ logoUrl, logoName, onLogoChange, onImagePreview }) {
  const fileRef = useRef();

  // Load logo from IndexedDB on mount
  useEffect(() => {
    loadLogo()
      .then((result) => {
        if (result) onLogoChange(result.url, result.name);
      })
      .catch(() => {});
  }, [onLogoChange]);

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
        <span className="wm-inline-icon" aria-hidden="true">◇</span>
        Logo Watermark
      </div>

      {logoUrl ? (
        <div className="wm-logo-preview-wrap">
          <button
            className="wm-logo-preview wm-zoom-trigger"
            type="button"
            onClick={() => onImagePreview?.({
              url: logoUrl,
              title: logoName || 'Logo watermark',
              kicker: 'Logo watermark',
            })}
            aria-label="Phóng to logo watermark"
          >
            <img src={logoUrl} alt="logo" />
          </button>
          <div className="wm-logo-info">
            <span className="wm-logo-name" title={logoName}>
              <span className="wm-status-icon" aria-hidden="true">✓</span>
              {logoName}
            </span>
            <small className="wm-muted-text wm-block-text">Đã lưu vào thiết bị</small>
            <div className="wm-inline-actions">
              <button
                className="wm-btn-outline wm-btn-small"
                onClick={() => fileRef.current?.click()}
              >
                <span className="wm-inline-icon" aria-hidden="true">↻</span>
                Thay đổi
              </button>
              <button className="wm-btn-danger-ghost wm-btn-small" onClick={handleClear}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="wm-dropzone" onClick={() => fileRef.current?.click()}>
          <span className="wm-dropzone-icon" aria-hidden="true">▧</span>
          <p className="wm-dropzone-title">Chọn file logo</p>
          <small className="wm-muted-text">PNG, SVG, WebP – nền trong suốt tốt nhất</small>
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
