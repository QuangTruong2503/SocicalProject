import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-toastify';
import LogoUploader from '../components/watermark/LogoUploader';
import ImageUploader from '../components/watermark/ImageUploader';
import WatermarkControls from '../components/watermark/WatermarkControls';
import WatermarkGallery from '../components/watermark/WatermarkGallery';
import WatermarkLivePreview from '../components/watermark/WatermarkLivePreview';
import SeasonalEffectLayer from '../components/watermark/SeasonalEffectLayer';
import { processWatermark, resizeBlob, buildFileName, compressAndResizeBlob, loadWatermarkImage, normalizeImageName } from '../hooks/useWatermarkProcessor';
import { useAuth } from '../hooks/useAuth.js';
import { useTheme } from '../hooks/useTheme.js';
import { useDialogFocus } from '../hooks/useDialogFocus.js';
import { supabase } from '../lib/supabase.js';
import { getUserDisplayName } from '../utils/userProfile.js';
import {
  loadWatermarkOptions,
  saveWatermarkOptions,
} from '../hooks/useIndexedDB.js';
import { buildThemeAccentVars } from '../utils/colorTools.js';
import {
  createWatermarkImageCount,
  getWatermarkImageCountTotal,
} from '../services/watermarkImageCountService.js';
import { getOrCreateWatermarkVisitorId } from '../utils/watermarkVisitor.js';
import { createThumbnailUrl } from '../utils/imageThumbnail.js';
import '../styles/Watermark.css';

const WATERMARK_COUNT_SOURCE_PAGE = 'watermark';

const DEFAULT_OPTIONS = {
  size: 60,
  opacity: 60,
  tiled: false,
  productName: '',
  logoPosition: 'center',
  accentColor: '#2563EB',
  seasonalEffect: {
    enabled: false,
    season: 'spring',
    density: 30,
    duration: 12,
    opacity: 70,
  },
};

function normalizeFileName(fileName, fallbackBase = 'image') {
  return normalizeImageName(fileName, fallbackBase);
}

function getDownloadFileName(fileName, suffix = '') {
  const normalized = normalizeFileName(fileName);
  const baseName = normalized.replace(/\.jpg$/i, '');
  return `${baseName}${suffix}.jpg`;
}

