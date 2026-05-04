import React, { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import LogoUploader from '../components/watermark/LogoUploader';
import ImageUploader from '../components/watermark/ImageUploader';
import WatermarkControls from '../components/watermark/WatermarkControls';
import WatermarkGallery from '../components/watermark/WatermarkGallery';
import { processWatermark, resizeBlob, buildFileName, compressAndResizeBlob } from '../hooks/useWatermarkProcessor';
import '../styles/Watermark.css';

const DEFAULT_OPTIONS = {
  size: 60,
  opacity: 60,
  tiled: false,
  productName: '',
  logoPosition: 'center',
};

export default function Watermark() {
  const [logoUrl, setLogoUrl]   = useState(null);
  const [logoName, setLogoName] = useState(null);
  const [images, setImages]     = useState([]);
  const [options, setOptions]   = useState(DEFAULT_OPTIONS);
  const [results, setResults]   = useState([]);
  const [processing, setProcessing] = useState(false);

  const handleLogoChange = useCallback((url, name) => {
    setLogoUrl(url);
    setLogoName(name);
  }, []);

  // ── Create watermarked images ──────────────────────────────────────
  const handleCreate = async () => {
    if (!logoUrl) return alert('Vui lòng chọn logo trước.');
    if (!images.length) return alert('Vui lòng chọn ít nhất 1 ảnh.');

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

    // Scroll to gallery
    setTimeout(() => {
      document.getElementById('wm-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  // ── Download all ───────────────────────────────────────────────────
  const handleDownloadAll = useCallback(async (mode) => {
    for (const r of results) {
      let blob = r.blob;
      let fileName = r.fileName;

      if (mode === '800x600') {
        try {
          blob = await resizeBlob(blob, 800, 600);
          fileName = fileName.replace('.jpg', '_800x600.jpg');
        } catch { /* use original */ }
      } else if (mode === 'ImageCompress') {
        try {
          blob = await compressAndResizeBlob(blob, 800, 600, 100);
          fileName = fileName.replace('.jpg', '_compressed.jpg');
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

  const canCreate = logoUrl && images.length > 0 && !processing;

  return (
    <>
      <Helmet>
        <title>Watermark - Thêm Logo Vào Ảnh</title>
      </Helmet>
      <div className="wm-page">
        <div className="wm-container">

          {/* ── Header ── */}
          <div className="wm-header">
            <h1 className="wm-headline">
              Water<span>mark</span>
          </h1>
          <p className="wm-subline">
            Thêm logo bảo vệ bản quyền hàng loạt — nhanh, đẹp, chuẩn.
          </p>
        </div>

        {/* ── Main Layout ── */}
        <div className="wm-layout">

          {/* Left column: upload panels */}
          <div className="wm-panel-column wm-panel-column--narrow">
            <div className="wm-card wm-card--spaced">
              <LogoUploader
                logoUrl={logoUrl}
                logoName={logoName}
                onLogoChange={handleLogoChange}
              />
            </div>

            <div className="wm-card">
              <ImageUploader images={images} onImagesChange={setImages} />
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
                      <span className="wm-inline-icon" aria-hidden="true">✨</span>
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
            isProcessing={processing}
          />
        </div>

      </div>
    </div>
    </>
  );
}
