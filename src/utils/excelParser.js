import * as XLSX from 'xlsx';

export const EXCEL_COLUMN_INDEX = {
  name: 3,
  description: 4,
  tag: 8,
};

function getSheetName(workbook) {
  return workbook?.SheetNames?.[0] || '';
}

function getSheet(workbook, sheetName) {
  if (!workbook || !sheetName) {
    return null;
  }

  return workbook.Sheets?.[sheetName] || null;
}

function getCellText(sheet, rowIndex, columnIndex) {
  if (!sheet) {
    return '';
  }

  const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const value = sheet[cellAddress]?.v;

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function setCellText(sheet, rowIndex, columnIndex, value) {
  const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  sheet[cellAddress] = {
    t: 's',
    v: value,
  };
}

function normalizeWorkbookRange(sheet) {
  if (!sheet?.['!ref']) {
    return null;
  }

  return XLSX.utils.decode_range(sheet['!ref']);
}

export function extractWorkbookRows(workbook) {
  const sheetName = getSheetName(workbook);
  const sheet = getSheet(workbook, sheetName);
  const range = normalizeWorkbookRange(sheet);

  if (!sheet || !range) {
    throw new Error('File Excel không có dữ liệu hợp lệ.');
  }

  const rows = [];

  for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const name = getCellText(sheet, rowIndex, EXCEL_COLUMN_INDEX.name);
    const description = getCellText(sheet, rowIndex, EXCEL_COLUMN_INDEX.description);
    const tag = getCellText(sheet, rowIndex, EXCEL_COLUMN_INDEX.tag);

    rows.push({
      rowNumber,
      name,
      description,
      tag,
      hasName: Boolean(name),
      hasTag: Boolean(tag),
      shouldProcess: Boolean(name) && !tag,
    });
  }

  return {
    sheetName,
    rows,
    summary: {
      sheetDataRows: Math.max(range.e.r, 0),
      totalRows: rows.filter((row) => row.hasName).length,
      pendingRows: rows.filter((row) => row.shouldProcess).length,
      skippedRows: rows.filter((row) => row.hasName && row.hasTag).length,
      emptyRows: rows.filter((row) => !row.hasName).length,
    },
  };
}

export function parseWorkbookBuffer(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    raw: false,
  });

  return {
    workbook,
    ...extractWorkbookRows(workbook),
  };
}

export function updateWorkbookTag(workbook, sheetName, rowNumber, tagValue) {
  const sheet = getSheet(workbook, sheetName);

  if (!sheet) {
    throw new Error('Không tìm thấy sheet cần cập nhật.');
  }

  setCellText(sheet, rowNumber - 1, EXCEL_COLUMN_INDEX.tag, tagValue);
}

export function serializeWorkbookSnapshot(workbook) {
  const arrayBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });

  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

export function restoreWorkbookSnapshot(base64Value) {
  if (!base64Value) {
    return null;
  }

  const binary = atob(base64Value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return XLSX.read(bytes, {
    type: 'array',
    cellDates: true,
    raw: false,
  });
}
