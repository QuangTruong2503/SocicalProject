import { isSameFolder } from './productFolderAccess.js';
import { getOutputFolderName } from './watermarkAutoFolderNames.js';

export function getFolderDraftSelection(products) {
  return products.map((product) => ({ id: product.excelId, name: getOutputFolderName(product), handle: product.handle }));
}

export function getFolderDraftSelectionKey(folders) {
  return JSON.stringify(folders.map(({ id, name }) => [id, name]));
}

// Excel IDs are recreated on a new page. Match directory handles and the exact
// input name before attaching a previous result or manual edit to a new ID.
export async function restoreFolderNamingDraft(saved, folders) {
  const restored = { folders, suggestions: new Map(), edits: new Map(), pending: [], started: false };
  if (!saved?.folders || folders.length === 0) return restored;

  const candidates = new Map();
  for (const folder of folders) {
    const group = candidates.get(folder.name) ?? [];
    group.push(folder);
    candidates.set(folder.name, group);
  }

  const ids = new Map();
  const usedIds = new Set();
  for (const previous of saved.folders) {
    for (const folder of candidates.get(previous.name) ?? []) {
      if (!usedIds.has(folder.id) && await isSameFolder(folder.handle, previous.handle)) {
        ids.set(previous.id, folder.id);
        usedIds.add(folder.id);
        break;
      }
    }
  }

  for (const [previousId, id] of ids) {
    if (saved.suggestions?.has(previousId)) restored.suggestions.set(id, saved.suggestions.get(previousId));
    if (saved.edits?.has(previousId)) restored.edits.set(id, saved.edits.get(previousId));
  }
  const pending = Array.isArray(saved.pending) ? saved.pending : [saved.pending].filter(Boolean);
  for (const batch of pending) {
    const targets = batch.targets.map((id) => ids.get(id) ?? null);
    if (targets.some(Boolean)) restored.pending.push({ ...batch, targets });
  }
  restored.started = Boolean((ids.size && saved.started) || restored.pending.length);
  return restored;
}
