import { memo } from 'react';

function SEOTagList({ tags = [], onTagClick = null, compact = false, emptyLabel = 'Chưa có keyword.' }) {
  if (!tags.length) {
    return <div className="seo-tag-list__empty">{emptyLabel}</div>;
  }

  return (
    <ul className={`seo-tag-list ${compact ? 'seo-tag-list--compact' : ''}`}>
      {tags.map((tag, index) => {
        const content = (
          <>
            <span className="seo-tag-list__chip-label">{tag}</span>
            {onTagClick && <span className="seo-tag-list__chip-action">Copy</span>}
          </>
        );

        return (
          <li key={`${tag}-${index}`}>
            {onTagClick ? (
              <button
                type="button"
                className="seo-tag-pill"
                onClick={() => onTagClick(tag)}
              >
                {content}
              </button>
            ) : (
              <span className="seo-tag-pill seo-tag-pill--static">{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default memo(SEOTagList);
