import { sniffFileKind } from './fileConvertChecks.js';

let pdfLibPromise = null;
function loadPdfLib() {
  if (!pdfLibPromise) {
    pdfLibPromise = import('pdf-lib').catch((error) => {
      pdfLibPromise = null;
      throw new Error('Không tải được thư viện xử lý PDF. Hãy tải lại trang.', { cause: error });
    });
  }
  return pdfLibPromise;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Loads a PDF with pdf-lib, turning its errors into readable messages.
 *
 * @param {File | Uint8Array} source
 * @param {string} name used in messages
 */
export async function loadEditablePdf(source, name) {
  const { PDFDocument, EncryptedPDFError } = await loadPdfLib();
  let bytes;
  try {
    bytes = source instanceof Uint8Array ? source : new Uint8Array(await source.arrayBuffer());
  } catch {
    throw new Error(`“${name}”: không đọc được file.`);
  }
  if (!bytes.length) throw new Error(`“${name}”: file rỗng.`);
  if (sniffFileKind(bytes.subarray(0, 1032)) !== 'pdf') throw new Error(`“${name}”: nội dung không phải PDF.`);

  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    // pdf-lib's ES5-compiled error classes break `instanceof`, so match the message too.
    if (error instanceof EncryptedPDFError || /encrypted/i.test(error?.message || '')) {
      throw new Error(`“${name}” được mã hóa hoặc đặt mật khẩu nên không thể chỉnh sửa. Hãy gỡ bảo vệ rồi thử lại.`, { cause: error });
    }
    throw new Error(`“${name}” bị hỏng hoặc dùng cấu trúc PDF không được hỗ trợ.`, { cause: error });
  }
  // pdf-lib parses leniently: a badly damaged file can load with no pages.
  if (doc.getPageCount() < 1) throw new Error(`“${name}” bị hỏng hoặc không có trang nào.`);
  return doc;
}

async function saveToBlob(doc) {
  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Concatenates every page of `files`, in order. Each source is loaded,
 * copied and released before the next.
 *
 * @param {File[]} files
 * @param {{ onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} [hooks]
 * @returns {Promise<{ blob: Blob, pageCount: number }>}
 */
export async function mergePdfs(files, { onProgress, signal } = {}) {
  if (files.length < 2) throw new Error('Cần ít nhất 2 file PDF để gộp.');
  const { PDFDocument } = await loadPdfLib();
  const output = await PDFDocument.create();

  for (let index = 0; index < files.length; index += 1) {
    signal?.throwIfAborted();
    const file = files[index];
    const source = await loadEditablePdf(file, file.name);
    try {
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => output.addPage(page));
    } catch (error) {
      throw new Error(`“${file.name}” có trang bị lỗi nên không sao chép được.`, { cause: error });
    }
    onProgress?.(index + 1, files.length);
    await tick();
  }

  signal?.throwIfAborted();
  return { blob: await saveToBlob(output), pageCount: output.getPageCount() };
}

/**
 * New PDF holding `pages` (1-based) of `file`, in the given order.
 *
 * @param {File} file
 * @param {number[]} pages
 * @returns {Promise<{ blob: Blob, pageCount: number }>}
 */
export async function extractPdfPages(file, pages) {
  if (!pages.length) throw new Error('Chưa chọn trang nào.');
  const { PDFDocument } = await loadPdfLib();
  const source = await loadEditablePdf(file, file.name);
  const total = source.getPageCount();
  const invalid = pages.find((page) => !Number.isInteger(page) || page < 1 || page > total);
  if (invalid !== undefined) throw new Error(`Trang ${invalid} không tồn tại (tài liệu có ${total} trang).`);

  const output = await PDFDocument.create();
  try {
    const copied = await output.copyPages(source, pages.map((page) => page - 1));
    copied.forEach((page) => output.addPage(page));
  } catch (error) {
    throw new Error('Có trang bị lỗi nên không trích xuất được.', { cause: error });
  }
  return { blob: await saveToBlob(output), pageCount: output.getPageCount() };
}
