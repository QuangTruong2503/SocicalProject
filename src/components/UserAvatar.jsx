import { useState } from 'react';
import '../styles/UserAvatar.css';

/**
 * Renders the user's avatar inside a sized container provided by the parent.
 * - While `isReady` is false (profile/uploads still loading) a pulsing placeholder is shown,
 *   so we never flash a provisional image (e.g. the Google picture) before the real one.
 * - The image fades in once it has actually loaded; on error it falls back to initials.
 */
export default function UserAvatar({ src, alt, initials, isReady = true, imageClassName = '', fallbackClassName = '' }) {
  const [loadedSrc, setLoadedSrc] = useState('');
  const [failedSrc, setFailedSrc] = useState('');

  if (!isReady) {
    return <span className="user-avatar-skeleton" aria-hidden="true" />;
  }

  if (!src || failedSrc === src) {
    return <span className={fallbackClassName}>{initials}</span>;
  }

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      className={`user-avatar-fade ${loadedSrc === src ? 'is-loaded' : ''} ${imageClassName}`.trim()}
      onLoad={() => setLoadedSrc(src)}
      onError={() => setFailedSrc(src)}
    />
  );
}
