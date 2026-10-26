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

/**
 * Where getUserAvatarUrl() takes the picture from, in the same priority order.
 * @returns {'upload' | 'profile' | 'provider' | 'none'}
 */
export function getUserAvatarSource(user, profile, latestUpload = null) {
  if (cleanString(latestUpload?.image_url)) return 'upload';
  if (cleanString(profile?.avatar_url)) return 'profile';
  if (cleanString(user?.user_metadata?.avatar_url)
    || cleanString(user?.user_metadata?.picture)
    || cleanString(user?.user_metadata?.avatar)) return 'provider';
  return 'none';
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

// Must match the profiles_plan_check constraint; a NULL plan is shown as 'free'.
export const PLAN_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

const PLAN_LABELS = Object.fromEntries(PLAN_OPTIONS.map((option) => [option.value, option.label]));

// Same order as public.plan_rank(); unknown plans rank below Free.
const PLAN_RANK = { free: 0, pro: 1, enterprise: 2 };

/**
 * Admin, or an active account on Pro or higher. Same rule as
 * usage_private.rate_window_exempt (the server decides on every AI request).
 */
export function hasProAccess(profile) {
  if (!profile || profile.status === 'suspended') return false;
  return profile.role === 'admin' || (PLAN_RANK[profile.plan || 'free'] ?? -1) >= PLAN_RANK.pro;
}

export function getPlanLabel(plan) {
  return PLAN_LABELS[plan || 'free'] || plan;
}
