import { useEffect, useMemo, useRef, useState } from 'react';
import WatermarkModal from './WatermarkModal.jsx';
import {
  AI_NAMING_RUN_LIMIT,
  AI_REQUEST_CONCURRENCY,
  DEFAULT_IMAGE_NAME_PROMPT,
  IMAGE_NAME_LIMITS,
  buildFinalFileNames,
  chunkArray,
  createAiImageDataUrl,
  parseSuggestionResponse,
  runWithConcurrency,
  slugifyFileName,
} from '../../utils/aiImageNaming.js';
import { AI_NAMING_ERRORS, FATAL_IMAGE_NAME_ERRORS, requestImageNameSuggestions } from '../../services/imageNameService.js';
import { describeAiNamingAccess } from '../../utils/aiNamingAccess.js';

const ACCESS_REJECTIONS = new Set([AI_NAMING_ERRORS.authRequired, AI_NAMING_ERRORS.accessDenied]);

const hasName = (entry) => Boolean(entry?.name?.trim());

/**
 * "Đặt tên bằng AI": suggests a file name per result from its content. Names
 * are only applied on "Áp dụng tên"; edits never call the API again.
 *
 * @param {{
 *   results: Array<{ id: string, fileName: string, url: string, thumb?: string, blob?: Blob, sourceFile?: Blob }>,
 *   defaultProductName?: string,
 *   draft?: { productName: string, prompt: string, entries: Record<string, { name: string, needsReview: boolean }> } | null,
 *   onApply: (namesById: Record<string, string>) => void,
 *   onClose: (draft: object | null) => void,
 * }} props
 */
