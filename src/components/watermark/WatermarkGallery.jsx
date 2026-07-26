import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/WatermarkGallery.css';

const BULK_RENAME_TUTORIAL_URL =
  'https://psqfbcgkgafqtsmrgjqu.supabase.co/storage/v1/object/public/ZepLao/huong-dan-doi-ten-file.mp4';

function normalizeDownloadName(fileName) {
  const trimmed = (fileName || '').trim();
  const baseName = trimmed ? trimmed.replace(/\.[^.]+$/, '') : 'image';
  return `${baseName || 'image'}.jpg`;
}

function normalizeBulkName(fileName) {
  const trimmed = fileName.trim();
  if (!trimmed) return '';
  return /\.[^.]+$/.test(trimmed) ? trimmed : `${trimmed}.jpg`;
}

export default function WatermarkGallery({
  results,
  onClear,
  onDownloadAll,
  onRenameFile,
  onRemoveResult,
  isProcessing,
  processingProgress,
  downloadProgress,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBulkRenameOpen, setIsBulkRenameOpen] = useState(false);
  const [bulkNames, setBulkNames] = useState('');
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
    if (!isBulkRenameOpen) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsBulkRenameOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isBulkRenameOpen]);

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

  const parsedBulkNames = useMemo(
    () => bulkNames.split(/\r?\n/).map(normalizeBulkName).filter(Boolean),
    [bulkNames]
  );

  const handleBulkRename = () => {
    parsedBulkNames.slice(0, results.length).forEach((fileName, index) => {
      onRenameFile?.(index, fileName);
    });
    setIsBulkRenameOpen(false);
    setBulkNames('');
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
          <button
            className="wm-bulk-rename-button"
            type="button"
            onClick={() => setIsBulkRenameOpen(true)}
            disabled={results.length === 0 || !onRenameFile}
          >
            <span className="wm-bulk-rename-button-icon" aria-hidden="true">✦</span>
            <span>Thêm tên ảnh hàng loạt</span>
          </button>
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
                  onRemoveResult={onRemoveResult}
                  onPreview={() => openPreview(r, index)}
                  style={{ animationDelay: `${index * 50}ms` }}
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

      {isBulkRenameOpen && (
        <div
          className="wm-bulk-rename-backdrop"
          role="presentation"
          onPointerDown={() => setIsBulkRenameOpen(false)}
        >
          <div
            className="wm-bulk-rename-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wm-bulk-rename-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="wm-bulk-rename-header">
              <div className="wm-bulk-rename-heading">
                <span className="wm-bulk-rename-hero-icon" aria-hidden="true">✦</span>
                <div>
                  <span className="wm-bulk-rename-eyebrow">Đổi tên nhanh</span>
                  <strong id="wm-bulk-rename-title">Thêm tên ảnh hàng loạt</strong>
                  <p>Dán danh sách tên và hệ thống sẽ ghép lần lượt với từng ảnh.</p>
                </div>
              </div>
              <button
                className="wm-bulk-rename-close"
                type="button"
                onClick={() => setIsBulkRenameOpen(false)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className="wm-bulk-rename-guide">
              <span><b>1</b> Mỗi tên một dòng</span>
              <span><b>2</b> Theo thứ tự ảnh #1, #2…</span>
              <span><b>3</b> Tự thêm đuôi .jpg</span>
            </div>
            <label className="wm-bulk-rename-field">
              <span className="wm-bulk-rename-field-label">
                <strong>Danh sách tên ảnh</strong>
                <small>{parsedBulkNames.length} tên đã nhập</small>
              </span>
              <textarea
                className="wm-bulk-rename-textarea"
                value={bulkNames}
                onChange={(event) => setBulkNames(event.target.value)}
                placeholder={'Áo sơ mi trắng\nÁo sơ mi xanh\nÁo sơ mi hồng'}
                rows={10}
                autoFocus
              />
            </label>
            <div className="wm-bulk-rename-summary" aria-live="polite">
              <span>
                {Math.min(parsedBulkNames.length, results.length)}/{results.length} ảnh sẽ được đổi tên
              </span>
              {parsedBulkNames.length > results.length && (
                <span>{parsedBulkNames.length - results.length} tên dư sẽ được bỏ qua</span>
              )}
            </div>
            <div className="wm-bulk-rename-actions">
              <a
                className="wm-bulk-rename-video"
                href={BULK_RENAME_TUTORIAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Mở video hướng dẫn trong tab mới"
              >
                <span aria-hidden="true">▶</span>
                Xem video hướng dẫn
              </a>
              <div className="wm-bulk-rename-action-buttons">
              <button
                className="wm-bulk-rename-cancel"
                type="button"
                onClick={() => setIsBulkRenameOpen(false)}
              >
                Hủy
              </button>
              <button
                className="wm-bulk-rename-confirm"
                type="button"
                onClick={handleBulkRename}
                disabled={parsedBulkNames.length === 0}
              >
                Xác nhận đổi tên
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ResultCard({ result, index, onPreview, onRenameFile, onRemoveResult, style }) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.url;
    a.download = normalizeDownloadName(result.fileName);
    a.click();
  };

  return (
    <div className="wm-result-card wm-result-card--enter" style={style}>
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
            <button className="wm-result-dl-btn" onClick={handleDownload} type="button">
              <span className="wm-inline-icon" aria-hidden="true">↓</span>
              Tải xuống
            </button>
            {onRemoveResult && (
              <button
                className="wm-result-remove-btn"
                onClick={() => onRemoveResult(index)}
                type="button"
              >
                <span className="wm-inline-icon" aria-hidden="true">×</span>
                Xóa
              </button>
            )}
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
