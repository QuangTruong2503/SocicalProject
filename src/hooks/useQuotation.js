import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import { formatCurrency, parseCurrency } from '../utils/numberFormat.js';
import { numberToVietnamese } from '../utils/numberToVietnamese.js';
import companyOptions from '../data/companies.json';

const STORAGE_KEY = 'quotation:last-draft';

const PRODUCT_CATALOG = [
  {
    id: 1,
    code: '4752-12G',
    name: 'Cần siết tự động lắc léo Kingtony',
    unit: 'Cái',
    price: 508000,
  },
  {
    id: 2,
    code: 'A-1002',
    name: 'Tấm lót chống trượt cao cấp',
    unit: 'Tấm',
    price: 120000,
  },
  {
    id: 3,
    code: 'B-2401',
    name: 'Bộ vít inox đa năng',
    unit: 'Bộ',
    price: 95000,
  },
  {
    id: 4,
    code: 'C-7788',
    name: 'Khay đựng linh kiện 12 ngăn',
    unit: 'Cái',
    price: 175000,
  },
  {
    id: 5,
    code: 'D-3309',
    name: 'Dây nguồn công nghiệp 3m',
    unit: 'Sợi',
    price: 82000,
  },
];

const DEFAULT_PRODUCT = () => ({
  id: uuidv4(),
  code: '',
  name: '',
  unit: '',
  quantity: 1,
  price: 0,
  vat: 8,
});

const DEFAULT_COMPANY_ID = companyOptions[0]?.id || '';

const DEFAULT_VALUES = {
  customer: {
    companyId: DEFAULT_COMPANY_ID,
    companyName: '',
    taxCode: '',
    taxAddress: '',
    phone: '',
    shippingAddress: '',
    date: dayjs().format('YYYY-MM-DD'),
    documentNo: '',
    note: '',
  },
  products: [DEFAULT_PRODUCT()],
};

function safeToNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Calculate a product row with VAT included.
 * @param {{ quantity?: number, price?: number, vat?: number }} product
 * @returns {{ subtotal: number, vatAmount: number, total: number }}
 */
export function calculateRow(product) {
  const quantity = Math.max(0, safeToNumber(product?.quantity, 0));
  const price = Math.max(0, safeToNumber(product?.price, 0));
  const vat = Math.min(100, Math.max(0, safeToNumber(product?.vat, 0)));
  const subtotal = quantity * price;
  const vatAmount = Math.round((subtotal * vat) / 100);
  const total = subtotal + vatAmount;

  return { subtotal, vatAmount, total };
}

/**
 * Sum quotation values from all rows.
 * @param {Array} products
 * @returns {{ subtotal: number, vatAmount: number, total: number, totalInWords: string }}
 */
export function calculateSummary(products = []) {
  const initial = { subtotal: 0, vatAmount: 0, total: 0 };

  const summary = products.reduce((accumulator, product) => {
    const row = calculateRow(product);

    accumulator.subtotal += row.subtotal;
    accumulator.vatAmount += row.vatAmount;
    accumulator.total += row.total;

    return accumulator;
  }, initial);

  return {
    ...summary,
    totalInWords: numberToVietnamese(summary.total),
  };
}

/**
 * Normalize text for a safe Excel filename segment.
 * @param {string} value
 * @returns {string}
 */
function toSafeFileSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function hydrateDraft() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_VALUES;
    }

    const parsed = JSON.parse(raw);
    return {
      customer: {
        ...DEFAULT_VALUES.customer,
        ...(parsed?.customer || {}),
      },
      products:
        Array.isArray(parsed?.products) && parsed.products.length > 0
          ? parsed.products.map((product) => ({
              ...DEFAULT_PRODUCT(),
              ...product,
              quantity: Math.max(1, safeToNumber(product.quantity, 1)),
              price: Math.max(0, safeToNumber(product.price, 0)),
              vat: Math.min(100, Math.max(0, safeToNumber(product.vat, 0))),
            }))
          : [DEFAULT_PRODUCT()],
    };
  } catch {
    return DEFAULT_VALUES;
  }
}

function saveDraft(values) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Local storage is best-effort only.
  }
}

/**
 * Manage quotation form state and row operations.
 * @returns {*} quotation helpers and form methods
 */
