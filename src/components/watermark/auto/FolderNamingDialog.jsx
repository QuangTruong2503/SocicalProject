import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { loadFolderNamingDraft, saveFolderNamingDraft } from '../../../hooks/useIndexedDB.js';
import { AI_REQUEST_CONCURRENCY, chunkArray, IMAGE_NAME_LIMITS, IMAGE_NAME_MODELS, runWithConcurrency } from '../../../utils/aiImageNaming.js';
import { getFolderDraftSelection, getFolderDraftSelectionKey, restoreFolderNamingDraft } from '../../../utils/watermarkAutoFolderDraft.js';
import {
  AI_NAMING_ERRORS,
  FATAL_IMAGE_NAME_ERRORS,
  newOperationId,
  requestFolderNameSuggestions,
} from '../../../services/imageNameService.js';
import {
  DEFAULT_FOLDER_NAME_PROMPT,
  FOLDER_NAME_ISSUES,
  FOLDER_NAME_LIMITS,
  getAiFolderNameError,
  getFolderNameLabels,
  matchFolderSuggestions,
  normalizeFolderName,
  normalizeFolderSourceUrl,
  withoutFolderNameLabels,
} from '../../../../supabase/functions/suggest-image-names/folderNaming.js';

const PROMPT_KEY = 'watermark_auto_folder_naming_prompt';
const FOLDER_LOOKUP_BATCH_SIZE = 2;
// The server deduplicates request IDs for 24 hours. Leave a margin for clock drift.
const RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1000;
const RECOVERABLE_REQUEST_ERRORS = new Set(['network', 'timeout', 'REQUEST_IN_PROGRESS', 'invalid_response', 'server_error']);
const CLOSED_REQUEST_ERRORS = new Set(['REQUEST_OUTCOME_UNKNOWN', 'REQUEST_ALREADY_PROCESSED', 'IDEMPOTENCY_CONFLICT']);
const RECOVERY_ACCESS_ERRORS = new Set([AI_NAMING_ERRORS.authRequired, AI_NAMING_ERRORS.accessDenied, AI_NAMING_ERRORS.accessCheckFailed]);
const EMPTY_MAP = new Map();

function loadPrompt() {
  try {
    const value = localStorage.getItem(PROMPT_KEY);
    if (value !== null && value.length <= IMAGE_NAME_LIMITS.maxPromptLength) return value;
  } catch {
    // Editing is still available for the current dialog.
  }
  return DEFAULT_FOLDER_NAME_PROMPT;
}

function resolveName(name, suggestion, labels, draft) {
  if (draft.name != null) return draft.name;
  const base = draft.suffix === 'original' ? name : suggestion?.suggestedName || name;
  if (!labels.length || !draft.label) return base;
  if (draft.label === 'remove') return withoutFolderNameLabels(base);
  return getFolderNameLabels(base).length ? base : `${base} ${[...new Set(labels)].join(' ')}`;
}

