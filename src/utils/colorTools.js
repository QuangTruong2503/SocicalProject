function normalizeHex(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map((char) => char + char)
      .join('')}`.toUpperCase();
  }

  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }

  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  const value = normalized.slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function ensureHexColor(hex, fallback = '#2563EB') {
  return normalizeHex(hex) || normalizeHex(fallback) || '#2563EB';
}

export function hexToRgba(hex, alpha = 1) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0, 0, 0, ${clamp(alpha, 0, 1)})`;

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;
}

export function shiftHexColor(hex, amount = 0) {
  const normalized = ensureHexColor(hex);
  const value = normalized.slice(1);
  const next = [0, 2, 4]
    .map((offset) => clamp(Number.parseInt(value.slice(offset, offset + 2), 16) + amount, 0, 255))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');

  return `#${next.toUpperCase()}`;
}

export function buildThemeAccentVars(accentColor, isDark = false) {
  const accent = ensureHexColor(accentColor);

  if (isDark) {
    // Inline custom properties always win over stylesheet rules (including
    // the `[data-theme='dark']` block), so the dark-mode shades have to be
    // computed here too — lightening instead of darkening keeps text/borders
    // readable against the dark surfaces instead of inheriting light-mode math.
    return {
      '--wm-primary': shiftHexColor(accent, 24),
      '--wm-primary-hover': shiftHexColor(accent, 44),
      '--wm-primary-deep': shiftHexColor(accent, 78),
      '--wm-primary-soft': hexToRgba(accent, 0.18),
      '--wm-primary-ring': hexToRgba(accent, 0.32),
      '--wm-border-strong': hexToRgba(accent, 0.4),
      '--wm-lilac': shiftHexColor(accent, 24),
      '--wm-lilac-soft': hexToRgba(accent, 0.26),
      '--wm-pink-mid': shiftHexColor(accent, 24),
    };
  }

  return {
    '--wm-primary': accent,
    '--wm-primary-hover': shiftHexColor(accent, -18),
    '--wm-primary-deep': shiftHexColor(accent, -54),
    '--wm-primary-soft': hexToRgba(accent, 0.1),
    '--wm-primary-ring': hexToRgba(accent, 0.22),
    '--wm-border-strong': hexToRgba(accent, 0.28),
    '--wm-lilac': accent,
    '--wm-lilac-soft': hexToRgba(accent, 0.16),
    '--wm-pink-mid': accent,
  };
}