export function useQuotation() {
  const initialValues = useMemo(() => hydrateDraft(), []);
  const form = useForm({
    defaultValues: initialValues,
    mode: 'onChange',
  });
  const { control, handleSubmit, setValue, reset, formState, trigger } = form;
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'products',
    keyName: 'fieldKey',
  });
  const [searchState, setSearchState] = useState({});
  const searchTimersRef = useRef(new Map());

  const watchedCustomer = useWatch({ control, name: 'customer' });
  const watchedProducts = useWatch({ control, name: 'products' });
  const watchedCompanyId = useWatch({ control, name: 'customer.companyId' });

  const selectedCompany = useMemo(
    () =>
      companyOptions.find((company) => company.id === watchedCompanyId) ||
      companyOptions[0] ||
      null,
    [watchedCompanyId],
  );

  const products = useMemo(
    () =>
      (watchedProducts || []).map((product) => {
        const calculated = calculateRow(product);

        return {
          ...product,
          quantity: Math.max(1, safeToNumber(product.quantity, 1)),
          price: Math.max(0, safeToNumber(product.price, 0)),
          vat: Math.min(100, Math.max(0, safeToNumber(product.vat, 0))),
          subtotal: calculated.subtotal,
          vatAmount: calculated.vatAmount,
          total: calculated.total,
        };
      }),
    [watchedProducts],
  );

  const summary = useMemo(() => calculateSummary(products), [products]);

  useEffect(() => {
    saveDraft({
      customer: watchedCustomer,
      products: watchedProducts,
    });
  }, [watchedCustomer, watchedProducts]);

  useEffect(() => {
    if (!watchedCustomer?.companyId && DEFAULT_COMPANY_ID) {
      setValue('customer.companyId', DEFAULT_COMPANY_ID, {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  }, [setValue, watchedCustomer?.companyId]);

  useEffect(
    () => () => {
      searchTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      searchTimersRef.current.clear();
    },
    [],
  );

  const addProduct = useCallback(() => {
    append(DEFAULT_PRODUCT());
  }, [append]);

  const removeProduct = useCallback(
    (index) => {
      if (fields.length === 1) {
        return;
      }

      remove(index);
      setSearchState((current) => {
        const nextState = { ...current };
        delete nextState[index];
        return nextState;
      });
    },
    [fields.length, remove],
  );

  const updateProduct = useCallback(
    (index, nextProduct) => {
      update(index, {
        ...DEFAULT_PRODUCT(),
        ...nextProduct,
        quantity: Math.max(1, safeToNumber(nextProduct.quantity, 1)),
        price: Math.max(0, safeToNumber(nextProduct.price, 0)),
        vat: Math.min(100, Math.max(0, safeToNumber(nextProduct.vat, 0))),
      });
    },
    [update],
  );

  const setProductValue = useCallback(
    (index, fieldName, value, options = {}) => {
      setValue(`products.${index}.${fieldName}`, value, {
        shouldDirty: true,
        shouldValidate: true,
        ...options,
      });
    },
    [setValue],
  );

  const searchProduct = useCallback((index, keyword) => {
    const trimmed = String(keyword || '').trim();

    if (searchTimersRef.current.has(index)) {
      window.clearTimeout(searchTimersRef.current.get(index));
    }

    if (!trimmed) {
      setSearchState((current) => ({
        ...current,
        [index]: { open: false, loading: false, items: [] },
      }));
      return;
    }

    setSearchState((current) => ({
      ...current,
      [index]: { open: true, loading: true, items: current[index]?.items || [] },
    }));

    const timerId = window.setTimeout(() => {
      const keywordLower = trimmed.toLowerCase();
      const results = PRODUCT_CATALOG.filter(
        (product) =>
          product.code.toLowerCase().includes(keywordLower) ||
          product.name.toLowerCase().includes(keywordLower),
      ).slice(0, 6);

      setSearchState((current) => ({
        ...current,
        [index]: { open: true, loading: false, items: results },
      }));
    }, 220);

    searchTimersRef.current.set(index, timerId);
  }, []);

  const hideSuggestions = useCallback((index) => {
    setSearchState((current) => ({
      ...current,
      [index]: { open: false, loading: false, items: current[index]?.items || [] },
    }));
  }, []);

  const selectSuggestion = useCallback(
    (index, product) => {
      setProductValue(index, 'code', product.code);
      setProductValue(index, 'name', product.name);
      setProductValue(index, 'unit', product.unit);
      setProductValue(index, 'price', product.price);
      setSearchState((current) => ({
        ...current,
        [index]: { open: false, loading: false, items: [] },
      }));
    },
    [setProductValue],
  );

  const resetForm = useCallback(() => {
    reset(DEFAULT_VALUES);
    setSearchState({});
  }, [reset]);

  const submitQuotation = handleSubmit((values) => {
    saveDraft(values);
    return values;
  });

  return {
    control,
    formState,
    fields,
    products,
    customer: watchedCustomer,
    selectedCompany,
    companyOptions,
    summary,
    searchState,
    addProduct,
    removeProduct,
    updateProduct,
    setProductValue,
    searchProduct,
    hideSuggestions,
    selectSuggestion,
    resetForm,
    submitQuotation,
    trigger,
    getValues: form.getValues,
    formatCurrency,
    parseCurrency,
    toSafeFileSegment,
  };
}
