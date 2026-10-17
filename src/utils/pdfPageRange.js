/**
 * Parses a 1-based page list such as "1-3,5,8" against a document with
 * `pageCount` pages. Order is kept as typed ("5,1-3" → [5, 1, 2, 3]) so the
 * user can reorder pages; repeated pages are dropped after their first use.
 *
 * @param {string} input
 * @param {number} pageCount
 * @returns {{ pages: number[], error: string, duplicates: number[] }}
 */
export function parsePageRange(input, pageCount) {
  const text = String(input ?? '').replace(/[–—]/g, '-').trim();
  if (!text) return { pages: [], error: 'Hãy nhập trang cần chọn, ví dụ: 1-3,5,8.', duplicates: [] };
  if (!Number.isInteger(pageCount) || pageCount < 1) return { pages: [], error: 'Tài liệu không có trang nào.', duplicates: [] };

  const pages = [];
  const seen = new Set();
  const duplicates = new Set();

  for (const rawPart of text.split(/[,;]/)) {
    const part = rawPart.replace(/\s+/g, '');
    if (!part) continue;

    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) return { pages: [], error: `“${rawPart.trim()}” không hợp lệ. Dùng số trang hoặc khoảng, ví dụ 2 hoặc 4-6.`, duplicates: [] };

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end < 1) return { pages: [], error: 'Số trang bắt đầu từ 1.', duplicates: [] };
    if (start > end) return { pages: [], error: `Khoảng “${part}” bị ngược. Hãy viết số nhỏ trước, ví dụ ${end}-${start}.`, duplicates: [] };
    if (end > pageCount) return { pages: [], error: `Trang ${end} vượt quá số trang của tài liệu (${pageCount} trang).`, duplicates: [] };

    for (let page = start; page <= end; page += 1) {
      if (seen.has(page)) {
        duplicates.add(page);
        continue;
      }
      seen.add(page);
      pages.push(page);
    }
  }

  if (!pages.length) return { pages: [], error: 'Hãy nhập trang cần chọn, ví dụ: 1-3,5,8.', duplicates: [] };
  return { pages, error: '', duplicates: [...duplicates] };
}

/**
 * Inverse of `parsePageRange`: [5, 1, 2, 3, 8] → "5,1-3,8". Only ascending
 * consecutive runs collapse so the typed order survives a round trip.
 *
 * @param {number[]} pages
 * @returns {string}
 */
export function formatPageRange(pages) {
  const parts = [];
  let index = 0;
  while (index < pages.length) {
    const start = pages[index];
    let end = start;
    while (index + 1 < pages.length && pages[index + 1] === end + 1) {
      index += 1;
      end = pages[index];
    }
    parts.push(start === end ? String(start) : `${start}-${end}`);
    index += 1;
  }
  return parts.join(',');
}

/**
 * Adds a page to the end of the selection, or removes it when present.
 *
 * @param {number[]} pages
 * @param {number} page
 * @returns {number[]}
 */
export function togglePage(pages, page) {
  return pages.includes(page) ? pages.filter((item) => item !== page) : [...pages, page];
}
