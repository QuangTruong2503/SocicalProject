import React, { useState, useCallback } from 'react';
import LogoUploader from '../components/watermark/LogoUploader';
import ImageUploader from '../components/watermark/ImageUploader';
import WatermarkControls from '../components/watermark/WatermarkControls';
import WatermarkGallery from '../components/watermark/WatermarkGallery';
import { processWatermark, resizeBlob, buildFileName, compressAndResizeBlob } from '../hooks/useWatermarkProcessor';
import '../styles/Watermark.css';

const DEFAULT_OPTIONS = {
  size: 60,
  opacity: 40,
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
    <div className="wm-page">
      <div className="container">

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
        <div className="row g-4">

          {/* Left column: upload panels */}
          <div className="col-lg-5">
            <div className="wm-card mb-4">
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
          <div className="col-lg-7">
            <div className="wm-card h-100">
              <WatermarkControls options={options} onChange={setOptions} />

              <hr className="wm-divider" />

              {/* Action Bar */}
              <div className="wm-action-bar">
                <button
                  className="btn wm-btn-primary wm-create-btn text-light"
                  onClick={handleCreate}
                  disabled={!canCreate}
                >
                  {processing ? (
                    <>
                      <span className="spinner-border" role="status" />
                      Đang xử lý…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-magic" />
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
                <div className="alert mt-3 mb-0 py-2 px-3" style={{
                  background: 'rgba(244,163,51,0.08)',
                  border: '1px solid rgba(244,163,51,0.25)',
                  borderRadius: '8px',
                  color: '#f4a333',
                  fontSize: '0.82rem',
                }}>
                  <i className="bi bi-lightbulb me-2" />
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
  );
}