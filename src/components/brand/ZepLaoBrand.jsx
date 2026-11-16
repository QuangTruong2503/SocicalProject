import { useContext } from 'react';
import { ThemeContext } from '../../context/theme.js';
import { brandAsset, brandToolForRoute } from '../../utils/brandAssets.js';

function useBrandTheme() {
  return useContext(ThemeContext)?.theme === 'dark' ? 'dark' : 'light';
}

export function ZepLaoLogo({ stacked = false, responsive = false, decorative = false, className = '' }) {
  const theme = useBrandTheme();
  const variant = stacked ? 'stacked' : 'horizontal';
  const image = <img className={`zl-logo ${stacked ? 'zl-logo-stacked' : ''} ${className}`}
    src={brandAsset(`logos/zeplao-${variant}-${theme}.svg`)}
    alt={decorative ? '' : 'ZepLao Tools Suite'} width={stacked ? 360 : 392} height={stacked ? 290 : 108} decoding="async" />;
  return responsive && !stacked ? <picture className="zl-logo-picture">
    <source media="(max-width: 540px)" srcSet={brandAsset(`logos/zeplao-horizontal-${theme}-compact.svg`)} />
    {image}
  </picture> : image;
}

export function ZepLaoToolIcon({ name, size = 64, label, className = '' }) {
  const theme = useBrandTheme();
  return <img className={`zl-tool-image ${className}`} src={brandAsset(`icons/tools/${name}-${theme}.svg`)}
    width={size} height={size} style={{ width: size, height: size }} alt={label || ''} aria-hidden={label ? undefined : true} decoding="async" />;
}

export function ZepLaoUIIcon({ name, size = 20, label, className = '' }) {
  return <span className={`zl-ui-icon ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    style={{ '--zl-icon-url': `url("${brandAsset(`icons/ui/${name}.svg`)}")`, width: size, height: size, flexBasis: size }} />;
}

export function ZepLaoRouteIcon({ to, size = 64 }) {
  const name = brandToolForRoute(to);
  return name ? <ZepLaoToolIcon name={name} size={size} /> : <img className="zl-tool-image" src={brandAsset('app/zeplao-app-gradient.svg')} width={size} height={size} style={{ width: size, height: size }} alt="" aria-hidden="true" />;
}
