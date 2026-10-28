import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IMAGE_NAME_LIMITS, chunkArray, createAiImageDataUrl, parseSuggestionResponse } from '../utils/aiImageNaming.js';
import {
  AI_NAMING_ERRORS,
  FATAL_IMAGE_NAME_ERRORS,
  newOperationId,
  requestImageNameSuggestions,
} from '../services/imageNameService.js';
import {
  classifyFileError,
  createNamedFolderWriter,
  getDroppedDirectories,
  getFolderAccessSupport,
  getWritePermission,
  isResultFolderName,
  isSameFolder,
  pickDirectory,
  readSourceFile,
  requestWritePermission,
  scanParentFolder,
  scanProductFolder,
} from '../utils/productFolderAccess.js';
import { KEEP_ORIGINAL_SIZE, MAX_OUTPUT_DIMENSION } from '../utils/watermarkRender.js';
import { normalizeProductName, outputBaseName, validateProductName } from '../utils/watermarkAutoNaming.js';
import { supabase } from '../lib/supabase.js';

/**
 * Queue of /watermark/auto: product folders one after another, images of one
 * product in batches of the endpoint's limit (never two products in one
 * request), one AI request in flight. Per batch: read → logo → AI name (from
 * the original, without logo) → size → save into "<product>/Named" → release.
 * Only metadata stays in memory between batches.
 *
 * Image status: queued → reading → rendering → naming → resizing → writing → saved,
 * or error / cancelled (stopped before finishing; resumable like queued).
 */

/** AI answers after which no new batch is sent until the user resumes. */
export const PAUSING_AI_CODES = new Set([
  ...FATAL_IMAGE_NAME_ERRORS,
  'timeout', 'too_many_concurrent', 'upstream_rate_limited', 'upstream_timeout', 'upstream_unreachable',
  'REQUEST_IN_PROGRESS', 'server_error', 'internal_error',
]);
const ACCESS_REJECTIONS = new Set([AI_NAMING_ERRORS.authRequired, AI_NAMING_ERRORS.accessDenied, AI_NAMING_ERRORS.modelDenied]);
/** Batches failing in a row (other errors) before the run pauses instead of failing every image. */
export const MAX_FAILED_BATCHES_IN_A_ROW = 3;
const PRODUCT_BLOCKING_CODES = new Set(['permission', 'not_found', 'named_is_file']);
const PENDING = new Set(['queued', 'cancelled']);
const ACTIVE = new Set(['reading', 'rendering', 'naming', 'resizing', 'writing']);
const EMIT_DELAY_MS = 60;

export const IMAGE_ERROR_MESSAGES = {
  decode_failed: 'Không đọc được ảnh (file hỏng hoặc trình duyệt không giải mã được).',
  too_large: 'Ảnh vượt khả năng xử lý của thiết bị ở kích thước gốc. Hãy chạy lượt mới với 800 × 600.',
  source_changed: 'Ảnh nguồn đã thay đổi hoặc bị xóa sau khi quét. Hãy quét lại thư mục.',
  read_failed: 'Không đọc được ảnh nguồn.',
  ai_unreadable: 'Không tạo được bản thu nhỏ để gửi AI.',
  ai_missing: 'AI chưa trả tên hợp lệ cho ảnh này.',
  ai_failed: 'Không đặt được tên AI.',
  resize_failed: 'Không chỉnh được kích thước ảnh.',
  write_failed: 'Không ghi được file vào Named.',
  locked: 'File đích đang bị khóa hoặc chỉ đọc.',
  disk_full: 'Ổ đĩa đã đầy, không ghi thêm được.',
};

export const PRODUCT_BLOCK_MESSAGES = {
  permission: 'Chưa có quyền ghi vào thư mục này. Bấm “Cấp quyền” rồi tiếp tục.',
  not_found: 'Không tìm thấy thư mục (đã xóa, đổi tên hoặc ổ đĩa bị ngắt). Hãy chọn lại.',
  named_is_file: 'Đã có một file tên “Named” trong thư mục nên không tạo được thư mục kết quả. Đổi tên file đó rồi tiếp tục.',
};

/** Render failures in original size are usually the canvas/memory limit, not a broken file. */
function renderErrorCode(error, outputSize) {
  if (outputSize !== 'original') return 'decode_failed';
  return /không thể đọc ảnh|quá thời gian/i.test(String(error?.message)) ? 'decode_failed' : 'too_large';
}

const defaultDeps = {
  pickDirectory: () => pickDirectory(),
  getWritePermission,
  requestWritePermission,
  scanProductFolder,
  scanParentFolder,
  readSourceFile,
  createWriter: createNamedFolderWriter,
  createAiImageDataUrl,
  requestNames: requestImageNameSuggestions,
  checkSession: async () => Boolean((await supabase.auth.getSession()).data?.session),
  newId: newOperationId,
  now: () => Date.now(),
  schedule: (callback, ms) => setTimeout(callback, ms),
  getSupport: () => getFolderAccessSupport(),
};

