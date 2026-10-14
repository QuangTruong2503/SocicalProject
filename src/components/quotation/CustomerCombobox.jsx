import { useEffect, useId, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { searchCustomers } from '../../services/quotationService.js';
import styles from '../../pages/Quotation/Quotation.module.css';

/**
 * Customer name input with suggestions from saved customers (ARIA combobox).
 * Typing calls onChange(name); picking a suggestion calls onSelect(customer).
 */
export default function CustomerCombobox({ value, onChange, onSelect, disabled, invalid, describedBy, placeholder }) {
  const listId = useId();
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = useDebouncedValue(value || '', 250);

  useEffect(() => {
    if (!typed) return undefined;
    let active = true;

    async function run() {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      try {
        const found = await searchCustomers(query);
        if (!active) return;
        setResults(found);
        setActiveIndex(-1);
        setOpen(found.length > 0);
      } catch {
        if (active) setResults([]);
      }
    }

    run();
    return () => { active = false; };
  }, [query, typed]);

  function pick(customer) {
    onSelect(customer);
    setOpen(false);
    setTyped(false);
    setResults([]);
  }

  function handleKeyDown(event) {
    if (!open || !results.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + step + results.length) % results.length);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      pick(results[activeIndex]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  }

  const showList = open && results.length > 0 && !disabled;

  return (
    <div className={styles.combo}>
      <input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={placeholder}
        value={value || ''}
        disabled={disabled}
        onChange={(event) => {
          setTyped(true);
          onChange(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => results.length && setOpen(true)}
      />
      {showList && (
        <ul id={listId} role="listbox" className={styles.comboList} aria-label="Khách hàng đã lưu">
          {results.map((customer, index) => (
            <li
              key={customer.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? styles.comboActive : undefined}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(customer);
              }}
            >
              <strong>{customer.name}</strong>
              <small>{[customer.tax_code && `MST ${customer.tax_code}`, customer.phone, customer.contact_name].filter(Boolean).join(' · ') || 'Khách hàng đã lưu'}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
