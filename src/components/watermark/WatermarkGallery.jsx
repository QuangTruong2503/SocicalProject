import React from 'react';

export default function WatermarkGallery({ results, onClear, onDownloadAll, isProcessing }) {
  if (results.length === 0 && !isProcessing) return null;

  return (
    <div className="wm-gallery-section">
      <div className="wm-gallery-header">
        <div className="d-flex align-items-center gap-3">
          <h5 className="wm-gallery-title mb-0">
            <i className="bi bi-grid-1x2-fill me-2" />
            Kết quả
            <span className="wm-badge ms-2 text-light">{results.length}</span>
          </h5>
        </div>

        <div className="d-flex gap-2 flex-wrap">
          <div className="dropdown">
            <button
              className="btn btn-primary dropdown-toggle"
              data-bs-toggle="dropdown"
              disabled={results.length === 0}
            >
              <i className="bi bi-download me-2" />
              <strong>Tải tất cả</strong>
            </button>
            <ul className="dropdown-menu dropdown-menu-dark dropdown-menu-end wm-dropdown">
              <li>
                <button
                  className="dropdown-item wm-dropdown-item"
                  onClick={() => onDownloadAll('full')}
                >
                  <i className="bi bi-image me-2" />
                  <div>
                    <div className="fw-semibold">Đầy đủ kích thước</div>
                    <small className="text-muted">Giữ nguyên độ phân giải gốc</small>
                  </div>
                </button>
              </li>
              <li>
                <button
                  className="dropdown-item wm-dropdown-item"
                  onClick={() => onDownloadAll('800x600')}
                >
                  <i className="bi bi-aspect-ratio me-2" />
                  <div>
                    <div className="fw-semibold">800 × 600 px</div>
                    <small className="text-muted">Tối ưu cho web &amp; mạng xã hội</small>
                  </div>
                </button>
              </li>
              <li>
                <button
                  className="dropdown-item wm-dropdown-item"
                  onClick={() => onDownloadAll('ImageCompress')}
                >
                  <i className="bi bi-file-zip me-2" />
                  <div>
                    <div className="fw-semibold">Nén 800 × 600 (&lt;100KB)</div>
                    <small className="text-muted">Nén tối ưu cho email &amp; tải nhanh</small>
                  </div>
                </button>
              </li>
            </ul>
          </div>

          <button
            className="btn wm-btn-outline-danger"
            onClick={onClear}
            disabled={results.length === 0}
          >
            <i className="bi bi-trash3 me-1" />
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
          <ResultCard key={i} result={r} index={i} />
        ))}
      </div>
    </div>
  );
}

function ResultCard({ result, index }) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.fileName;
    a.click();
  };

  return (
    <div className="wm-result-card">
      <div className="wm-result-img-wrap">
        <img src={result.url} alt={result.fileName} loading="lazy" />
        <div className="wm-result-overlay">
          <button className="wm-result-dl-btn" onClick={handleDownload}>
            <i className="bi bi-download me-1" />
            Tải xuống
          </button>
        </div>
      </div>
      <div className="wm-result-meta">
        <span className="wm-result-name" title={result.fileName}>
          {result.fileName}
        </span>
        <span className="wm-result-num">#{index + 1}</span>
      </div>
    </div>
  );
}