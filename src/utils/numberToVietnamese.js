const DIGITS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
];

const SCALE_UNITS = [
  '',
  'nghìn',
  'triệu',
  'tỷ',
  'nghìn tỷ',
  'triệu tỷ',
];

function capitalizeFirstLetter(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Read a three-digit block in Vietnamese.
 * @param {number} value
 * @param {boolean} forceHundreds
 * @returns {string}
 */
function readGroup(value, forceHundreds = false) {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  const parts = [];

  if (hundreds > 0 || forceHundreds) {
    parts.push(`${DIGITS[hundreds]} trăm`);
  }

  if (tens > 1) {
    parts.push(`${DIGITS[tens]} mươi`);

    if (ones === 1) {
      parts.push('mốt');
    } else if (ones === 4) {
      parts.push('tư');
    } else if (ones === 5) {
      parts.push('lăm');
    } else if (ones > 0) {
      parts.push(DIGITS[ones]);
    }
  } else if (tens === 1) {
    parts.push('mười');

    if (ones === 1) {
      parts.push('một');
    } else if (ones === 4) {
      parts.push('bốn');
    } else if (ones === 5) {
      parts.push('lăm');
    } else if (ones > 0) {
      parts.push(DIGITS[ones]);
    }
  } else if (ones > 0) {
    if (hundreds > 0 || forceHundreds) {
      parts.push('lẻ');
    }

    parts.push(DIGITS[ones]);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convert a positive integer into Vietnamese text.
 * @param {number|string} input
 * @returns {string}
 */
export function numberToVietnamese(input) {
  const rawNumber = Number(input) || 0;
  const integerNumber = Math.max(0, Math.floor(rawNumber));

  if (integerNumber === 0) {
    return 'Không đồng chẵn.';
  }

  const groups = [];
  let remaining = integerNumber;

  while (remaining > 0) {
    groups.unshift(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const groupTexts = groups
    .map((groupValue, index) => {
      if (groupValue === 0) {
        return '';
      }

      const scaleIndex = groups.length - index - 1;
      const hasHigherGroup = groups.slice(0, index).some((value) => value > 0);
      const hasLowerGroup = groups.slice(index + 1).some((value) => value > 0);
      const forceHundreds = hasHigherGroup && groupValue < 100 && (groupValue > 0 || hasLowerGroup);
      const groupText = readGroup(groupValue, forceHundreds);
      const scaleText = SCALE_UNITS[scaleIndex] || '';

      return `${groupText}${scaleText ? ` ${scaleText}` : ''}`.trim();
    })
    .filter(Boolean);

  const finalText = groupTexts.join(' ').replace(/\s+/g, ' ').trim();
  return `${capitalizeFirstLetter(finalText)} đồng chẵn.`;
}

