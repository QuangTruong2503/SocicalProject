import { useState } from 'react';
import { useInViewport, useMotionPreferences } from '../hooks/useFrameMotion.js';
import '../styles/UserAvatar.css';

/**
 * Renders the user's avatar inside a sized container provided by the parent.
 * - While `isReady` is false (profile/uploads still loading) a pulsing placeholder is shown,
 *   so we never flash a provisional image (e.g. the Google picture) before the real one.
 * - The image fades in once it has actually loaded; on error it falls back to initials.
 * - Passing `frameSrc` (a URL, or '' for no frame) switches to the layered layout: the
 *   picture is clipped to a circle and the decorative frame sits on top, AVATAR_FRAME_SCALE
 *   times larger, without catching clicks. The parent must then not clip its overflow.
 * - Animated frames: pass `frameFallbackSrc` (the still image). The browser plays the
 *   APNG/WebP itself; the still is shown instead when `frameAnimate` is false, the user
 *   prefers reduced motion, the tab is hidden or the avatar is off screen. If the animation
 *   fails the still is tried; if that fails too, only the frame is dropped.
 */
export default function UserAvatar({
  src,
  alt,
  initials,
  isReady = true,
  imageClassName = '',
  fallbackClassName = '',
  frameSrc,
  frameFallbackSrc = '',
  frameAnimate = true,
  frameClassName = '',
}) {
  const [loadedSrc, setLoadedSrc] = useState('');
  const [failedSrc, setFailedSrc] = useState('');
  const [loadedFrame, setLoadedFrame] = useState('');
  const [failedFrames, setFailedFrames] = useState([]);
  const [layers, setLayers] = useState(null);
  const isAnimated = Boolean(frameSrc && frameFallbackSrc);
  const { reducedMotion, hidden } = useMotionPreferences();
  const onScreen = useInViewport(layers, isAnimated && frameAnimate);

  let picture;

  if (!isReady) {
    picture = <span className="user-avatar-skeleton" aria-hidden="true" />;
  } else if (!src || failedSrc === src) {
    picture = <span className={fallbackClassName}>{initials}</span>;
  } else {
    picture = (
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

  if (frameSrc === undefined) {
    return picture;
  }

  const animate = isAnimated && frameAnimate && !reducedMotion && !hidden && onScreen;
  const candidates = !isAnimated ? [frameSrc] : animate ? [frameSrc, frameFallbackSrc] : [frameFallbackSrc];
  const shownFrame = isReady ? candidates.find((candidate) => candidate && !failedFrames.includes(candidate)) : undefined;

  return (
    <span className="user-avatar-layers" ref={setLayers}>
      <span className="user-avatar-clip">{picture}</span>
      {shownFrame && (
        <img
          // Keyed by the frame, not the variant: switching to the still keeps the element in place.
          key={frameSrc}
          src={shownFrame}
          alt=""
          aria-hidden="true"
          draggable="false"
          decoding="async"
          data-avatar-frame=""
          data-frame-state={isAnimated ? (shownFrame === frameSrc ? 'animated' : 'still') : 'static'}
          className={`user-avatar-frame ${loadedFrame === frameSrc ? 'is-loaded' : ''} ${frameClassName}`.trim()}
          onLoad={() => setLoadedFrame(frameSrc)}
          onError={() => setFailedFrames((current) => (current.includes(shownFrame) ? current : [...current, shownFrame]))}
        />
      )}
    </span>
  );
}
