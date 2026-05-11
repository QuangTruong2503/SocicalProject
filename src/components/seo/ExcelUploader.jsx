export default function ExcelUploader({
  fileInfo,
  statusLabel,
  onFileChange,
  onResetFile,
  fileInputRef,
  fileSummary,
}) {
  return (
    <section className="seo-excel-card seo-excel-card--upload">
      <div className="seo-excel-card__header">
        <div>
          <span className="seo-excel-kicker">Upload Excel</span>
          <h2>Nhập file sản phẩm</h2>
        </div>

        <span className={`seo-status-badge seo-status-badge--${fileInfo.statusTone || 'idle'}`}>
          {statusLabel}
        </span>
      </div>

      <div className="seo-upload-zone">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileChange}
          className="seo-upload-zone__input"
        />

        <div className="seo-upload-zone__copy">
          <strong>Kéo thả hoặc chọn file .xlsx / .xls</strong>
          <p>Đọc cột D = Tên, cột E = Mô tả, cột I = Tag. Dòng bắt đầu từ hàng 2.</p>
        </div>
      </div>

      <div className="seo-upload-meta">
        <div className="seo-meta-chip">
          <span>File</span>
          <strong>{fileInfo.fileName || 'Chưa chọn file'}</strong>
        </div>
        <div className="seo-meta-chip">
          <span>Tổng dòng trong sheet</span>
          <strong>{fileInfo.rowCount}</strong>
        </div>
        <div className="seo-meta-chip">
          <span>Dòng cần xử lý</span>
          <strong>{fileSummary.pendingRows}</strong>
        </div>
        <div className="seo-meta-chip">
          <span>Trạng thái</span>
          <strong>{fileInfo.statusText}</strong>
        </div>
      </div>

      <div className="seo-upload-actions">
        <button
          type="button"
          className="seo-btn seo-btn--secondary"
          onClick={onResetFile}
          disabled={!fileInfo.fileName}
        >
          Bỏ file hiện tại
        </button>
      </div>
    </section>
  );
}
