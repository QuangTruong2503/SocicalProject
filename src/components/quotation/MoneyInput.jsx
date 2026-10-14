import { useLayoutEffect, useRef } from 'react';

const formatter = new Intl.NumberFormat('vi-VN');

function format(value) {
  const number = Number(value);
  return Number.isFinite(number) ? formatter.format(number) : '';
}

/**
 * Whole-number VND input that shows thousand separators while typing
 * ("1.250.000") and keeps the caret next to the same digit after reformatting.
 * `onChange` receives a number.
 */
export default function MoneyInput({ value, onChange, ...rest }) {
  const inputRef = useRef(null);
  const digitsBeforeCaretRef = useRef(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const digitsBefore = digitsBeforeCaretRef.current;
    if (!input || digitsBefore === null || document.activeElement !== input) return;

    let position = 0;
    let seen = 0;
    while (position < input.value.length && seen < digitsBefore) {
      if (/\d/.test(input.value[position])) seen += 1;
      position += 1;
    }
    input.setSelectionRange(position, position);
    digitsBeforeCaretRef.current = null;
  });

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={format(value)}
      onChange={(event) => {
        const raw = event.target.value;
        const caret = event.target.selectionStart ?? raw.length;
        digitsBeforeCaretRef.current = raw.slice(0, caret).replace(/\D/g, '').length;
        const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
        onChange(digits === '' ? 0 : Number(digits));
      }}
      {...rest}
    />
  );
}
