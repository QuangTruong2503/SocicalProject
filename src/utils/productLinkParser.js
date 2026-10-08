const URL_PATTERN = /https?:\/\/[^\s"'<>,;|]+/gi;
const SEPARATOR_EDGES = /^[\s:\-–—|,;.\t#*•]+|[\s:\-–—|,;.\t#*•]+$/g;

export function normalizeProductCode(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(SEPARATOR_EDGES, '').trim();
}

export function productCodeKey(value) {
  return normalizeProductCode(value).toLowerCase();
}

function isHeaderText(text) {
  // Ignore bare list numbering such as "1." or "12)".
  return text.length >= 2 && !/^\d+[.)]?$/.test(text);
}

/**
 * Parse pasted text / CSV / TSV into products.
 *
 * Supported shapes (can be mixed):
 *   KINGTONY 653532M          ← a non-URL line starts a product
 *   https://...jpg            ← following URL lines belong to it
 *
 *   KINGTONY 653532M<TAB>https://...<TAB>https://...   ← code and links on one row
 *
 * @param {string} text
 * @returns {{ items: Array<{ code: string, links: string[] }>, orphanLinks: string[], linkCount: number }}
 */
export function parseProductLinks(text) {
  const byKey = new Map();
  const orphanLinks = [];
  let current = null;

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const links = rawLine.match(URL_PATTERN) ?? [];
    const label = normalizeProductCode(rawLine.replace(URL_PATTERN, ' '));

    if (isHeaderText(label)) {
      const key = label.toLowerCase();
      current = byKey.get(key) ?? { code: label, links: [] };
      byKey.set(key, current);
    }

    for (const link of links) {
      const cleanLink = link.replace(/[).\]]+$/, '');

      if (!current) {
        if (!orphanLinks.includes(cleanLink)) orphanLinks.push(cleanLink);
        continue;
      }

      if (!current.links.includes(cleanLink)) current.links.push(cleanLink);
    }
  }

  const items = [...byKey.values()];
  return {
    items,
    orphanLinks,
    linkCount: items.reduce((sum, item) => sum + item.links.length, 0),
  };
}

/**
 * Read a .txt/.csv/.tsv/.xlsx/.xls file into text understood by parseProductLinks.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function readProductLinkFile(file) {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return workbook.SheetNames
      .map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name], { FS: '\t', blankrows: false }))
      .join('\n');
  }

  return file.text();
}

function fileStem(link) {
  try {
    const path = new URL(link).pathname;
    const name = decodeURIComponent(path.split('/').pop() || '');
    return name.replace(/\.[a-z0-9]{2,5}$/i, '');
  } catch {
    return link;
  }
}

/**
 * Short, human-readable labels for a product's links, e.g.
 * "tuyp-3-4-den-kingtony-653532m-32mm-dau-luc-giac.jpg" → "dau luc giac"
 * by stripping the file-name prefix all links share.
 * @param {string[]} links
 * @returns {string[]}
 */
export function buildLinkLabels(links) {
  const stems = links.map(fileStem);

  if (stems.length < 2) {
    return stems.map((stem) => stem.replace(/[-_]+/g, ' ').trim() || stem);
  }

  let prefix = stems[0];
  for (const stem of stems.slice(1)) {
    while (prefix && !stem.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  // Only cut at a word boundary so "dau-luc" never becomes "u-luc".
  const boundary = Math.max(prefix.lastIndexOf('-'), prefix.lastIndexOf('_'));
  const cut = boundary >= 0 ? boundary + 1 : 0;

  return stems.map((stem) => {
    const rest = stem.slice(cut).replace(/[-_]+/g, ' ').trim();
    return rest || stem;
  });
}