export default function AiRenameModal({
  results,
  defaultProductName = '',
  draft = null,
  accessStatus = 'loading',
  accessError = null,
  onAccessRejected,
  onRetryAccess,
  onRequestLogin,
  onApply,
  onClose,
}) {
  // UI gate only; the Edge Function re-checks access on every request.
  const canGenerate = accessStatus === 'allowed';
  const accessCopy = canGenerate ? null : describeAiNamingAccess(accessStatus, accessError);
  const [productName, setProductName] = useState(() => draft?.productName ?? defaultProductName ?? '');
  const [prompt, setPrompt] = useState(() => draft?.prompt ?? DEFAULT_IMAGE_NAME_PROMPT);
  // id → { status: 'idle' | 'pending' | 'done' | 'error', name, needsReview, error }
  const [entries, setEntries] = useState(() => Object.fromEntries(
    Object.entries(draft?.entries || {}).map(([id, entry]) => [id, { status: 'done', name: entry.name, needsReview: entry.needsReview, error: null }]),
  ));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [formError, setFormError] = useState('');
  const [runError, setRunError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const runIdRef = useRef(0);
  const abortRef = useRef(null);
  const productInputRef = useRef(null);

  useEffect(() => () => {
    runIdRef.current += 1;
    abortRef.current?.abort();
  }, []);

  const resultIds = useMemo(() => new Set(results.map((result) => result.id)), [results]);
  const namedCount = results.filter((result) => hasName(entries[result.id])).length;
  const missing = results.filter((result) => !hasName(entries[result.id]));
  const errorCount = results.filter((result) => entries[result.id]?.status === 'error').length;
  const reviewCount = results.filter((result) => hasName(entries[result.id]) && entries[result.id].needsReview).length;
  const targetCount = Math.min(missing.length || results.length, AI_NAMING_RUN_LIMIT);

  const finalNames = useMemo(() => {
    const drafts = {};
    for (const result of results) {
      if (hasName(entries[result.id])) drafts[result.id] = entries[result.id].name;
    }
    return buildFinalFileNames(results, drafts, { productName });
  }, [entries, productName, results]);

  const generateLabel = namedCount === 0
    ? 'Tạo tên gợi ý'
    : missing.length === 0
      ? 'Tạo lại tất cả'
      : errorCount > 0 ? `Thử lại ${targetCount} ảnh chưa có tên` : `Tạo gợi ý cho ${targetCount} ảnh còn lại`;

  const stopRun = () => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setEntries((current) => Object.fromEntries(Object.entries(current).map(([id, entry]) => (
      [id, entry.status === 'pending' ? { ...entry, status: hasName(entry) ? 'done' : 'idle' } : entry]
    ))));
  };

  const handleClose = () => {
    if (running) stopRun();
    const kept = Object.fromEntries(Object.entries(entries)
      .filter(([id, entry]) => resultIds.has(id) && hasName(entry))
      .map(([id, entry]) => [id, { name: entry.name, needsReview: Boolean(entry.needsReview) }]));
    onClose(Object.keys(kept).length ? { productName, prompt, entries: kept } : null);
  };

  const handleGenerate = async (event) => {
    event?.preventDefault();
    // abortRef is set synchronously, so a double click before re-render cannot start a second run.
    if (running || abortRef.current || !canGenerate) return;

    const name = productName.trim();
    if (!name || !slugifyFileName(name)) {
      setFormError('Vui lòng nhập tên sản phẩm (có ít nhất một chữ cái hoặc chữ số).');
      productInputRef.current?.focus();
      return;
    }
    if (prompt.length > IMAGE_NAME_LIMITS.maxPromptLength) {
      setFormError(`Prompt tối đa ${IMAGE_NAME_LIMITS.maxPromptLength} ký tự.`);
      return;
    }
    setFormError('');

    const pool = missing.length ? missing : results;
    const targets = pool.slice(0, AI_NAMING_RUN_LIMIT).map((result) => ({ result, position: results.indexOf(result) + 1 }));
    if (!targets.length) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const controller = new AbortController();
    abortRef.current = controller;
    const isCurrent = () => runIdRef.current === runId;
    const targetIds = targets.map(({ result }) => result.id);
    let fatalError = '';
    let accessRejected = false;
    let done = 0;
    const failedIds = new Set();

    setRunning(true);
    setRunError('');
    setStatusMessage('');
    setProgress({ done: 0, total: targets.length });
    setEntries((current) => {
      const next = { ...current };
      for (const id of targetIds) next[id] = { name: '', needsReview: false, ...current[id], status: 'pending', error: null };
      return next;
    });

    const markFailed = (ids, message) => {
      ids.forEach((id) => failedIds.add(id));
      setEntries((current) => {
        const next = { ...current };
        for (const id of ids) next[id] = { name: '', needsReview: false, ...current[id], status: 'error', error: message };
        return next;
      });
    };

    await runWithConcurrency(chunkArray(targets, IMAGE_NAME_LIMITS.maxImagesPerRequest), AI_REQUEST_CONCURRENCY, async (chunk) => {
      if (!isCurrent() || fatalError) return;
      const ids = chunk.map(({ result }) => result.id);
      const images = [];
      const unreadable = [];

      for (const { result, position } of chunk) {
        try {
          images.push({ id: result.id, position, dataUrl: await createAiImageDataUrl(result) });
        } catch {
          unreadable.push(result.id);
        }
        if (!isCurrent()) return;
      }
      if (unreadable.length) markFailed(unreadable, 'Không đọc được ảnh này để phân tích.');

      if (images.length) {
        const response = await requestImageNameSuggestions({ productName: name, prompt, images, signal: controller.signal });
        // A closed dialog, a stopped run or a newer run must not receive this answer.
        if (!isCurrent() || response.code === 'aborted') return;

        if (response.error) {
          // Names already suggested or typed are kept (markFailed only changes the status).
          markFailed(images.map((image) => image.id), response.error);
          if (FATAL_IMAGE_NAME_ERRORS.has(response.code)) fatalError ||= response.error;
          if (ACCESS_REJECTIONS.has(response.code)) {
            accessRejected = true;
            onAccessRejected?.(response.code);
          }
        } else {
          const { suggestions, failedIds: unnamedIds } = parseSuggestionResponse(images.map((image) => image.id), response.data);
          unnamedIds.forEach((id) => failedIds.add(id));
          setEntries((current) => {
            const next = { ...current };
            for (const [id, suggestion] of suggestions) {
              next[id] = { status: 'done', name: suggestion.name, needsReview: suggestion.needsReview, error: null };
            }
            for (const id of unnamedIds) {
              next[id] = { name: '', needsReview: false, ...current[id], status: 'error', error: 'AI chưa đặt được tên cho ảnh này.' };
            }
            return next;
          });
        }
      }

      done += ids.length;
      setProgress({ done, total: targets.length });
    });

    if (!isCurrent()) return;
    abortRef.current = null;
    // Batches skipped after a fatal error keep their previous name (if any) and show the reason.
    setEntries((current) => {
      const next = { ...current };
      for (const id of targetIds) {
        if (next[id]?.status === 'pending') next[id] = { ...next[id], status: 'error', error: fatalError || 'Chưa xử lý.' };
      }
      return next;
    });
    // An access rejection is explained by the access notice instead.
    setRunError(accessRejected ? '' : fatalError);
    setRunning(false);

    const failed = failedIds.size;
    setStatusMessage(fatalError ? '' : failed
      ? `Đã xử lý ${targets.length} ảnh, ${failed} ảnh lỗi — bạn có thể thử lại hoặc tự nhập tên.`
      : `Đã tạo gợi ý cho ${targets.length} ảnh. Kiểm tra rồi bấm “Áp dụng tên”.`);
  };

  const handleNameChange = (id, value) => {
    setEntries((current) => ({
      ...current,
      [id]: { needsReview: false, ...current[id], name: value, status: value.trim() ? 'done' : 'idle', error: null },
    }));
  };

  const handleApply = () => {
    if (running || finalNames.size === 0) return;
    onApply(Object.fromEntries(finalNames));
  };

  return (
    <WatermarkModal
      onClose={handleClose}
      labelledBy="wm-ai-rename-title"
      describedBy="wm-ai-rename-privacy"
      backdropClassName="wm-bulk-rename-backdrop"
      className="wm-bulk-rename-modal wm-ai-rename-modal"
    >
      <div className="wm-bulk-rename-header">
        <div className="wm-bulk-rename-heading">
          <span className="wm-bulk-rename-hero-icon" aria-hidden="true">AI</span>
          <div>
            <span className="wm-bulk-rename-eyebrow">Đặt tên bằng AI</span>
            <strong id="wm-ai-rename-title">Gợi ý tên file từ nội dung ảnh</strong>
            <p>AI thêm mô tả ngắn (toàn cảnh, mặt trước, phụ kiện…) sau tên sản phẩm của bạn.</p>
          </div>
        </div>
        <button className="wm-bulk-rename-close" type="button" onClick={handleClose} aria-label="Đóng">×</button>
      </div>

      <p className="wm-ai-rename-privacy" id="wm-ai-rename-privacy">
        <span aria-hidden="true">ⓘ</span>
        Khi bấm tạo gợi ý, bản thu nhỏ của ảnh (ưu tiên ảnh gốc chưa gắn logo) được gửi qua máy chủ tới OpenAI để phân tích.
        Tên file chỉ thay đổi khi bạn bấm “Áp dụng tên”.
      </p>

      <form className="wm-ai-rename-form" onSubmit={handleGenerate} noValidate>
        <div className="wm-bulk-rename-field">
          <span className="wm-bulk-rename-field-label">
            <label htmlFor="wm-ai-product-name">
              <strong>Tên sản phẩm <span className="wm-ai-required" aria-hidden="true">*</span></strong>
            </label>
            <small aria-hidden="true">{productName.length}/{IMAGE_NAME_LIMITS.maxProductNameLength}</small>
          </span>
          <input
            ref={productInputRef}
            id="wm-ai-product-name"
            className="wm-ai-rename-input"
            value={productName}
            onChange={(event) => { setProductName(event.target.value); setFormError(''); }}
            maxLength={IMAGE_NAME_LIMITS.maxProductNameLength}
            placeholder="Ví dụ: Máy khoan Bosch GSB 13 RE"
            required
            aria-required="true"
            aria-invalid={formError ? 'true' : undefined}
            aria-describedby={formError ? 'wm-ai-form-error' : undefined}
            disabled={running}
            autoComplete="off"
            data-dialog-initial
          />
        </div>

        <details className="wm-ai-prompt">
          <summary>Prompt mẫu (có thể chỉnh sửa)</summary>
          <div className="wm-bulk-rename-field">
            <span className="wm-bulk-rename-field-label">
              <label htmlFor="wm-ai-prompt"><strong>Nội dung prompt</strong></label>
              <small aria-hidden="true">{prompt.length}/{IMAGE_NAME_LIMITS.maxPromptLength}</small>
            </span>
            <textarea
              id="wm-ai-prompt"
              className="wm-bulk-rename-textarea wm-ai-prompt-textarea"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={IMAGE_NAME_LIMITS.maxPromptLength}
              rows={7}
              disabled={running}
              aria-describedby="wm-ai-prompt-hint"
            />
          </div>
          <div className="wm-ai-prompt-footer">
            <small id="wm-ai-prompt-hint">
              {'{{productName}}'} được thay bằng tên sản phẩm. Định dạng kết quả, ID ảnh và giới hạn dữ liệu do hệ thống cố định.
            </small>
            <button
              type="button"
              className="wm-ai-reset-prompt"
              onClick={() => setPrompt(DEFAULT_IMAGE_NAME_PROMPT)}
              disabled={running || prompt === DEFAULT_IMAGE_NAME_PROMPT}
            >
              Khôi phục mặc định
            </button>
          </div>
        </details>

        {formError && <p className="wm-ai-rename-error" id="wm-ai-form-error" role="alert">{formError}</p>}

        <div className="wm-ai-rename-run">
          <span className="wm-ai-rename-count">
            <strong>{targetCount}</strong> ảnh sẽ được xử lý
            {results.length > AI_NAMING_RUN_LIMIT && ` · tối đa ${AI_NAMING_RUN_LIMIT} ảnh mỗi lần`}
          </span>
          <div className="wm-ai-rename-run-buttons">
            {running && (
              <button type="button" className="wm-bulk-rename-cancel" onClick={stopRun}>Dừng</button>
            )}
            <button
              type="submit"
              className="wm-bulk-rename-confirm wm-ai-generate"
              disabled={running || results.length === 0 || !canGenerate}
              aria-busy={running || accessStatus === 'loading' || undefined}
              aria-describedby={accessCopy ? 'wm-ai-access-notice' : undefined}
            >
              {running ? (
                <>
                  <span className="wm-spinner" aria-hidden="true" />
                  Đang phân tích {progress.done}/{progress.total}…
                </>
              ) : accessStatus === 'loading' ? 'Đang kiểm tra quyền…' : generateLabel}
            </button>
          </div>
        </div>
      </form>

      {accessCopy && accessStatus !== 'loading' && (
        <div className="wm-ai-access-notice" id="wm-ai-access-notice" role="alert">
          <div>
            <strong>{accessCopy.message}</strong>
            <span>Tên đã gợi ý hoặc tự nhập bên dưới vẫn được giữ và có thể áp dụng.</span>
          </div>
          {accessStatus === 'signed_out' && onRequestLogin && (
            <button type="button" className="wm-ai-reset-prompt" onClick={onRequestLogin}>Đăng nhập</button>
          )}
          {accessStatus === 'error' && onRetryAccess && (
            <button type="button" className="wm-ai-reset-prompt" onClick={onRetryAccess}>Thử lại</button>
          )}
        </div>
      )}

      {runError && <p className="wm-ai-rename-error" role="alert">{runError}</p>}
      <p className="wm-ai-rename-status" role="status" aria-live="polite">
        {running ? `Đang phân tích ${progress.done}/${progress.total} ảnh…` : statusMessage}
      </p>

      <ul className="wm-ai-rename-list" aria-label="Xem trước tên file">
        {results.map((result, index) => {
          const entry = entries[result.id];
          const finalName = finalNames.get(result.id);
          const inputId = `wm-ai-name-${result.id}`;
          return (
            <li key={result.id} className={`wm-ai-rename-item${entry?.status === 'error' ? ' is-error' : ''}`}>
              <img className="wm-ai-rename-thumb" src={result.thumb || result.url} alt="" loading="lazy" decoding="async" />
              <div className="wm-ai-rename-item-body">
                <div className="wm-ai-rename-current">
                  <span className="wm-result-num">#{index + 1}</span>
                  <span title={result.fileName}>Hiện tại: {result.fileName}</span>
                </div>
                <label className="wm-visually-hidden" htmlFor={inputId}>Tên đề xuất cho ảnh #{index + 1}</label>
                <input
                  id={inputId}
                  className="wm-ai-rename-input wm-ai-rename-name"
                  value={entry?.name ?? ''}
                  onChange={(event) => handleNameChange(result.id, event.target.value)}
                  placeholder={entry?.status === 'pending' ? 'Đang phân tích…' : 'Chưa có gợi ý'}
                  maxLength={IMAGE_NAME_LIMITS.maxSuggestedNameLength}
                  disabled={entry?.status === 'pending'}
                  aria-describedby={`${inputId}-hint`}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="wm-ai-rename-hint" id={`${inputId}-hint`}>
                  {entry?.status === 'pending' && <span className="wm-ai-chip">Đang xử lý…</span>}
                  {entry?.status === 'error' && <span className="wm-ai-chip is-error">{entry.error}</span>}
                  {finalName && entry?.status !== 'pending' && <span className="wm-ai-final">→ {finalName}</span>}
                  {finalName && entry?.needsReview && <span className="wm-ai-chip is-review">Cần kiểm tra</span>}
                  {!finalName && entry?.status !== 'pending' && entry?.status !== 'error' && <span>Giữ tên hiện tại</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="wm-bulk-rename-actions">
        <span className="wm-ai-rename-summary">
          {namedCount}/{results.length} ảnh có tên mới
          {reviewCount > 0 && ` · ${reviewCount} cần kiểm tra`}
        </span>
        <div className="wm-bulk-rename-action-buttons">
          <button className="wm-bulk-rename-cancel" type="button" onClick={handleClose}>Hủy</button>
          <button className="wm-bulk-rename-confirm" type="button" onClick={handleApply} disabled={running || finalNames.size === 0}>
            Áp dụng tên{finalNames.size > 0 ? ` (${finalNames.size})` : ''}
          </button>
        </div>
      </div>
    </WatermarkModal>
  );
}
