import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import LogoUploader from '../components/watermark/LogoUploader';
import ImageUploader from '../components/watermark/ImageUploader';
import WatermarkControls from '../components/watermark/WatermarkControls';
import WatermarkGallery from '../components/watermark/WatermarkGallery';
import WatermarkLivePreview from '../components/watermark/WatermarkLivePreview';
import ImageLightbox from '../components/watermark/ImageLightbox';
import SeasonalEffectLayer from '../components/watermark/SeasonalEffectLayer';
import PersonalizationModal from '../components/watermark/PersonalizationModal.jsx';
import WatermarkModal from '../components/watermark/WatermarkModal.jsx';
import { buildFileName, getUniqueFileNames } from '../hooks/useWatermarkProcessor';
import { useAuth } from '../hooks/useAuth.js';
import { useAiNamingAccess } from '../hooks/useAiNamingAccess.js';
import { useTheme } from '../hooks/useTheme.js';
import { getUserDisplayName, hasProAccess } from '../utils/userProfile.js';
import { loadWatermarkOptions, saveWatermarkOptions } from '../hooks/useIndexedDB.js';
import { buildThemeAccentVars } from '../utils/colorTools.js';
import {
  createWatermarkImageCount,
  getMyWatermarkImageTotal,
  getWatermarkImageCountTotal,
  subscribeToWatermarkImageCounts,
} from '../services/watermarkImageCountService.js';
import { getOrCreateWatermarkVisitorId } from '../utils/watermarkVisitor.js';
import { trackUsageEvent, trackUsageEvents } from '../services/usageTelemetryService.js';
import {
  buildApplyEvents,
  buildCreateEvent,
  buildDownloadEvent,
  buildSingleDownloadEvent,
  createSubject,
  newUsageId,
} from '../utils/usageEvents.js';
import { runBatchDownload } from '../utils/watermarkDownload.js';
import { createWatermarkEngine } from '../utils/watermarkEngine.js';
import { DEFAULT_OPTIONS, mergeWatermarkOptions } from '../utils/watermarkOptions.js';
import {
  MAX_COPY_SOURCE_IMAGES,
  captureAndDownloadSourceImages,
  renderSourceImagesToPngBlob,
} from '../utils/sourceImageCapture.js';
import '../styles/Watermark.css';

const WATERMARK_COUNT_SOURCE_PAGE = 'watermark';

