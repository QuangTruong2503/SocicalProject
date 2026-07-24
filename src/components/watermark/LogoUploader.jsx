import React, { useEffect, useRef, useState } from 'react';
import { saveLogo, loadLogo, clearLogo } from '../../hooks/useIndexedDB';
import '../../styles/LogoUploader.css';

export default function LogoUploader({ logoUrl, logoName, onLogoChange, onImagePreview }) {
  const fileRef = useRef();
  const currentObjectUrlRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');

  const revokeCurrentObjectUrl = () => {
    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }
  };

  // Load logo from IndexedDB on mount
  useEffect(() => {
    let isActive = true;

    loadLogo()
      .then((result) => {
        if (!isActive || !result) return;

        revokeCurrentObjectUrl();
        currentObjectUrlRef.current = result.url;
        onLogoChange(result.url, result.name, result.blob);
      })
      .catch(() => {});

    return () => {
      isActive = false;
      revokeCurrentObjectUrl();
    };
  }, [onLogoChange]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setErrorMessage('');
      await saveLogo(file);
      revokeCurrentObjectUrl();
      const url = URL.createObjectURL(file);
      currentObjectUrlRef.current = url;
      onLogoChange(url, file.name, file);
    } catch {
      setErrorMessage('Không thể lưu logo vào IndexedDB.');
    } finally {
      e.target.value = '';
    }
  };

  const handleClear = async () => {
    setErrorMessage('');
    revokeCurrentObjectUrl();
    await clearLogo();
    onLogoChange(null, null, null);
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

      {errorMessage && (
        <div className="wm-inline-banner wm-inline-banner--error" role="alert">
          <span className="wm-inline-icon" aria-hidden="true">!</span>
          <span>{errorMessage}</span>
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