/**
 * Framework-free store + queue; the React hook below subscribes to it.
 * @param {Partial<typeof defaultDeps> & { engine?: object, onSegmentEnd?: Function, onAccessRejected?: Function }} overrides
 */
export function createAutoRunner(overrides = {}) {
  const deps = { ...defaultDeps, ...overrides };
  const listeners = new Set();
  /** @type {Map<string, object>} */
  const products = new Map();
  /** @type {Map<string, object>} */
  const images = new Map();
  let productSeq = 0;
  let runSeq = 0;
  let run = null;
  let notices = [];
  let noticeSeq = 0;
  let picking = false;
  let granting = false;
  let disposed = false;
  let snapshot = null;
  let emitTimer = null;
  let version = 0;

  // ── store ──────────────────────────────────────────────────────────
  function emitNow() {
    emitTimer = null;
    version += 1;
    snapshot = null;
    listeners.forEach((listener) => listener());
  }

  function emit() {
    if (emitTimer) return;
    emitTimer = true;
    deps.schedule(emitNow, EMIT_DELAY_MS);
  }

  const setImage = (id, patch) => {
    const image = images.get(id);
    if (image) images.set(id, { ...image, ...patch });
    emit();
  };
  const setProduct = (id, patch) => {
    const product = products.get(id);
    if (product) products.set(id, { ...product, ...patch });
    emit();
  };
  const imagesOf = (product) => product.imageIds.map((id) => images.get(id));

  function failImage(id, code, message) {
    setImage(id, { status: 'error', errorCode: code, errorMessage: message || IMAGE_ERROR_MESSAGES[code] || IMAGE_ERROR_MESSAGES.write_failed });
  }

  function blockProduct(productId, code) {
    const lostGrant = code === 'permission' && products.get(productId)?.permission === 'granted';
    setProduct(productId, { blocked: { code, message: PRODUCT_BLOCK_MESSAGES[code] }, ...(lostGrant ? { permission: 'prompt' } : {}) });
  }

  function productStatus(product, productImages) {
    if (!productImages.length) return 'empty';
    if (productImages.some((image) => ACTIVE.has(image.status))) return 'processing';
    if (product.blocked) return 'blocked';
    const saved = productImages.filter((image) => image.status === 'saved').length;
    const errors = productImages.filter((image) => image.status === 'error').length;
    const inRun = run?.productIds.includes(product.id);
    if (!inRun || (!saved && !errors)) return 'waiting';
    if (saved === productImages.length) return 'done';
    if (!saved && errors === productImages.length) return 'error';
    if (saved + errors === productImages.length || run.state !== 'running') return 'partial';
    return 'processing';
  }

  function buildSnapshot() {
    const productList = [...products.values()].map((product) => {
      const productImages = imagesOf(product);
      const counts = { saved: 0, error: 0, review: 0, pending: 0 };
      for (const image of productImages) {
        if (image.status === 'saved') {
          counts.saved += 1;
          if (image.needsReview) counts.review += 1;
        } else if (image.status === 'error') counts.error += 1;
        else counts.pending += 1;
      }
      const resultFolderName = run?.writers.get(product.id)?.folderName ?? product.namedHandle?.name ?? 'Named';
      return { ...product, images: productImages, counts, status: productStatus(product, productImages), resultFolderName };
    });

    let runView = null;
    if (run) {
      const runProducts = productList.filter((product) => run.productIds.includes(product.id));
      const all = runProducts.flatMap((product) => product.images);
      const current = run.currentProductId ? products.get(run.currentProductId) : null;
      const activeImage = all.find((image) => ACTIVE.has(image.status));
      runView = {
        id: run.id,
        productIds: [...run.productIds],
        state: run.state,
        pause: run.pause,
        config: run.config,
        startedAt: run.startedAt,
        currentProductName: run.state === 'running' || run.state === 'stopping' ? current?.name ?? null : null,
        stage: activeImage?.status ?? null,
        total: all.length,
        saved: all.filter((image) => image.status === 'saved').length,
        errors: all.filter((image) => image.status === 'error').length,
        review: all.filter((image) => image.status === 'saved' && image.needsReview).length,
        pending: all.filter((image) => PENDING.has(image.status)).length,
        retryableErrors: all.filter((image) => image.status === 'error' && image.errorCode !== 'source_changed').length,
        productsWithSaved: runProducts.filter((product) => product.counts.saved > 0).length,
        blockedProducts: runProducts.filter((product) => product.blocked).length,
      };
    }

    return { version, products: productList, run: runView, notices, picking, granting, support: deps.getSupport() };
  }

  // ── folders ────────────────────────────────────────────────────────
  const isLocked = () => run?.state === 'running' || run?.state === 'stopping';

  async function findDuplicate(handle) {
    for (const product of products.values()) {
      if (await isSameFolder(product.handle, handle)) return product;
    }
    return null;
  }

  async function addScanned(scan, { permission }) {
    const id = `p${(productSeq += 1)}`;
    const name = normalizeProductName(scan.folderName);
    const nameError = validateProductName(name);
    const imageIds = scan.images.map((image, index) => {
      const imageId = `${id}-${index + 1}`;
      images.set(imageId, {
        id: imageId,
        productId: id,
        handle: image.handle,
        sourceName: image.name,
        size: image.size,
        lastModified: image.lastModified,
        position: index + 1,
        status: 'queued',
        errorCode: null,
        errorMessage: null,
        suggestion: null,
        outputName: null,
        needsReview: false,
        rendered: false,
      });
      return imageId;
    });
    products.set(id, {
      id,
      name,
      folderName: scan.folderName,
      relativePath: scan.relativePath,
      handle: scan.handle,
      imageIds,
      unsupported: scan.unsupported,
      invalid: scan.invalid,
      nestedFolders: scan.nestedFolders,
      namedHandle: scan.namedHandle,
      namedIsFile: scan.namedIsFile,
      nameError,
      permission,
      blocked: null,
      selected: imageIds.length > 0 && !nameError && !scan.namedIsFile,
    });
    return products.get(id);
  }

  function setNotices(list) {
    notices = list.filter(Boolean).map((notice) => ({ id: `n${(noticeSeq += 1)}`, ...notice }));
    emit();
  }

  async function withPicker(task) {
    if (picking || granting || isLocked() || disposed) return null;
    picking = true;
    emitNow();
    try {
      return await task();
    } catch (error) {
      const known = error?.name === 'FolderAccessError';
      setNotices([{ tone: 'error', text: known ? error.message : 'Không đọc được thư mục đã chọn. Hãy thử lại hoặc chọn thư mục khác.' }]);
      return null;
    } finally {
      picking = false;
      emitNow();
    }
  }

  /** "Thêm thư mục sản phẩm": the chosen folder is one product. */
  function addProductFolder() {
    return withPicker(async () => {
      const handle = await deps.pickDirectory();
      if (!handle) return { cancelled: true };
      if (isResultFolderName(handle.name)) {
        setNotices([{ tone: 'error', text: `“${handle.name}” là thư mục kết quả. Hãy chọn thư mục sản phẩm chứa nó.` }]);
        return { added: 0 };
      }
      if (await findDuplicate(handle)) {
        setNotices([{ tone: 'info', text: `Thư mục “${handle.name}” đã có trong danh sách.` }]);
        return { added: 0 };
      }
      const permission = await deps.getWritePermission(handle);
      const scan = await deps.scanProductFolder(handle, { relativePath: handle.name });
      const product = await addScanned(scan, { permission });
      setNotices([
        !product.imageIds.length && { tone: 'warning', text: `“${product.name}” không có ảnh JPG, PNG hoặc WebP hợp lệ nằm trực tiếp trong thư mục.` },
        scan.nestedFolders > 0 && { tone: 'info', text: `Bỏ qua ${scan.nestedFolders} thư mục con trong “${product.name}”. Chỉ xử lý ảnh nằm trực tiếp trong thư mục sản phẩm.` },
      ]);
      return { added: 1 };
    });
  }

  /** Multiple folders dropped together, retaining writable directory handles. */
  function addDroppedFolders(dataTransfer) {
    return withPicker(() => importProductFolders(getDroppedDirectories(dataTransfer)));
  }

  async function importProductFolders(folderResult) {
      const { handles, ignoredFiles, failed } = await folderResult;
      let added = 0;
      let duplicates = 0;
      let resultFolders = 0;
      const warnings = [];
      for (const handle of handles) {
        if (disposed) break;
        if (isResultFolderName(handle.name)) {
          resultFolders += 1;
          continue;
        }
        if (await findDuplicate(handle)) {
          duplicates += 1;
          continue;
        }
        try {
          const permission = await deps.getWritePermission(handle);
          const scan = await deps.scanProductFolder(handle, { relativePath: handle.name });
          if (disposed) break;
          const product = await addScanned(scan, { permission });
          added += 1;
          if (!product.imageIds.length) warnings.push({ tone: 'warning', text: `“${product.name}” không có ảnh JPG, PNG hoặc WebP hợp lệ nằm trực tiếp trong thư mục.` });
          if (scan.nestedFolders > 0) warnings.push({ tone: 'info', text: `Bỏ qua ${scan.nestedFolders} thư mục con trong “${product.name}”. Chỉ xử lý ảnh nằm trực tiếp trong thư mục sản phẩm.` });
        } catch {
          warnings.push({ tone: 'error', text: `Không đọc được thư mục “${handle.name}”. Hãy thử thêm lại thư mục này.` });
        }
      }
      if (disposed) return null;
      setNotices([
        { tone: added ? 'success' : 'warning', text: added ? `Đã thêm ${added} sản phẩm.` : 'Chưa thêm được thư mục sản phẩm mới. Hãy kéo thả thư mục chứa ảnh sản phẩm.' },
        duplicates > 0 && { tone: 'info', text: `${duplicates} thư mục đã có trong danh sách nên không thêm lại.` },
        resultFolders > 0 && { tone: 'info', text: `Bỏ qua ${resultFolders} thư mục kết quả “Named”. Hãy chọn thư mục sản phẩm chứa nó.` },
        ignoredFiles > 0 && { tone: 'info', text: `Bỏ qua ${ignoredFiles} file được thả riêng. Hãy chọn thư mục chứa ảnh sản phẩm.` },
        failed > 0 && { tone: 'error', text: `Không đọc được ${failed} mục kéo thả. Hãy thử thêm lại các thư mục này.` },
        ...warnings,
      ]);
      return { added };
  }

  /** "Chọn thư mục cha": each direct sub-folder is a product. */
  function addParentFolder() {
    return withPicker(async () => {
      const handle = await deps.pickDirectory();
      if (!handle) return { cancelled: true };
      if (isResultFolderName(handle.name)) {
        setNotices([{ tone: 'error', text: `“${handle.name}” là thư mục kết quả, không phải thư mục cha chứa sản phẩm.` }]);
        return { added: 0 };
      }
      const permission = await deps.getWritePermission(handle);
      const result = await deps.scanParentFolder(handle);
      let added = 0;
      let duplicates = 0;
      let nested = 0;
      for (const scan of result.products) {
        if (await findDuplicate(scan.handle)) {
          duplicates += 1;
          continue;
        }
        // Sub-folders share the parent's grant; checked per folder anyway.
        await addScanned(scan, { permission: permission === 'granted' ? await deps.getWritePermission(scan.handle) : permission });
        nested += scan.nestedFolders;
        added += 1;
      }
      setNotices([
        { tone: added ? 'success' : 'warning', text: added ? `Đã thêm ${added} sản phẩm từ “${handle.name}”.` : `Không có thư mục sản phẩm mới trong “${handle.name}”.` },
        result.rootImages > 0 && { tone: 'info', text: `Bỏ qua ${result.rootImages} ảnh nằm ngay trong thư mục cha (không thuộc sản phẩm nào).` },
        duplicates > 0 && { tone: 'info', text: `${duplicates} thư mục đã có trong danh sách nên không thêm lại.` },
        nested > 0 && { tone: 'info', text: `Bỏ qua ${nested} thư mục cháu. Chỉ xử lý ảnh nằm trực tiếp trong thư mục sản phẩm.` },
      ]);
      return { added };
    });
  }

  function forgetProduct(id) {
    const product = products.get(id);
    if (!product) return;
    product.imageIds.forEach((imageId) => images.delete(imageId));
    products.delete(id);
    if (run) run.productIds = run.productIds.filter((productId) => productId !== id);
  }

  function removeProduct(id) {
    if (isLocked()) return;
    forgetProduct(id);
    emitNow();
  }

  function clearProducts() {
    if (isLocked()) return;
    [...products.keys()].forEach(forgetProduct);
    run = null;
    notices = [];
    emitNow();
  }

  function setSelected(id, selected) {
    const product = products.get(id);
    if (isLocked() || !product) return;
    if (selected && (!product.imageIds.length || product.nameError || product.namedIsFile)) return;
    // User input is published at once: a controlled checkbox must not lag behind the click.
    products.set(id, { ...product, selected });
    emitNow();
  }

  function setAllSelected(selected) {
    if (isLocked()) return;
    for (const product of products.values()) {
      const eligible = product.imageIds.length && !product.nameError && !product.namedIsFile;
      products.set(product.id, { ...product, selected: Boolean(selected && eligible) });
    }
    emitNow();
  }

  /** From a button: may show the browser's permission prompt for this one folder. */
  async function requestPermission(id) {
    if (granting || picking || isLocked() || disposed) return 'denied';
    const product = products.get(id);
    if (!product) return 'denied';
    granting = true;
    emitNow();
    try {
      const permission = await deps.getWritePermission(product.handle, { request: true });
      if (!disposed) await refreshPermissions();
      return permission;
    } finally {
      granting = false;
      emitNow();
    }
  }

  /** All missing grants start in the same click; native browser prompts may remain separate. */
  async function requestAllPermissions() {
    if (granting || picking || isLocked() || disposed) return null;
    const pending = [...products.values()].filter((product) => product.permission !== 'granted' && product.imageIds.length > 0 && !product.nameError && !product.namedIsFile);
    if (!pending.length) return { requested: 0, granted: 0, remaining: 0 };
    granting = true;
    emitNow();
    try {
      // Do not await one prompt before launching the next request: activation can expire.
      await Promise.allSettled(pending.map(async (product) => deps.requestWritePermission(product.handle)));
      if (disposed) return null;
      await refreshPermissions();
      if (disposed) return null;
      const granted = pending.filter((product) => products.get(product.id)?.permission === 'granted').length;
      const remaining = pending.length - granted;
      setNotices([
        { tone: remaining ? 'warning' : 'success', text: `Đã cấp quyền ghi cho ${granted}/${pending.length} thư mục.` },
        remaining > 0 && { tone: 'warning', text: `Còn ${remaining} thư mục chưa được cấp quyền ghi. Bạn có thể thử cấp quyền lại.` },
      ]);
      return { requested: pending.length, granted, remaining };
    } finally {
      granting = false;
      emitNow();
    }
  }

  /** Recheck inherited grants without opening any browser permission prompts. */
  async function refreshPermissions() {
    for (const product of products.values()) {
      const permission = await deps.getWritePermission(product.handle);
      if (disposed) return;
      const current = products.get(product.id);
      if (current) products.set(product.id, {
        ...current,
        permission,
        blocked: permission === 'granted' && current.blocked?.code === 'permission' ? null : current.blocked,
      });
    }
    emitNow();
  }

  /** Reads the folder again (after files changed); its results in this session start over. */
  async function rescanProduct(id) {
    const product = products.get(id);
    if (!product || isLocked()) return;
    let scan;
    try {
      scan = await deps.scanProductFolder(product.handle, { relativePath: product.relativePath });
    } catch (error) {
      setProduct(id, { blocked: { code: 'not_found', message: PRODUCT_BLOCK_MESSAGES[classifyFileError(error)] || PRODUCT_BLOCK_MESSAGES.not_found } });
      return;
    }
    const permission = await deps.getWritePermission(product.handle);
    if (isLocked() || !products.has(id)) return;
    const order = [...products.keys()];
    const runIndex = run ? run.productIds.indexOf(id) : -1;
    run?.writers.delete(id);
    forgetProduct(id);
    const next = await addScanned(scan, { permission });
    // Keep the list order and the run membership of the folder.
    const entries = order.map((key) => (key === id ? [next.id, next] : [key, products.get(key)]));
    products.clear();
    entries.forEach(([key, value]) => products.set(key, value));
    if (runIndex >= 0) run.productIds.splice(runIndex, 0, next.id);
    emitNow();
  }

  // ── run ────────────────────────────────────────────────────────────
  const isCurrent = (target) => !disposed && run === target;
  const isActive = (target) => isCurrent(target) && !target.stopRequested && !target.pause;

  function pauseRun(target, pause) {
    target.pause = {
      ...pause,
      until: pause.retryAfterSeconds ? deps.now() + pause.retryAfterSeconds * 1000 : null,
    };
    emit();
  }

  function cancelImages(ids) {
    ids.forEach((id) => {
      const image = images.get(id);
      if (image && image.status !== 'saved' && image.status !== 'error') setImage(id, { status: 'cancelled' });
    });
  }

  async function processBatch(target, segment, productId, ids) {
    const { config } = target;
    const product = products.get(productId);
    const writer = target.writers.get(productId);
    const prepared = [];
    const cancelPrepared = () => cancelImages(prepared.map((item) => item.id));
    const maxDimension = config.outputSize === 'original' ? KEEP_ORIGINAL_SIZE : MAX_OUTPUT_DIMENSION;

    // 1. read + logo, in source order
    for (const id of ids) {
      if (!isActive(target)) {
        cancelImages([id]);
        continue;
      }
      const image = images.get(id);
      const firstRender = !image.rendered;
      setImage(id, { status: 'reading', errorCode: null, errorMessage: null });
      let file;
      try {
        file = await deps.readSourceFile(image);
      } catch (error) {
        if (!isCurrent(target)) return;
        const code = classifyFileError(error);
        if (code === 'permission') {
          cancelImages([id, ...ids.slice(ids.indexOf(id) + 1)]);
          cancelPrepared();
          blockProduct(productId, 'permission');
          return;
        }
        // Changed content: a cached AI name would describe something else.
        if (code === 'source_changed') setImage(id, { suggestion: null, outputName: null });
        failImage(id, code === 'source_changed' ? code : 'read_failed');
        if (firstRender) segment.create.failed += 1;
        continue;
      }
      if (!isActive(target)) {
        cancelImages([id]);
        continue;
      }
      setImage(id, { status: 'rendering' });
      try {
        // Always from the original file, so a retry never stamps the logo twice.
        const { blob } = await deps.engine.render(file, config.renderOptions, { maxDimension });
        if (!isCurrent(target)) return;
        prepared.push({ id, file, blob });
        if (firstRender) {
          segment.create.succeeded += 1;
          setImage(id, { rendered: true });
        }
      } catch (error) {
        if (!isCurrent(target)) return;
        failImage(id, renderErrorCode(error, config.outputSize));
        if (firstRender) segment.create.failed += 1;
      }
    }
    if (!isActive(target)) {
      cancelPrepared();
      return;
    }

    // 2. AI names for the images without one from earlier in this run
    const unnamed = prepared.filter((item) => !images.get(item.id).suggestion);
    if (unnamed.length) {
      const payload = [];
      for (const item of unnamed) {
        setImage(item.id, { status: 'naming' });
        try {
          const position = Math.min(images.get(item.id).position, IMAGE_NAME_LIMITS.maxPosition);
          // The original without logo: the logo would hide the product from the model.
          payload.push({ id: item.id, position, dataUrl: await deps.createAiImageDataUrl({ sourceFile: item.file }) });
        } catch {
          failImage(item.id, 'ai_unreadable');
        }
        if (!isActive(target)) break;
      }
      if (!isActive(target)) {
        cancelPrepared();
        return;
      }

      if (payload.length) {
        const response = await deps.requestNames({
          productName: product.name,
          prompt: config.prompt,
          model: config.model,
          images: payload,
          signal: target.controller.signal,
          requestId: deps.newId(),
          aiRunId: segment.aiRunId,
        });
        // A stopped/replaced run or a closed page never applies a late answer.
        if (!isCurrent(target)) return;
        if (response.code === 'aborted' || target.stopRequested) {
          cancelPrepared();
          return;
        }
        segment.aiRequests += 1;

        if (response.error) {
          if (ACCESS_REJECTIONS.has(response.code)) deps.onAccessRejected?.(response.code);
          target.aiFailureStreak += 1;
          if (PAUSING_AI_CODES.has(response.code) || target.aiFailureStreak >= MAX_FAILED_BATCHES_IN_A_ROW) {
            // Not these images' fault: they wait for "Tiếp tục".
            cancelPrepared();
            pauseRun(target, { kind: 'ai', code: response.code, message: response.error, retryAfterSeconds: response.retryAfterSeconds });
            return;
          }
          payload.forEach((item) => failImage(item.id, 'ai_failed', response.error));
        } else {
          target.aiFailureStreak = 0;
          const { suggestions, failedIds } = parseSuggestionResponse(payload.map((item) => item.id), response.data);
          for (const [id, suggestion] of suggestions) setImage(id, { suggestion: { ...suggestion, aiRunId: segment.aiRunId } });
          failedIds.forEach((id) => failImage(id, 'ai_missing'));
        }
      }
    }

    // 3. size + save, in source order (so "-2" suffixes follow the folder order)
    for (let index = 0; index < prepared.length; index += 1) {
      const item = prepared[index];
      const image = images.get(item.id);
      if (image.status === 'error' || !image.suggestion) {
        item.blob = null;
        continue;
      }
      if (!isActive(target)) {
        cancelImages([item.id]);
        item.blob = null;
        continue;
      }

      let output = item.blob;
      if (config.outputSize === '800x600') {
        setImage(item.id, { status: 'resizing' });
        try {
          output = await deps.engine.resize(item.blob, 800, 600);
        } catch {
          if (!isCurrent(target)) return;
          failImage(item.id, 'resize_failed');
          item.blob = null;
          continue;
        }
        if (!isCurrent(target)) return;
        if (!isActive(target)) {
          cancelImages([item.id]);
          item.blob = null;
          continue;
        }
      }

      setImage(item.id, { status: 'writing' });
      segment.write.attempted += 1;
      try {
        const name = await writer.write(outputBaseName(image.suggestion.name, product.name, image.position), output, { preferredName: image.outputName });
        segment.write.written += 1;
        if (image.suggestion.aiRunId) segment.applied.set(image.suggestion.aiRunId, (segment.applied.get(image.suggestion.aiRunId) || 0) + 1);
        // A finished file is reported even if the run was stopped meanwhile.
        if (images.has(item.id)) setImage(item.id, { status: 'saved', outputName: name, needsReview: image.suggestion.needsReview });
        if (!isCurrent(target)) return;
      } catch (error) {
        if (!isCurrent(target)) return;
        const code = classifyFileError(error);
        if (error?.attemptedName) setImage(item.id, { outputName: error.attemptedName });
        if (PRODUCT_BLOCKING_CODES.has(code)) {
          cancelImages(prepared.slice(index).map((entry) => entry.id));
          blockProduct(productId, code);
          return;
        }
        failImage(item.id, code);
        segment.write.failed += 1;
        if (code === 'disk_full') {
          cancelImages(prepared.slice(index + 1).map((entry) => entry.id));
          pauseRun(target, { kind: 'disk', code, message: IMAGE_ERROR_MESSAGES.disk_full });
          return;
        }
      } finally {
        item.blob = null;
        output = null;
      }
    }
  }

  async function processSegment(target, segment) {
    for (const productId of [...target.productIds]) {
      if (!isActive(target)) return;
      const product = products.get(productId);
      if (!product || product.blocked) continue;
      const queue = imagesOf(product).filter((image) => PENDING.has(image.status));
      if (!queue.length) continue;

      const permission = await deps.getWritePermission(product.handle);
      if (!isCurrent(target)) return;
      if (permission !== 'granted') {
        setProduct(productId, { permission });
        blockProduct(productId, 'permission');
        continue;
      }
      if (!target.writers.has(productId)) {
        target.writers.set(productId, deps.createWriter(product.handle, { namedHandle: product.namedHandle }));
      }
      target.currentProductId = productId;
      emit();

      for (const batch of chunkArray(queue.map((image) => image.id), IMAGE_NAME_LIMITS.maxImagesPerRequest)) {
        if (!isActive(target) || products.get(productId)?.blocked) break;
        await processBatch(target, segment, productId, batch);
        if (!isCurrent(target) || target.pause) return;
      }
    }
  }

  function startSegment(target) {
    const pendingIds = target.productIds.flatMap((id) => {
      const product = products.get(id);
      return product ? imagesOf(product).filter((image) => PENDING.has(image.status)) : [];
    });
    const segment = {
      aiRunId: deps.newId(),
      startedAt: deps.now(),
      create: { requested: pendingIds.filter((image) => !image.rendered).length, succeeded: 0, failed: 0 },
      write: { requested: pendingIds.length, attempted: 0, written: 0, failed: 0 },
      applied: new Map(),
      aiRequests: 0,
    };
    target.state = 'running';
    target.stopRequested = false;
    target.pause = null;
    target.aiFailureStreak = 0;
    target.controller = new AbortController();
    emitNow();

    target.loop = processSegment(target, segment)
      .catch((error) => {
        if (isCurrent(target)) pauseRun(target, { kind: 'unexpected', code: 'unexpected', message: error?.message || 'Lỗi không mong muốn.' });
      })
      .finally(() => {
        target.currentProductId = null;
        const finished = { ...segment, durationMs: deps.now() - segment.startedAt, aborted: Boolean(target.stopRequested) || disposed };
        if (isCurrent(target)) {
          const pending = target.productIds.some((id) => {
            const product = products.get(id);
            return product && imagesOf(product).some((image) => PENDING.has(image.status));
          });
          if (target.stopRequested) target.pause = { kind: 'stopped', code: 'stopped', message: 'Đã dừng. Ảnh đã lưu được giữ nguyên.', until: null };
          else if (!target.pause && pending) target.pause = { kind: 'blocked', code: 'blocked', message: 'Một số sản phẩm cần cấp lại quyền hoặc xử lý lỗi thư mục trước khi tiếp tục.', until: null };
          target.state = target.pause ? 'paused' : 'finished';
          target.stopRequested = false;
          emitNow();
        }
        try {
          deps.onSegmentEnd?.({ runId: target.id, imageBatchId: target.imageBatchId, config: target.config, segment: finished });
        } catch {
          // Telemetry problems never affect the files or the queue.
        }
      });
    return target.loop;
  }

  /**
   * "Bắt đầu xử lý": checks the selection again, fixes the configuration for the
   * whole run and starts. Resolves { ok } or { ok: false, reason, products? }.
   * @param {{ renderOptions: object, outputSize: 'original' | '800x600', model: string, prompt: string }} config
   */
  async function start(config) {
    if (isLocked() || picking || granting || disposed) return { ok: false, reason: 'busy' };
    if (!deps.engine) return { ok: false, reason: 'engine' };
    const ready = [...products.values()].filter((product) => product.selected && product.imageIds.length && !product.nameError && !product.namedIsFile);
    if (!ready.length) return { ok: false, reason: 'no_images' };
    const invalidNames = [...products.values()].filter((product) => product.selected && product.nameError);
    if (invalidNames.length) return { ok: false, reason: 'product_name', products: invalidNames.map((product) => product.name) };

    const missing = [];
    for (const product of ready) {
      const permission = await deps.getWritePermission(product.handle);
      products.set(product.id, { ...product, permission });
      if (permission !== 'granted') missing.push(product.name);
    }
    emitNow();
    if (missing.length) return { ok: false, reason: 'permission', products: missing };
    if (!(await deps.checkSession())) return { ok: false, reason: 'auth' };
    if (isLocked() || disposed) return { ok: false, reason: 'busy' };

    for (const product of ready) {
      products.set(product.id, { ...products.get(product.id), blocked: null });
      for (const id of product.imageIds) {
        images.set(id, {
          ...images.get(id), status: 'queued', errorCode: null, errorMessage: null, suggestion: null, outputName: null, needsReview: false, rendered: false,
        });
      }
    }

    run = {
      id: (runSeq += 1),
      imageBatchId: deps.newId(),
      config: Object.freeze({ ...config, renderOptions: Object.freeze({ ...config.renderOptions }) }),
      productIds: ready.map((product) => product.id),
      writers: new Map(),
      state: 'running',
      pause: null,
      startedAt: deps.now(),
      currentProductId: null,
    };
    startSegment(run);
    return { ok: true };
  }

  /** "Dừng": no new image or batch; the file being written finishes first. */
  function stop() {
    if (run?.state !== 'running') return;
    run.stopRequested = true;
    run.state = 'stopping';
    run.controller.abort();
    emitNow();
  }

  /** "Tiếp tục phần còn lại": same configuration, only unfinished images. */
  function resume() {
    if (!run || isLocked() || picking || granting || disposed) return { ok: false, reason: 'busy' };
    if (run.pause?.until && run.pause.until > deps.now()) return { ok: false, reason: 'wait', until: run.pause.until };
    // Folders blocked by permission/drive problems are checked again by the loop.
    for (const id of run.productIds) {
      const product = products.get(id);
      if (product?.blocked) products.set(id, { ...product, blocked: null });
    }
    startSegment(run);
    return { ok: true };
  }

  /** "Thử lại ảnh lỗi": AI names already received are reused; files are rendered again from the originals. */
  function retryErrors() {
    if (!run || isLocked() || picking || granting || disposed) return { ok: false, reason: 'busy' };
    for (const id of run.productIds) {
      const product = products.get(id);
      if (!product) continue;
      for (const image of imagesOf(product)) {
        if (image.status === 'error' && image.errorCode !== 'source_changed') {
          images.set(image.id, { ...image, status: 'queued', errorCode: null, errorMessage: null });
        }
      }
    }
    return resume();
  }

  function dismissNotice(id) {
    notices = notices.filter((notice) => notice.id !== id);
    emitNow();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      snapshot ??= buildSnapshot();
      return snapshot;
    },
    setEngine(engine) {
      deps.engine = engine;
    },
    setCallbacks({ onSegmentEnd, onAccessRejected }) {
      deps.onSegmentEnd = onSegmentEnd;
      deps.onAccessRejected = onAccessRejected;
    },
    mount() {
      disposed = false;
    },
    /** Page left: abort, ignore late answers, write nothing new. */
    dispose() {
      disposed = true;
      run?.controller?.abort();
    },
    /** Resolves when the current loop has ended (tests, unmount). */
    idle: () => run?.loop ?? Promise.resolve(),
    addProductFolder,
    addDroppedFolders,
    addParentFolder,
    removeProduct,
    clearProducts,
    setSelected,
    setAllSelected,
    requestPermission,
    requestAllPermissions,
    refreshPermissions,
    rescanProduct,
    start,
    stop,
    resume,
    retryErrors,
    dismissNotice,
  };
}

/**
 * React binding: one runner per page, snapshots through useSyncExternalStore.
 * @param {{ engine: object | null, onSegmentEnd?: Function, onAccessRejected?: Function }} options
 */
export function useWatermarkAutoProcessor({ engine, onSegmentEnd, onAccessRejected }) {
  const [runner] = useState(() => createAutoRunner());
  const callbacksRef = useRef({ onSegmentEnd, onAccessRejected });

  useEffect(() => {
    callbacksRef.current = { onSegmentEnd, onAccessRejected };
  }, [onSegmentEnd, onAccessRejected]);

  useEffect(() => {
    runner.setCallbacks({
      onSegmentEnd: (summary) => callbacksRef.current.onSegmentEnd?.(summary),
      onAccessRejected: (code) => callbacksRef.current.onAccessRejected?.(code),
    });
  }, [runner]);

  useEffect(() => {
    runner.setEngine(engine);
  }, [runner, engine]);

  useEffect(() => {
    runner.mount();
    return () => runner.dispose();
  }, [runner]);

  const snapshot = useSyncExternalStore(runner.subscribe, runner.getSnapshot, runner.getSnapshot);
  return { snapshot, runner };
}
