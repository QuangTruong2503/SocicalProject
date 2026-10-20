import { useState } from 'react';
import { getInitials, getProfileName } from './adminUserLabels.js';
import us from './AdminUsers.module.css';

/**
 * Profile picture with an initials fallback when there is no image or it fails to load.
 * `frameSrc` adds the user's avatar frame on top (decorative; dropped if it fails to load).
 */
export default function AdminUserAvatar({ profile, size = 'small', frameSrc = '' }) {
  const [failedUrl, setFailedUrl] = useState('');
  const [failedFrame, setFailedFrame] = useState('');
  const url = profile.avatar_url || '';
  const className = `${us.avatar} ${size === 'large' ? us.avatarLarge : ''}`;

  const picture = !url || failedUrl === url
    ? <span className={className} aria-hidden="true">{getInitials(profile)}</span>
    : (
      <img
        className={className}
        src={url}
        alt={getProfileName(profile)}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)}
      />
    );

  if (!frameSrc || failedFrame === frameSrc) {
    return picture;
  }

  return (
    <span className={us.avatarFramed}>
      {picture}
      <img className={us.avatarFrame} src={frameSrc} alt="" aria-hidden="true" draggable="false" onError={() => setFailedFrame(frameSrc)} />
    </span>
  );
}
