import SEOTagList from './SEOTagList.jsx';

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
  const canGenerate = Boolean(draft.title.trim()) && !isGenerating;
  const hasResult = Boolean(seoResult?.seoTags?.length);

  return (
    <article className="seo-panel seo-generator">
      <header className="seo-panel__header">
        <div>
          <span className="seo-panel__kicker">SEO Generator</span>
          <h2>Tạo bộ keyword mới</h2>
        </div>

        {isSavingHistory && (
          <span className="seo-status-pill seo-status-pill--saving">Đang lưu lịch sử</span>
        )}
      </header>

      <form className="seo-generator__form" onSubmit={onGenerate}>
        <label className="seo-field">
          <span className="seo-field__label">Tiêu đề sản phẩm</span>
          <input
            type="text"
            value={draft.title}
            onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))}
            placeholder="Ví dụ: Laptop Dell XPS 13, kem chống nắng, khóa học React..."
            className="seo-input"
            autoComplete="off"
            spellCheck={false}
            disabled={isGenerating}
          />
          {/* <span className="seo-field__hint">Nhập chủ đề ngắn gọn để AI mở rộng thành cụm keyword có chuyển đổi cao.</span> */}
        </label>

        <label className="seo-field">
          <span className="seo-field__label">Thông số / ưu điểm</span>
          <textarea
            value={draft.details}
            onChange={(event) => onDraftChange((current) => ({ ...current, details: event.target.value }))}
            placeholder="Thêm mô tả, tính năng, đối tượng khách hàng, ưu điểm, chất liệu, thông số..."
            className="seo-textarea"
            rows={5}
            disabled={isGenerating}
          />
          <span className="seo-field__hint">Chi tiết càng rõ, keyword đầu ra càng sát search intent.</span>
        </label>

        {error && (
          <div className="seo-alert seo-alert--error" role="alert">
            {error}
          </div>
        )}

        <div className="seo-generator__actions">
          <button
            type="submit"
            className="seo-button seo-button--primary"
            disabled={!canGenerate}
          >
            {isGenerating ? 'Đang tạo...' : 'Tạo keywords'}
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
            disabled={isGenerating && !draft.title && !draft.details}
          >
            Xóa keywords
          </button>
        </div>
      </form>

      <section className="seo-result-card" aria-live="polite">
        <div className="seo-result-card__header">
          <div>
            <span className="seo-panel__kicker">Generated result</span>
            <h3>{seoResult?.title || 'No keywords generated yet'}</h3>
          </div>

          <div className="seo-result-card__meta">
            <span className="seo-result-card__count">{seoResult?.seoCount || 0}</span>
            <span className="seo-result-card__label">keywords</span>
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

            <SEOTagList tags={seoResult.seoTags} onTagClick={onCopyTag} />
          </>
        ) : (
          <div className="seo-empty-inline">
            <div className="seo-empty-inline__icon">✦</div>
            <p>Chưa có keyword nào được tạo.</p>
          </div>
        )}
      </section>
    </article>
  );
}
