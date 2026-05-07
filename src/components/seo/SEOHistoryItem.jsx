import { memo } from 'react';
import SEOTagList from './SEOTagList.jsx';

function formatHistoryDate(value) {
  if (!value) {
    return 'Unknown time';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function SEOHistoryItem({
  item,
  isOpen,
  onToggle,
  onDelete,
  onCopyTags,
  onReuse,
  copiedKey,
}) {
  const tagPreview = item.seo_tags || [];
  const joinedTags = tagPreview.join(', ');

  return (
    <article className={`seo-history-item ${isOpen ? 'seo-history-item--open' : ''}`}>
      <button
        type="button"
        className="seo-history-item__summary"
        onClick={() => onToggle(item.id)}
        aria-expanded={isOpen}
      >
        <div className="seo-history-item__summary-copy">
          <span className="seo-history-item__title">{item.title}</span>
          <span className="seo-history-item__meta">
            {item.seo_count} keywords • {formatHistoryDate(item.created_at)}
          </span>
        </div>

        <span className="seo-history-item__toggle">{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div className="seo-history-item__body">
          <div className="seo-history-item__body-head">
            <div>
              <span className="seo-history-item__body-label">Tags</span>
              <p>{joinedTags || 'No tags saved for this generation.'}</p>
            </div>

            <div className="seo-history-item__actions">
              <button
                type="button"
                className="seo-button seo-button--inline seo-button--history"
                onClick={() => onCopyTags(item)}
                disabled={!joinedTags}
              >
                {copiedKey === `history-${item.id}` ? 'Copied' : 'Copy tags'}
              </button>
              <button
                type="button"
                className="seo-button seo-button--inline seo-button--history"
                onClick={() => onReuse(item)}
              >
                Reuse
              </button>
              <button
                type="button"
                className="seo-button seo-button--inline seo-button--danger"
                onClick={() => onDelete(item)}
              >
                Delete
              </button>
            </div>
          </div>

          <SEOTagList tags={tagPreview} compact />
        </div>
      )}
    </article>
  );
}

export default memo(SEOHistoryItem);
