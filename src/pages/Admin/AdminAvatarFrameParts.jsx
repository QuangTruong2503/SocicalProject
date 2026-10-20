import UserAvatar from '../../components/UserAvatar.jsx';
import fs from './AdminAvatarFrames.module.css';

// Neutral sample portrait drawn here, so previews need no external image.
const SAMPLE_AVATAR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#93c5fd"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="40" r="18" fill="#e0e7ff"/><path d="M16 100c4-22 18-32 34-32s30 10 34 32z" fill="#e0e7ff"/></svg>')}`;

/** A frame on a sample avatar: the sample portrait, or initials when `photo` is false. */
export function FramePreview({ frameSrc, frameFallbackSrc = '', frameAnimate = true, photo = true, size = 'small' }) {
  return (
    <span className={`${fs.preview} ${size === 'large' ? fs.previewLarge : ''}`}>
      <UserAvatar src={photo ? SAMPLE_AVATAR : ''} alt="" initials="AB" frameSrc={frameSrc || ''} frameFallbackSrc={frameFallbackSrc} frameAnimate={frameAnimate} />
    </span>
  );
}
