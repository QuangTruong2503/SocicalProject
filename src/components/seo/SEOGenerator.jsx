import SEOTagList from './SEOTagList.jsx';

function AnalysisCard({ label, value }) {
  return (
    <article className="seo-analysis-card">
      <span className="seo-analysis-card__label">{label}</span>
      <p className="seo-analysis-card__value">{value || 'Không có dữ liệu.'}</p>
    </article>
  );
}

export default function SEOGenerator({
  draft,
  seoResult,
  isGenerating,
  isSavingHistory,
  error,
  copiedKey,
  onDraftChange,
  onGenerate,
  onRegenerate,
  onClear,
  onCopyAll,
  onCopyTag,
}) {
  const canGenerate = Boolean(draft.productName.trim()) && !isGenerating;
  const hasResult = Boolean(seoResult?.seoTags?.length);
  const analysisItems = seoResult?.analysis || [];

  return (
    <article className="seo-panel seo-generator">
      <header className="seo-panel__header">
        <div>
          <span className="seo-panel__kicker">SEO Generator</span>
          <h2>Tạo bộ tag semantic</h2>
        </div>

        {isSavingHistory && (
          <span className="seo-status-pill seo-status-pill--saving">Đang lưu lịch sử</span>
        )}
      </header>

      <form className="seo-generator__form" onSubmit={onGenerate}>
        <div className="seo-form-grid">
          <label className="seo-field seo-field--span-2">
            <span className="seo-field__label">Tên sản phẩm</span>
            <input
              type="text"
              value={draft.productName}
              onChange={(event) => onDraftChange((current) => ({ ...current, productName: event.target.value }))}
              placeholder="Ví dụ: Máy khoan pin Makita DHP483"
              className="seo-input"
              autoComplete="off"
              spellCheck={false}
              disabled={isGenerating}
            />
          </label>

          <label className="seo-field">
            <span className="seo-field__label">Nhà phân phối</span>
            <input
              type="text"
              value={draft.distributor}
              onChange={(event) => onDraftChange((current) => ({ ...current, distributor: event.target.value }))}
              placeholder="Tên công ty / đơn vị phân phối"
              className="seo-input"
              autoComplete="off"
              spellCheck={false}
              disabled={isGenerating}
            />
          </label>

          <label className="seo-field seo-field--span-2">
            <span className="seo-field__label">Nội dung sản phẩm tổng hợp</span>
            <textarea
              value={draft.productDetails}
              onChange={(event) => onDraftChange((current) => ({ ...current, productDetails: event.target.value }))}
              placeholder="Dán toàn bộ thông số kỹ thuật, tính năng nổi bật, ứng dụng thực tế và ưu điểm sản phẩm vào đây..."
              className="seo-textarea"
              rows={4}
              disabled={isGenerating}
            />
          </label>
        </div>

        <div className="seo-form-grid__footer">
          <span className="seo-helper-line">
            Chỉ cần nhập một khối nội dung đầy đủ để AI tự tách keyword cốt lõi, technical, use case và thương mại.
          </span>

          {error && (
            <div className="seo-alert seo-alert--error" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="seo-generator__actions">
          <button
            type="submit"
            className="seo-button seo-button--primary"
            disabled={!canGenerate}
          >
            {isGenerating ? 'Đang phân tích...' : 'Tạo semantic tags'}
          </button>

          <button
            type="button"
            className="seo-button seo-button--secondary"
            onClick={onRegenerate}
            disabled={!hasResult || isGenerating}
          >
            Tạo lại
          </button>

          <button
            type="button"
            className="seo-button seo-button--ghost"
            onClick={onClear}
            disabled={isGenerating}
          >
            Xóa form
          </button>
        </div>
      </form>

      <section className="seo-result-card" aria-live="polite">
        <div className="seo-result-card__header">
          <div>
            <span className="seo-panel__kicker">Generated result</span>
            <h3>{seoResult?.title || 'Chưa có bộ tag nào được tạo'}</h3>
          </div>

          <div className="seo-result-card__meta">
            <span className="seo-result-card__count">{seoResult?.seoCount || 0}</span>
            <span className="seo-result-card__label">tags</span>
          </div>
        </div>

        {seoResult ? (
          <>
            <div className="seo-result-card__toolbar">
              <button
                type="button"
                className="seo-button seo-button--inline"
                onClick={onCopyAll}
                disabled={!seoResult.raw}
              >
                {copiedKey === seoResult.raw ? 'Copied' : 'Copy all tags'}
              </button>
              <span className="seo-result-card__timestamp">
                {new Date(seoResult.generatedAt).toLocaleString('vi-VN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>

            <div className="seo-result-card__analysis">
              {analysisItems.length ? (
                analysisItems.map((item) => (
                  <AnalysisCard key={item.key} label={item.label} value={item.value} />
                ))
              ) : (
                <div className="seo-empty-inline seo-empty-inline--compact">
                  <div className="seo-empty-inline__icon">✦</div>
                  <p>Chưa có phần phân tích semantic.</p>
                </div>
              )}
            </div>

            <div className="seo-result-card__tags">
              <div className="seo-result-card__section-head">
                <div>
                  <span className="seo-panel__kicker">Bộ tag tối ưu</span>
                  <h4>Tags phục vụ landing page</h4>
                </div>
                <span className="seo-result-card__label">{seoResult.seoCount} tags</span>
              </div>

              <SEOTagList tags={seoResult.seoTags} onTagClick={onCopyTag} />
            </div>
          </>
        ) : (
          <div className="seo-empty-inline">
            <div className="seo-empty-inline__icon">✦</div>
            <p>Nhập dữ liệu sản phẩm để tạo ra bộ tag semantic tối ưu.</p>
          </div>
        )}
      </section>
    </article>
  );
}
