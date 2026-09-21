import React, { useEffect, useRef, useState } from 'react';
import { saveLogo, loadLogo, clearLogo } from '../../hooks/useIndexedDB';
import { loadWatermarkImage } from '../../hooks/useWatermarkProcessor';
import '../../styles/LogoUploader.css';

export default function LogoUploader({ logoUrl, logoName, onLogoChange, onImagePreview }) {
  const fileRef = useRef();
  const currentObjectUrlRef = useRef(null);
  const revisionRef = useRef(0);
  const [saving, setSaving] = useState(false);
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
    const revision = revisionRef.current;

    loadLogo()
      .then((result) => {
        if (!result) return;
        if (!isActive || revision !== revisionRef.current) {
          URL.revokeObjectURL(result.url);
          return;
        }

        revokeCurrentObjectUrl();
        currentObjectUrlRef.current = result.url;
        onLogoChange(result.url, result.name, result.blob);
      })
      .catch(() => {});

    return () => {
      isActive = false;
      revisionRef.current += 1;
      revokeCurrentObjectUrl();
    };
  }, [onLogoChange]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const input = e.target;
    const revision = ++revisionRef.current;
    const url = URL.createObjectURL(file);
    setSaving(true);
    try {
      setErrorMessage('');
      await loadWatermarkImage(url);
      if (revision !== revisionRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      revokeCurrentObjectUrl();
      currentObjectUrlRef.current = url;
      onLogoChange(url, file.name, file);
      try {
        await saveLogo(file);
      } catch {
        setErrorMessage('Logo dùng được trong phiên này nhưng chưa lưu được trên thiết bị.');
      }
    } catch {
      URL.revokeObjectURL(url);
      setErrorMessage('Không thể đọc logo. Vui lòng chọn một file ảnh hợp lệ.');
    } finally {
      input.value = '';
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setErrorMessage('');
    revisionRef.current += 1;
    revokeCurrentObjectUrl();
    onLogoChange(null, null, null);
    try {
      await clearLogo();
    } catch {
      setErrorMessage('Đã gỡ logo khỏi phiên này nhưng chưa xóa được bản lưu trên thiết bị.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="wm-logo-uploader" aria-busy={saving}>
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
            <small className="wm-muted-text wm-block-text">{saving ? 'Đang lưu logo…' : errorMessage ? 'Logo trong phiên hiện tại' : 'Đã lưu vào thiết bị'}</small>
            <div className="wm-inline-actions">
              <button
                className="wm-btn-outline wm-btn-small"
                disabled={saving}
                onClick={() => fileRef.current?.click()}
              >
                <span className="wm-inline-icon" aria-hidden="true">↻</span>
                Thay đổi
              </button>
              <button className="wm-btn-danger-ghost wm-btn-small" onClick={handleClear} disabled={saving} aria-label="Xóa logo">
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="wm-dropzone" disabled={saving} onClick={() => fileRef.current?.click()}>
          <span className="wm-dropzone-icon" aria-hidden="true">▧</span>
          <p className="wm-dropzone-title">Chọn file logo</p>
          <small className="wm-muted-text">PNG, SVG, WebP – nền trong suốt tốt nhất</small>
        </button>
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
