import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Helmet } from 'react-helmet-async';
import LogoUploader from '../components/watermark/LogoUploader';
import ImageUploader from '../components/watermark/ImageUploader';
import WatermarkControls from '../components/watermark/WatermarkControls';
import WatermarkGallery from '../components/watermark/WatermarkGallery';
import { processWatermark, resizeBlob, buildFileName, compressAndResizeBlob } from '../hooks/useWatermarkProcessor';
import NotificationModal from '../components/NotificationModal';
import { useAuth } from '../hooks/useAuth.js';
import {
  createWatermarkImageCount,
  getWatermarkImageCountTotal,
} from '../services/watermarkImageCountService.js';
import { getOrCreateWatermarkVisitorId } from '../utils/watermarkVisitor.js';
// import fifaImg from '../asset/fifawc.png';
// import cr7Gif from '../asset/cr7.gif';
import '../styles/Watermark.css';
import '../styles/DoanTrangWatermark.css';

const DEFAULT_OPTIONS = {
  size: 60,
  opacity: 60,
  tiled: false,
  productName: '',
  logoPosition: 'center',
};
const notification = {
  id: 'watermark-update-110526',
  title: 'Cập nhật mới',
  content: 'Đã thêm tính năng mới cho trang watermark.',
  imageUrl: 'https://psqfbcgkgafqtsmrgjqu.supabase.co/storage/v1/object/public/ZepLao/asset/notify.png',
};
const WATERMARK_COUNT_SOURCE_PAGE = 'watermark';
// const headerAnchors = Array.from({ length: 5 }, (_, index) => index);

function normalizeFileName(fileName, fallbackBase = 'image') {
  const trimmed = (fileName || '').trim();
  const baseName = trimmed ? trimmed.replace(/\.[^.]+$/, '') : fallbackBase;
  return `${baseName || fallbackBase}.jpg`;
}

function getDownloadFileName(fileName, suffix = '') {
  const normalized = normalizeFileName(fileName);
  const baseName = normalized.replace(/\.jpg$/i, '');
  return `${baseName}${suffix}.jpg`;
}

