function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getUserDisplayName(user, profile) {
  const fullName = cleanString(profile?.full_name);
  if (fullName) {
    return fullName;
  }

  const profileName = cleanString(profile?.username);
  if (profileName) {
    return profileName;
  }

  const metadataName = cleanString(user?.user_metadata?.full_name)
    || cleanString(user?.user_metadata?.name)
    || cleanString(user?.user_metadata?.username);

  if (metadataName) {
    return metadataName;
  }

  const email = cleanString(profile?.email) || cleanString(user?.email);
  if (email) {
    return email.split('@')[0];
  }

  return 'User';
}

export function getUserAvatarUrl(user, profile, latestUpload = null) {
  return cleanString(latestUpload?.image_url)
    || cleanString(profile?.avatar_url)
    || cleanString(user?.user_metadata?.avatar_url)
    || cleanString(user?.user_metadata?.picture)
    || cleanString(user?.user_metadata?.avatar)
    || '';
}

export function getUserInitials(user, profile) {
  const source = getUserDisplayName(user, profile);
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'U';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