export default function FolderNamingDialog({ open, userId, products, models, model, accessMessage, onAccessRejected, onApply, onClose, onStatusChange }) {
  const titleId = useId();
  const dialog = useRef(null);
  const operation = useRef(null);
  const savedDraft = useRef(null);
  const workspaceRef = useRef(null);
  const [prompt, setPrompt] = useState(loadPrompt);
  const [selectedModel, setSelectedModel] = useState(model);
  const [workspace, setWorkspace] = useState(null);
  const [storage, setStorage] = useState('loading');
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(null);
  const [paused, setPaused] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [error, setError] = useState('');
  const [reviewFilter, setReviewFilter] = useState(null);
  const currentModel = models.find(({ id }) => id === selectedModel) ?? models[0];
  const activeModel = currentModel?.id;
  const folders = useMemo(() => getFolderDraftSelection(products), [products]);
  const selectionKey = getFolderDraftSelectionKey(folders);
  const current = workspace?.selectionKey === selectionKey ? workspace : null;
  const suggestions = current?.suggestions ?? EMPTY_MAP;
  const edits = current?.edits ?? EMPTY_MAP;
  const hasDraft = Boolean(current?.started || suggestions.size || edits.size);
  const busyLookup = busy === 'lookup';
  const pendingCount = current?.pending.length ?? 0;
  const recoveredRequest = pendingCount > 0;
  const canGenerate = current && !busy && activeModel && !accessMessage;
  const warnOnLeave = busyLookup || (hasDraft && storage === 'session');

  useEffect(() => {
    const element = dialog.current;
    if (open) element.showModal();
    return () => { if (element.open) element.close(); };
  }, [open]);

  useEffect(() => () => { operation.current?.controller.abort(); }, []);

  useEffect(() => {
    const warnLeaving = (event) => { event.preventDefault(); event.returnValue = ''; };
    if (!warnOnLeave) return undefined;
    window.addEventListener('beforeunload', warnLeaving);
    return () => window.removeEventListener('beforeunload', warnLeaving);
  }, [warnOnLeave]);

  useEffect(() => {
    let active = true;
    if (!userId) return undefined;
    loadFolderNamingDraft(userId).then((saved) => {
      if (!active) return;
      savedDraft.current = saved;
      setStorage('ready');
    }).catch(() => { if (active) setStorage('session'); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!open || (userId && storage === 'loading') || workspaceRef.current?.selectionKey === selectionKey) return undefined;
    let active = true;
    restoreFolderNamingDraft(savedDraft.current, folders).then((restored) => {
      if (!active) return;
      const next = { ...restored, selectionKey };
      workspaceRef.current = next;
      setWorkspace(next);
      setError('');
      setPaused(false);
      setReviewFilter(null);
    });
    return () => { active = false; };
  }, [open, folders, selectionKey, storage, userId]);

  useEffect(() => {
    onStatusChange({ userId, busy, hasDraft, completed: suggestions.size, total: folders.length, paused });
  }, [onStatusChange, userId, busy, hasDraft, suggestions.size, folders.length, paused]);

  async function saveWorkspace(next) {
    workspaceRef.current = next;
    savedDraft.current = next;
    setWorkspace(next);
    if (!userId || storage === 'session') return;
    try {
      await saveFolderNamingDraft(userId, next);
    } catch {
      setStorage('session');
    }
  }

  function updatePrompt(value) {
    setPrompt(value);
    try {
      localStorage.setItem(PROMPT_KEY, value);
    } catch {
      // Keep the current draft if local storage is unavailable.
    }
  }

  function updateDraft(id, update) {
    const previous = workspaceRef.current;
    const next = new Map(previous.edits);
    next.set(id, { ...previous.edits.get(id), ...update });
    void saveWorkspace({ ...previous, edits: next });
  }

  async function generate(replaceAll = false) {
    if (!canGenerate || operation.current) return;
    const initial = workspaceRef.current;
    const recovering = initial.pending.length > 0;
    const recoverable = initial.pending.filter((batch) => Date.now() - batch.sentAt < RECOVERY_WINDOW_MS
      && IMAGE_NAME_MODELS.some(({ id }) => id === batch.model));
    if (recoverable.length < initial.pending.length) {
      await saveWorkspace({ ...initial, pending: recoverable });
      setError('Có lô đã hết hạn khôi phục hoặc dùng model đã ngừng hỗ trợ. Tra cứu phần chưa có kết quả sẽ gửi yêu cầu mới.');
      return;
    }
    // Checking an earlier request must not start additional paid batches.
    const remaining = recovering ? [] : folders.filter(({ id }) => replaceAll || !initial.suggestions.has(id));
    if (!remaining.length && !recovering) return;

    const controller = new AbortController();
    const task = { controller, pauseRequested: false, blocked: false };
    operation.current = task;
    setError('');
    setPaused(false);
    setReviewFilter(null);
    setConfirmRegenerate(false);
    setBusy('lookup');
    const aiRunId = newOperationId();
    const batches = recovering ? recoverable : chunkArray(remaining, FOLDER_LOOKUP_BATCH_SIZE).map((batch) => ({
      folders: batch.map(({ id, name }) => ({ id, name })), targets: batch.map(({ id }) => id),
      prompt, model: activeModel, aiRunId, requestId: newOperationId(),
    }));
    const total = batches.reduce((count, batch) => count + batch.targets.filter(Boolean).length, 0);
    let finished = 0;
    setProgress({ finished, total });

    const deferred = [];
    let retrySerially = false;
    const canContinue = () => !controller.signal.aborted && !task.pauseRequested && !task.blocked;

    async function lookupBatch(batch, allowSerialRetry) {
      if (!canContinue()) return;
      try {
        // Checkpoint the exact request before sending it. Reload or network loss can
        // then recover every in-flight batch using the original request IDs.
        if (!recovering) {
          const workspace = workspaceRef.current;
          await saveWorkspace({ ...workspace, started: true, pending: [...workspace.pending, { ...batch, sentAt: Date.now() }] });
        }
        if (controller.signal.aborted) return;
        const { targets, ...request } = batch;
        const response = await requestFolderNameSuggestions({ ...request, signal: controller.signal });
        if (controller.signal.aborted) return;
        const workspace = workspaceRef.current;
        const pending = workspace.pending.filter((item) => item.requestId !== batch.requestId);
        if (response.code === 'too_many_concurrent' && allowSerialRetry) {
          // The server refused this request before calling AI. Retry after the
          // other in-flight batch settles, using the same request ID.
          deferred.push(batch);
          retrySerially = true;
          if (!recovering) await saveWorkspace({ ...workspace, pending });
          return;
        }
        if (response.error) {
          const previousOutcome = CLOSED_REQUEST_ERRORS.has(response.code) || (recovering && response.code === AI_NAMING_ERRORS.modelDenied);
          const keepPending = RECOVERABLE_REQUEST_ERRORS.has(response.code) || (recovering && (RECOVERY_ACCESS_ERRORS.has(response.code)
            || response.code === 'too_many_concurrent'));
          setError((previous) => previous || (previousOutcome ? `${response.error} Gửi yêu cầu mới có thể phát sinh chi phí.` : response.error));
          if ([AI_NAMING_ERRORS.authRequired, AI_NAMING_ERRORS.modelDenied, AI_NAMING_ERRORS.accessDenied].includes(response.code)) {
            onAccessRejected(response.code);
          }
          if (keepPending || FATAL_IMAGE_NAME_ERRORS.has(response.code) || CLOSED_REQUEST_ERRORS.has(response.code)
            || response.code === 'too_many_concurrent' || response.code === 'upstream_rate_limited') task.blocked = true;
          if (!keepPending) await saveWorkspace({ ...workspace, pending });
          return;
        }

        const results = new Map(workspace.suggestions);
        const found = matchFolderSuggestions(batch.folders, response.data?.items ?? []);
        batch.folders.forEach(({ id }, index) => {
          const item = found.get(id);
          const target = targets[index];
          if (target && item && typeof item.suggestedName === 'string' && Array.isArray(item.issues)) results.set(target, item);
        });
        await saveWorkspace({ ...workspace, pending, suggestions: results });
        finished += targets.filter(Boolean).length;
        setProgress({ finished, total });
      } catch {
        if (controller.signal.aborted) return;
        task.blocked = true;
        setError((previous) => previous || 'Không thể hoàn tất tra cứu. Hãy thử lại các folder còn thiếu.');
      }
    }

    try {
      await runWithConcurrency(batches, AI_REQUEST_CONCURRENCY, async (batch) => {
        if (retrySerially) deferred.push(batch);
        else await lookupBatch(batch, batches.length > 1);
      });
      if (retrySerially && canContinue()) {
        await runWithConcurrency(deferred, 1, (batch) => lookupBatch(batch, false));
      }
      if (task.pauseRequested) setPaused(finished < total);
    } finally {
      if (operation.current === task) {
        operation.current = null;
        if (dialog.current) setBusy(null);
      }
    }
  }

  function pauseNewBatches() {
    if (!operation.current) return;
    operation.current.pauseRequested = true;
    setPaused(true);
  }

  function closeDialog() {
    setConfirmRegenerate(false);
    onClose();
  }

  const rows = hasDraft ? folders.map(({ id, name }, index) => {
    const suggestion = suggestions.get(id);
    const draft = edits.get(id) ?? {};
    const labels = getFolderNameLabels(name.normalize('NFC'));
    const issues = suggestion?.issues.filter((code) => Object.hasOwn(FOLDER_NAME_ISSUES, code)) ?? [];
    const needsSuffixChoice = issues.includes('unusual_suffix');
    const pending = (labels.length > 0 && !draft.label) || (needsSuffixChoice && !draft.suffix);
    const newName = resolveName(name, suggestion, labels, draft);
    return { id, rowNumber: index + 2, currentName: name, newName, labels, draft, needsSuffixChoice, pending, issues, suggestion, error: getAiFolderNameError(newName) };
  }) : [];
  const forReview = rows.filter((row) => row.issues.length || row.pending || row.error || !row.suggestion);
  const visibleRows = reviewFilter ? rows.filter(({ id }) => reviewFilter.has(id)) : rows;
  const awaitingReview = rows.filter((row) => row.pending || row.error).length;
  const hasNames = suggestions.size > 0 || edits.size > 0;
  const ready = !busy && hasNames && !awaitingReview;
  const allLookedUp = folders.length > 0 && suggestions.size === folders.length;
  const showLookupActions = busyLookup || !allLookedUp || recoveredRequest;
  const progressHint = busyLookup ? 'Bạn có thể thu gọn và mở lại để xem tiến độ.'
    : recoveredRequest ? `Còn ${pendingCount} lô chưa xác nhận kết quả. Bạn có thể kiểm tra lại các yêu cầu đã gửi.`
      : paused ? 'Đã tạm dừng. Kết quả đã có được giữ trong bản nháp.'
        : !hasDraft ? `Tối đa ${FOLDER_LOOKUP_BATCH_SIZE} folder mỗi lô, ${AI_REQUEST_CONCURRENCY} lô cùng lúc. Kết quả tự lưu theo từng lô.` : null;

  async function exportNames() {
    if (!ready) return;
    setError('');
    setBusy('export');
    try {
      const { exportFolderNamesToExcel } = await import('../../../utils/watermarkAutoFolderExcel.js');
      if (dialog.current) exportFolderNamesToExcel(products, new Map(rows.map(({ id, newName }) => [id, normalizeFolderName(newName)])));
    } catch (exception) {
      setError(exception.message || 'Không thể xuất Excel. Hãy thử lại.');
    } finally {
      if (dialog.current) setBusy(null);
    }
  }

  function applyNames() {
    if (!ready) return;
    try {
      onApply(rows.map(({ id, newName, rowNumber }) => ({ id, name: normalizeFolderName(newName), rowNumber })));
      onClose();
    } catch (exception) {
      setError(exception.message || 'Không thể áp dụng tên folder. Hãy thử lại.');
    }
  }

  return (
    <dialog className="wma-folder-naming" ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); closeDialog(); }}>
      <header className="wma-folder-naming-head">
        <div>
          <h2 id={titleId}>Đặt tên folder bằng AI</h2>
          <p className="wma-hint">Tra cứu web và duyệt tên cho {folders.length} folder. Tên đã duyệt dùng cho Result hoặc cột D trong Excel.</p>
        </div>
        <button type="button" className="wma-icon-btn" aria-label={busyLookup ? 'Thu gọn đặt tên folder' : 'Đóng đặt tên folder'}
          title={busyLookup ? 'Thu gọn, tiếp tục tra cứu' : 'Đóng và giữ bản nháp'} onClick={closeDialog}>×</button>
      </header>
      <div className="wma-folder-naming-body">
        <section className="wma-folder-naming-progress" aria-label="Tiến độ đặt tên folder">
          <div className="wma-folder-naming-progress-head">
            <strong role="status">{busyLookup
              ? `${paused ? 'Đang chờ các lô đang chạy' : 'Đang tra cứu'} · ${progress?.finished ?? 0}/${progress?.total ?? folders.length}`
              : !current ? 'Đang mở bản nháp' : `${suggestions.size}/${folders.length} folder có kết quả`}</strong>
            {hasDraft && <span className="wma-folder-draft-badge">{userId && storage === 'ready' ? 'Tự lưu trên trình duyệt' : 'Lưu trong trang này'}</span>}
          </div>
          {busyLookup && progress && <progress aria-label="Số folder đã xử lý trong lượt này" value={progress.finished} max={progress.total} />}
          {progressHint && <p className="wma-hint">{progressHint}</p>}
          {showLookupActions && <div className="wma-picker-actions">
            {!busyLookup && (!allLookedUp || recoveredRequest) && <button type="button" className="wm-btn-primary" disabled={!canGenerate} onClick={() => generate()}>
              {recoveredRequest ? 'Kiểm tra yêu cầu đã gửi' : hasDraft ? 'Tra cứu phần còn lại' : 'Tra cứu và tạo tên'}
            </button>}
            {busyLookup && <button type="button" className="wm-btn-outline" disabled={paused} onClick={pauseNewBatches}>Tạm dừng gửi lô mới</button>}
            {busyLookup && <button type="button" className="wm-btn-outline" onClick={closeDialog}>Thu gọn</button>}
          </div>}
        </section>
        {accessMessage && <p className="wma-hint" role="status">{accessMessage}</p>}
        {error && <p className="wma-row-error" role="alert">{error}</p>}
        <details className="wma-folder-naming-prompt">
          <summary>Model AI và prompt{currentModel && <span className="wma-hint">{currentModel.label}</span>}</summary>
          <label className="wma-folder-naming-model">
            Model AI
            <select value={activeModel ?? ''} disabled={Boolean(busy) || !models.length} onChange={(event) => setSelectedModel(event.target.value)}>
              {!models.length && <option value="">Chưa có model</option>}
              {models.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="wma-folder-naming-prompt-field">Prompt đặt tên folder
            <textarea value={prompt} aria-label="Prompt đặt tên folder" maxLength={IMAGE_NAME_LIMITS.maxPromptLength} disabled={Boolean(busy)} onChange={(event) => updatePrompt(event.target.value)} />
          </label>
          <div className="wma-picker-actions">
            <button type="button" className="wm-btn-outline wm-btn-small" disabled={Boolean(busy)} onClick={() => updatePrompt(DEFAULT_FOLDER_NAME_PROMPT)}>Khôi phục prompt mặc định</button>
            <p className="wma-hint">Tự lưu trên trình duyệt này. Để trống để dùng prompt mặc định.</p>
          </div>
        </details>
        {rows.length > 0 && (
          <>
            <div className="wma-folder-naming-filters" aria-label="Lọc bảng tên folder" role="group">
              <button type="button" aria-pressed={!reviewFilter} onClick={() => setReviewFilter(null)}>Tất cả <span>{rows.length}</span></button>
              <button type="button" aria-pressed={Boolean(reviewFilter)} onClick={() => setReviewFilter(new Set(forReview.map(({ id }) => id)))}>Cần kiểm tra <span>{forReview.length}</span></button>
              {!busyLookup && suggestions.size > 0 && !recoveredRequest && !confirmRegenerate && (
                <button type="button" className="wma-folder-repeat" disabled={!canGenerate} onClick={() => setConfirmRegenerate(true)}>Tra cứu lại tất cả</button>
              )}
            </div>
            {confirmRegenerate && <div className="wma-folder-naming-confirm" role="group" aria-label="Xác nhận tra cứu lại">
              <p>Tra cứu lại {folders.length} folder sẽ gửi yêu cầu AI mới và phát sinh chi phí. Tên bạn đã sửa sẽ được giữ.</p>
              <div className="wma-picker-actions">
                <button type="button" className="wm-btn-outline wm-btn-small" onClick={() => setConfirmRegenerate(false)}>Giữ bản nháp</button>
                <button type="button" className="wm-btn-primary wm-btn-small" disabled={!canGenerate} onClick={() => generate(true)}>Xác nhận tra cứu lại</button>
              </div>
            </div>}
            {!visibleRows.length && <p className="wma-hint">Đã duyệt hết các dòng trong mục này.</p>}
            {visibleRows.length > 0 && (
            <div className="wma-folder-naming-table" tabIndex={0} role="region" aria-label="Bảng tên folder">
              <table role="table">
                <thead role="rowgroup"><tr role="row"><th scope="col">Tên hiện tại (cột C)</th><th scope="col">Tên mới (cột D)</th><th scope="col">Ký tự</th></tr></thead>
                <tbody role="rowgroup">
                  {visibleRows.map(({ id, rowNumber, currentName, newName, labels, draft, needsSuffixChoice, pending, issues, suggestion, error: nameError }) => {
                    const sources = (Array.isArray(suggestion?.sourceUrls) ? suggestion.sourceUrls : []).map(normalizeFolderSourceUrl).filter(Boolean);
                    const review = issues.map((code) => FOLDER_NAME_ISSUES[code]);
                    if (labels.length && !draft.label) review.push('Cần xác nhận nhãn tên cũ');
                    if (!suggestion) review.push(busyLookup ? 'Chưa nhận kết quả' : 'Chưa có kết quả tra cứu');
                    return (
                      <tr key={id} role="row">
                        <th scope="row" role="rowheader"><span className="wma-hint">Dòng {rowNumber}</span>{currentName}</th>
                        <td role="cell">
                          <span className="wma-folder-naming-mobile-label wma-hint" aria-hidden="true">Tên mới (cột D)</span>
                          <input type="text" aria-label={`Tên mới dòng ${rowNumber}`} aria-invalid={Boolean(nameError)} value={newName} disabled={Boolean(busy) || pending}
                            onChange={(event) => updateDraft(id, { name: event.target.value })} />
                          {needsSuffixChoice && <label>Cách xử lý hậu tố mã
                            <select value={draft.suffix ?? ''} disabled={Boolean(busy)} onChange={(event) => updateDraft(id, { suffix: event.target.value, name: null })} aria-label={`Hậu tố mã dòng ${rowNumber}`}>
                              <option value="">Chọn cách xử lý</option><option value="suggested">Dùng mã gợi ý</option><option value="original">Giữ tên cũ</option>
                            </select>
                          </label>}
                          {labels.length > 0 && <label>Nhãn “{[...new Set(labels)].join('”, “')}”
                            <select value={draft.label ?? ''} disabled={Boolean(busy)} onChange={(event) => updateDraft(id, { label: event.target.value, name: null })} aria-label={`Nhãn tên cũ dòng ${rowNumber}`}>
                              <option value="">Chọn giữ hoặc bỏ</option><option value="keep">Giữ nhãn</option><option value="remove">Bỏ nhãn</option>
                            </select>
                          </label>}
                          {nameError && <span className="wma-row-error">{nameError}</span>}
                          {review.length > 0 && <p className="wma-folder-naming-feedback">{review.join(' · ')}{suggestion?.note ? ` (${suggestion.note})` : ''}</p>}
                          {sources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}</a>)}
                        </td>
                        <td role="cell">{normalizeFolderName(newName).length}/{FOLDER_NAME_LIMITS.maxLength}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </>
        )}
      </div>
      <footer className="wma-picker-actions wma-folder-naming-footer">
        {!busy && awaitingReview > 0 && <p className="wma-hint wma-folder-footer-note">Còn {awaitingReview} dòng cần xác nhận hoặc sửa trước khi xuất.</p>}
        <button type="button" className="wm-btn-outline" disabled={!ready} onClick={exportNames}>Xuất Excel với tên AI</button>
        <button type="button" className="wm-btn-primary" disabled={!ready} onClick={applyNames}>Áp dụng tên folder</button>
      </footer>
    </dialog>
  );
}