function formatCount(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function releaseResult(result) {
  URL.revokeObjectURL(result.url);
  if (result.thumb) URL.revokeObjectURL(result.thumb);
}

function triggerDownload(blob, fileName) {
  const anchor = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

function useAnimatedCount(value, duration = 700) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    const from = displayRef.current;
    if (from === target) return undefined;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let rafId;

    const tick = (now) => {
      const progress = reducedMotion ? 1 : Math.min((now - start) / duration, 1);
      const current = Math.round(from + (target - from) * (1 - (1 - progress) ** 3));
      displayRef.current = current;
      setDisplay(current);
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return display;
}

/** One compact line of counters above the tool. */
function WatermarkStatsStrip({ totalCreated, personalCreated, personalScope, lastCreated, isLoading, error, totalJustUpdated }) {
  const total = useAnimatedCount(totalCreated);
  const personal = useAnimatedCount(personalCreated);

  return (
    <dl className="wm-stats-strip" aria-label="Số ảnh đã tạo">
      <div className={`wm-stat${totalJustUpdated ? ' is-pulsing' : ''}`} title={error || undefined}>
        <dt>Toàn hệ thống</dt>
        <dd>{isLoading ? '…' : error ? '—' : formatCount(total)}</dd>
      </div>
      <div className="wm-stat">
        <dt>{personalScope === 'account' ? 'Tài khoản của bạn' : 'Trên trình duyệt này'}</dt>
        <dd>{isLoading ? '…' : formatCount(personal)}</dd>
      </div>
      {lastCreated > 0 && (
        <div className="wm-stat">
          <dt>Lần tạo gần nhất</dt>
          <dd>{formatCount(lastCreated)} ảnh</dd>
        </div>
      )}
    </dl>
  );
}

function WatermarkImageZoom({ image, onClose }) {
  if (!image) return null;
  if (Array.isArray(image.items)) return <SourceDetailModal image={image} onClose={onClose} />;
  return (
    <ImageLightbox
      items={Array.isArray(image.gallery) ? image.gallery : [image]}
      initialIndex={image.index || 0}
      onClose={onClose}
    />
  );
}

function SourceDetailModal({ image, onClose }) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const detailItems = image.items;
  const isCopyBlocked = detailItems.length > MAX_COPY_SOURCE_IMAGES;

  const handleCopy = async () => {
    if (isCopyBlocked || isCopying || isCapturing) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      toast.error('Trình duyệt này chưa hỗ trợ sao chép hình vào clipboard.');
      return;
    }
    setIsCopying(true);
    try {
      // Pass the blob as a promise so the clipboard write starts inside the click (required by Safari).
      const blobPromise = renderSourceImagesToPngBlob(detailItems);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      toast.success('Đã sao chép ảnh toàn cảnh vào clipboard.');
    } catch (error) {
      toast.error(error?.message || 'Không thể sao chép ảnh toàn cảnh.');
    } finally {
      setIsCopying(false);
    }
  };

  const handleCapture = async () => {
    if (isCapturing || isCopying) return;
    setIsCapturing(true);
    try {
      const fileCount = await captureAndDownloadSourceImages(detailItems);
      toast.success(fileCount > 1 ? `Đã tải ${fileCount} ảnh JPG toàn cảnh.` : 'Đã chụp và tải toàn bộ ảnh nguồn.');
    } catch (error) {
      toast.error(error?.message || 'Không thể chụp ảnh toàn cảnh.');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <WatermarkModal
      onClose={onClose}
      label={`Phóng to ${image.title}`}
      describedBy="wm-source-detail-description"
      backdropClassName="wm-preview-backdrop"
      className="wm-preview-modal wm-preview-modal--zoom wm-preview-modal--source-detail"
    >
      <div className="wm-preview-header wm-source-detail-header">
        <div className="wm-preview-title-wrap">
          <span className="wm-preview-kicker">{image.kicker || 'Xem ảnh'}</span>
          <strong className="wm-preview-title" title={image.title}>{image.title}</strong>
          <span className="wm-source-detail-description" id="wm-source-detail-description">
            {isCopyBlocked
              ? `Có ${detailItems.length} ảnh — chỉ sao chép được tối đa ${MAX_COPY_SOURCE_IMAGES} ảnh, hãy dùng "Xuất ảnh JPG"`
              : 'Kiểm tra thứ tự ảnh trước khi xuất bản tổng hợp JPG'}
          </span>
        </div>
        <div className="wm-preview-actions">
          <button
            className="wm-source-capture-button wm-source-copy-button"
            type="button"
            onClick={handleCopy}
            disabled={isCopyBlocked || isCopying || isCapturing}
            title={isCopyBlocked ? `Chỉ sao chép được tối đa ${MAX_COPY_SOURCE_IMAGES} ảnh` : undefined}
          >
            <span className="wm-source-capture-icon" aria-hidden="true">⧉</span>
            {isCopying ? 'Đang sao chép…' : 'Sao chép ảnh'}
          </button>
          <button
            className="wm-source-capture-button"
            type="button"
            onClick={handleCapture}
            disabled={isCapturing || isCopying}
            data-dialog-initial
          >
            <span className="wm-source-capture-icon" aria-hidden="true">↓</span>
            {isCapturing ? 'Đang tạo JPG…' : 'Xuất ảnh JPG'}
          </button>
          <button className="wm-preview-close" type="button" onClick={onClose} aria-label="Đóng (Esc)" title="Đóng (Esc)">
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>

      <div className="wm-preview-image-frame wm-source-detail-frame">
        <div className="wm-source-detail-grid">
          {detailItems.map((item) => (
            <figure className="wm-source-detail-item" key={`${item.url}-${item.index}`}>
              <div className="wm-source-detail-image-wrap">
                <img src={item.url} alt={item.title} loading="lazy" decoding="async" />
                <span className="wm-source-detail-index">{item.index}</span>
              </div>
            </figure>
          ))}
        </div>
      </div>
    </WatermarkModal>
  );
}

function DownloadMethodModal({ imageCount, onChoose, onClose }) {
  const canStream = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

  return (
    <WatermarkModal
      onClose={onClose}
      labelledBy="wm-download-choice-title"
      describedBy="wm-download-choice-description"
      backdropClassName="wm-download-choice-backdrop"
      className="wm-download-choice-modal"
    >
      <button className="wm-download-choice-close" type="button" onClick={onClose} aria-label="Đóng">×</button>
      <span className="wm-download-choice-kicker">Tùy chọn tải xuống</span>
      <h2 id="wm-download-choice-title">Tải {imageCount} ảnh theo cách nào?</h2>
      <p id="wm-download-choice-description">
        File ZIP tải đủ ảnh trong một lần{canStream ? ' và được ghi thẳng vào thư mục bạn chọn, không giữ cả file trong bộ nhớ' : ''}.
        Nếu tải từng ảnh, trình duyệt có thể hỏi cho phép tải nhiều file.
      </p>
      <div className="wm-download-choice-actions">
        <button type="button" className="wm-download-choice-primary" onClick={() => onChoose('zip')} data-dialog-initial>
          Tải file ZIP
          <small className="wm-download-choice-subtext">Khuyên dùng · Một lần tải, đủ tất cả ảnh</small>
        </button>
        <button type="button" className="wm-download-choice-secondary" onClick={() => onChoose('direct')}>
          Tải từng ảnh
        </button>
      </div>
    </WatermarkModal>
  );
}

/**
 * Writes the ZIP straight to a file the user picked (File System Access API),
 * so the whole archive is never held in memory. Resolves false if cancelled.
 */
async function streamZipToFile(zip, fileHandle, isCancelled) {
  const writable = await fileHandle.createWritable();
  const stream = zip.generateInternalStream({ type: 'uint8array', compression: 'STORE', streamFiles: true });

  try {
    const completed = await new Promise((resolve, reject) => {
      stream
        .on('data', (chunk) => {
          if (isCancelled()) {
            stream.pause();
            resolve(false);
            return;
          }
          stream.pause();
          writable.write(chunk).then(() => stream.resume(), reject);
        })
        .on('error', reject)
        .on('end', () => resolve(true))
        .resume();
    });

    if (completed) await writable.close();
    else await writable.abort();
    return completed;
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

export default function Watermark() {
  const { user, profile } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const aiNamingAccess = useAiNamingAccess();
  const resultsRef = useRef([]);
  // Results dropped from the list; their object URLs are revoked after React has
  // removed the <img> elements (lazy images that had not loaded yet would break).
  const pendingReleaseRef = useRef([]);
  const taskRef = useRef(null);
  // Stable result IDs: AI suggestions and renames are matched by ID, never by position.
  const resultIdRef = useRef(0);
  const mountedRef = useRef(true);
  const createButtonRippleIdRef = useRef(0);
  const totalPulseTimeoutRef = useRef(null);
  const [engine, setEngine] = useState(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoName, setLogoName] = useState(null);
  const [images, setImages] = useState([]);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [optionsHydrated, setOptionsHydrated] = useState(false);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [totalCreated, setTotalCreated] = useState(0);
  const [personalCreated, setPersonalCreated] = useState(0);
  const [lastCreated, setLastCreated] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [totalJustUpdated, setTotalJustUpdated] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [downloadChoiceMode, setDownloadChoiceMode] = useState(null);
  const [isPersonalizeOpen, setIsPersonalizeOpen] = useState(false);
  const [buttonRipples, setButtonRipples] = useState([]);
  const [visitorId] = useState(() => getOrCreateWatermarkVisitorId());
  const userId = user?.id ?? null;
  const pageThemeVars = useMemo(() => buildThemeAccentVars(options.accentColor, isDark), [options.accentColor, isDark]);
  const readableImages = useMemo(() => images.filter((image) => image.status !== 'error'), [images]);
  const unreadableCount = images.length - readableImages.length;

  // One rendering engine (Web Worker + fallback) for previews and exports.
  useEffect(() => {
    const nextEngine = createWatermarkEngine();
    setEngine(nextEngine);
    return () => nextEngine.dispose();
  }, []);

  useEffect(() => {
    if (!engine) return;
    let active = true;
    engine.setLogo(logoUrl)
      .then(() => { if (active) setLogoVersion((version) => version + 1); })
      .catch(() => { if (active) toast.error('Không thể đọc logo. Hãy chọn một file ảnh hợp lệ.'); });
    return () => { active = false; };
  }, [engine, logoUrl]);

  const handleLogoChange = useCallback((url, name) => {
    setLogoUrl(url);
    setLogoName(name);
  }, []);

  const openZoom = useCallback((image) => setZoomImage(image), []);
  const closeZoom = useCallback(() => setZoomImage(null), []);

  const handleCreateButtonPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    const targetRect = event.currentTarget.getBoundingClientRect();
    const id = `${Date.now()}-${(createButtonRippleIdRef.current += 1)}`;
    setButtonRipples((current) => [...current, { id, x: event.clientX - targetRect.left, y: event.clientY - targetRect.top }]);
    window.setTimeout(() => setButtonRipples((current) => current.filter((item) => item.id !== id)), 720);
  }, []);

  useEffect(() => {
    document.body.classList.add('wm-watermark-theme');
    return () => document.body.classList.remove('wm-watermark-theme');
  }, []);

  useEffect(() => {
    let isActive = true;

    loadWatermarkOptions()
      .then((savedOptions) => {
        if (isActive && savedOptions) setOptions(mergeWatermarkOptions(savedOptions));
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setOptionsHydrated(true);
      });

    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    if (!optionsHydrated) return undefined;

    const timer = window.setTimeout(() => {
      saveWatermarkOptions(options).catch((error) => {
        console.warn('[Watermark] Could not save watermark options', error);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [options, optionsHydrated]);

  // Signed in: count the account (same number as the dashboard). Otherwise: this browser.
  useEffect(() => {
    if (!visitorId) return undefined;
    let isActive = true;

    Promise.all([
      getWatermarkImageCountTotal({}),
      userId
        ? getMyWatermarkImageTotal()
        : getWatermarkImageCountTotal({ sourcePage: WATERMARK_COUNT_SOURCE_PAGE, visitorId }),
    ]).then(([totalResult, personalResult]) => {
      if (!isActive) return;
      setStatsError(totalResult.error || personalResult.error || null);
      setTotalCreated(totalResult.data || 0);
      setPersonalCreated(personalResult.data || 0);
      setStatsLoading(false);
    });

    return () => { isActive = false; };
  }, [visitorId, userId]);

  // Live total via Supabase Realtime Broadcast.
  useEffect(() => {
    if (!visitorId) return undefined;

    const unsubscribe = subscribeToWatermarkImageCounts((event) => {
      // Skip our own inserts — handleCreate already bumps the total locally.
      if (event.visitorId === visitorId) return;

      setTotalCreated((current) => current + event.imageCount);
      setTotalJustUpdated(true);
      window.clearTimeout(totalPulseTimeoutRef.current);
      totalPulseTimeoutRef.current = window.setTimeout(() => setTotalJustUpdated(false), 900);
    });

    return () => {
      window.clearTimeout(totalPulseTimeoutRef.current);
      unsubscribe();
    };
  }, [visitorId]);

  useEffect(() => {
    if (!zoomImage) return undefined;
    document.body.classList.add('wm-modal-open');
    return () => document.body.classList.remove('wm-modal-open');
  }, [zoomImage]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (taskRef.current) taskRef.current.cancelled = true;
      resultsRef.current.forEach(releaseResult);
      pendingReleaseRef.current.forEach(releaseResult);
      pendingReleaseRef.current = [];
    };
  }, []);

  useEffect(() => {
    const pending = pendingReleaseRef.current;
    pendingReleaseRef.current = [];
    pending.forEach(releaseResult);
  }, [results]);

  /** Replace the result list; removed items are released after the next commit. */
  const commitResults = useCallback((next) => {
    const kept = new Set(next);
    pendingReleaseRef.current.push(...resultsRef.current.filter((item) => !kept.has(item)));
    resultsRef.current = next;
    setResults(next);
  }, []);

  const handleCancelTask = useCallback(() => {
    if (taskRef.current) taskRef.current.cancelled = true;
  }, []);

  // ── Create watermarked images ──────────────────────────────────────
  const handleCreate = async () => {
    if (!readableImages.length || taskRef.current || !optionsHydrated || !engine) return;

    const task = { cancelled: false };
    taskRef.current = task;
    const sources = readableImages;
    const total = sources.length;
    // Usage event: subject fixed now; one batch ID shared by the images, downloads and AI names of this set.
    const subject = createSubject(userId, visitorId);
    const imageBatchId = newUsageId();
    const startedAt = performance.now();
    const skipped = unreadableCount;
    let processed = 0;
    let unexpectedError = false;
    const renderOptions = {
      size: options.size,
      opacity: options.opacity,
      margin: options.margin,
      tiled: options.tiled,
      logoPosition: options.logoPosition,
    };
    const created = [];
    const failedNames = [];
    setProcessing(true);
    setProcessingProgress({ current: 0, total });
    const loadingToastId = toast.loading('Đang chuẩn bị ảnh watermark…');

    try {
      for (let index = 0; index < total && !task.cancelled; index += 1) {
        try {
          const { blob, thumbBlob } = await engine.render(sources[index].file, renderOptions);
          if (!mountedRef.current) return;

          const item = {
            id: `res-${(resultIdRef.current += 1)}`,
            batchId: imageBatchId,
            // Original (no logo) for AI naming; a File reference, not a copy.
            sourceFile: sources[index].file,
            url: URL.createObjectURL(blob),
            thumb: URL.createObjectURL(thumbBlob),
            blob,
            fileName: buildFileName(options.productName, created.length, total),
          };

          // The previous batch is replaced only once the first new image exists,
          // so a batch that fails entirely keeps the old results.
          created.push(item);
          commitResults(created.length === 1 ? [item] : [...resultsRef.current, item]);
        } catch {
          failedNames.push(sources[index].name);
        }

        processed = index + 1;
        setProcessingProgress({ current: index + 1, total });
        toast.update(loadingToastId, { render: `Đang tạo ảnh (${index + 1}/${total})…` });
      }

      if (created.length) {
        setLastCreated(created.length);
        if (visitorId) {
          void createWatermarkImageCount({
            userId, visitorId,
            displayName: user ? getUserDisplayName(user, null) : null,
            userColor: options.accentColor,
            imageCount: created.length,
            sourcePage: WATERMARK_COUNT_SOURCE_PAGE,
          }).then((result) => {
            if (!mountedRef.current || result.error) return;
            setTotalCreated((current) => current + created.length);
            setPersonalCreated((current) => current + created.length);
          }).catch((error) => console.warn('[Watermark] Could not save image count', error));
        }
      }

      const notes = [
        failedNames.length ? `Không xử lý được: ${failedNames.slice(0, 3).join(', ')}${failedNames.length > 3 ? '…' : ''}.` : '',
        unreadableCount ? `Bỏ qua ${unreadableCount} ảnh không đọc được.` : '',
      ].filter(Boolean).join(' ');

      toast.update(loadingToastId, {
        render: task.cancelled
          ? `Đã dừng. Giữ lại ${created.length} ảnh đã tạo xong.`
          : `${created.length === total ? `Đã tạo xong ${created.length} ảnh watermark.` : `Đã tạo ${created.length}/${total} ảnh.`} ${notes}`.trim(),
        type: created.length ? (failedNames.length || task.cancelled ? 'warning' : 'success') : 'error',
        isLoading: false,
        autoClose: 5000,
        closeButton: true,
      });
    } catch (error) {
      unexpectedError = true;
      toast.update(loadingToastId, { render: error.message, type: 'error', isLoading: false, autoClose: 5000 });
    } finally {
      taskRef.current = null;
      if (mountedRef.current) setProcessing(false);
      // Images never started (stop button, page left, unexpected error) are "cancelled", not "failed".
      trackUsageEvent(buildCreateEvent({
        subject,
        imageBatchId,
        requested: total + skipped,
        succeeded: created.length,
        failed: failedNames.length,
        skipped,
        cancelled: total - processed,
        aborted: task.cancelled || !mountedRef.current,
        durationMs: performance.now() - startedAt,
        errorCode: unexpectedError ? 'unexpected' : null,
      }));
    }
  };

  // ── Download all ───────────────────────────────────────────────────
  const downloadAll = useCallback(async (mode, method) => {
    if (!results.length || taskRef.current || !engine) return;

    const subject = createSubject(userId, visitorId);
    const items = results;
    const total = items.length;
    const batchIds = new Set(items.map((item) => item.batchId));
    const imageBatchId = batchIds.size === 1 ? items[0].batchId ?? null : null;
    const imageSize = mode === '800x600' ? '800x600' : 'original';
    const startedAt = performance.now();
    const track = (outcome, errorCode) => trackUsageEvent(buildDownloadEvent({
      subject, imageBatchId, method, imageSize, requested: total, outcome, durationMs: performance.now() - startedAt, errorCode,
    }));

    // Ask for the ZIP destination first, while the click still counts as a user gesture.
    let fileHandle = null;
    if (method === 'zip' && typeof window.showSaveFilePicker === 'function') {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: `watermark-${Date.now()}.zip`,
          types: [{ description: 'File ZIP', accept: { 'application/zip': ['.zip'] } }],
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          // Closing the save dialog is not a download.
          track({ prepared: 0, delivered: 0, outputFiles: 0, delivery: null, cancelled: true, error: null }, 'picker_cancelled');
          return;
        }
        fileHandle = null;
      }
    }

    const task = { cancelled: false };
    taskRef.current = task;
    setIsDownloading(true);

    const names = getUniqueFileNames(items);
    setDownloadProgress({ current: 0, total, percent: 0, message: 'Đang chuẩn bị file tải xuống…' });
    const loadingToastId = toast.loading(`Đang chuẩn bị tải xuống (0/${total})…`);
    const prepare = (item) => (mode === '800x600' ? engine.resize(item.blob, 800, 600) : Promise.resolve(item.blob));
    const reportProgress = (done, message) => {
      setDownloadProgress({ current: done, total, percent: Math.round((done / total) * 100), message });
      toast.update(loadingToastId, { render: `${message}…`, progress: done / total });
    };

    const outcome = await runBatchDownload({
      items,
      names,
      method,
      prepare,
      fileHandle,
      task,
      triggerDownload,
      loadZip: async () => (await import('jszip')).default,
      streamZip: streamZipToFile,
      zipName: () => `watermark-${Date.now()}.zip`,
      onProgress: ({ phase, done }) => {
        if (phase === 'zip-add') reportProgress(done, `Đã thêm ${done}/${total} ảnh vào file ZIP`);
        else if (phase === 'zip-pack') setDownloadProgress({ current: total, total, percent: 100, message: 'Đang đóng gói file ZIP…' });
        else reportProgress(done, `Đã chuẩn bị ${done}/${total} ảnh`);
      },
    });

    if (outcome.error) {
      toast.update(loadingToastId, {
        render: outcome.error.message || 'Không thể chuẩn bị tải xuống. Vui lòng thử lại.',
        type: 'error', isLoading: false, progress: undefined, autoClose: 5000, closeButton: true,
      });
    } else if (outcome.cancelled) {
      toast.update(loadingToastId, { render: 'Đã hủy tải xuống.', type: 'info', isLoading: false, progress: undefined, autoClose: 3000 });
    } else {
      toast.update(loadingToastId, {
        render: method === 'zip'
          ? (fileHandle ? `Đã lưu file ZIP gồm ${total} ảnh.` : `Đã chuẩn bị file ZIP gồm ${total} ảnh. Kiểm tra mục tải xuống.`)
          : `Đã gửi ${total} ảnh tới trình duyệt để tải xuống.`,
        type: 'success',
        isLoading: false,
        progress: undefined,
        autoClose: 3000,
        closeButton: true,
      });
    }
    track(outcome);

    taskRef.current = null;
    if (mountedRef.current) {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  }, [engine, results, userId, visitorId]);

  // "Tải xuống" on one card (anchor download in ResultCard).
  const handleResultDownload = useCallback((result) => {
    trackUsageEvent(buildSingleDownloadEvent({ subject: createSubject(userId, visitorId), imageBatchId: result.batchId ?? null }));
  }, [userId, visitorId]);

  const handleDownloadAll = useCallback((mode) => {
    if (!results.length) return;
    if (results.length > 1) {
      setDownloadChoiceMode(mode);
      return;
    }
    downloadAll(mode, 'direct');
  }, [downloadAll, results.length]);

  const handleDownloadChoice = useCallback((method) => {
    const mode = downloadChoiceMode;
    setDownloadChoiceMode(null);
    if (mode) downloadAll(mode, method);
  }, [downloadAll, downloadChoiceMode]);

  const handleClear = useCallback(() => {
    if (taskRef.current) return;
    commitResults([]);
    setDownloadProgress(null);
    setProcessingProgress({ current: 0, total: 0 });
  }, [commitResults]);

  const handleRemoveResult = useCallback((index) => {
    if (taskRef.current) return;
    commitResults(resultsRef.current.filter((_, itemIndex) => itemIndex !== index));
  }, [commitResults]);

  // Renaming keeps the same blobs/URLs, so nothing is released.
  const renameResults = useCallback((rename) => {
    if (taskRef.current) return false;
    resultsRef.current = resultsRef.current.map(rename);
    setResults(resultsRef.current);
    return true;
  }, []);

  const handleRenameResult = useCallback((index, nextName) => {
    renameResults((result, i) => (i === index ? { ...result, fileName: nextName } : result));
  }, [renameResults]);

  const handleRenameFiles = useCallback((names) => {
    renameResults((result, index) => (names[index] ? { ...result, fileName: names[index] } : result));
  }, [renameResults]);

  // Existing login flow; /auth sends the user back here afterwards.
  const handleRequestAiLogin = useCallback(() => {
    navigate('/auth', { state: { from: '/watermark' } });
  }, [navigate]);

  /** Only IDs still present are renamed; unknown IDs are ignored. */
  const handleRenameById = useCallback((namesById, stats) => {
    const has = (id) => Object.prototype.hasOwnProperty.call(namesById, id) && typeof namesById[id] === 'string';
    const renamed = resultsRef.current.filter((result) => has(result.id));
    if (!renameResults((result) => (has(result.id) ? { ...result, fileName: namesById[result.id] } : result))) {
      toast.error('Đang xử lý ảnh, chưa thể đổi tên. Vui lòng thử lại sau.');
      return;
    }
    if (renamed.length) {
      toast.success(`Đã đổi tên ${renamed.length} ảnh.`);
      // Using suggestions already generated: an analytics event, never a new AI call.
      if (stats?.groups?.length) {
        trackUsageEvents(buildApplyEvents({
          subject: createSubject(userId, visitorId),
          imageBatchId: renamed[0].batchId ?? null,
          groups: stats.groups,
        }));
      }
    }
  }, [renameResults, userId, visitorId]);

  const busy = processing || isDownloading;
  const canCreate = readableImages.length > 0 && !busy && optionsHydrated && Boolean(engine);

  return (
    <>
      <Helmet>
        <title>Watermark - Thêm Logo Vào Ảnh</title>
      </Helmet>
      <div className="wm-page" style={pageThemeVars}>
        <SeasonalEffectLayer settings={options.seasonalEffect} />
        <div className="wm-container">
          <header className="wm-workspace-heading">
            <div className="wm-heading-main">
              <h1>Thêm logo vào ảnh</h1>
              <p>Chọn ảnh → chỉnh logo → tạo và tải xuống. Ảnh được xử lý ngay trên thiết bị của bạn.</p>
              {hasProAccess(profile) && (
                <Link to="/watermark/auto" className="wma-entry-link">
                  Watermark tự động theo thư mục sản phẩm <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
            <div className="wm-heading-side">
              <WatermarkStatsStrip
                totalCreated={totalCreated}
                personalCreated={personalCreated}
                personalScope={userId ? 'account' : 'browser'}
                lastCreated={lastCreated}
                isLoading={statsLoading}
                error={statsError}
                totalJustUpdated={totalJustUpdated}
              />
              <button
                type="button"
                className="wm-personalize-button"
                onClick={() => setIsPersonalizeOpen(true)}
                aria-haspopup="dialog"
                aria-label="Cá nhân hóa giao diện"
                title="Cá nhân hóa giao diện (màu, hiệu ứng theo mùa)"
                disabled={!optionsHydrated}
              >
                <span className="wm-personalize-button__swatch" style={{ '--wm-swatch': options.accentColor }} aria-hidden="true" />
                <span aria-hidden="true">🎨</span>
              </button>
            </div>
          </header>

          <div className="wm-layout">
            <div className="wm-panel-column wm-panel-column--narrow" inert={processing || undefined}>
              <div className="wm-card wm-card--spaced">
                <LogoUploader logoUrl={logoUrl} logoName={logoName} onLogoChange={handleLogoChange} onImagePreview={openZoom} />
              </div>
              <div className="wm-card">
                <ImageUploader images={images} onImagesChange={setImages} onImagePreview={openZoom} />
              </div>
            </div>

            <div className="wm-panel-column wm-panel-column--wide">
              <div className="wm-card wm-card--full">
                <div inert={processing || !optionsHydrated || undefined}>
                  <WatermarkControls options={options} onChange={setOptions} />
                </div>

                <WatermarkLivePreview
                  images={readableImages}
                  engine={engine}
                  options={options}
                  logoVersion={logoVersion}
                  paused={processing}
                />
                <hr className="wm-divider" />

                <div className="wm-action-bar">
                  <button
                    className="wm-btn-primary wm-create-btn"
                    type="button"
                    onClick={handleCreate}
                    onPointerDown={handleCreateButtonPointerDown}
                    disabled={!canCreate}
                  >
                    {buttonRipples.map((ripple) => (
                      <span key={ripple.id} className="wm-btn-ripple" style={{ left: ripple.x, top: ripple.y }} aria-hidden="true" />
                    ))}
                    {processing ? (
                      <>
                        <span className="wm-spinner" aria-hidden="true" />
                        Đang xử lý {processingProgress.current}/{processingProgress.total}…
                      </>
                    ) : (
                      'Tạo ảnh watermark'
                    )}
                  </button>

                  {processing && (
                    <button type="button" className="wm-btn-outline" onClick={handleCancelTask}>Dừng lại</button>
                  )}
                  <span className="wm-create-hint" aria-live="polite">
                    {!logoUrl && 'Không dùng logo · '}
                    {readableImages.length === 0 ? 'Chưa có ảnh nào' : `${readableImages.length} ảnh sẽ được tạo`}
                    {unreadableCount > 0 && ` · bỏ qua ${unreadableCount} ảnh không đọc được`}
                  </span>
                </div>

                {!logoUrl && (
                  <div className="wm-tip-alert">
                    <span className="wm-inline-icon" aria-hidden="true">💡</span>
                    Bạn vẫn có thể tạo ảnh không logo. Logo sẽ được lưu tự động nếu được chọn.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div id="wm-gallery">
            <WatermarkGallery
              results={results}
              onClear={handleClear}
              onDownloadAll={handleDownloadAll}
              onRenameFile={handleRenameResult}
              onRenameFiles={handleRenameFiles}
              onRenameById={handleRenameById}
              onResultDownload={handleResultDownload}
              productName={options.productName}
              aiAccess={aiNamingAccess}
              onRequestAiLogin={handleRequestAiLogin}
              onRemoveResult={handleRemoveResult}
              isProcessing={processing}
              processingProgress={processingProgress}
              downloadProgress={downloadProgress}
              isBusy={busy}
              onCancel={handleCancelTask}
            />
          </div>
        </div>
      </div>

      <WatermarkImageZoom image={zoomImage} onClose={closeZoom} />

      {downloadChoiceMode && (
        <DownloadMethodModal
          imageCount={results.length}
          onChoose={handleDownloadChoice}
          onClose={() => setDownloadChoiceMode(null)}
        />
      )}

      {isPersonalizeOpen && (
        <PersonalizationModal
          options={options}
          onApply={(next) => {
            setOptions((current) => ({ ...current, ...next }));
            setIsPersonalizeOpen(false);
          }}
          onClose={() => setIsPersonalizeOpen(false)}
        />
      )}
    </>
  );
}
