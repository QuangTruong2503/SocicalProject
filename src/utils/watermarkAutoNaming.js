/**
 * Naming rules of /watermark/auto on top of the shared AI naming contract:
 * the product name is the folder name, files are "<slug-product>-<descriptor>.jpg",
 * unique per "Named" folder (existing files included, case-insensitive).
 */
import { IMAGE_NAME_LIMITS, slugifyFileName } from '../../supabase/functions/suggest-image-names/imageNaming.js';

export const OUTPUT_EXTENSION = 'jpg';
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/**
 * The folder name as the Edge Function will read it: control characters become
 * spaces, runs of spaces collapse, NFC so the length matches what is shown.
 */
export function normalizeProductName(folderName) {
  let output = '';
  for (const char of String(folderName ?? '').normalize('NFC')) {
    const code = char.codePointAt(0);
    output += code < 32 || code === 127 ? ' ' : char;
  }
  return output.replace(/\s+/g, ' ').trim();
}

/** Why this folder name cannot be sent as productName, or null. Never shortened silently. */
export function validateProductName(name) {
  if (!name || !slugifyFileName(name)) return 'Tên thư mục cần có ít nhất một chữ cái hoặc chữ số.';
  if (name.length > IMAGE_NAME_LIMITS.maxProductNameLength) {
    return `Tên thư mục dài ${name.length} ký tự, tối đa ${IMAGE_NAME_LIMITS.maxProductNameLength}. Hãy đổi tên thư mục trên máy rồi chọn lại.`;
  }
  return null;
}

export function productSlug(productName) {
  return slugifyFileName(productName, IMAGE_NAME_LIMITS.maxProductSlugLength) || 'anh-san-pham';
}

/** "may-khoan-bosch-001": the fallback when AI could not describe the image. */
export function fallbackBaseName(productName, position) {
  return `${productSlug(productName)}-${String(Math.max(1, Math.trunc(position) || 1)).padStart(3, '0')}`;
}

/**
 * Base name (no extension) for a validated AI suggestion. The server answers
 * an unclear image with "<product>-<position>"; that becomes the padded
 * fallback "<product>-001" so numbering reads well and stays stable on retry.
 */
export function outputBaseName(suggestedName, productName, position) {
  let base = slugifyFileName(suggestedName, IMAGE_NAME_LIMITS.maxSuggestedNameLength);
  if (!base || base === `${productSlug(productName)}-${position}`) base = fallbackBaseName(productName, position);
  // "con.jpg", "nul.jpg"… cannot exist on Windows.
  if (WINDOWS_RESERVED.test(base)) base = `${base}-anh`;
  return base;
}

/**
 * "<base>.jpg", then "<base>-2.jpg", "-3"… — the first name not in `usedLowercase`.
 * @param {string} baseName
 * @param {Set<string>} usedLowercase names already on disk or reserved, lowercased
 */
export function nextAvailableFileName(baseName, usedLowercase, extension = OUTPUT_EXTENSION) {
  let candidate = `${baseName}.${extension}`;
  for (let suffix = 2; usedLowercase.has(candidate.toLowerCase()); suffix += 1) {
    candidate = `${baseName}-${suffix}.${extension}`;
  }
  return candidate;
}

const STATUS_LABELS = {
  queued: 'Chờ',
  cancelled: 'Chờ (đã dừng)',
  reading: 'Đang đọc ảnh',
  rendering: 'Đang chèn logo',
  naming: 'Đang đặt tên AI',
  resizing: 'Đang chỉnh kích thước',
  writing: 'Đang lưu',
  saved: 'Đã lưu',
  error: 'Lỗi',
};

export const imageStatusLabel = (status) => STATUS_LABELS[status] || status;

/**
 * Local report rows (never sent anywhere): one per image of the run.
 * @param {{ products: Array<{ name: string, relativePath: string, images: Array<object> }> }} snapshot
 */
export function buildReportRows(products) {
  return products.flatMap((product) => product.images.map((image) => ({
    product: product.name,
    folder: product.relativePath,
    source: image.sourceName,
    output: image.status === 'saved' ? `${product.relativePath}/${product.resultFolderName}/${image.outputName}` : '',
    status: imageStatusLabel(image.status),
    needsReview: image.status === 'saved' && image.needsReview,
    error: image.status === 'error' ? image.errorMessage || '' : '',
  })));
}

export const REPORT_CSV_HEADER = ['Sản phẩm', 'Thư mục', 'Ảnh nguồn', 'Ảnh kết quả', 'Trạng thái', 'Cần kiểm tra', 'Lỗi'];

export function reportRowsToCsvRows(rows) {
  return rows.map((row) => [row.product, row.folder, row.source, row.output, row.status, row.needsReview ? 'Có' : '', row.error]);
}

/** "Đã lưu X/Y ảnh trong Named của N sản phẩm; E ảnh lỗi; R ảnh cần kiểm tra." */
export function describeRunSummary({ saved, total, productsWithSaved, errors, review }) {
  return `Đã lưu ${saved}/${total} ảnh trong Named của ${productsWithSaved} sản phẩm; ${errors} ảnh lỗi; ${review} ảnh cần kiểm tra.`;
}

/** Plain-text report for the clipboard. */
export function reportToText(rows, summary) {
  const lines = [summary, ''];
  for (const row of rows) {
    const target = row.output || row.error || row.status;
    lines.push(`${row.folder}/${row.source} → ${target}${row.needsReview ? ' (cần kiểm tra)' : ''}`);
  }
  return lines.join('\n');
}
