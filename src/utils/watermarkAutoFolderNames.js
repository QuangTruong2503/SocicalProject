import { normalizeProductName, validateProductName } from './watermarkAutoNaming.js';

export function getOutputFolderName(product) {
  return product.outputFolderName ?? product.folderName;
}

/** Validate the whole import before changing any product. Rows may be sorted or omitted. */
export function prepareFolderNameChanges(rows, products) {
  if (!rows.length) throw new Error('File Excel chưa có thư mục sản phẩm.');
  const byId = new Map(products.map((product) => [product.excelId, product]));
  const seen = new Set();
  return rows.map(({ id, name, rowNumber }) => {
    const prefix = `Dòng ${rowNumber}: `;
    const product = byId.get(id);
    if (!product) throw new Error(`${prefix}ID folder không thuộc danh sách hiện tại. Hãy xuất lại Excel từ trang này.`);
    if (seen.has(id)) throw new Error(`${prefix}ID folder bị trùng trong Excel.`);
    seen.add(id);
    const folderName = String(name ?? '').normalize('NFC').trim();
    // Validate a single Windows folder component, never a path.
    if (Array.from(folderName).some((char) => char.charCodeAt(0) < 32)
      || /[<>:"/\\|?*]/.test(folderName) || /[. ]$/.test(folderName)
      || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(folderName)
      || /^(named|result)$/i.test(folderName)) {
      throw new Error(`${prefix}tên folder không hợp lệ hoặc là tên dành riêng. Không dùng đường dẫn hay ký tự < > : " / \\ | ? *.`);
    }
    const nameError = validateProductName(normalizeProductName(folderName));
    if (nameError) throw new Error(`${prefix}${nameError.replace('Hãy đổi tên thư mục trên máy rồi chọn lại.', 'Hãy sửa cột “Tên folder mới” trong Excel.')}`);
    return { product, folderName, name: normalizeProductName(folderName) };
  });
}
