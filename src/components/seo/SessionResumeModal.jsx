export default function SessionResumeModal({
  isOpen,
  summary,
  onResume,
  onStartNew,
  onDownloadCurrent,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="seo-modal-backdrop" role="presentation">
      <div className="seo-modal" role="dialog" aria-modal="true" aria-labelledby="seo-resume-title">
        <div className="seo-modal__header">
          <span className="seo-excel-kicker">Session detected</span>
          <h2 id="seo-resume-title">Phát hiện tiến trình chưa hoàn tất. Tiếp tục?</h2>
        </div>

        <p className="seo-modal__description">
          Mình tìm thấy một session đang dang dở trong IndexedDB. Bạn có thể tiếp tục xử lý, bắt đầu mới, hoặc tải file hiện tại.
        </p>

        <div className="seo-modal__stats">
          <div className="seo-modal__stat">
            <span>Còn lại</span>
            <strong>{summary.pendingCount}</strong>
          </div>
          <div className="seo-modal__stat">
            <span>Tổng đã lưu</span>
            <strong>{summary.totalCount}</strong>
          </div>
        </div>

        <div className="seo-modal__actions">
          <button type="button" className="seo-btn seo-btn--primary" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="seo-btn seo-btn--secondary" onClick={onStartNew}>
            Start New
          </button>
          <button type="button" className="seo-btn seo-btn--ghost" onClick={onDownloadCurrent}>
            Download Current Progress
          </button>
        </div>
      </div>
    </div>
  );
}

