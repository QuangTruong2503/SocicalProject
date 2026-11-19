// globalThis.__autoLogo: { url, name, blob } restored as the saved logo (null = none).
export async function loadWatermarkOptions() { return globalThis.__autoOptions ?? null; }
export async function saveWatermarkOptions(options) { globalThis.__autoSavedOptions = options; }
export async function loadLogo() { return globalThis.__autoLogo ?? null; }
export async function saveLogo() {}
export async function clearLogo() {}
export async function clearWatermarkOptions() {}
export async function saveFolderNamingDraft(userId, value) { (globalThis.__folderNamingDrafts ??= new Map()).set(userId, value); }
export async function loadFolderNamingDraft(userId) { return globalThis.__folderNamingDrafts?.get(userId) ?? null; }
