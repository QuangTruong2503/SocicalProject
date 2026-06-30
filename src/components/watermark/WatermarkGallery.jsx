import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  processingProgress,
  downloadProgress,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [isPreviewClosing, setIsPreviewClosing] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0, scrollTop: 0 });
  const menuRef = useRef(null);
  const viewportRef = useRef(null);
  const previewCloseTimerRef = useRef(null);
  const isVirtualized = results.length > 24;

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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isVirtualized) {
      return undefined;
    }

    const updateViewport = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
        scrollTop: viewport.scrollTop,
      });
    };

    updateViewport();

    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(viewport);
    viewport.addEventListener('scroll', updateViewport, { passive: true });

    return () => {
      resizeObserver.disconnect();
      viewport.removeEventListener('scroll', updateViewport);
    };
  }, [isVirtualized, results.length]);

  const virtualizedWindow = useMemo(() => {
    if (!isVirtualized || viewportSize.width === 0 || viewportSize.height === 0) {
      return {
        startIndex: 0,
        endIndex: results.length,
        topPadding: 0,
        bottomPadding: 0,
        columnCount: 0,
      };
    }

    const gap = 20;
    const minCardWidth = 220;
    const overscanRows = 2;
    const columnCount = Math.max(1, Math.floor((viewportSize.width + gap) / (minCardWidth + gap)));
    const rowHeight = 392;
    const totalRows = Math.ceil(results.length / columnCount);
    const visibleStartRow = Math.max(0, Math.floor(viewportSize.scrollTop / rowHeight) - overscanRows);
    const visibleEndRow = Math.min(
      totalRows,
      Math.ceil((viewportSize.scrollTop + viewportSize.height) / rowHeight) + overscanRows
    );
    const startIndex = visibleStartRow * columnCount;
    const endIndex = Math.min(results.length, visibleEndRow * columnCount);

    return {
      startIndex,
      endIndex,
      topPadding: visibleStartRow * rowHeight,
      bottomPadding: Math.max(0, (totalRows - visibleEndRow) * rowHeight),
      columnCount,
    };
  }, [isVirtualized, results.length, viewportSize.height, viewportSize.scrollTop, viewportSize.width]);

  const visibleResults = isVirtualized
    ? results.slice(virtualizedWindow.startIndex, virtualizedWindow.endIndex)
    : results;
  const progressTotal = Number(processingProgress?.total) || 0;
  const progressCurrent = Math.min(
    Number(processingProgress?.current) || 0,
    progressTotal || Number(processingProgress?.current) || 0
  );
  const progressPercent = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0;
  const downloadTotal = Number(downloadProgress?.total) || 0;
  const downloadCurrent = Math.min(
    Number(downloadProgress?.current) || 0,
    downloadTotal || Number(downloadProgress?.current) || 0
  );
  const downloadPercent = Number(downloadProgress?.percent) || (downloadTotal > 0
    ? Math.round((downloadCurrent / downloadTotal) * 100)
    : 0);

  const handleDownload = (mode) => {
    onDownloadAll(mode);
    setIsMenuOpen(false);
  };

  if (results.length === 0 && !isProcessing) return null;

  const showSkeletons = isProcessing && results.length === 0;

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
          <div className="wm-processing-track" aria-hidden="true">
            <div
              className="wm-processing-inner"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="wm-processing-copy">
            <strong>
              {progressCurrent}/{progressTotal || results.length || '?'} ảnh đã xong
            </strong>
            <span>
              {progressTotal > 0
                ? `Đang tạo ảnh watermark, khoảng ${progressPercent}%`
                : 'Đang tạo ảnh watermark…'}
            </span>
          </div>
        </div>
      )}

      {downloadProgress && (
        <div className="wm-processing-bar wm-download-progress">
          <div className="wm-processing-track" aria-hidden="true">
            <div
              className="wm-processing-inner"
              style={{ width: `${downloadPercent}%` }}
            />
          </div>
          <div className="wm-processing-copy">
            <strong>
              {downloadCurrent}/{downloadTotal || '?'} đã sẵn sàng
            </strong>
            <span>{downloadProgress.message || 'Đang chuẩn bị file tải xuống…'}</span>
          </div>
        </div>
      )}

      {showSkeletons ? (
        <div className="wm-result-grid wm-result-grid--skeleton" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonResultCard key={index} />
          ))}
        </div>
      ) : (
        <div
          ref={viewportRef}
          className={`wm-result-viewport${isVirtualized ? ' is-virtualized' : ''}`}
          style={isVirtualized ? { maxHeight: 'min(82vh, 920px)' } : undefined}
        >
          <div
            className="wm-result-grid"
            style={isVirtualized ? { gridTemplateColumns: `repeat(${virtualizedWindow.columnCount || 1}, minmax(0, 1fr))` } : undefined}
          >
            {isVirtualized && virtualizedWindow.topPadding > 0 && (
              <div
                className="wm-result-grid-spacer"
                style={{ height: `${virtualizedWindow.topPadding}px`, gridColumn: '1 / -1' }}
                aria-hidden="true"
              />
            )}

            {visibleResults.map((r, i) => {
              const index = isVirtualized ? virtualizedWindow.startIndex + i : i;
              return (
                <ResultCard
                  key={`${index}-${r.url}`}
                  result={r}
                  index={index}
                  onRenameFile={onRenameFile}
                  onPreview={() => openPreview(r, index)}
                />
              );
            })}

            {isVirtualized && virtualizedWindow.bottomPadding > 0 && (
              <div
                className="wm-result-grid-spacer"
                style={{ height: `${virtualizedWindow.bottomPadding}px`, gridColumn: '1 / -1' }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      )}

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
        <button
          className="wm-result-image-trigger"
          type="button"
          onClick={onPreview}
          aria-label={`Phóng to ${result.fileName}`}
        >
          <img src={result.url} alt={result.fileName} loading="lazy" />
        </button>
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

function SkeletonResultCard() {
  return (
    <div className="wm-result-card wm-result-card--skeleton">
      <div className="wm-result-img-wrap">
        <div className="wm-skeleton wm-skeleton--image" />
        <div className="wm-result-overlay wm-result-overlay--skeleton">
          <div className="wm-skeleton wm-skeleton--button" />
          <div className="wm-skeleton wm-skeleton--button" />
        </div>
      </div>
      <div className="wm-result-meta">
        <div className="wm-result-meta-row">
          <div className="wm-skeleton wm-skeleton--line wm-skeleton--name" />
          <div className="wm-skeleton wm-skeleton--chip" />
        </div>
        <div className="wm-skeleton wm-skeleton--input" />
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
