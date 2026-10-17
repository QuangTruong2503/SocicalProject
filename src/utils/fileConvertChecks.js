const MB = 1024 * 1024;

/** Accept maps for react-dropzone plus the limits each tool enforces. */
export const FILE_RULES = {
  image: {
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    kinds: ['jpeg', 'png'],
    label: 'JPG, JPEG, PNG',
    maxFileSize: 25 * MB,
    maxFiles: 60,
    maxTotalSize: 250 * MB,
  },
  pdf: {
    accept: { 'application/pdf': ['.pdf'] },
    kinds: ['pdf'],
    label: 'PDF',
    maxFileSize: 150 * MB,
    maxFiles: 1,
    maxTotalSize: 150 * MB,
  },
  pdfMerge: {
    accept: { 'application/pdf': ['.pdf'] },
    kinds: ['pdf'],
    label: 'PDF',
    maxFileSize: 100 * MB,
    maxFiles: 30,
    maxTotalSize: 300 * MB,
  },
};

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const [value, unit] = bytes < MB ? [bytes / 1024, 'KB'] : [bytes / MB, 'MB'];
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${unit}`;
}

/**
 * Identifies JPEG/PNG/PDF from the first bytes so a renamed file is caught
 * before it reaches a decoder.
 *
 * @param {Uint8Array} bytes
 * @returns {'jpeg' | 'png' | 'pdf' | ''}
 */
export function sniffFileKind(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((value, index) => bytes[index] === value)) return 'png';
  // PDF readers accept up to 1 KB of junk before the header.
  const limit = Math.min(bytes.length - 4, 1024);
  for (let index = 0; index < limit; index += 1) {
    if (bytes[index] === 0x25 && bytes[index + 1] === 0x50 && bytes[index + 2] === 0x44 && bytes[index + 3] === 0x46 && bytes[index + 4] === 0x2d) return 'pdf';
  }
  return '';
}

/**
 * Reads the head of a file and checks it is one of the expected kinds.
 *
 * @param {File} file
 * @param {string[]} kinds
 * @returns {Promise<string>} the detected kind
 */
export async function assertFileKind(file, kinds) {
  let head;
  try {
    head = new Uint8Array(await file.slice(0, 1032).arrayBuffer());
  } catch {
    throw new Error('Không đọc được file. File có thể đã bị di chuyển hoặc bị khóa.');
  }
  if (!head.length) throw new Error('File rỗng.');
  const kind = sniffFileKind(head);
  if (!kinds.includes(kind)) {
    throw new Error(kinds.includes('pdf') ? 'Nội dung không phải PDF (có thể chỉ đổi đuôi .pdf).' : 'Nội dung không phải ảnh JPG hoặc PNG.');
  }
  return kind;
}

/** react-dropzone validator: rejects zero-byte files with a custom code. */
export function rejectEmptyFile(file) {
  return file.size === 0 ? { code: 'file-empty', message: 'File rỗng.' } : null;
}

/**
 * Turns react-dropzone rejections into readable lines.
 *
 * @param {{ file: File, errors: { code: string }[] }[]} rejections
 * @param {{ label: string, maxFileSize: number }} rules
 * @returns {string[]}
 */
export function describeRejections(rejections, rules) {
  return rejections.map(({ file, errors }) => {
    const code = errors[0]?.code;
    const reason = {
      'file-invalid-type': `không đúng định dạng (chỉ nhận ${rules.label})`,
      'file-too-large': `vượt quá ${formatBytes(rules.maxFileSize)}`,
      'file-empty': 'file rỗng',
      'too-many-files': 'chỉ chọn một file',
    }[code] || 'không hợp lệ';
    return `${file.name}: ${reason}.`;
  });
}

/**
 * Splits accepted files into those that fit the remaining count/size budget
 * and those that do not.
 *
 * @param {File[]} files incoming files
 * @param {File[]} existing files already in the list
 * @param {{ maxFiles: number, maxTotalSize: number }} rules
 * @returns {{ accepted: File[], messages: string[] }}
 */
export function fitFileBudget(files, existing, rules) {
  const accepted = [];
  const messages = [];
  let count = existing.length;
  let total = existing.reduce((sum, file) => sum + file.size, 0);

  for (const file of files) {
    if (count >= rules.maxFiles) {
      messages.push(`${file.name}: đã đạt tối đa ${rules.maxFiles} file.`);
      continue;
    }
    if (total + file.size > rules.maxTotalSize) {
      messages.push(`${file.name}: tổng dung lượng vượt quá ${formatBytes(rules.maxTotalSize)}.`);
      continue;
    }
    accepted.push(file);
    count += 1;
    total += file.size;
  }
  return { accepted, messages };
}

/**
 * @param {string} name
 * @returns {string}
 */
export function baseName(name) {
  const trimmed = String(name || '').replace(/\.[^./\\]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return trimmed || 'tai-lieu';
}

let idCounter = 0;
export function nextFileId() {
  idCounter += 1;
  return `f${Date.now().toString(36)}${idCounter}`;
}

/**
 * Moves an item in an array; out-of-range targets leave the array as is.
 *
 * @template T
 * @param {T[]} items
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveItem(items, from, to) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
