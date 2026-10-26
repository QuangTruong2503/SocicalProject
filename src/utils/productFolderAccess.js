/**
 * Folder access for /watermark/auto (File System Access API, Chrome/Edge desktop).
 * Every handle comes from a directory picker the user opened; nothing here
 * walks the disk on its own. Product folders are read one level deep, results
 * go to "<product>/Named". Source files are only read, never renamed or written.
 */
import { nextAvailableFileName } from './watermarkAutoNaming.js';

export const RESULT_FOLDER_NAME = 'Named';
export const SUPPORTED_IMAGE_TYPES = Object.freeze({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
const PICKER_ID = 'watermark-auto';
const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini', 'ehthumbs.db']);
const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

/** Natural order ("IMG_2" before "IMG_10"), stable for equal names. */
export const naturalCompare = (a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

export const isResultFolderName = (name) => String(name ?? '').trim().toLowerCase() === RESULT_FOLDER_NAME.toLowerCase();

const isSystemFile = (name) => name.startsWith('.') || SYSTEM_FILES.has(name.toLowerCase());

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export const isSupportedImageName = (name) => Boolean(SUPPORTED_IMAGE_TYPES[extensionOf(name)]);

/** Error with a stable code the UI can explain. */
export class FolderAccessError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'FolderAccessError';
    this.code = code;
  }
}

/**
 * Whether direct saving into the chosen folders is possible here. Feature
 * detection, not browser sniffing.
 * @returns {{ supported: boolean, reason: null | 'insecure' | 'no_picker' }}
 */
export function getFolderAccessSupport(win = globalThis.window) {
  if (!win?.isSecureContext) return { supported: false, reason: 'insecure' };
  if (typeof win.showDirectoryPicker !== 'function') return { supported: false, reason: 'no_picker' };
  return { supported: true, reason: null };
}

/** Must be called straight from a click. Resolves null when the user closes the dialog. */
export async function pickDirectory(win = globalThis.window) {
  try {
    return await win.showDirectoryPicker({ mode: 'readwrite', id: PICKER_ID });
  } catch (error) {
    if (error?.name === 'AbortError') return null;
    if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') {
      throw new FolderAccessError('picker_blocked', 'Trình duyệt không cho mở thư mục này (thư mục hệ thống hoặc bị chặn). Hãy chọn thư mục khác.');
    }
    throw error;
  }
}

/**
 * 'granted' | 'prompt' | 'denied'. `request: true` may show the browser's
 * permission prompt, so it is only used from a button the user pressed.
 */
export async function getWritePermission(handle, { request = false } = {}) {
  const descriptor = { mode: 'readwrite' };
  try {
    // Without the permission API (older engines), a readwrite picker grant is all there is.
    if (typeof handle?.queryPermission !== 'function') return 'granted';
    const state = await handle.queryPermission(descriptor);
    if (state === 'granted' || !request) return state;
    if (typeof handle.requestPermission !== 'function') return state;
    return await handle.requestPermission(descriptor);
  } catch {
    return 'denied';
  }
}

export async function isSameFolder(a, b) {
  if (a === b) return true;
  try {
    return typeof a?.isSameEntry === 'function' ? await a.isSameEntry(b) : false;
  } catch {
    return false;
  }
}

/** Checks the first bytes: a broken or mislabelled file is not sent to the queue. */
async function hasImageSignature(file) {
  try {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
    const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
    const isWebp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    return isJpeg || isPng || isWebp;
  } catch {
    return false;
  }
}

/**
 * Reads the images directly inside one product folder.
 * @returns {Promise<{
 *   handle: FileSystemDirectoryHandle, folderName: string, relativePath: string,
 *   images: Array<{ handle: FileSystemFileHandle, name: string, size: number, lastModified: number, type: string }>,
 *   unsupported: number, invalid: number, nestedFolders: number,
 *   namedHandle: FileSystemDirectoryHandle | null, namedIsFile: boolean,
 * }>}
 */
export async function scanProductFolder(handle, { relativePath = handle.name } = {}) {
  const images = [];
  let unsupported = 0;
  let invalid = 0;
  let nestedFolders = 0;
  let namedHandle = null;
  let namedIsFile = false;

  for await (const entry of handle.values()) {
    if (isResultFolderName(entry.name)) {
      // An existing "Named"/"named" folder is reused as is and never read as input.
      if (entry.kind === 'directory') namedHandle ??= entry;
      else namedIsFile = true;
      continue;
    }
    if (entry.kind === 'directory') {
      nestedFolders += 1;
      continue;
    }
    if (isSystemFile(entry.name)) continue;
    if (!isSupportedImageName(entry.name)) {
      unsupported += 1;
      continue;
    }

    let file;
    try {
      file = await entry.getFile();
    } catch {
      invalid += 1;
      continue;
    }
    if (!file.size || !(await hasImageSignature(file))) {
      invalid += 1;
      continue;
    }
    images.push({
      handle: entry,
      name: entry.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type || SUPPORTED_IMAGE_TYPES[extensionOf(entry.name)],
    });
  }

  images.sort((a, b) => naturalCompare(a.name, b.name));
  return { handle, folderName: handle.name, relativePath, images, unsupported, invalid, nestedFolders, namedHandle, namedIsFile };
}

/**
 * Every direct sub-folder of a parent becomes a product; images at the
 * parent's root and folders called "Named" are skipped and counted.
 */