function formatCount(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function WatermarkCountBoard({
  totalCreated,
  personalCreated,
  lastCreated,
  selectedCount,
  isLoading,
  error,
}) {
  const rows = [
    {
      label: 'Tổng ảnh đã tạo',
      value: isLoading ? '...' : formatCount(totalCreated),
      note: error ? 'Chưa tải được dữ liệu Supabase' : 'Chỉ tính trang Watermark',
      tone: error ? 'warning' : 'primary',
    },
    {
      label: 'Ảnh của bạn',
      value: isLoading ? '...' : formatCount(personalCreated),
      note: 'Số ảnh bạn đã tạo trên trình duyệt này',
      tone: 'success',
    },
    { 
      label: 'Lần tạo gần nhất',
      value: formatCount(lastCreated),
      note: selectedCount > 0 ? `${formatCount(selectedCount)} ảnh` : 'Chưa chọn ảnh',
      tone: 'neutral',
    },
  ];

  return (
    <section className="wm-count-board" aria-label="Bảng đếm ảnh watermark">
      <div className="wm-count-board__header">
        <div>
          <span className="wm-count-board__kicker">Ảnh Đã Tạo</span>
          <h2>Ảnh Đã Tạo</h2>
        </div>
        <span className={`wm-count-board__status ${error ? 'is-warning' : 'is-live'}`}>
          {error ? 'Chưa đồng bộ' : 'Đang đồng bộ'}
        </span>
      </div>

      <div className="wm-count-grid">
        {rows.map((row) => (
          <article className={`wm-count-card wm-count-card--${row.tone}`} key={row.label}>
            <span className="wm-count-card__label">{row.label}</span>
            <strong>{row.value}</strong>
            <span className="wm-count-card__note">{row.note}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function WatermarkImageZoom({ image, onClose }) {
  if (!image) return null;

  return createPortal(
    <div
      className="wm-preview-backdrop"
      role="presentation"
      onPointerDown={onClose}
    >
      <div
        className="wm-preview-modal wm-preview-modal--zoom"
        role="dialog"
        aria-modal="true"
        aria-label={`Phóng to ${image.title}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="wm-preview-header">
          <div className="wm-preview-title-wrap">
            <span className="wm-preview-kicker">{image.kicker || 'Xem ảnh'}</span>
            <strong className="wm-preview-title" title={image.title}>
              {image.title}
            </strong>
          </div>
          <button
            className="wm-preview-close"
            type="button"
            onClick={onClose}
            aria-label="Đóng ảnh phóng to"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="wm-preview-image-frame">
          <img src={image.url} alt={image.title} />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Watermark() {
  const { user } = useAuth();
  const [logoUrl, setLogoUrl]   = useState(null);
  const [logoName, setLogoName] = useState(null);
  const [images, setImages]     = useState([]);
  const [options, setOptions]   = useState(DEFAULT_OPTIONS);
  const [results, setResults]   = useState([]);
  const [processing, setProcessing] = useState(false);
  const [totalCreated, setTotalCreated] = useState(0);
  const [personalCreated, setPersonalCreated] = useState(0);
  const [lastCreated, setLastCreated] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [zoomImage, setZoomImage] = useState(null);
  const [visitorId] = useState(() => getOrCreateWatermarkVisitorId());

  const handleLogoChange = useCallback((url, name) => {
    setLogoUrl(url);
    setLogoName(name);
  }, []);

  const openZoom = useCallback((image) => {
    setZoomImage(image);
  }, []);

  const closeZoom = useCallback(() => {
    setZoomImage(null);
  }, []);

  useEffect(() => {
    if (!visitorId) {
      return undefined;
    }

    let isActive = true;

    Promise.all([
      getWatermarkImageCountTotal({ sourcePage: WATERMARK_COUNT_SOURCE_PAGE }),
      getWatermarkImageCountTotal({
        sourcePage: WATERMARK_COUNT_SOURCE_PAGE,
        visitorId,
      }),
    ]).then(([totalResult, personalResult]) => {
      if (!isActive) {
        return;
      }

      if (totalResult.error || personalResult.error) {
        setStatsError(totalResult.error || personalResult.error);
      } else {
        setStatsError(null);
      }

      setTotalCreated(totalResult.data || 0);
      setPersonalCreated(personalResult.data || 0);
      setStatsLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [visitorId]);

  useEffect(() => {
    if (!zoomImage) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeZoom();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.classList.add('wm-modal-open');

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('wm-modal-open');
    };
  }, [closeZoom, zoomImage]);

  // ── Create watermarked images ──────────────────────────────────────
  const handleCreate = async () => {
    if (!logoUrl) return alert('Vui lòng chọn logo trước.');
    if (!images.length) return alert('Vui lòng chọn ít nhất 1 ảnh.');
    if (!visitorId) return alert('Đang khởi tạo mã người dùng, bạn thử lại sau vài giây.');

    setProcessing(true);
    const newResults = [];

    for (let i = 0; i < images.length; i++) {
      try {
        const blob = await processWatermark(images[i].file, logoUrl, options);
        const url  = URL.createObjectURL(blob);
        const fileName = buildFileName(options.productName, i, images.length);
        newResults.push({ url, blob, fileName });
      } catch (err) {
        console.error(`Error processing image ${i}:`, err);
      }
    }

    setResults(newResults);
    setProcessing(false);

    if (newResults.length > 0) {
      const result = await createWatermarkImageCount({
        userId: user?.id,
        visitorId,
        imageCount: newResults.length,
        sourcePage: WATERMARK_COUNT_SOURCE_PAGE,
      });

      if (result.error) {
        console.warn('[Watermark] Could not save image count', result.error);
      } else {
        setTotalCreated((current) => current + newResults.length);
        setPersonalCreated((current) => current + newResults.length);
        setLastCreated(newResults.length);
        setStatsError(null);
      }
    }

    // Scroll to gallery
    setTimeout(() => {
      document.getElementById('wm-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  // ── Download all ───────────────────────────────────────────────────
  const handleDownloadAll = useCallback(async (mode) => {
    for (const r of results) {
      let blob = r.blob;
      let fileName = getDownloadFileName(r.fileName);

      if (mode === '800x600') {
        try {
          blob = await resizeBlob(blob, 800, 600);
          fileName = getDownloadFileName(r.fileName);
        } catch { /* use original */ }
      } else if (mode === 'ImageCompress') {
        try {
          blob = await compressAndResizeBlob(blob, 800, 600, 100);
          fileName = getDownloadFileName(r.fileName);
        } catch { /* use original */ }
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      await new Promise((r) => setTimeout(r, 80)); // slight delay between downloads
    }
  }, [results]);

  // ── Clear results ──────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setResults([]);
  }, [results]);

  const handleRenameResult = useCallback((index, nextName) => {
    setResults((prev) => prev.map((result, i) => (
      i === index ? { ...result, fileName: nextName } : result
    )));
  }, []);

  const canCreate = logoUrl && images.length > 0 && !processing;

  return (
    <>
      <Helmet>
        <title>Watermark - Thêm Logo Vào Ảnh</title>
      </Helmet>
      <div className="wm-page">
        <div className="wm-container">

          {/* ── Header ── */}
          {/* <div className="wm-header">
            <div className="wm-header__copy">
              <div className="wm-hero-copy">
                <span className="wm-hero-kicker">World Cup studio</span>
                <h1 className="wm-headline">
                  World Cup <span>Watermark</span>
                </h1>
                <p className="wm-subline">
                  Cristiano Ronaldo – ONE LAST DANCE | World Cup 2026
                </p>
                <div className="wm-hero-chips" aria-hidden="true">
                  <span>Kickoff</span>
                  <span>Final ready</span>
                  <span>Clean export</span>
                </div>
              </div>
              <img
                  className="wm-luffy"
                  src={fifaImg}
                  alt=""
                  role="button"
                  tabIndex={0}
                  onClick={() => openZoom({
                    url: fifaImg,
                    title: 'World Cup trophy',
                    kicker: 'World Cup',
                  })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openZoom({
                        url: fifaImg,
                        title: 'World Cup trophy',
                        kicker: 'World Cup',
                      });
                    }
                  }}
                />  
            </div>
            <div className="wm-header-anchors">
              {headerAnchors.map((anchor) => (
                <button
                  className="wm-header-anchor"
                  key={anchor}
                  type="button"
                  onClick={() => openZoom({
                    url: cr7HeaderImages[anchor],
                    title: `CR7 #${anchor + 1}`,
                    kicker: 'CR7 highlight',
                  })}
                  aria-label={`Phóng to ảnh CR7 ${anchor + 1}`}
                >
                  <span className="wm-header-anchor__line" />
                  <img src={cr7HeaderImages[anchor]} alt="" />
                </button>
              ))}
            </div>

          </div> */}

        <WatermarkCountBoard
          totalCreated={totalCreated}
          personalCreated={personalCreated}
          lastCreated={lastCreated}
          selectedCount={images.length}
          isLoading={statsLoading}
          error={statsError}
        />

        {/* ── Main Layout ── */}
        <div className="wm-layout">

          {/* Left column: upload panels */}
          <div className="wm-panel-column wm-panel-column--narrow">
            <div className="wm-card wm-card--spaced">
              <LogoUploader
                logoUrl={logoUrl}
                logoName={logoName}
                onLogoChange={handleLogoChange}
                onImagePreview={openZoom}
              />
            </div>

            <div className="wm-card">
              <ImageUploader
                images={images}
                onImagesChange={setImages}
                onImagePreview={openZoom}
              />
            </div>
          </div>

          {/* Right column: controls */}
          <div className="wm-panel-column wm-panel-column--wide">
            <div className="wm-card wm-card--full">
              <WatermarkControls options={options} onChange={setOptions} />

              <hr className="wm-divider" />

              {/* Action Bar */}
              <div className="wm-action-bar">
                <button
                  className="wm-btn-primary wm-create-btn"
                  onClick={handleCreate}
                  disabled={!canCreate}
                >
                  {processing ? (
                    <>
                      <span className="wm-spinner" role="status" aria-label="Đang xử lý" />
                      Đang xử lý…
                    </>
                  ) : (
                    <>
                      <span className="wm-inline-icon" aria-hidden="true">🌼</span>
                      Tạo ảnh Watermark
                    </>
                  )}
                </button>

                <span className="wm-create-hint">
                  {!logoUrl && '⚠ Chưa có logo · '}
                  {images.length === 0
                    ? 'Chưa có ảnh nào'
                    : `${images.length} ảnh đã chọn`}
                </span>
              </div>

              {/* Tip cards */}
              {!logoUrl && (
                <div className="wm-tip-alert">
                  <span className="wm-inline-icon" aria-hidden="true">💡</span>
                  Logo sẽ được lưu tự động vào trình duyệt – lần sau mở web logo vẫn còn đó.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Gallery ── */}
        <div id="wm-gallery">
          <WatermarkGallery
            results={results}
            onClear={handleClear}
            onDownloadAll={handleDownloadAll}
            onRenameFile={handleRenameResult}
            isProcessing={processing}
          />
        </div>

      </div>
    </div>
    <NotificationModal
      notification={notification}
    />
    <WatermarkImageZoom image={zoomImage} onClose={closeZoom} />
    </>
  );
}
