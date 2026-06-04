import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Helmet } from 'react-helmet-async';
import LogoUploader from '../components/watermark/LogoUploader';
import ImageUploader from '../components/watermark/ImageUploader';
import WatermarkControls from '../components/watermark/WatermarkControls';
import WatermarkGallery from '../components/watermark/WatermarkGallery';
import {
  buildFileName,
  compressAndResizeBlob,
  processWatermark,
  resizeBlob,
} from '../hooks/useWatermarkProcessor';
import { useAuth } from '../hooks/useAuth.js';
import {
  createWatermarkImageCount,
  getWatermarkImageCountTotal,
} from '../services/watermarkImageCountService.js';
import { uploadDoanTrangHeroPreview } from '../services/uploadService.js';
import {
  loadDoanTrangHeroImage,
  saveDoanTrangHeroImage,
} from '../hooks/useIndexedDB.js';
import '../styles/Watermark.css';
import '../styles/DoanTrangWatermark.css';

const DEFAULT_OPTIONS = {
  size: 60,
  opacity: 60,
  tiled: false,
  productName: 'doan-trang',
  logoPosition: 'center',
};

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

function DoanTrangCountBoard({
  totalCreated,
  sessionCreated,
  lastCreated,
  selectedCount,
  isLoading,
  error,
}) {
  const rows = [
    {
      label: 'Tổng ảnh đã tạo',
      value: isLoading ? '...' : formatCount(totalCreated),
      note: error ? 'Chưa tải được dữ liệu Supabase' : 'Đã đồng bộ toàn bộ',
      tone: error ? 'warning' : 'primary',
    },
    {
      label: 'Phiên hiện tại',
      value: formatCount(sessionCreated),
      note: 'Số ảnh tạo trong lần mở trang này',
      tone: 'success',
    },
    {
      label: 'Lần tạo gần nhất',
      value: formatCount(lastCreated),
      note: selectedCount > 0 ? `${formatCount(selectedCount)} ảnh đang chọn` : 'Chưa chọn ảnh',
      tone: 'neutral',
    },
  ];

  return (
    <section className="dtw-count-board" aria-label="Bảng đếm ảnh watermark Đoan Trang">
      <div className="dtw-count-board__header">
        <div>
          <span className="dtw-kicker">Rose counter</span>
          <h2>Bảng đếm ảnh đã tạo</h2>
        </div>
        <span className={`dtw-count-board__status ${error ? 'is-warning' : 'is-live'}`}>
          {error ? 'Chưa đồng bộ' : 'Đang đồng bộ'}
        </span>
      </div>

      <div className="dtw-count-grid">
        {rows.map((row) => (
          <article className={`dtw-count-card dtw-count-card--${row.tone}`} key={row.label}>
            <span className="dtw-count-card__label">{row.label}</span>
            <strong>{row.value}</strong>
            <span className="dtw-count-card__note">{row.note}</span>
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
      className="wm-preview-backdrop dtw-preview-backdrop"
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

export default function DoanTrangWatermarkPage() {
  const { user } = useAuth();
  const heroInputRef = useRef(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoName, setLogoName] = useState(null);
  const [images, setImages] = useState([]);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [totalCreated, setTotalCreated] = useState(0);
  const [sessionCreated, setSessionCreated] = useState(0);
  const [lastCreated, setLastCreated] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [zoomImage, setZoomImage] = useState(null);
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroImageName, setHeroImageName] = useState('');
  const [heroImageError, setHeroImageError] = useState('');
  const [heroImageLoading, setHeroImageLoading] = useState(true);
  const [heroImageUploading, setHeroImageUploading] = useState(false);
  const [heroImageStorageUrl, setHeroImageStorageUrl] = useState('');

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
    document.body.classList.add('dtw-watermark-theme');

    return () => {
      document.body.classList.remove('dtw-watermark-theme');
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    loadDoanTrangHeroImage()
      .then((result) => {
        if (!isActive) return;

        if (result) {
          setHeroImageUrl(result.url);
          setHeroImageName(result.name);
        }
      })
      .catch((error) => {
        console.warn('[DoanTrangWatermark] Could not load hero image', error);
      })
      .finally(() => {
        if (isActive) {
          setHeroImageLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    getWatermarkImageCountTotal().then((result) => {
      if (!isActive) return;

      if (result.error) {
        setStatsError(result.error);
        setStatsLoading(false);
        return;
      }

      setTotalCreated(result.data || 0);
      setStatsError(null);
      setStatsLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, []);

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

  useEffect(() => () => {
    if (heroImageUrl) {
      URL.revokeObjectURL(heroImageUrl);
    }
  }, [heroImageUrl]);

  const handleHeroImageChange = async (event) => {
    const file = event.target.files?.[0];
    setHeroImageError('');

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setHeroImageError('Vui lòng chọn file ảnh hợp lệ.');
      event.target.value = '';
      return;
    }

    try {
      await saveDoanTrangHeroImage(file);
      const nextUrl = URL.createObjectURL(file);

      if (heroImageUrl) {
        URL.revokeObjectURL(heroImageUrl);
      }

      setHeroImageUrl(nextUrl);
      setHeroImageName(file.name);
      setHeroImageStorageUrl('');
      setHeroImageUploading(true);
      const uploadResult = await uploadDoanTrangHeroPreview({
        userId: user?.id,
        file,
      });

      if (uploadResult.error) {
        setHeroImageError(uploadResult.error);
        return;
      }

      setHeroImageStorageUrl(uploadResult.data?.image_url || '');
    } catch (error) {
      console.error('[DoanTrangWatermark] Could not save hero image', error);
      setHeroImageError('Chưa lưu được ảnh preview vào IndexedDB. Bạn thử lại nhé.');
    } finally {
      setHeroImageUploading(false);
      event.target.value = '';
    }
  };

  const handleCreate = async () => {
    if (!logoUrl) return alert('Vui lòng chọn logo trước.');
    if (!images.length) return alert('Vui lòng chọn ít nhất 1 ảnh.');

    setProcessing(true);
    const newResults = [];

    for (let i = 0; i < images.length; i++) {
      try {
        const blob = await processWatermark(images[i].file, logoUrl, options);
        const url = URL.createObjectURL(blob);
        const fileName = buildFileName(options.productName, i, images.length);
        newResults.push({ url, blob, fileName });
      } catch (error) {
        console.error(`[DoanTrangWatermark] Error processing image ${i}:`, error);
      }
    }

    setResults(newResults);
    setProcessing(false);

    if (newResults.length > 0) {
      const result = await createWatermarkImageCount({
        userId: user?.id,
        imageCount: newResults.length,
      });

      if (result.error) {
        console.warn('[DoanTrangWatermark] Could not save image count', result.error);
      } else {
        setTotalCreated((current) => current + newResults.length);
        setSessionCreated((current) => current + newResults.length);
        setLastCreated(newResults.length);
        setStatsError(null);
      }
    }

    setTimeout(() => {
      document.getElementById('dtw-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  const handleDownloadAll = useCallback(async (mode) => {
    for (const result of results) {
      let blob = result.blob;
      let fileName = getDownloadFileName(result.fileName);

      if (mode === '800x600') {
        try {
          blob = await resizeBlob(blob, 800, 600);
          fileName = getDownloadFileName(result.fileName);
        } catch {
          /* Use original blob. */
        }
      } else if (mode === 'ImageCompress') {
        try {
          blob = await compressAndResizeBlob(blob, 800, 600, 100);
          fileName = getDownloadFileName(result.fileName);
        } catch {
          /* Use original blob. */
        }
      }

      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = fileName;
      anchor.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }, [results]);

  const handleClear = useCallback(() => {
    results.forEach((result) => URL.revokeObjectURL(result.url));
    setResults([]);
  }, [results]);

  const handleRenameResult = useCallback((index, nextName) => {
    setResults((current) => current.map((result, resultIndex) => (
      resultIndex === index ? { ...result, fileName: nextName } : result
    )));
  }, []);

  const canCreate = logoUrl && images.length > 0 && !processing;

  return (
    <>
      <Helmet>
        <title>Watermark Đoan Trang | Công cụ tạo watermark ảnh</title>
        <meta
          name="description"
          content="Tạo watermark ảnh phong cách nữ tính, màu hồng tinh tế, dễ dùng và tải xuống nhanh chóng."
        />
      </Helmet>

      <div className="dtw-page dtw-wm-page">
        <div className="wm-container dtw-container">
          <section className="dtw-hero">
            <div className="dtw-hero-copy">
              <span className="dtw-kicker">Boutique watermark studio</span>
              <h1>
                Watermark
                <span> Đoan Trang</span>
              </h1>
              <p>
                Chọn logo, chọn nhiều ảnh, tinh chỉnh vị trí và xuất gallery giống trang watermark chính.
              </p>
              <div className="dtw-hero-chips" aria-hidden="true">
                <span>Logo watermark</span>
                <span>Batch export</span>
                <span>Rose UI</span>
              </div>
            </div>

            <div className={`dtw-hero-preview ${heroImageUrl ? 'has-image' : 'is-empty'}`}>
              <input
                ref={heroInputRef}
                className="dtw-hero-file-input"
                type="file"
                accept="image/*"
                onChange={handleHeroImageChange}
              />

              <div className="dtw-hero-photo">
                <div className="dtw-hero-photo-inner">
                  {heroImageUrl ? (
                    <>
                      <button
                        className="dtw-hero-image-button"
                        type="button"
                        onClick={() => openZoom({
                          url: heroImageUrl,
                          title: heroImageName || 'Ảnh preview Đoan Trang',
                          kicker: 'Hero preview',
                        })}
                        aria-label="Phóng to ảnh preview Đoan Trang"
                      >
                        <img src={heroImageUrl} alt={heroImageName || 'Ảnh preview Đoan Trang'} />
                      </button>
                      <button
                        className="dtw-hero-change-button"
                        type="button"
                        onClick={() => heroInputRef.current?.click()}
                      >
                        Thay ảnh
                      </button>
                    </>
                  ) : (
                    <div className="dtw-hero-empty">
                      <span className="dtw-hero-empty-mark" aria-hidden="true">DT</span>
                      <strong>{heroImageLoading ? 'Đang tải ảnh...' : 'Chưa có ảnh preview'}</strong>
                      {!heroImageLoading && (
                        <button
                          className="dtw-hero-upload-button"
                          type="button"
                          onClick={() => heroInputRef.current?.click()}
                        >
                          Chọn ảnh preview
                        </button>
                      )}
                      {heroImageError && <small>{heroImageError}</small>}
                    </div>
                  )}
                  <span className="dtw-hero-mark">Đoan Trang</span>
                </div>
              </div>
              <div className="dtw-hero-note">
                <strong>{images.length || 0} ảnh</strong>
                <span>
                  {heroImageError && heroImageUrl
                    ? heroImageError
                    : heroImageUploading
                    ? 'Đang tải preview lên Supabase'
                    : heroImageStorageUrl
                      ? 'Preview đã lưu Supabase'
                      : heroImageUrl
                        ? 'Ảnh preview đã lưu trình duyệt'
                        : logoUrl
                          ? 'Logo đã sẵn sàng'
                          : 'Chưa chọn logo'}
                </span>
              </div>
            </div>
          </section>

          <DoanTrangCountBoard
            totalCreated={totalCreated}
            sessionCreated={sessionCreated}
            lastCreated={lastCreated}
            selectedCount={images.length}
            isLoading={statsLoading}
            error={statsError}
          />

          <section className="wm-layout dtw-layout" aria-label="Công cụ tạo watermark Đoan Trang">
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

            <div className="wm-panel-column wm-panel-column--wide">
              <div className="wm-card wm-card--full">
                <WatermarkControls options={options} onChange={setOptions} />

                <hr className="wm-divider" />

                <div className="wm-action-bar">
                  <button
                    className="wm-btn-primary wm-create-btn"
                    type="button"
                    onClick={handleCreate}
                    disabled={!canCreate}
                  >
                    {processing ? (
                      <>
                        <span className="wm-spinner" role="status" aria-label="Đang xử lý" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <span className="wm-inline-icon" aria-hidden="true">♡</span>
                        Tạo ảnh watermark
                      </>
                    )}
                  </button>

                  <span className="wm-create-hint">
                    {!logoUrl && 'Chưa có logo · '}
                    {images.length === 0 ? 'Chưa có ảnh nào' : `${images.length} ảnh đã chọn`}
                  </span>
                </div>

                {!logoUrl && (
                  <div className="wm-tip-alert">
                    <span className="wm-inline-icon" aria-hidden="true">◇</span>
                    Logo sẽ được lưu tự động vào trình duyệt để lần sau mở trang vẫn còn sẵn.
                  </div>
                )}
              </div>
            </div>
          </section>

          <div id="dtw-gallery">
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

      <WatermarkImageZoom image={zoomImage} onClose={closeZoom} />
    </>
  );
}
