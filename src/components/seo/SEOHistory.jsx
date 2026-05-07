import SEOHistoryItem from './SEOHistoryItem.jsx';

function SEOHistorySkeleton() {
  return (
    <div className="seo-history-skeleton">
      <div className="seo-skeleton seo-skeleton--title" />
      <div className="seo-skeleton seo-skeleton--input" />
      <div className="seo-skeleton seo-skeleton--card" />
      <div className="seo-skeleton seo-skeleton--card" />
      <div className="seo-skeleton seo-skeleton--card" />
    </div>
  );
}

export default function SEOHistory({
  histories,
  isLoading,
  error,
  searchTerm,
  onSearchTermChange,
  expandedHistoryId,
  onToggleHistory,
  onDeleteHistory,
  onCopyTags,
  onReuseHistory,
  copiedKey,
}) {
  return (
    <aside className="seo-panel seo-history">
      <header className="seo-panel__header seo-panel__header--stacked">
        <div>
          <span className="seo-panel__kicker">SEO History</span>
          <h2>Archive & reuse</h2>
        </div>

        <span className="seo-status-pill">
          {histories.length} visible
        </span>
      </header>

      <label className="seo-history__search">
        <span className="seo-history__search-label">Search history</span>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Search by title, tag, count, or date..."
          className="seo-input seo-input--search"
        />
      </label>

      {error && (
        <div className="seo-alert seo-alert--warning" role="alert">
          {error}
        </div>
      )}

      {isLoading ? (
        <SEOHistorySkeleton />
      ) : histories.length ? (
        <div className="seo-history__list">
          {histories.map((item) => (
            <SEOHistoryItem
              key={item.id}
              item={item}
              isOpen={expandedHistoryId === item.id}
              onToggle={onToggleHistory}
              onDelete={onDeleteHistory}
              onCopyTags={onCopyTags}
              onReuse={onReuseHistory}
              copiedKey={copiedKey}
            />
          ))}
        </div>
      ) : (
        <div className="seo-empty-state">
          <div className="seo-empty-state__icon">⌘</div>
          <h3>{searchTerm ? 'No matches found' : 'No history yet'}</h3>
          <p>
            {searchTerm
              ? 'Try another term. Search matches titles, tags, counts, and timestamps.'
              : 'Run your first SEO generation and it will appear here automatically.'}
          </p>
        </div>
      )}
    </aside>
  );
}
