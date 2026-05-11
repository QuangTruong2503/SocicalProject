import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import ExcelUploader from '../components/seo/ExcelUploader.jsx';
import PromptEditor from '../components/seo/PromptEditor.jsx';
import ProgressPanel from '../components/seo/ProgressPanel.jsx';
import LogConsole from '../components/seo/LogConsole.jsx';
import SessionResumeModal from '../components/seo/SessionResumeModal.jsx';
import '../styles/SeoExcelGenerator.css';
import {
  extractWorkbookRows,
  parseWorkbookBuffer,
  restoreWorkbookSnapshot,
  serializeWorkbookSnapshot,
  updateWorkbookTag,
} from '../utils/excelParser.js';
import { requestSeoTagsFromOpenAI } from '../utils/openaiClient.js';
import { downloadWorkbook } from '../utils/fileSaver.js';
import {
  clearSeoExcelDB,
  getAllProducts,
  getSessionSnapshot,
  hasPendingSession,
  saveProduct,
  saveProducts,
  saveSessionSnapshot,
} from '../utils/seoExcelDB.js';

const DEFAULT_PROMPT = `Tạo danh sách SEO tag cho sản phẩm sau.

Tên sản phẩm:
{{TEN}}

Mô tả:
{{MO_TA}}

Yêu cầu:

* Viết tag tiếng Việt
* Chuẩn SEO
* 5-10 tag
* phân tách bằng dấu phẩy
* không giải thích`;

const STORAGE_KEYS = {
  prompt: 'seo-excel-generator.prompt',
  apiKey: 'seo-excel-generator.apiKey',
  model: 'seo-excel-generator.model',
  delayMs: 'seo-excel-generator.delayMs',
};

const MODEL_OPTIONS = ['gpt-4o-mini', 'gpt-5.4-mini'];
const RETRY_DELAYS = [2000, 5000, 10000];
const PROGRESS_FILE_NAME = 'seo_output_progress.xlsx';
const FINAL_FILE_NAME = 'seo_output_final.xlsx';

