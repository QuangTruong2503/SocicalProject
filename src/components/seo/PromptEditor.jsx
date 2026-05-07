export default function PromptEditor({
  prompt,
  onPromptChange,
  onLoadDefault,
  onSavePrompt,
}) {
  return (
    <section className="seo-excel-card">
      <div className="seo-excel-card__header">
        <div>
          <span className="seo-excel-kicker">Prompt Configuration</span>
          <h2>Template AI</h2>
        </div>

        <div className="seo-inline-actions">
          <button type="button" className="seo-btn seo-btn--ghost" onClick={onLoadDefault}>
            Load Prompt mặc định
          </button>
          <button type="button" className="seo-btn seo-btn--ghost" onClick={onSavePrompt}>
            Save Prompt localStorage
          </button>
        </div>
      </div>

      <textarea
        className="seo-textarea seo-textarea--large"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        spellCheck={false}
        placeholder="Nhập prompt template..."
      />

      <div className="seo-helper-line">
        Variables hỗ trợ: <code>{'{{TEN}}'}</code> và <code>{'{{MO_TA}}'}</code>
      </div>
    </section>
  );
}

