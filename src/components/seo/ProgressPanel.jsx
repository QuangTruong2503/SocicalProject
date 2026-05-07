function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return '--:--';
  }

  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function ProgressPanel({
  stats,
  progressPercent,
  etaMs,
  onStart,
  onPause,
  onResume,
  onStop,
  onExportCurrent,
  onClearSession,
}) {
  return (
    <section className="seo-excel-card">
      <div className="seo-excel-card__header">
        <div>
          <span className="seo-excel-kicker">Processing Controls</span>
          <h2>Điều khiển luồng xử lý</h2>
        </div>
        <span className="seo-status-badge seo-status-badge--running">{stats.statusLabel}</span>
      </div>

      <div className="seo-control-row">
        <button type="button" className="seo-btn seo-btn--primary" onClick={onStart} disabled={!stats.canStart}>
          Bắt đầu xử lý
        </button>
        <button type="button" className="seo-btn seo-btn--secondary" onClick={onPause} disabled={!stats.canPause}>
          Tạm dừng
        </button>
        <button type="button" className="seo-btn seo-btn--secondary" onClick={onResume} disabled={!stats.canResume}>
          Tiếp tục
        </button>
        <button type="button" className="seo-btn seo-btn--danger" onClick={onStop} disabled={!stats.canStop}>
          Dừng hẳn
        </button>
        <button type="button" className="seo-btn seo-btn--ghost" onClick={onExportCurrent} disabled={!stats.canExport}>
          Download Current Progress
        </button>
        <button type="button" className="seo-btn seo-btn--ghost" onClick={onClearSession} disabled={!stats.canClearSession}>
          Clear Session
        </button>
      </div>

      <div className="seo-progress-grid">
        <div className="seo-stat-box">
          <span>Tổng sản phẩm</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="seo-stat-box">
          <span>Đã xử lý</span>
          <strong>{stats.processed}</strong>
        </div>
        <div className="seo-stat-box">
          <span>Đang xử lý dòng số</span>
          <strong>{stats.currentRow || '--'}</strong>
        </div>
        <div className="seo-stat-box">
          <span>Thành công</span>
          <strong>{stats.success}</strong>
        </div>
        <div className="seo-stat-box">
          <span>Lỗi</span>
          <strong>{stats.errors}</strong>
        </div>
        <div className="seo-stat-box">
          <span>ETA dự kiến</span>
          <strong>{formatDuration(etaMs)}</strong>
        </div>
      </div>

      <div className="seo-progress-bar" aria-label="Tiến độ xử lý">
        <div className="seo-progress-bar__fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="seo-progress-footer">
        <span>{progressPercent}% hoàn tất</span>
        <span>{stats.stageText}</span>
      </div>
    </section>
  );
}