function safeNumber(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatEta(totalItems, processedItems, elapsedMs, delayMs) {
  if (!totalItems || !processedItems) {
    return 0;
  }

  const remainingItems = Math.max(totalItems - processedItems, 0);
  const avgPerItem = elapsedMs / processedItems;
  return Math.max(remainingItems * avgPerItem + (remainingItems * delayMs), 0);
}

function formatProgressLabel(status) {
  switch (status) {
    case 'ready':
      return 'Sẵn sàng';
    case 'processing':
      return 'Đang xử lý';
    case 'paused':
      return 'Đã tạm dừng';
    case 'completed':
      return 'Hoàn tất';
    case 'stopped':
      return 'Đã dừng';
    case 'error':
      return 'Có lỗi';
    default:
      return 'Chưa sẵn sàng';
  }
}

function normalizeTemplate(prompt, name, description) {
  return prompt
    .replace(/\{\{TEN\}\}/g, name || '')
    .replace(/\{\{MO_TA\}\}/g, description || 'Không có mô tả');
}

function normalizeTagResponse(text) {
  if (!text) {
    return '';
  }

  const trimmed = text.trim();

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((item) => String(item).trim()).filter(Boolean))].join(', ');
      }
    } catch {
      // Fall through to text normalization.
    }
  }

  const cleaned = trimmed
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[•·]/g, ',')
    .replace(/\n+/g, ',')
    .replace(/^\s*\d+[).:-]\s*/gm, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/,+/g, ',')
    .trim();

  const tags = cleaned
    .split(/[,;|]/)
    .map((tag) => tag.trim().replace(/^["'`]+|["'`]+$/g, ''))
    .filter(Boolean);

  return [...new Set(tags)].join(', ');
}

export default function SeoExcelGenerator() {
  const [prompt, setPrompt] = useState(() => window.localStorage.getItem(STORAGE_KEYS.prompt) || '');
  const [apiKey, setApiKey] = useState(() => window.localStorage.getItem(STORAGE_KEYS.apiKey) || import.meta.env.VITE_OPENAI_API_KEY || '');
  const [model, setModel] = useState(() => window.localStorage.getItem(STORAGE_KEYS.model) || 'gpt-4o-mini');
  const [delayMs, setDelayMs] = useState(() => safeNumber(window.localStorage.getItem(STORAGE_KEYS.delayMs), 1500));
  const [fileInfo, setFileInfo] = useState({
    fileName: '',
    rowCount: 0,
    statusText: 'Chưa chọn file',
    statusTone: 'idle',
  });
  const [fileSummary, setFileSummary] = useState({
    sheetDataRows: 0,
    pendingRows: 0,
    skippedRows: 0,
    emptyRows: 0,
    totalRows: 0,
  });
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState({
    total: 0,
    processed: 0,
    currentRow: null,
    success: 0,
    errors: 0,
  });
  const [etaMs, setEtaMs] = useState(0);
  const [logs, setLogs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [sessionPromptOpen, setSessionPromptOpen] = useState(false);
  const [sessionSummary, setSessionSummary] = useState({
    pendingCount: 0,
    totalCount: 0,
  });
  const resolvedApiKey = apiKey.trim() || import.meta.env.VITE_OPENAI_API_KEY || '';

  const workbookRef = useRef(null);
  const sheetNameRef = useRef('');
  const rowsRef = useRef([]);
  const fileInputRef = useRef(null);
  const currentIndexRef = useRef(0);
  const processingRef = useRef(false);
  const pausedRef = useRef(false);
  const stopRef = useRef(false);
  const startedAtRef = useRef(0);
  const abortRef = useRef(null);
  const toastIdRef = useRef(0);
  const progressRef = useRef(progress);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    progressRef.current = progress;
  }, [progress]);

  function pushToast(type, title, message) {
    toastIdRef.current += 1;
    const id = toastIdRef.current;

    setToasts((current) => [...current, { id, type, title, message }]);

    window.setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }

      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }

  function addLog(message) {
    const timestamp = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setLogs((current) => [`[${timestamp}] ${message}`, ...current].slice(0, 300));
  }

  function persistSettings(nextState = {}) {
    try {
      if (nextState.prompt !== undefined) {
        window.localStorage.setItem(STORAGE_KEYS.prompt, nextState.prompt);
      }

      if (nextState.apiKey !== undefined) {
        window.localStorage.setItem(STORAGE_KEYS.apiKey, nextState.apiKey);
      }

      if (nextState.model !== undefined) {
        window.localStorage.setItem(STORAGE_KEYS.model, nextState.model);
      }

      if (nextState.delayMs !== undefined) {
        window.localStorage.setItem(STORAGE_KEYS.delayMs, String(nextState.delayMs));
      }
    } catch {
      pushToast('warning', 'Không thể lưu cài đặt', 'Trình duyệt đã chặn localStorage hoặc đã đầy bộ nhớ.');
    }
  }

  async function restorePersistedSettings() {
    try {
      const savedPrompt = window.localStorage.getItem(STORAGE_KEYS.prompt);
      const savedApiKey = window.localStorage.getItem(STORAGE_KEYS.apiKey);
      const savedModel = window.localStorage.getItem(STORAGE_KEYS.model);
      const savedDelay = window.localStorage.getItem(STORAGE_KEYS.delayMs);

      if (savedPrompt) {
        setPrompt(savedPrompt);
      }

      if (savedApiKey) {
        setApiKey(savedApiKey);
      }

      if (savedModel) {
        setModel(savedModel);
      }

      if (savedDelay) {
        setDelayMs(safeNumber(savedDelay, 1500));
      }
    } catch (error) {
      console.error('[SeoExcelGenerator] Failed to restore state', error);
      pushToast('warning', 'Khôi phục thất bại', 'Không thể đọc cài đặt lưu trước đó.');
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    const bootstrap = async () => {
      await restorePersistedSettings();

      try {
        const summary = await hasPendingSession();
        if (summary.hasSession && summary.pendingCount > 0) {
          setSessionSummary({
            pendingCount: summary.pendingCount,
            totalCount: summary.totalCount,
          });
          setSessionPromptOpen(true);
        }
      } catch (error) {
        console.error('[SeoExcelGenerator] Failed to inspect session', error);
      }
    };

    void bootstrap();

    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persistSettings({ prompt, apiKey, model, delayMs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, apiKey, model, delayMs]);

  useEffect(() => {
    const total = progress.total;
    const processed = progress.processed;
    const elapsedMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    const nextEta = formatEta(total, processed, elapsedMs, delayMs);
    setEtaMs(nextEta);
  }, [delayMs, progress.processed, progress.total]);

  useEffect(() => {
    const nextTone = status === 'completed'
      ? 'done'
      : status === 'processing'
        ? 'running'
        : status === 'paused'
          ? 'paused'
          : status === 'error'
            ? 'error'
            : status === 'ready'
              ? 'ready'
              : 'idle';

    setFileInfo((current) => ({
      ...current,
      statusText: formatProgressLabel(status),
      statusTone: nextTone,
    }));
  }, [status]);

  async function saveProgressWorkbook(overrides = {}) {
    if (!workbookRef.current) {
      return;
    }

    try {
      const snapshot = {
        total: progressRef.current.total,
        processed: progressRef.current.processed,
        success: progressRef.current.success,
        errors: progressRef.current.errors,
        currentIndex: currentIndexRef.current,
        ...overrides,
      };

      const workbookBase64 = serializeWorkbookSnapshot(workbookRef.current);
      const sessionPayload = {
        workbookBase64,
        sheetName: sheetNameRef.current,
        fileName: overrides.fileName ?? fileInfo.fileName,
        total: snapshot.total,
        processed: snapshot.processed,
        success: snapshot.success,
        errors: snapshot.errors,
        currentIndex: snapshot.currentIndex,
        status: overrides.status ?? status,
      };

      const productPayloads = rowsRef.current.map((row) => ({
        id: row.rowNumber,
        ten: row.name || '',
        moTa: row.description || '',
        tag: row.tags || row.result || row.tag || '',
        status: row.status || (row.tags || row.result ? 'success' : 'pending'),
        updatedAt: row.updatedAt || new Date().toISOString(),
      }));

      await Promise.all([
        saveSessionSnapshot(sessionPayload),
        saveProducts(productPayloads),
      ]);
    } catch (error) {
      console.error('[SeoExcelGenerator] saveProgressWorkbook failed', error);
      pushToast('warning', 'Không thể lưu tiến độ', 'IndexedDB hoặc snapshot workbook đang gặp vấn đề.');
    }
  }

  async function hydrateSessionFromIndexedDB() {
    const [session, products] = await Promise.all([
      getSessionSnapshot(),
      getAllProducts(),
    ]);

    if (!session?.workbookBase64) {
      throw new Error('Không tìm thấy snapshot workbook của session.');
    }

    const workbook = restoreWorkbookSnapshot(session.workbookBase64);

    if (!workbook) {
      throw new Error('Không thể khôi phục workbook gốc từ IndexedDB.');
    }

    const parsed = extractWorkbookRows(workbook);
    const productMap = new Map(products.map((product) => [Number(product.id), product]));
    const mergedRows = parsed.rows
      .filter((row) => row.shouldProcess)
      .map((row) => {
        const saved = productMap.get(row.rowNumber);
        const mergedTag = saved?.tag || row.tag || '';
        const mergedStatus = saved?.status || (mergedTag ? 'success' : 'pending');

        if (mergedTag) {
          updateWorkbookTag(workbook, session.sheetName || parsed.sheetName, row.rowNumber, mergedTag);
        }

        return {
          ...row,
          tags: mergedTag,
          result: mergedTag,
          status: mergedStatus,
          updatedAt: saved?.updatedAt || new Date().toISOString(),
        };
      });

    const successCount = mergedRows.filter((row) => row.status === 'success').length;
    const errorCount = mergedRows.filter((row) => row.status === 'error').length;
    const pendingRows = mergedRows.filter((row) => ['pending', 'processing'].includes(row.status));
    const currentRow = pendingRows[0]?.rowNumber || null;

    return {
      session,
      workbook,
      sheetName: session.sheetName || parsed.sheetName,
      rows: mergedRows,
      summary: parsed.summary,
      progress: {
        total: mergedRows.length,
        processed: successCount + errorCount,
        success: successCount,
        errors: errorCount,
        currentRow,
        currentIndex: currentRow ? mergedRows.findIndex((row) => row.rowNumber === currentRow) : mergedRows.length,
      },
      hasPending: pendingRows.length > 0,
    };
  }

  async function applySessionToWorkspace({ showToast = true } = {}) {
    const hydrated = await hydrateSessionFromIndexedDB();

    workbookRef.current = hydrated.workbook;
    sheetNameRef.current = hydrated.sheetName;
    rowsRef.current = hydrated.rows;
    currentIndexRef.current = hydrated.progress.currentIndex >= 0 ? hydrated.progress.currentIndex : 0;
    setLogs([]);
    setStatus(hydrated.hasPending ? 'paused' : 'completed');
    setProgress({
      total: hydrated.progress.total,
      processed: hydrated.progress.processed,
      currentRow: hydrated.progress.currentRow,
      success: hydrated.progress.success,
      errors: hydrated.progress.errors,
    });
    progressRef.current = {
      total: hydrated.progress.total,
      processed: hydrated.progress.processed,
      currentRow: hydrated.progress.currentRow,
      success: hydrated.progress.success,
      errors: hydrated.progress.errors,
    };
    setFileSummary({
      sheetDataRows: hydrated.summary.sheetDataRows,
      pendingRows: hydrated.summary.pendingRows,
      skippedRows: hydrated.summary.skippedRows,
      emptyRows: hydrated.summary.emptyRows,
      totalRows: hydrated.summary.totalRows,
    });
    setFileInfo({
      fileName: hydrated.session.fileName || 'seo_output_progress.xlsx',
      rowCount: hydrated.summary.sheetDataRows,
      statusText: hydrated.hasPending
        ? 'Đã khôi phục session dang dở'
        : 'Session đã hoàn tất',
      statusTone: hydrated.hasPending ? 'paused' : 'done',
    });
    setSessionPromptOpen(false);
    if (showToast) {
      pushToast('success', 'Đã khôi phục session', hydrated.hasPending ? 'Bạn có thể tiếp tục xử lý.' : 'Session đã hoàn tất.');
    }

    return hydrated;
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const validFile = /\.(xlsx|xls)$/i.test(file.name);

    if (!validFile) {
      pushToast('error', 'Sai định dạng file', 'Chỉ hỗ trợ .xlsx và .xls.');
      event.target.value = '';
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parseWorkbookBuffer(arrayBuffer);
      await clearSeoExcelDB();

      workbookRef.current = parsed.workbook;
      sheetNameRef.current = parsed.sheetName;
      rowsRef.current = parsed.rows.filter((row) => row.shouldProcess).map((row) => ({
        ...row,
        status: 'pending',
        tags: '',
        result: '',
      }));
      currentIndexRef.current = 0;
      processingRef.current = false;
      pausedRef.current = false;
      stopRef.current = false;
      startedAtRef.current = 0;
      setSessionPromptOpen(false);
      setSessionSummary({
        pendingCount: 0,
        totalCount: 0,
      });
      setLogs([]);
      setStatus('ready');
      setProgress({
        total: rowsRef.current.length,
        processed: 0,
        currentRow: rowsRef.current[0]?.rowNumber || null,
        success: 0,
        errors: 0,
      });
      progressRef.current = {
        total: rowsRef.current.length,
        processed: 0,
        currentRow: rowsRef.current[0]?.rowNumber || null,
        success: 0,
        errors: 0,
      };
      setFileSummary({
        sheetDataRows: parsed.summary.sheetDataRows,
        pendingRows: parsed.summary.pendingRows,
        skippedRows: parsed.summary.skippedRows,
        emptyRows: parsed.summary.emptyRows,
        totalRows: parsed.summary.totalRows,
      });
      setFileInfo({
        fileName: file.name,
        rowCount: parsed.summary.sheetDataRows,
        statusText: `Đã đọc ${parsed.summary.sheetDataRows} dòng, có ${rowsRef.current.length} dòng cần xử lý`,
        statusTone: 'ready',
      });
      addLog(
        `Đã đọc file "${file.name}" với ${parsed.summary.sheetDataRows} dòng trong sheet, ${rowsRef.current.length} dòng cần xử lý, ${parsed.summary.skippedRows} dòng đã có Tag.`
      );
      pushToast(
        'success',
        'Đã nạp file',
        `Phát hiện ${parsed.summary.sheetDataRows} dòng trong sheet, ${rowsRef.current.length} dòng cần tạo tag.`
      );
      await saveProgressWorkbook({
        fileName: file.name,
        status: 'ready',
        total: rowsRef.current.length,
        processed: 0,
        success: 0,
        errors: 0,
        currentIndex: 0,
      });
    } catch (error) {
      console.error('[SeoExcelGenerator] handleFileChange failed', error);
      setStatus('error');
      pushToast('error', 'Không đọc được file Excel', error instanceof Error ? error.message : 'File không hợp lệ.');
    }
  }

  async function handleResetFile() {
    workbookRef.current = null;
    sheetNameRef.current = '';
    rowsRef.current = [];
    currentIndexRef.current = 0;
    processingRef.current = false;
    pausedRef.current = false;
    stopRef.current = false;
    startedAtRef.current = 0;
    setLogs([]);
    setStatus('idle');
    setProgress({
      total: 0,
      processed: 0,
      currentRow: null,
      success: 0,
      errors: 0,
    });
    progressRef.current = {
      total: 0,
      processed: 0,
      currentRow: null,
      success: 0,
      errors: 0,
    };
    setFileSummary({
      sheetDataRows: 0,
      pendingRows: 0,
      skippedRows: 0,
      emptyRows: 0,
      totalRows: 0,
    });
    setFileInfo({
      fileName: '',
      rowCount: 0,
      statusText: 'Chưa chọn file',
      statusTone: 'idle',
    });
    setSessionPromptOpen(false);
    setSessionSummary({
      pendingCount: 0,
      totalCount: 0,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    await clearSeoExcelDB();
    pushToast('success', 'Đã xoá file', 'Tool đã sẵn sàng nhận file mới.');
  }

  function loadDefaultPrompt() {
    setPrompt(DEFAULT_PROMPT);
    pushToast('success', 'Đã nạp prompt mặc định', 'Bạn có thể chỉnh sửa trước khi chạy.');
  }

  function savePromptToStorage() {
    persistSettings({ prompt });
    pushToast('success', 'Đã lưu prompt', 'Prompt template đã được lưu vào localStorage.');
  }

  function updateCounts(nextPatch) {
    setProgress((current) => ({ ...current, ...nextPatch }));
  }

  async function generateSingleRow(row) {
    const composedPrompt = normalizeTemplate(prompt, row.name, row.description);
    let lastError = null;

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt += 1) {
      if (stopRef.current) {
        throw new Error('Đã dừng xử lý theo yêu cầu.');
      }

      try {
        if (abortRef.current) {
          abortRef.current.abort();
        }

        abortRef.current = new AbortController();
        const responseText = await requestSeoTagsFromOpenAI({
          prompt: composedPrompt,
          apiKey: resolvedApiKey,
          model,
          signal: abortRef.current.signal,
          timeoutMs: 120000,
        });

        const normalized = normalizeTagResponse(responseText);

        if (!normalized) {
          throw new Error('Malformed response từ AI.');
        }

        return normalized;
      } catch (error) {
        lastError = error;

        if (attempt < RETRY_DELAYS.length - 1) {
          const waitMs = RETRY_DELAYS[attempt];
          addLog(`[Dòng ${row.rowNumber}] Lỗi ${error instanceof Error ? error.message : 'unknown'} - retry sau ${waitMs / 1000}s`);
          await new Promise((resolve) => window.setTimeout(resolve, waitMs));
          continue;
        }
      }
    }

    throw lastError || new Error('Lỗi không xác định khi gọi OpenAI.');
  }

  async function processRowsFromCurrentPosition() {
    if (processingRef.current) {
      return;
    }

    if (!workbookRef.current || !rowsRef.current.length) {
      pushToast('warning', 'Chưa có dữ liệu', 'Hãy upload file Excel trước khi xử lý.');
      return;
    }

    if (!resolvedApiKey) {
      pushToast('warning', 'Thiếu API key', 'Hãy thêm VITE_OPENAI_API_KEY vào .env hoặc nhập trực tiếp trong form.');
      return;
    }

    processingRef.current = true;
    stopRef.current = false;
    startedAtRef.current = startedAtRef.current || Date.now();
    setStatus('processing');
    addLog('Bắt đầu xử lý workbook.');

    try {
      while (currentIndexRef.current < rowsRef.current.length && !stopRef.current) {
        if (pausedRef.current) {
          setStatus('paused');
          break;
        }

        const row = rowsRef.current[currentIndexRef.current];

        if (!row) {
          break;
        }

        setStatus('processing');
        updateCounts({ currentRow: row.rowNumber });
        addLog(`[Dòng ${row.rowNumber}] Đang xử lý...`);
        row.status = 'processing';
        row.updatedAt = new Date().toISOString();
        await saveProduct({
          id: row.rowNumber,
          ten: row.name || '',
          moTa: row.description || '',
          tag: row.tags || row.result || '',
          status: row.status,
          updatedAt: row.updatedAt,
        });

        try {
          const generatedTags = await generateSingleRow(row);
          updateWorkbookTag(workbookRef.current, sheetNameRef.current, row.rowNumber, generatedTags || 'ERROR_API');
          row.result = generatedTags;
          row.status = 'success';
          row.tags = generatedTags;
          row.updatedAt = new Date().toISOString();
          addLog(`[Dòng ${row.rowNumber}] Thành công`);
          const nextProcessed = progressRef.current.processed + 1;
          const nextSuccess = progressRef.current.success + 1;
          setProgress((current) => ({
            ...current,
            processed: nextProcessed,
            success: nextSuccess,
          }));
          progressRef.current = {
            ...progressRef.current,
            processed: nextProcessed,
            success: nextSuccess,
          };
          await saveProduct({
            id: row.rowNumber,
            ten: row.name || '',
            moTa: row.description || '',
            tag: generatedTags,
            status: row.status,
            updatedAt: row.updatedAt,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Lỗi không xác định';
          updateWorkbookTag(workbookRef.current, sheetNameRef.current, row.rowNumber, 'ERROR_API');
          row.result = 'ERROR_API';
          row.status = 'error';
          row.error = message;
          row.tags = 'ERROR_API';
          row.updatedAt = new Date().toISOString();
          addLog(`[Dòng ${row.rowNumber}] Lỗi ${message}`);
          const nextProcessed = progressRef.current.processed + 1;
          const nextErrors = progressRef.current.errors + 1;
          setProgress((current) => ({
            ...current,
            processed: nextProcessed,
            errors: nextErrors,
          }));
          progressRef.current = {
            ...progressRef.current,
            processed: nextProcessed,
            errors: nextErrors,
          };
          await saveProduct({
            id: row.rowNumber,
            ten: row.name || '',
            moTa: row.description || '',
            tag: 'ERROR_API',
            status: row.status,
            updatedAt: row.updatedAt,
          });
        }

        currentIndexRef.current += 1;
        const nextRow = rowsRef.current[currentIndexRef.current];

        setProgress((current) => ({
          ...current,
          currentRow: nextRow?.rowNumber || null,
        }));

        await saveProgressWorkbook({
          status: 'processing',
          total: rowsRef.current.length,
          processed: progressRef.current.processed,
          success: progressRef.current.success,
          errors: progressRef.current.errors,
          currentIndex: currentIndexRef.current,
        });

        if (delayMs > 0 && currentIndexRef.current < rowsRef.current.length && !stopRef.current) {
          await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        }
      }

      if (stopRef.current) {
        setStatus('stopped');
        addLog('Đã dừng hẳn theo yêu cầu.');
      } else if (pausedRef.current) {
        setStatus('paused');
        addLog('Đã tạm dừng xử lý.');
      } else {
        setStatus('completed');
        addLog('Hoàn tất toàn bộ file.');
        await saveProgressWorkbook({ status: 'completed' });
        downloadWorkbook(workbookRef.current, FINAL_FILE_NAME);
        pushToast('success', 'Hoàn tất', `Đã xuất file cuối: ${FINAL_FILE_NAME}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể xử lý file.';
      setStatus('error');
      addLog(`Lỗi hệ thống: ${message}`);
      pushToast('error', 'Xử lý thất bại', message);
    } finally {
      processingRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
      }
    }
  }

  async function handleStart() {
    if (!workbookRef.current) {
      pushToast('warning', 'Chưa có workbook', 'Upload file Excel trước khi chạy.');
      return;
    }

    if (status === 'completed') {
      currentIndexRef.current = 0;
      setProgress((current) => ({
        ...current,
        processed: 0,
        success: 0,
        errors: 0,
        currentRow: rowsRef.current[0]?.rowNumber || null,
      }));
      progressRef.current = {
        total: rowsRef.current.length,
        processed: 0,
        currentRow: rowsRef.current[0]?.rowNumber || null,
        success: 0,
        errors: 0,
      };
    }

    pausedRef.current = false;
    stopRef.current = false;
    await processRowsFromCurrentPosition();
  }

  async function handlePause() {
    if (status !== 'processing') {
      return;
    }

    pausedRef.current = true;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setStatus('paused');
    addLog('Tạm dừng xử lý.');
    await saveProgressWorkbook({ status: 'paused' });
  }

  async function handleResume() {
    if (!workbookRef.current || !rowsRef.current.length) {
      pushToast('warning', 'Chưa có dữ liệu', 'Hãy upload file Excel hoặc khôi phục phiên làm việc.');
      return;
    }

    pausedRef.current = false;
    stopRef.current = false;
    if (!processingRef.current) {
      await processRowsFromCurrentPosition();
      return;
    }

    setStatus('processing');
    addLog('Tiếp tục xử lý.');
  }

  async function handleStop() {
    stopRef.current = true;
    pausedRef.current = false;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setStatus('stopped');
    addLog('Dừng hẳn theo yêu cầu.');
    await saveProgressWorkbook({ status: 'stopped' });
  }

  async function handleClearSession() {
    await clearSeoExcelDB();
    setSessionPromptOpen(false);
    setSessionSummary({
      pendingCount: 0,
      totalCount: 0,
    });
    pushToast('success', 'Đã xoá session', 'IndexedDB đã được dọn sạch.');
  }

  async function handleDownloadCurrentProgress() {
    try {
      const hydrated = workbookRef.current
        ? {
            workbook: workbookRef.current,
            sheetName: sheetNameRef.current,
            rows: rowsRef.current,
          }
        : await hydrateSessionFromIndexedDB();

      const workbook = hydrated.workbook;
      const products = workbookRef.current ? rowsRef.current : hydrated.rows;
      const sheetName = hydrated.sheetName;

      for (const row of products) {
        if (row?.tags || row?.result) {
          updateWorkbookTag(workbook, sheetName, row.rowNumber, row.tags || row.result || '');
        }
      }

      downloadWorkbook(workbook, progress.processed >= progress.total ? FINAL_FILE_NAME : PROGRESS_FILE_NAME);
      pushToast('success', 'Đã tải file', 'Current progress đã được export.');
    } catch (error) {
      console.error('[SeoExcelGenerator] handleDownloadCurrentProgress failed', error);
      pushToast('error', 'Không thể tải file', error instanceof Error ? error.message : 'Không thể merge dữ liệu từ IndexedDB.');
    }
  }

  async function handleResumeSession() {
    try {
      await applySessionToWorkspace({ showToast: true });
      setSessionPromptOpen(false);
    } catch (error) {
      console.error('[SeoExcelGenerator] handleResumeSession failed', error);
      pushToast('error', 'Không thể resume', error instanceof Error ? error.message : 'Session không hợp lệ.');
    }
  }

  async function handleStartNewSession() {
    await handleResetFile();
    setSessionPromptOpen(false);
    setSessionSummary({
      pendingCount: 0,
      totalCount: 0,
    });
  }

  const progressPercent = progress.total ? Math.min(Math.round((progress.processed / progress.total) * 100), 100) : 0;
  const statusLabel = fileInfo.statusText || formatProgressLabel(status);
  const canContinue = (status === 'paused' || status === 'stopped' || sessionPromptOpen) && Boolean(workbookRef.current || sessionPromptOpen);

  return (
    <>
      <Helmet>
        <title>SEO Excel Generator</title>
        <meta
          name="description"
          content="Upload Excel sản phẩm, sinh SEO tag bằng AI, tự động ghi vào cột Tag và lưu file tiến độ theo thời gian thực."
        />
      </Helmet>

      <div className="seo-excel-page">
        <div className="seo-excel-shell">
          <section className="seo-excel-hero">
            <div className="seo-excel-hero__top">
              <div>
                <span className="seo-excel-badge">SEO Excel Generator</span>
                <h1>Tự động tạo tag SEO từ file Excel bằng AI</h1>
              </div>

              <span className={`seo-status-badge seo-status-badge--${fileInfo.statusTone || 'idle'}`}>
                {statusLabel}
              </span>
            </div>

            <p>
              Upload file sản phẩm, map dữ liệu từ cột D/E/I, gửi từng dòng đến OpenAI,
              ghi kết quả vào cột Tag và tự động lưu snapshot tiến độ để bạn có thể tiếp tục khi trang bị gián đoạn.
            </p>

            <div className="seo-excel-hero__stats">
              <div className="seo-hero-stat">
                <span>Đã xử lý</span>
                <strong>{progress.processed}</strong>
              </div>
              <div className="seo-hero-stat">
                <span>Thành công</span>
                <strong>{progress.success}</strong>
              </div>
              <div className="seo-hero-stat">
                <span>Lỗi</span>
                <strong>{progress.errors}</strong>
              </div>
              <div className="seo-hero-stat">
                <span>Dòng cần xử lý</span>
                <strong>{progress.total}</strong>
              </div>
            </div>
          </section>

          <div className="seo-excel-layout">
            <div className="seo-excel-main">
              <ExcelUploader
                fileInfo={fileInfo}
                statusLabel={statusLabel}
                onFileChange={handleFileChange}
                onResetFile={handleResetFile}
                fileInputRef={fileInputRef}
                fileSummary={fileSummary}
              />

              <PromptEditor
                prompt={prompt}
                onPromptChange={setPrompt}
                onLoadDefault={loadDefaultPrompt}
                onSavePrompt={savePromptToStorage}
              />

              <ProgressPanel
                stats={{
                  total: progress.total,
                  processed: progress.processed,
                  currentRow: progress.currentRow,
                  success: progress.success,
                  errors: progress.errors,
                  statusLabel,
                  stageText: status === 'processing' ? 'Realtime save đang bật' : 'Sẵn sàng xử lý',
                  canStart: Boolean(workbookRef.current) && !processingRef.current,
                  canPause: status === 'processing' && !pausedRef.current,
                  canResume: canContinue && !processingRef.current,
                  canStop: status === 'processing' || status === 'paused',
                  canExport: Boolean(workbookRef.current || sessionPromptOpen),
                  canClearSession: Boolean(workbookRef.current || sessionPromptOpen || sessionSummary.totalCount),
                }}
                progressPercent={progressPercent}
                etaMs={etaMs}
                onStart={handleStart}
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
                onExportCurrent={handleDownloadCurrentProgress}
                onClearSession={handleClearSession}
              />
            </div>

            <div className="seo-excel-side">
              <section className="seo-excel-card">
                <div className="seo-excel-card__header">
                  <div>
                    <span className="seo-excel-kicker">OpenAI Config</span>
                    <h2>API key và model</h2>
                  </div>
                </div>

                <div className="seo-form-grid">
                  <label className="seo-form-field">
                    <span>API Key</span>
                    <input
                      type="password"
                      className="seo-input"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="sk-..."
                      autoComplete="off"
                    />
                  </label>

                  <label className="seo-form-field">
                    <span>Model</span>
                    <select
                      className="seo-input"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                    >
                      {MODEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="seo-form-field">
                    <span>Delay giữa mỗi request (ms)</span>
                    <input
                      type="number"
                      className="seo-input"
                      min="0"
                      step="100"
                      value={delayMs}
                      onChange={(event) => setDelayMs(safeNumber(event.target.value, 1500))}
                    />
                  </label>
                </div>

                <div className="seo-helper-line">
                  Mặc định dùng <code>{model}</code>. Bạn có thể lưu cài đặt ngay trong localStorage.
                </div>
              </section>

              <LogConsole logs={logs} />
            </div>
          </div>
        </div>

        <SessionResumeModal
          isOpen={sessionPromptOpen}
          summary={sessionSummary}
          onResume={handleResumeSession}
          onStartNew={handleStartNewSession}
          onDownloadCurrent={handleDownloadCurrentProgress}
        />

        <div className="seo-toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`seo-toast seo-toast--${toast.type}`}>
              <span className="seo-toast__title">{toast.title}</span>
              <div className="seo-toast__message">{toast.message}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
