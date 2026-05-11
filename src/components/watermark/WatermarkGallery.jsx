import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/WatermarkGallery.css';

function normalizeDownloadName(fileName) {
  const trimmed = (fileName || '').trim();
  const baseName = trimmed ? trimmed.replace(/\.[^.]+$/, '') : 'image';
  return `${baseName || 'image'}.jpg`;
}

export default function WatermarkGallery({
  results,
  onClear,
  onDownloadAll,
  onRenameFile,
  isProcessing,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [isPreviewClosing, setIsPreviewClosing] = useState(false);
  const menuRef = useRef(null);
  const previewCloseTimerRef = useRef(null);

  const closePreview = useCallback(() => {
    if (!previewResult || isPreviewClosing) return;

    setIsPreviewClosing(true);
    previewCloseTimerRef.current = window.setTimeout(() => {
      setPreviewResult(null);
      setIsPreviewClosing(false);
    }, 180);
  }, [isPreviewClosing, previewResult]);

  const openPreview = useCallback((result, index) => {
    if (previewCloseTimerRef.current) {
      window.clearTimeout(previewCloseTimerRef.current);
    }
    setIsPreviewClosing(false);
    setPreviewResult({ ...result, index });
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!previewResult) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closePreview();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.classList.add('wm-modal-open');

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('wm-modal-open');
    };
  }, [closePreview, previewResult]);

  useEffect(() => {
    return () => {
      if (previewCloseTimerRef.current) {
        window.clearTimeout(previewCloseTimerRef.current);
      }
    };
  }, []);

  const handleDownload = (mode) => {
    onDownloadAll(mode);
    setIsMenuOpen(false);
  };

  if (results.length === 0 && !isProcessing) return null;

  return (
    <div className="wm-gallery-section">
      <div className="wm-gallery-header">
        <div className="wm-gallery-heading">
          <h5 className="wm-gallery-title">
            <span className="wm-inline-icon" aria-hidden="true">▦</span>
            Kết quả
            <span className="wm-badge">{results.length}</span>
          </h5>
        </div>

        <div className="wm-gallery-actions">
          <div className="wm-download-menu" ref={menuRef}>
            <button
              className="wm-download-menu-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((open) => !open)}
              disabled={results.length === 0}
            >
              <span className="wm-inline-icon" aria-hidden="true">↓</span>
              <strong>Tải tất cả</strong>
            </button>
            {isMenuOpen && (
            <ul className="wm-dropdown" role="menu">
              <li>
                <button
                  className="wm-dropdown-item"
                  onClick={() => handleDownload('full')}
                  type="button"
                  role="menuitem"
                >
                  <span className="wm-inline-icon" aria-hidden="true">□</span>
                  <div>
                    <div className="wm-dropdown-title">Đầy đủ kích thước</div>
                    <small className="wm-muted-text">Giữ nguyên độ phân giải gốc</small>
                  </div>
                </button>
              </li>
              <li>
                <button
                  className="wm-dropdown-item"
                  onClick={() => handleDownload('800x600')}
                  type="button"
                  role="menuitem"
                >
                  <span className="wm-inline-icon" aria-hidden="true">▭</span>
                  <div>
                    <div className="wm-dropdown-title">800 × 600 px</div>
                    <small className="wm-muted-text">Tối ưu cho web &amp; mạng xã hội</small>
                  </div>
                </button>
              </li>
              <li>
                <button
                  className="wm-dropdown-item"
                  onClick={() => handleDownload('ImageCompress')}
                  type="button"
                  role="menuitem"
                >
                  <span className="wm-inline-icon" aria-hidden="true">⌁</span>
                  <div>
                    <div className="wm-dropdown-title">Nén 800 × 600 (&lt;100KB)</div>
                    <small className="wm-muted-text">Nén tối ưu cho email &amp; tải nhanh</small>
                  </div>
                </button>
              </li>
            </ul>
            )}
          </div>

          <button
            className="wm-btn-outline-danger"
            onClick={onClear}
            disabled={results.length === 0}
          >
            <span className="wm-inline-icon" aria-hidden="true">×</span>
            Xóa kết quả
          </button>
        </div>
      </div>

      {isProcessing && (
        <div className="wm-processing-bar">
          <div className="wm-processing-inner" />
          <span>Đang tạo ảnh watermark…</span>
        </div>
      )}

      <div className="wm-result-grid">
        {results.map((r, i) => (
          <ResultCard
            key={i}
            result={r}
            index={i}
            onRenameFile={onRenameFile}
            onPreview={() => openPreview(r, i)}
          />
        ))}
      </div>

      {previewResult && (
        <ImagePreviewModal
          result={previewResult}
          isClosing={isPreviewClosing}
          onClose={closePreview}
        />
      )}
    </div>
  );
}

function ResultCard({ result, index, onPreview, onRenameFile }) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.url;
    a.download = normalizeDownloadName(result.fileName);
    a.click();
  };

  return (
    <div className="wm-result-card">
      <div className="wm-result-img-wrap">
        <img src={result.url} alt={result.fileName} loading="lazy" />
        <div className="wm-result-overlay">
          <div className="wm-result-action-row">
            <button
              className="wm-result-icon-btn"
              onClick={onPreview}
              type="button"
              aria-label={`Xem ảnh ${result.fileName}`}
              title="Xem ảnh"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button className="wm-result-dl-btn" onClick={handleDownload} type="button">
              <span className="wm-inline-icon" aria-hidden="true">↓</span>
              Tải xuống
            </button>
          </div>
        </div>
      </div>
      <div className="wm-result-meta">
        <div className="wm-result-meta-row">
          <span className="wm-result-name" title={result.fileName}>
            {result.fileName}
          </span>
          <span className="wm-result-num">#{index + 1}</span>
        </div>
        <label className="wm-result-rename">
          <span className="wm-result-rename-label">Đổi tên file</span>
          <input
            className="wm-result-name-input"
            type="text"
            value={result.fileName}
            onChange={(event) => onRenameFile?.(index, event.target.value)}
            placeholder="Nhập tên file mới"
          />
        </label>
      </div>
    </div>
  );
}

function ImagePreviewModal({ result, isClosing, onClose }) {
  return createPortal(
    <div
      className={`wm-preview-backdrop${isClosing ? ' is-closing' : ''}`}
      role="presentation"
      onPointerDown={onClose}
    >
      <div
        className="wm-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Xem trước ${result.fileName}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="wm-preview-header">
          <div className="wm-preview-title-wrap">
            <span className="wm-preview-kicker">Ảnh #{result.index + 1}</span>
            <strong className="wm-preview-title" title={result.fileName}>
              {result.fileName}
            </strong>
          </div>
          <button
            className="wm-preview-close"
            type="button"
            onClick={onClose}
            aria-label="Đóng xem trước"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="wm-preview-image-frame">
          <img src={result.url} alt={result.fileName} />
        </div>
      </div>
    </div>,
    document.body
  );
}