function formatCount(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function releaseResult(result) {
  URL.revokeObjectURL(result.url);
  if (result.thumb) URL.revokeObjectURL(result.thumb);
}

function useReplayOnReveal(elementRef) {
  const [replayKey, setReplayKey] = useState(0);
  const wasVisibleRef = React.useRef(false);

  useEffect(() => {
    const node = elementRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!wasVisibleRef.current) {
            wasVisibleRef.current = true;
            setReplayKey((key) => key + 1);
          }
        } else {
          wasVisibleRef.current = false;
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [elementRef]);

  return replayKey;
}

function useAnimatedCount(value, { duration = 700, replayKey } = {}) {
  const numericValue = Number(value) || 0;
  const [display, setDisplay] = useState(numericValue);
  const displayRef = React.useRef(numericValue);
  const lastReplayKeyRef = React.useRef(replayKey);

  useEffect(() => {
    const isReplay = replayKey !== undefined && replayKey !== lastReplayKeyRef.current;
    lastReplayKeyRef.current = replayKey;

    const from = isReplay ? 0 : displayRef.current;
    const to = numericValue;

    if (!isReplay && from === to) {
      return undefined;
    }

    if (isReplay) {
      displayRef.current = from;
    }

    let rafId;
    const start = performance.now();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const tick = (now) => {
      const progress = reducedMotion ? 1 : Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const current = Math.round(from + (to - from) * eased);
      displayRef.current = current;
      setDisplay(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [numericValue, duration, replayKey]);

  return display;
}

function WatermarkCountBoard({
  totalCreated,
  personalCreated,
  lastCreated,
  selectedCount,
  isLoading,
  error,
  totalJustUpdated,
}) {
  const boardRef = React.useRef(null);
  const replayKey = useReplayOnReveal(boardRef);

  const animatedTotal = useAnimatedCount(totalCreated, { replayKey });
  const animatedPersonal = useAnimatedCount(personalCreated, { replayKey });
  const animatedLast = useAnimatedCount(lastCreated, { duration: 500, replayKey });

  const rows = [
    {
      label: 'Tổng ảnh đã tạo',
      value: isLoading ? '...' : formatCount(animatedTotal),
      note: error ? 'Tạm thời chưa tải được thống kê' : 'Tính trên toàn bộ dự án',
      tone: error ? 'warning' : 'primary',
      pulse: totalJustUpdated,
    },
    {
      label: 'Ảnh của bạn',
      value: isLoading ? '...' : formatCount(animatedPersonal),
      note: 'Tổng ảnh đã tạo trên trình duyệt này',
      tone: 'success',
    },
    {
      label: 'Lần tạo gần nhất',
      value: formatCount(animatedLast),
      note: selectedCount > 0 ? `${formatCount(selectedCount)} ảnh` : 'Chưa chọn ảnh',
      tone: 'neutral',
    },
  ];

  return (
    <section className="wm-count-board" aria-label="Bảng đếm ảnh watermark" ref={boardRef}>
      <div className="wm-count-board__header">
        <div>
          <span className="wm-count-board__kicker">Ảnh Đã Tạo</span>
          <h2>Ảnh Đã Tạo</h2>
        </div>
      </div>

      <div className="wm-count-grid">
        {rows.map((row) => (
          <article
            className={`wm-count-card wm-count-card--${row.tone}${row.pulse ? ' wm-count-card--pulse' : ''}`}
            key={row.label}
          >
            <span className="wm-count-card__label">{row.label}</span>
            <strong>{row.value}</strong>
            <span className="wm-count-card__note">{row.note}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function WatermarkImageZoom({ image, onClose }) {
  const [isCapturing, setIsCapturing] = useState(false);
  const dialogRef = useDialogFocus(Boolean(image));
  if (!image) return null;
  const detailItems = Array.isArray(image.items) ? image.items : null;

  const handleCapture = async () => {
    if (!detailItems || isCapturing) return;
    setIsCapturing(true);
    try {
      const { captureAndDownloadSourceImages } = await import('../utils/sourceImageCapture.js');
      await captureAndDownloadSourceImages(detailItems);
      toast.success('Đã chụp và tải toàn bộ ảnh nguồn.');
    } catch (error) {
      toast.error(error?.message || 'Không thể chụp ảnh toàn cảnh.');
    } finally {
      setIsCapturing(false);
    }
  };

  return createPortal(
    <div
      className="wm-preview-backdrop"
      role="presentation"
      onPointerDown={onClose}
    >
      <div
        className={`wm-preview-modal wm-preview-modal--zoom${detailItems ? ' wm-preview-modal--source-detail' : ''}`}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Phóng to ${image.title}`}
        aria-describedby={detailItems ? 'wm-source-detail-description' : undefined}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={`wm-preview-header${detailItems ? ' wm-source-detail-header' : ''}`}>
          <div className="wm-preview-title-wrap">
            <span className="wm-preview-kicker">{image.kicker || 'Xem ảnh'}</span>
            <strong className="wm-preview-title" title={image.title}>
              {image.title}
            </strong>
            {detailItems && (
              <span className="wm-source-detail-description" id="wm-source-detail-description">
                Kiểm tra thứ tự ảnh trước khi xuất bản tổng hợp JPG
              </span>
            )}
          </div>
          <div className="wm-preview-actions">
            {detailItems && (
              <button
                className="wm-source-capture-button"
                type="button"
                onClick={handleCapture}
                disabled={isCapturing}
                data-dialog-initial
              >
                <span className="wm-source-capture-icon" aria-hidden="true">↓</span>
                {isCapturing ? 'Đang tạo JPG…' : 'Xuất ảnh JPG'}
              </button>
            )}
            <button
              className="wm-preview-close"
              type="button"
              onClick={onClose}
              aria-label="Đóng ảnh phóng to"
              data-dialog-initial={!detailItems || undefined}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>

        <div className={`wm-preview-image-frame${detailItems ? ' wm-source-detail-frame' : ''}`}>
          {detailItems ? (
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
          ) : (
            <img src={image.url} alt={image.title} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function DownloadMethodModal({ imageCount, onChoose, onClose }) {
  const dialogRef = useDialogFocus();
  return createPortal(
    <div className="wm-download-choice-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        className="wm-download-choice-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wm-download-choice-title"
        aria-describedby="wm-download-choice-description"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          className="wm-download-choice-close"
          type="button"
          onClick={onClose}
          aria-label="Đóng"
        >
          ×
        </button>
        <span className="wm-download-choice-kicker">Tùy chọn tải xuống</span>
        <h2 id="wm-download-choice-title">Tải {imageCount} ảnh theo cách nào?</h2>
        <p id="wm-download-choice-description">
          File ZIP giúp tải đủ ảnh trong một lần. Nếu tải từng ảnh, trình duyệt có thể yêu cầu cho phép tải nhiều file.
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
      </div>
    </div>,
    document.body
  );
}

export default function Watermark() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const resultsRef = React.useRef([]);
  const taskRef = React.useRef(null);
  const mountedRef = React.useRef(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const createButtonRippleIdRef = React.useRef(0);
  const [logoUrl, setLogoUrl]   = useState(null);
  const [logoName, setLogoName] = useState(null);
  const [images, setImages]     = useState([]);
  const [options, setOptions]   = useState(DEFAULT_OPTIONS);
  const [results, setResults]   = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [totalCreated, setTotalCreated] = useState(0);
  const [personalCreated, setPersonalCreated] = useState(0);
  const [lastCreated, setLastCreated] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [totalJustUpdated, setTotalJustUpdated] = useState(false);
  const totalPulseTimeoutRef = React.useRef(null);
  const [optionsHydrated, setOptionsHydrated] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [downloadChoiceMode, setDownloadChoiceMode] = useState(null);
  const [buttonRipples, setButtonRipples] = useState([]);
  const [visitorId] = useState(() => getOrCreateWatermarkVisitorId());
  const pageThemeVars = useMemo(
    () => buildThemeAccentVars(options.accentColor, isDark),
    [options.accentColor, isDark],
  );

  const handleLogoChange = useCallback((url, name) => {
    setLogoUrl(url);
    setLogoName(name);
  }, []);

  const openZoom = useCallback((image) => {
    setZoomImage(image);
  }, []);

  const closeZoom = useCallback(() => {
    setZoomImage(null);
  }, []);

  const handleCreateButtonPointerDown = useCallback((event) => {
    if (event.button !== 0) {
      return;
    }

    const targetRect = event.currentTarget.getBoundingClientRect();
    const id = `${Date.now()}-${(createButtonRippleIdRef.current += 1)}`;
    const ripple = {
      id,
      x: event.clientX - targetRect.left,
      y: event.clientY - targetRect.top,
    };

    setButtonRipples((current) => [...current, ripple]);

    window.setTimeout(() => {
      setButtonRipples((current) => current.filter((item) => item.id !== id));
    }, 720);
  }, []);

  useEffect(() => {
    document.body.classList.add('wm-watermark-theme');

    return () => {
      document.body.classList.remove('wm-watermark-theme');
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    loadWatermarkOptions()
      .then((savedOptions) => {
        if (!isActive) {
          return;
        }

        if (savedOptions && typeof savedOptions === 'object') {
          setOptions((current) => ({
            ...current,
            ...savedOptions,
          }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) {
          setOptionsHydrated(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!optionsHydrated) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      saveWatermarkOptions(options).catch((error) => {
        console.warn('[Watermark] Could not save watermark options', error);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [options, optionsHydrated]);

  useEffect(() => {
    if (!visitorId) {
      return undefined;
    }

    let isActive = true;

    Promise.all([
      getWatermarkImageCountTotal({}),
      getWatermarkImageCountTotal({
        sourcePage: WATERMARK_COUNT_SOURCE_PAGE,
        visitorId,
      }),
    ]).then(([totalResult, personalResult]) => {
      if (!isActive) {
        return;
      }

      if (totalResult.error || personalResult.error) {
        setStatsError(totalResult.error || personalResult.error);
      } else {
        setStatsError(null);
      }

      setTotalCreated(totalResult.data || 0);
      setPersonalCreated(personalResult.data || 0);
      setStatsLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [visitorId]);

  // ── Live total via Supabase Realtime (websocket) ───────────────────
  useEffect(() => {
    if (!visitorId) {
      return undefined;
    }

    const channel = supabase
      .channel('watermark-image-counts-total')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'watermark_image_counts' },
        (payload) => {
          const row = payload.new;
          const increment = Number(row?.image_count) || 0;

          // Skip our own inserts — handleCreate already bumps the total locally.
          if (!row || row.visitor_id === visitorId || increment <= 0) {
            return;
          }

          setTotalCreated((current) => current + increment);
          setTotalJustUpdated(true);

          if (totalPulseTimeoutRef.current) {
            window.clearTimeout(totalPulseTimeoutRef.current);
          }
          totalPulseTimeoutRef.current = window.setTimeout(() => {
            setTotalJustUpdated(false);
          }, 900);
        },
      )
      .subscribe();

    return () => {
      if (totalPulseTimeoutRef.current) {
        window.clearTimeout(totalPulseTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [visitorId]);

  useEffect(() => {
    if (!zoomImage) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeZoom();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.classList.add('wm-modal-open');

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('wm-modal-open');
    };
  }, [closeZoom, zoomImage]);

  useEffect(() => {
    if (!downloadChoiceMode) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setDownloadChoiceMode(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.classList.add('wm-modal-open');

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('wm-modal-open');
    };
  }, [downloadChoiceMode]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (taskRef.current) taskRef.current.cancelled = true;
      resultsRef.current.forEach(releaseResult);
    };
  }, []);

  // ── Create watermarked images ──────────────────────────────────────
  const handleCreate = async () => {
    if (!images.length || taskRef.current || !optionsHydrated) return;
    const task = { cancelled: false };
    taskRef.current = task;
    setProcessing(true);
    setProcessingProgress({ current: 0, total: images.length });
    const newResults = [];
    const failedNames = [];
    const loadingToastId = toast.loading('Đang chuẩn bị ảnh watermark…');
    try {
      const logo = logoUrl ? await loadWatermarkImage(logoUrl) : null;
      for (let i = 0; i < images.length && !task.cancelled; i += 1) {
        try {
          const blob = await processWatermark(images[i].file, logo, options);
          if (task.cancelled) break;
          const thumb = await createThumbnailUrl(blob);
          if (task.cancelled) {
            URL.revokeObjectURL(thumb);
            break;
          }
          newResults.push({
            url: URL.createObjectURL(blob), blob, thumb,
            fileName: buildFileName(options.productName, i, images.length),
          });
        } catch {
          failedNames.push(images[i].name);
        }
        if (task.cancelled) break;
        setProcessingProgress({ current: i + 1, total: images.length });
        toast.update(loadingToastId, { render: `Đang tạo ảnh (${i + 1}/${images.length})…` });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (task.cancelled) {
        newResults.forEach(releaseResult);
        toast.dismiss(loadingToastId);
        return;
      }
      // Keep the previous batch when every source fails.
      if (newResults.length) {
        resultsRef.current.forEach(releaseResult);
        resultsRef.current = newResults;
        setResults(newResults);
        setLastCreated(newResults.length);
        if (visitorId) {
          void createWatermarkImageCount({
            userId: user?.id, visitorId,
            displayName: user ? getUserDisplayName(user, null) : null,
            userColor: options.accentColor, imageCount: newResults.length,
            sourcePage: WATERMARK_COUNT_SOURCE_PAGE,
          }).then((result) => {
            if (!mountedRef.current || result.error) return;
            setTotalCreated((current) => current + newResults.length);
            setPersonalCreated((current) => current + newResults.length);
          }).catch((error) => console.warn('[Watermark] Could not save image count', error));
        }
      }
      toast.update(loadingToastId, {
        render: failedNames.length
          ? `Đã tạo ${newResults.length}/${images.length} ảnh. Không đọc được: ${failedNames.slice(0, 3).join(', ')}${failedNames.length > 3 ? '…' : ''}`
          : `Đã tạo xong ${newResults.length} ảnh watermark.`,
        type: newResults.length ? (failedNames.length ? 'warning' : 'success') : 'error',
        isLoading: false, autoClose: 5000, closeButton: true,
      });
    } catch (error) {
      newResults.forEach(releaseResult);
      toast.update(loadingToastId, { render: error.message, type: 'error', isLoading: false, autoClose: 5000 });
    } finally {
      taskRef.current = null;
      if (mountedRef.current) setProcessing(false);
    }
  };

  // ── Download all ───────────────────────────────────────────────────
  const downloadAll = useCallback(async (mode, method) => {
    if (!results.length || taskRef.current) return;
    const task = { cancelled: false };
    taskRef.current = task;
    setIsDownloading(true);

    const total = results.length;
    setDownloadProgress({
      current: 0,
      total,
      percent: 0,
      message: 'Đang chuẩn bị file tải xuống…',
    });
    const loadingToastId = toast.loading(`Đang chuẩn bị tải xuống (0/${total})…`);

    const prepareResult = async (r) => {
      let blob = r.blob;
      const fileName = getDownloadFileName(r.fileName);

      if (mode === '800x600') {
        blob = await resizeBlob(blob, 800, 600);
      } else if (mode === 'ImageCompress') {
        blob = await compressAndResizeBlob(blob, 800, 600, 100);
      }

      return { blob, fileName };
    };

    try {
      if (method === 'zip') {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        const usedNames = new Set();

        for (let index = 0; index < results.length; index += 1) {
          if (task.cancelled) return;
          const prepared = await prepareResult(results[index]);
          if (task.cancelled) return;
          let fileName = prepared.fileName;
          let duplicateIndex = 2;
          while (usedNames.has(fileName.toLocaleLowerCase('vi'))) {
            fileName = prepared.fileName.replace(/\.jpg$/i, `-${duplicateIndex}.jpg`);
            duplicateIndex += 1;
          }
          usedNames.add(fileName.toLocaleLowerCase('vi'));
          zip.file(fileName, prepared.blob);

          setDownloadProgress({
            current: index + 1,
            total,
            percent: Math.round(((index + 1) / total) * 100),
            message: `Đã thêm ${index + 1}/${total} ảnh vào file ZIP`,
          });
          toast.update(loadingToastId, {
            render: `Đang tạo file ZIP (${index + 1}/${total})…`,
            progress: (index + 1) / total,
          });
        }

        setDownloadProgress({ current: total, total, percent: 100, message: 'Đang đóng gói file ZIP…' });
        const zipBlob = await zip.generateAsync({
          type: 'blob',
          compression: 'STORE',
        });
        if (task.cancelled) return;
        const anchor = document.createElement('a');
        const objectUrl = URL.createObjectURL(zipBlob);
        anchor.href = objectUrl;
        anchor.download = `watermark-${Date.now()}.zip`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      } else {
        for (let index = 0; index < results.length; index += 1) {
          if (task.cancelled) return;
          const prepared = await prepareResult(results[index]);
          if (task.cancelled) return;
          const a = document.createElement('a');
          const objectUrl = URL.createObjectURL(prepared.blob);
          a.href = objectUrl;
          a.download = prepared.fileName;
          a.click();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);

          setDownloadProgress({
            current: index + 1,
            total,
            percent: Math.round(((index + 1) / total) * 100),
            message: `Đã chuẩn bị ${index + 1}/${total} ảnh`,
          });
          toast.update(loadingToastId, {
            render: `Đang chuẩn bị tải xuống (${index + 1}/${total})…`,
            progress: (index + 1) / total,
          });

          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }

      toast.update(loadingToastId, {
        render: method === 'zip' ? `Đã chuẩn bị file ZIP gồm ${total} ảnh. Kiểm tra mục tải xuống.` : `Đã gửi ${total} ảnh tới trình duyệt để tải xuống.`,
        type: 'success',
        isLoading: false,
        progress: undefined,
        autoClose: 3000,
        closeButton: true,
      });
    } catch (error) {
      toast.update(loadingToastId, {
        render: error.message || 'Không thể chuẩn bị tải xuống. Vui lòng thử lại.',
        type: 'error', isLoading: false, autoClose: 5000, closeButton: true,
      });
    } finally {
      taskRef.current = null;
      if (task.cancelled) toast.dismiss(loadingToastId);
      if (mountedRef.current) {
        setIsDownloading(false);
        setDownloadProgress(null);
      }
    }
  }, [results]);

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
    if (mode) {
      downloadAll(mode, method);
    }
  }, [downloadAll, downloadChoiceMode]);

  // ── Clear results ──────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (taskRef.current) return;
    resultsRef.current.forEach(releaseResult);
    resultsRef.current = [];
    setResults([]);
    setDownloadProgress(null);
    setProcessingProgress({ current: 0, total: 0 });
  }, []);

  const handleRemoveResult = useCallback((index) => {
    if (taskRef.current) return;
    setResults((current) => {
      const removed = current[index];
      if (removed?.url) {
        releaseResult(removed);
      }

      const next = current.filter((_, itemIndex) => itemIndex !== index);
      resultsRef.current = next;
      return next;
    });
  }, []);

  const handleRenameResult = useCallback((index, nextName) => {
    if (taskRef.current) return;
    setResults((prev) => prev.map((result, i) => (
      i === index ? { ...result, fileName: nextName } : result
    )));
  }, []);

  const handleRenameFiles = useCallback((names) => {
    if (taskRef.current) return;
    setResults((current) => current.map((result, index) => (
      names[index] ? { ...result, fileName: names[index] } : result
    )));
  }, []);

  const busy = processing || isDownloading;
  const canCreate = images.length > 0 && !busy && optionsHydrated;

  return (
    <>
      <Helmet>
        <title>Watermark - Thêm Logo Vào Ảnh</title>
      </Helmet>
      <div className="wm-page" style={pageThemeVars}>
        <SeasonalEffectLayer settings={options.seasonalEffect} />
        <div className="wm-container">

          <header className="wm-workspace-heading">
            <h1>Thêm logo vào ảnh</h1>
            <p>Chọn ảnh → chỉnh logo → tạo và tải xuống. Ảnh được xử lý ngay trên thiết bị của bạn.</p>
          </header>

        <WatermarkCountBoard
          totalCreated={totalCreated}
          personalCreated={personalCreated}
          lastCreated={lastCreated}
          selectedCount={images.length}
          isLoading={statsLoading}
          error={statsError}
          totalJustUpdated={totalJustUpdated}
        />

        {/* ── Main Layout ── */}
        <div className="wm-layout">

          {/* Left column: upload panels */}
          <div className="wm-panel-column wm-panel-column--narrow" inert={processing || undefined}>
            <div className="wm-card wm-card--spaced">
              <LogoUploader
                logoUrl={logoUrl}
                logoName={logoName}
                onLogoChange={handleLogoChange}
                onImagePreview={openZoom}
              />
            </div>

            <div className="wm-card">
              <ImageUploader
                images={images}
                onImagesChange={setImages}
                onImagePreview={openZoom}
              />
            </div>
          </div>

          {/* Right column: controls */}
          <div className="wm-panel-column wm-panel-column--wide">
            <div className="wm-card wm-card--full">
              <div inert={processing || !optionsHydrated || undefined}>
              <WatermarkControls
                options={options}
                onChange={setOptions}
                enableAccentOptions
              />
              </div>

              <WatermarkLivePreview file={images[0]?.file} logoUrl={logoUrl} options={options} paused={processing} />
              <hr className="wm-divider" />

              {/* Action Bar */}
              <div className="wm-action-bar">
                <button
                  className="wm-btn-primary wm-create-btn"
                  type="button"
                  onClick={handleCreate}
                  onPointerDown={handleCreateButtonPointerDown}
                  disabled={!canCreate}
                >
                  {buttonRipples.map((ripple) => (
                    <span
                      key={ripple.id}
                      className="wm-btn-ripple"
                      style={{ left: ripple.x, top: ripple.y }}
                      aria-hidden="true"
                    />
                  ))}
                  {processing ? (
                    <>
                      <span className="wm-spinner" role="status" aria-label="Đang xử lý" />
                      Đang xử lý {processingProgress.current}/{processingProgress.total}…
                    </>
                  ) : (
                    <>
                      <span className="wm-inline-icon" aria-hidden="true">🦈</span>
                      Tạo ảnh Watermark
                    </>
                  )}
                </button>

                {processing && <button type="button" className="wm-btn-outline" onClick={() => {
                  if (taskRef.current) taskRef.current.cancelled = true;
                }}>Hủy xử lý</button>}
                <span className="wm-create-hint">
                  {!logoUrl && 'Không dùng logo · '}
                  {images.length === 0
                    ? 'Chưa có ảnh nào'
                    : `${images.length} ảnh đã chọn`}
                </span>
              </div>

              {/* Tip cards */}
              {!logoUrl && (
                <div className="wm-tip-alert">
                  <span className="wm-inline-icon" aria-hidden="true">💡</span>
                  Bạn vẫn có thể tạo ảnh không logo. Logo sẽ được lưu tự động nếu được chọn.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Gallery ── */}
        <div id="wm-gallery">
          <WatermarkGallery
            results={results}
            onClear={handleClear}
            onDownloadAll={handleDownloadAll}
            onRenameFile={handleRenameResult}
            onRenameFiles={handleRenameFiles}
            onRemoveResult={handleRemoveResult}
            isProcessing={processing}
            processingProgress={processingProgress}
            downloadProgress={downloadProgress}
            isBusy={busy}
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
    </>
  );
}
