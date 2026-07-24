import React, { useMemo } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { FaMagnifyingGlass, FaTrash } from 'react-icons/fa6';
import { calculateRow } from '../../hooks/useQuotation.js';
import { formatCurrency, parseCurrency } from '../../utils/numberFormat.js';
import styles from '../../pages/Quotation/Quotation.module.css';

function createFieldName(index, field) {
  return `products.${index}.${field}`;
}

function ProductSuggestions({ rowIndex, suggestions, onSelectSuggestion }) {
  if (!suggestions?.open) {
    return null;
  }

  if (suggestions.loading) {
    return <div className="quotation-suggestions">Đang tìm sản phẩm...</div>;
  }

  if (!suggestions.items?.length) {
    return <div className="quotation-suggestions">Không tìm thấy sản phẩm phù hợp.</div>;
  }

  return (
    <div className={styles.quotationSuggestions}>
      {suggestions.items.map((item) => (
        <button
          key={item.id}
          className={styles.quotationSuggestion}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelectSuggestion(rowIndex, item)}
        >
          <strong>{item.code}</strong>
          <span>{item.name}</span>
          <small>{item.unit} · {formatCurrency(item.price)}</small>
        </button>
      ))}
    </div>
  );
}

function ProductRow({
  index,
  control,
  errors,
  onRemove,
  onSearchProduct,
  onHideSuggestions,
  onSelectSuggestion,
  suggestions,
  onEnterAdvance,
  onAddProduct,
  canRemove,
}) {
  const watchedRow = useWatch({ control, name: `products.${index}` });
  const allRows = useWatch({ control, name: 'products' }) || [];
  const calculatedRow = useMemo(() => calculateRow(watchedRow), [watchedRow]);
  const inputCompact = styles['quotationField__input--compact'];
  const inputCenter = styles['quotationField__input--center'];
  const inputRight = styles['quotationField__input--right'];
  const isLastRow = index === allRows.length - 1;

  return (
    <tr>
      <td className={`${styles.quotationCell} ${styles['quotationCell--index']}`}>{index + 1}</td>

      <td className={styles.quotationCell}>
        <div className={styles.quotationAutocomplete}>
          <Controller
            control={control}
            name={createFieldName(index, 'code')}
            render={({ field }) => (
              <input
                {...field}
                className={`${styles['quotationField__input']} ${inputCompact}`}
                placeholder="Mã SP"
                data-quotation-field={createFieldName(index, 'code')}
                onChange={(event) => {
                  field.onChange(event.target.value);
                  onSearchProduct(index, event.target.value);
                }}
                onFocus={() => onSearchProduct(index, field.value)}
                onBlur={() => window.setTimeout(() => onHideSuggestions(index), 150)}
                onKeyDown={(event) => onEnterAdvance(event, createFieldName(index, 'name'))}
              />
            )}
          />
          <FaMagnifyingGlass className={styles.quotationInputIcon} aria-hidden="true" />
          <ProductSuggestions
            rowIndex={index}
            suggestions={suggestions}
            onSelectSuggestion={onSelectSuggestion}
          />
        </div>
      </td>

      <td className={styles.quotationCell}>
        <Controller
          control={control}
          name={createFieldName(index, 'name')}
          render={({ field }) => (
            <input
              {...field}
              className={`${styles['quotationField__input']} ${inputCompact}`}
              placeholder="Tên hàng"
              data-quotation-field={createFieldName(index, 'name')}
              onKeyDown={(event) => onEnterAdvance(event, createFieldName(index, 'unit'))}
            />
          )}
        />
        {errors?.products?.[index]?.name && (
          <span className={styles['quotationField__error']}>{errors.products[index].name.message}</span>
        )}
      </td>

      <td className={styles.quotationCell}>
        <Controller
          control={control}
          name={createFieldName(index, 'unit')}
          render={({ field }) => (
            <input
              {...field}
              className={`${styles['quotationField__input']} ${inputCompact}`}
              placeholder="ĐVT"
              data-quotation-field={createFieldName(index, 'unit')}
              onKeyDown={(event) => onEnterAdvance(event, createFieldName(index, 'quantity'))}
            />
          )}
        />
      </td>

      <td className={`${styles.quotationCell} ${styles['quotationCell--quantity']}`}>
        <Controller
          control={control}
          name={createFieldName(index, 'quantity')}
          rules={{
            validate: (value) => {
              const numericValue = Number(value);
              return numericValue >= 1 || 'Số lượng phải lớn hơn hoặc bằng 1.';
            },
          }}
          render={({ field }) => (
            <input
              {...field}
              className={`${styles['quotationField__input']} ${inputCompact} ${inputCenter}`}
              inputMode="numeric"
              placeholder="1"
              data-quotation-field={createFieldName(index, 'quantity')}
              value={field.value ?? 1}
              onChange={(event) => field.onChange(parseCurrency(event.target.value) || 1)}
              onKeyDown={(event) => onEnterAdvance(event, createFieldName(index, 'price'))}
            />
          )}
        />
        {errors?.products?.[index]?.quantity && (
          <span className={styles['quotationField__error']}>{errors.products[index].quantity.message}</span>
        )}
      </td>

      <td className={`${styles.quotationCell} ${styles['quotationCell--price']}`}>
        <Controller
          control={control}
          name={createFieldName(index, 'price')}
          rules={{
            validate: (value) => Number(value) >= 0 || 'Đơn giá phải từ 0 trở lên.',
          }}
          render={({ field }) => (
            <input
              {...field}
              className={`${styles['quotationField__input']} ${inputCompact} ${inputRight}`}
              inputMode="numeric"
              placeholder="0"
              data-quotation-field={createFieldName(index, 'price')}
              value={formatCurrency(field.value)}
              onChange={(event) => field.onChange(parseCurrency(event.target.value))}
              onKeyDown={(event) => onEnterAdvance(event, createFieldName(index, 'vat'))}
            />
          )}
        />
        {errors?.products?.[index]?.price && (
          <span className={styles['quotationField__error']}>{errors.products[index].price.message}</span>
        )}
      </td>

      <td className={`${styles.quotationCell} ${styles['quotationCell--vat']}`}>
        <Controller
          control={control}
          name={createFieldName(index, 'vat')}
          rules={{
            validate: (value) => {
              const numericValue = Number(value);
              return (numericValue >= 0 && numericValue <= 100) || 'VAT phải từ 0 đến 100.';
            },
          }}
          render={({ field }) => (
            <input
              {...field}
              className={`${styles['quotationField__input']} ${inputCompact} ${inputCenter}`}
              inputMode="numeric"
              placeholder="8"
              data-quotation-field={createFieldName(index, 'vat')}
              value={field.value ?? 0}
              onChange={(event) => field.onChange(parseCurrency(event.target.value))}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return;
                }

                event.preventDefault();

                if (isLastRow) {
                  onAddProduct();
                  window.setTimeout(() => {
                    const nextField = createFieldName(index + 1, 'code');
                    const nextElement = document.querySelector(
                      `[data-quotation-field="${nextField}"]`,
                    );

                    if (nextElement instanceof HTMLElement) {
                      nextElement.focus();
                    }
                  }, 0);
                  return;
                }

                onEnterAdvance(event, createFieldName(index + 1, 'code'));
              }}
            />
          )}
        />
        {errors?.products?.[index]?.vat && (
          <span className={styles['quotationField__error']}>{errors.products[index].vat.message}</span>
        )}
      </td>

      <td className={`${styles.quotationCell} ${styles['quotationCell--total']}`}>
        <strong>{formatCurrency(calculatedRow.total)}</strong>
        <span className={styles.quotationCell__subtext}>
          VAT {formatCurrency(calculatedRow.vatAmount)}
        </span>
      </td>

      <td className={`${styles.quotationCell} ${styles['quotationCell--delete']}`}>
        <button
          className={`${styles.quotationIconButton} ${styles['quotationIconButton--danger']}`}
          type="button"
          onClick={() => onRemove(index)}
          disabled={!canRemove}
          aria-label={`Xóa dòng ${index + 1}`}
        >
          <FaTrash aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

export default React.memo(ProductRow);
