import { useState } from 'react';
import { getInitials, getProfileName } from './adminUserLabels.js';
import us from './AdminUsers.module.css';

/** Profile picture with an initials fallback when there is no image or it fails to load. */
export default function AdminUserAvatar({ profile, size = 'small' }) {
  const [failedUrl, setFailedUrl] = useState('');
  const url = profile.avatar_url || '';
  const className = `${us.avatar} ${size === 'large' ? us.avatarLarge : ''}`;

  if (!url || failedUrl === url) {
    return <span className={className} aria-hidden="true">{getInitials(profile)}</span>;
  }

  return (
    <img
      className={className}
      src={url}
      alt={getProfileName(profile)}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
    />
  );
}