export async function scanParentFolder(parentHandle) {
  const folders = [];
  let rootImages = 0;
  let namedSkipped = 0;

  for await (const entry of parentHandle.values()) {
    if (entry.kind === 'directory') {
      if (isResultFolderName(entry.name)) namedSkipped += 1;
      else folders.push(entry);
    } else if (!isSystemFile(entry.name) && isSupportedImageName(entry.name)) {
      rootImages += 1;
    }
  }

  folders.sort((a, b) => naturalCompare(a.name, b.name));
  const products = [];
  for (const folder of folders) {
    products.push(await scanProductFolder(folder, { relativePath: `${parentHandle.name}/${folder.name}` }));
  }
  return { products, rootImages, namedSkipped };
}

/**
 * The current File behind a scanned image, or a 'source_changed' error when it
 * was edited, replaced or removed since the scan (a cached AI name would then
 * describe other content).
 */
export async function readSourceFile(image) {
  let file;
  try {
    file = await image.handle.getFile();
  } catch (error) {
    if (error?.name === 'NotFoundError') throw new FolderAccessError('source_changed', 'Ảnh nguồn đã bị xóa hoặc di chuyển.');
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw new FolderAccessError('permission', 'Mất quyền đọc thư mục.');
    throw new FolderAccessError('read_failed', 'Không đọc được ảnh nguồn.');
  }
  if (file.size !== image.size || file.lastModified !== image.lastModified) {
    throw new FolderAccessError('source_changed', 'Ảnh nguồn đã thay đổi sau khi quét.');
  }
  return file;
}

/**
 * Maps a browser file-system error to a code:
 * 'disk_full' stops the whole run, 'permission' / 'not_found' / 'named_is_file'
 * block one product, anything else fails one image.
 */
export function classifyFileError(error) {
  if (error instanceof FolderAccessError) return error.code;
  switch (error?.name) {
    case 'QuotaExceededError': return 'disk_full';
    case 'NotAllowedError':
    case 'SecurityError': return 'permission';
    case 'NotFoundError': return 'not_found';
    case 'TypeMismatchError': return 'named_is_file';
    case 'NoModificationAllowedError': return 'locked';
    default: return 'write_failed';
  }
}

async function findResultFolder(productHandle) {
  for await (const entry of productHandle.values()) {
    if (isResultFolderName(entry.name)) return entry;
  }
  return null;
}

async function entryExists(directory, name) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') return false;
    // A folder with that name: also taken.
    if (error?.name === 'TypeMismatchError') return true;
    throw error;
  }
}

const SAFE_FILE_NAME = /^[a-z0-9][a-z0-9-]*\.jpg$/;

/**
 * One writer per product folder and run: the only place that creates files in
 * "<product>/Named". Names are handed out one at a time, checked against what
 * is on disk (case-insensitive) right before the file is created, and a file
 * that existed before is never opened for writing.
 *
 * File System Access cannot lock a folder against other programs; this keeps
 * the app's own writes from colliding and re-checks at the last moment.
 */
export function createNamedFolderWriter(productHandle, { namedHandle = null } = {}) {
  let directory = namedHandle;
  let used = null;
  // Names this writer created but could not finish; a retry may reuse them.
  const unfinished = new Set();

  async function ensureDirectory() {
    if (directory) return directory;
    const existing = await findResultFolder(productHandle);
    if (existing && existing.kind !== 'directory') {
      throw new FolderAccessError('named_is_file', `Trong thư mục đã có một file tên “${existing.name}”, nên không tạo được thư mục ${RESULT_FOLDER_NAME}.`);
    }
    directory = existing || await productHandle.getDirectoryHandle(RESULT_FOLDER_NAME, { create: true });
    return directory;
  }

  async function usedNames() {
    if (used) return used;
    const target = await ensureDirectory();
    used = new Set();
    for await (const name of target.keys()) used.add(name.toLowerCase());
    return used;
  }

  return {
    get folderName() {
      return directory?.name ?? RESULT_FOLDER_NAME;
    },

    /**
     * Writes `blob` as "<baseName>.jpg" (or "-2", "-3"… when taken) and
     * resolves with the final name once close() succeeded.
     * @param {string} baseName slug without extension
     * @param {Blob} blob
     * @param {{ preferredName?: string | null }} [options] the name a failed earlier attempt reserved
     */
    async write(baseName, blob, { preferredName = null } = {}) {
      const target = await ensureDirectory();
      const names = await usedNames();
      let preferred = preferredName && unfinished.has(preferredName.toLowerCase()) ? preferredName : null;

      for (let attempt = 0; attempt < 10000; attempt += 1) {
        const name = preferred || nextAvailableFileName(baseName, names);
        preferred = null;
        if (!SAFE_FILE_NAME.test(name)) throw new FolderAccessError('write_failed', 'Tên file không hợp lệ.');
        if (await entryExists(target, name)) {
          // Created by someone else since the listing: take the next suffix.
          names.add(name.toLowerCase());
          unfinished.delete(name.toLowerCase());
          continue;
        }

        names.add(name.toLowerCase());
        unfinished.add(name.toLowerCase());
        const fileHandle = await target.getFileHandle(name, { create: true });
        let writable = null;
        try {
          writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          await writable?.abort?.().catch(() => {});
          // The empty file was created by this attempt and never completed.
          await target.removeEntry(name).catch(() => {});
          error.attemptedName = name;
          throw error;
        }
        unfinished.delete(name.toLowerCase());
        return name;
      }
      throw new FolderAccessError('write_failed', 'Không tìm được tên file còn trống.');
    },
  };
}
