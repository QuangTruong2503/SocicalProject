import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';
import '../../styles/ImageLightbox.css';

const SWIPE_THRESHOLD_PX = 50;

/**
 * Full-screen image viewer: Esc / backdrop / ✕ closes, ← → (or swipe) navigates,
 * click the image or the zoom button to toggle actual size.
 * items: [{ url, title, kicker?, downloadName? }]
 */
export default function ImageLightbox({ items, initialIndex = 0, isClosing = false, onClose }) {
  const count = items.length;
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, count - 1)));
  const [isZoomed, setIsZoomed] = useState(false);
  const dialogRef = useDialogFocus();
  const swipeStartRef = useRef(null);
  const safeIndex = Math.min(index, count - 1);
  const item = items[safeIndex];
  const hasMultiple = count > 1;

  const go = useCallback((step) => {
    if (count < 2) return;
    setIndex((current) => (current + step + count) % count);
    setIsZoomed(false);
  }, [count]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        go(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [go, onClose]);

  // Warm the cache so stepping through the set feels instant.
  useEffect(() => {
    if (!hasMultiple) return;
    [items[(safeIndex + 1) % count], items[(safeIndex - 1 + count) % count]].forEach((neighbor) => {
      if (neighbor?.url) new Image().src = neighbor.url;
    });
  }, [count, hasMultiple, items, safeIndex]);

  if (!item) return null;

  const handlePointerDown = (event) => {
    if (event.pointerType !== 'touch' || isZoomed) return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(event.clientY - start.y)) {
      go(dx > 0 ? -1 : 1);
    }
  };

  return createPortal(
    <div
      className={`wm-preview-backdrop wm-lightbox${isClosing ? ' is-closing' : ''}`}
      role="presentation"
      onPointerDown={onClose}
    >
      <div
        className="wm-lightbox__dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Xem ảnh ${item.title}`}
        aria-describedby="wm-lightbox-hint"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="wm-lightbox__bar">
          <div className="wm-lightbox__heading">
            {item.kicker && <span className="wm-lightbox__kicker">{item.kicker}</span>}
            <strong className="wm-lightbox__title" title={item.title}>{item.title}</strong>
          </div>

          <div className="wm-lightbox__tools">
            {hasMultiple && (
              <span className="wm-lightbox__counter" aria-live="polite">
                {safeIndex + 1} / {count}
              </span>
            )}
            <button
              className="wm-lightbox__tool"
              type="button"
              onClick={() => setIsZoomed((value) => !value)}
              aria-pressed={isZoomed}
              aria-label={isZoomed ? 'Thu nhỏ vừa khung' : 'Phóng to kích thước thật'}
              title={isZoomed ? 'Thu nhỏ vừa khung' : 'Phóng to kích thước thật'}
            >
              <span aria-hidden="true">{isZoomed ? '⊖' : '⊕'}</span>
            </button>
            <a
              className="wm-lightbox__tool"
              href={item.url}
              download={item.downloadName || item.title}
              aria-label={`Tải ${item.title}`}
              title="Tải ảnh này"
            >
              <span aria-hidden="true">↓</span>
            </a>
            <button
              className="wm-lightbox__close"
              type="button"
              onClick={onClose}
              aria-label="Đóng (Esc)"
              title="Đóng (Esc)"
              data-dialog-initial
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </header>

        <div className="wm-lightbox__stage">
          <div
            className={`wm-lightbox__scroller${isZoomed ? ' is-zoomed' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { swipeStartRef.current = null; }}
          >
            <img
              key={item.url}
              className="wm-lightbox__image"
              src={item.url}
              alt={item.title}
              draggable={false}
              onClick={() => setIsZoomed((value) => !value)}
            />
          </div>

          {hasMultiple && (
            <>
              <button
                className="wm-lightbox__nav wm-lightbox__nav--prev"
                type="button"
                onClick={() => go(-1)}
                aria-label="Ảnh trước (←)"
                title="Ảnh trước (←)"
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                className="wm-lightbox__nav wm-lightbox__nav--next"
                type="button"
                onClick={() => go(1)}
                aria-label="Ảnh tiếp theo (→)"
                title="Ảnh tiếp theo (→)"
              >
                <span aria-hidden="true">›</span>
              </button>
            </>
          )}
        </div>

        <p className="wm-lightbox__hint" id="wm-lightbox-hint">
          <span className="wm-lightbox__hint-keys">
            <kbd>Esc</kbd> hoặc bấm ra ngoài để đóng
            {hasMultiple && <> · <kbd>←</kbd> <kbd>→</kbd> chuyển ảnh</>}
            {' '}· Bấm vào ảnh để phóng to
          </span>
          <span className="wm-lightbox__hint-touch">
            {hasMultiple ? 'Vuốt ngang để chuyển ảnh · ' : ''}Chạm ✕ để đóng
          </span>
        </p>
      </div>
    </div>,
    document.body
  );
}
