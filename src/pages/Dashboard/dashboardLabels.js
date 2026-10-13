import { ACCESS_LEVEL_OPTIONS } from '../../services/productLinkService.js';

const PROVIDER_LABELS = { email: 'Email', google: 'Google' };

export function getAuthProviderLabel(user) {
  const providers = user?.app_metadata?.providers;
  const list = Array.isArray(providers) && providers.length > 0
    ? providers
    : [user?.app_metadata?.provider].filter(Boolean);

  return list.length ? list.map((provider) => PROVIDER_LABELS[provider] || provider).join(', ') : 'Không rõ';
}

// product_links_level(): 0 none, 1 viewer, 2 checker, 3 editor
const LEVEL_VALUES = ['', 'viewer', 'checker', 'editor'];

export function getProductLinkLevelLabel(level) {
  const value = LEVEL_VALUES[Number(level) || 0] ?? '';
  return ACCESS_LEVEL_OPTIONS.find((option) => option.value === value)?.label || 'Không có quyền';
}
