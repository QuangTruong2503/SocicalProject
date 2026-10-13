import { LOGO_POSITIONS, bounded } from './watermarkRender.js';
import { ensureHexColor } from './colorTools.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export const DEFAULT_OPTIONS = {
  size: 60,
  opacity: 60,
  margin: 2,
  tiled: false,
  productName: '',
  logoPosition: 'center',
  accentColor: '#2563EB',
  seasonalEffect: {
    enabled: false,
    season: 'spring',
    density: 30,
    duration: 12,
    opacity: 70,
  },
};

/**
 * Defaults + saved options, value by value. Saved data from older versions may
 * miss keys (or carry invalid ones), so nested objects are merged and every
 * value is validated instead of spreading the saved object wholesale.
 */
export function mergeWatermarkOptions(saved) {
  const source = saved && typeof saved === 'object' ? saved : {};
  const season = source.seasonalEffect && typeof source.seasonalEffect === 'object' ? source.seasonalEffect : {};
  const defaults = DEFAULT_OPTIONS.seasonalEffect;

  return {
    size: bounded(source.size, 10, 200, DEFAULT_OPTIONS.size),
    opacity: bounded(source.opacity, 5, 100, DEFAULT_OPTIONS.opacity),
    margin: bounded(source.margin, 0, 20, DEFAULT_OPTIONS.margin),
    tiled: typeof source.tiled === 'boolean' ? source.tiled : DEFAULT_OPTIONS.tiled,
    productName: typeof source.productName === 'string' ? source.productName.slice(0, 180) : DEFAULT_OPTIONS.productName,
    logoPosition: LOGO_POSITIONS.includes(source.logoPosition) ? source.logoPosition : DEFAULT_OPTIONS.logoPosition,
    accentColor: ensureHexColor(source.accentColor, DEFAULT_OPTIONS.accentColor),
    seasonalEffect: {
      enabled: typeof season.enabled === 'boolean' ? season.enabled : defaults.enabled,
      season: SEASONS.includes(season.season) ? season.season : defaults.season,
      density: bounded(season.density, 10, 80, defaults.density),
      duration: bounded(season.duration, 5, 30, defaults.duration),
      opacity: bounded(season.opacity, 10, 100, defaults.opacity),
    },
  };
}
