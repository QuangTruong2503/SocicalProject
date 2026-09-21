export const HARAVAN_PRESETS = [
  { name: 'Minh Triết', prefix: 'https://cdn.hstatic.net/files/1000033760/file/' },
  { name: 'Himarket', prefix: 'https://file.hstatic.net/1000216987/file/' },
  { name: 'Máy Dụng Cụ', prefix: 'https://cdn.hstatic.net/files/200000966291/file/' },
  { name: 'Minh Tâm', prefix: 'https://cdn.hstatic.net/files/200000974622/file/' },
];

const STORAGE_KEY = 'watermark.haravan.preferences.v1';

export function normalizeHaravanPrefix(value) {
  try {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    return null;
  }
}

export function loadHaravanPreferences() {
  const fallback = { customOptions: [], selectedPrefix: HARAVAN_PRESETS[0].prefix };
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const seen = new Set(HARAVAN_PRESETS.map((option) => option.prefix));
    const customOptions = [];
    for (const option of Array.isArray(saved?.customOptions) ? saved.customOptions : []) {
      const name = typeof option?.name === 'string' ? option.name.trim().slice(0, 80) : '';
      const prefix = normalizeHaravanPrefix(option?.prefix);
      if (name && prefix && !seen.has(prefix)) {
        seen.add(prefix);
        customOptions.push({ name, prefix });
      }
    }
    return {
      customOptions,
      selectedPrefix: seen.has(saved?.selectedPrefix) ? saved.selectedPrefix : fallback.selectedPrefix,
    };
  } catch {
    return fallback;
  }
}

export function saveHaravanPreferences(preferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
