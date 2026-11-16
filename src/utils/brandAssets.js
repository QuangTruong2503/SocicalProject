export const BRAND_NAME = 'ZepLao';
export const BRAND_TITLE = 'ZepLao Tools Suite';

export function brandAsset(path, base = import.meta.env?.BASE_URL || '/') {
  return `${base.replace(/\/?$/, '/')}brand/zeplao/${path}`;
}

// Keep the approved mapping on the canonical URLs used by this repository.
export const BRAND_TOOL_ROUTES = [
  ['/bao-gia-minh-triet', 'quote-minh-triet'],
  ['/bao-gia-knm', 'quote-knm'],
  ['/link-anh-san-pham', 'image-links'],
  ['/tools/watermark', 'watermark'],
  ['/tools/chuyen-doi-file', 'convert'],
  ['/watermark', 'watermark'],
  ['/chuyen-doi-file', 'convert'],
  ['/dashboard/profile', 'profile'],
  ['/dashboard/avatar', 'profile'],
  ['/dashboard', 'dashboard'],
  ['/memory-game', 'memory'],
  ['/admin', 'admin'],
];

export function brandToolForRoute(path) {
  return BRAND_TOOL_ROUTES.find(([route]) => path === route || path.startsWith(`${route}/`))?.[1];
}
