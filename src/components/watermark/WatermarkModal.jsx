import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';

/**
 * Shared behavior for the watermark page's dialogs, which keep their own look:
 * portal, backdrop click and Escape to close (unless `busy`), focus trap,
 * page scroll lock, and a labelled `role="dialog"` panel.
 *
 * @param {{
 *   onClose: () => void, busy?: boolean, labelledBy?: string, label?: string, describedBy?: string,
 *   backdropClassName: string, className: string, as?: 'div' | 'section', children: React.ReactNode,
 * }} props
 */
export default function WatermarkModal({
  onClose,
  busy = false,
  labelledBy,
  label,
  describedBy,
  backdropClassName,
  className,
  as = 'div',
  children,
}) {
  const Panel = as;
  const dialogRef = useDialogFocus();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.classList.add('wm-modal-open');

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('wm-modal-open');
    };
  }, [busy, onClose]);

  // Render inside .wm-page: the page's CSS variables (colors, the user's accent
  // theme, dark mode) are scoped there. Portaling to <body> left these dialogs
  // with undefined variables, i.e. a transparent panel. .wm-page creates no
  // stacking context, so the fixed backdrop still covers the site header.
  const container = document.querySelector('.wm-page') || document.body;

  return createPortal(
    <div
      className={backdropClassName}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <Panel
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-describedby={describedBy}
      >
        {children}
      </Panel>
    </div>,
    container,
  );
}
