import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import LogoUploader from '../components/watermark/LogoUploader';
import ImageUploader from '../components/watermark/ImageUploader';
import WatermarkControls from '../components/watermark/WatermarkControls';
import WatermarkGallery from '../components/watermark/WatermarkGallery';
import {
  buildFileName,
  compressAndResizeBlob,
  processWatermark,
  resizeBlob,
} from '../hooks/useWatermarkProcessor';
import { useAuth } from '../hooks/useAuth.js';
import { getUserDisplayName } from '../utils/userProfile.js';
import {
  createWatermarkImageCount,
  getWatermarkImageCountTotal,
} from '../services/watermarkImageCountService.js';
import { getOrCreateWatermarkVisitorId } from '../utils/watermarkVisitor.js';
import { uploadDoanTrangHeroPreview } from '../services/uploadService.js';
import {
  loadDoanTrangHeroImage,
  saveDoanTrangHeroImage,
} from '../hooks/useIndexedDB.js';
import '../styles/Watermark-girly-pink-complete.css';
import '../styles/DoanTrangWatermark.css';

const DEFAULT_OPTIONS = {
  size: 60,
  opacity: 60,
  tiled: false,
  productName: 'doan-trang',
  logoPosition: 'center',
};
const DOANTRANG_COUNT_SOURCE_PAGE = 'watermark/doantrang';
const DOANTRANG_IMAGE_MILESTONES = [800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const buttonVariants = {
  hover: { scale: 1.05, boxShadow: '0px 5px 15px rgba(219, 39, 119, 0.4)' },
  tap: { scale: 0.95 },
};
const heartVariants = {
  hover: {
    scale: [1, 1.2, 1, 1.2, 1],
    transition: { duration: 1.3, repeat: Infinity },
  },
};
const containerVariants = {
  idle: { scale: 1, borderColor: '#f472b6', backgroundColor: 'rgba(255, 255, 255, 0.96)' },
  dragging: {
    scale: 1.02,
    borderColor: '#db2777',
    backgroundColor: 'rgba(251, 207, 232, 0.3)',
    transition: { repeat: Infinity, repeatType: 'reverse', duration: 0.8 },
  },
};
const iconVariants = {
  dragging: {
    y: [0, -10, 0],
    transition: { repeat: Infinity, duration: 1, ease: 'easeInOut' },
  },
};
const galleryVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};
const imageCardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 15 },
  },
};
const exportConfettiColors = ['#db2777', '#f472b6', '#ffffff'];
const milestoneFireworkColors = ['#fb7185', '#f97316', '#facc15', '#60a5fa', '#34d399', '#f472b6'];

// Some lint setups in this repo do not count JSX tag usage for namespace imports.
void motion;

function createSeededRandom(seed) {
  let value = Math.abs(Math.floor(seed)) % 2147483647;

  if (value === 0) {
    value = 1;
  }

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function buildExportConfettiPieces(itemCount = 1) {
  const normalizedCount = Math.max(1, Number(itemCount) || 1);
  const pieceCount = Math.min(24 + normalizedCount * 50, 180);
  const burstScale = 1 + Math.min(normalizedCount, 8) * 0.12;

  return Array.from({ length: pieceCount }, (_, index) => {
    const angle = (index / pieceCount) * Math.PI * 2;
    const distance = (180 + Math.random() * 140) * burstScale;
    const driftX = Math.cos(angle) * distance + (Math.random() * 90 - 45) * burstScale;
    const driftY = Math.sin(angle) * distance * 0.5 + 120 + Math.random() * 120 * burstScale;

    return {
      id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      color: exportConfettiColors[index % exportConfettiColors.length],
      x: driftX,
      y: driftY,
      rotate: -180 + Math.random() * 360,
      size: (7 + Math.random() * 7) * burstScale,
      delay: Math.random() * 0.14,
    };
  });
}

function buildMilestoneFireworkBursts(milestone) {
  const rand = createSeededRandom(Number(milestone) || 1);
  const burstLayout = [
    { left: 16, top: 20, delay: 0 },
    { left: 80, top: 18, delay: 0.18 },
    { left: 20, top: 66, delay: 0.28 },
    { left: 82, top: 64, delay: 0.42 },
  ];

  return burstLayout.map((base, burstIndex) => {
    const particleCount = 10 + Math.floor(rand() * 5);
    const baseRadius = 92 + burstIndex * 10 + rand() * 16;

    return {
      id: `dtw-firework-${milestone}-${burstIndex}`,
      left: base.left + (rand() * 8 - 4),
      top: base.top + (rand() * 6 - 3),
      delay: base.delay + rand() * 0.16,
      scale: 0.9 + rand() * 0.45,
      particles: Array.from({ length: particleCount }, (_, index) => {
        const angle = (index / particleCount) * Math.PI * 2 + rand() * 0.35;
        const distance = baseRadius + rand() * 60;
        const drift = rand() * 18 - 9;

        return {
          id: `${milestone}-${burstIndex}-${index}`,
          color: milestoneFireworkColors[(burstIndex + index) % milestoneFireworkColors.length],
          x: Math.cos(angle) * distance + drift,
          y: Math.sin(angle) * distance * 0.9 + drift * 0.5,
          size: 5 + rand() * 5,
          delay: burstIndex * 0.14 + index * 0.012 + rand() * 0.08,
          rotate: -120 + rand() * 240,
        };
      }),
    };
  });
}

function normalizeFileName(fileName, fallbackBase = 'image') {
  const trimmed = (fileName || '').trim();
  const baseName = trimmed ? trimmed.replace(/\.[^.]+$/, '') : fallbackBase;
  return `${baseName || fallbackBase}.jpg`;
}

function getDownloadFileName(fileName, suffix = '') {
  const normalized = normalizeFileName(fileName);
  const baseName = normalized.replace(/\.jpg$/i, '');
  return `${baseName}${suffix}.jpg`;
}

function formatCount(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function AnimatedCount({ value, duration = 1.5, shouldAnimate }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest).toLocaleString('vi-VN'));

  useEffect(() => {
    if (!shouldAnimate) {
      count.set(0);
      return undefined;
    }

    const animation = animate(count, Number(value) || 0, { duration, ease: 'easeOut' });
    return animation.stop;
  }, [count, duration, shouldAnimate, value]);

  return <motion.span>{rounded}</motion.span>;
}

function getReachedImageMilestone(previousCount, nextCount) {
  const previous = Number(previousCount) || 0;
  const next = Number(nextCount) || 0;

  if (next <= previous) return null;

  const fixedMilestone = DOANTRANG_IMAGE_MILESTONES
    .filter((milestone) => previous < milestone && next >= milestone)
    .at(-1);

  if (fixedMilestone) {
    return fixedMilestone;
  }

  if (next > 1000) {
    const previousThousand = Math.floor(previous / 1000);
    const nextThousand = Math.floor(next / 1000);

    if (nextThousand > previousThousand) {
      return nextThousand * 1000;
    }
  }

  return null;
}

function DoanTrangCountBoard({
  totalCreated,
  personalCreated,
  lastCreated,
  selectedCount,
  isLoading,
  error,
}) {
  const boardRef = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const boardElement = boardRef.current;
    if (!boardElement) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        } else {
          setIsInView(false);
        }
      },
      {
        threshold: 0.35,
      }
    );

    observer.observe(boardElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  const rows = [
    {
      label: 'Tổng ảnh đã tạo',
      value: totalCreated,
      isLoading,
      note: error ? 'Chưa tải được dữ liệu Supabase' : 'Chỉ tính trang Watermark Đoan Trang',
      tone: error ? 'warning' : 'primary',
    },
    {
      label: 'Ảnh của bạn',
      value: personalCreated,
      isLoading,
      note: 'Số ảnh bạn đã tạo trên trình duyệt này',
      tone: 'success',
    },
    {
      label: 'Lần tạo gần nhất',
      value: lastCreated,
      isLoading,
      note: selectedCount > 0 ? `${formatCount(selectedCount)} ảnh đang chọn` : 'Chưa chọn ảnh',
      tone: 'neutral',
    },
  ];

  return (
    <section
      ref={boardRef}
      className="dtw-count-board"
      aria-label="Bảng đếm ảnh watermark Đoan Trang"
    >
      <div className="dtw-count-board__header">
        <div>
          <span className="dtw-kicker">Rose counter</span>
        </div>
      </div>

      <div className="dtw-count-grid">
        {rows.map((row) => (
          <article className={`dtw-count-card dtw-count-card--${row.tone}`} key={row.label}>
            <span className="dtw-count-card__label">{row.label}</span>
            <strong>
              {row.isLoading ? '...' : (
                <AnimatedCount value={row.value} shouldAnimate={isInView} />
              )}
            </strong>
            <span className="dtw-count-card__note">{row.note}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function DoanTrangMilestoneCelebration({ milestone, justCreated, onClose }) {
  if (!milestone) return null;
  const fireworkBursts = buildMilestoneFireworkBursts(milestone);

  return createPortal(
    <div className="dtw-milestone-backdrop" role="presentation" onPointerDown={onClose}>
      <div className="dtw-milestone-fireworks" aria-hidden="true">
        {fireworkBursts.map((burst) => (
          <span
            key={burst.id}
            className="dtw-milestone-firework"
            style={{
              left: `${burst.left}%`,
              top: `${burst.top}%`,
              '--dtw-firework-delay': `${burst.delay}s`,
              '--dtw-firework-scale': burst.scale,
            }}
          >
            {burst.particles.map((particle) => (
              <motion.span
                key={particle.id}
                className="dtw-milestone-spark"
                style={{
                  '--dtw-spark-color': particle.color,
                  '--dtw-spark-size': `${particle.size}px`,
                  '--dtw-spark-delay': `${particle.delay}s`,
                }}
                initial={{
                  x: 0,
                  y: 0,
                  opacity: 0,
                  scale: 0.25,
                  rotate: 0,
                }}
                animate={{
                  x: particle.x,
                  y: particle.y,
                  opacity: [0, 1, 1, 0],
                  scale: [0.25, 1.1, 1, 0.82],
                  rotate: particle.rotate,
                }}
                transition={{
                  duration: 1.55,
                  delay: burst.delay + particle.delay,
                  ease: 'easeOut',
                }}
              />
            ))}
          </span>
        ))}
      </div>

      <div
        className="dtw-milestone-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dtw-milestone-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="dtw-milestone-burst" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, index) => (
            <span
              key={index}
              style={{
                '--dtw-confetti-angle': `${index * 20}deg`,
                animationDelay: `${index * 28}ms`,
              }}
            />
          ))}
        </div>

        <span className="dtw-milestone-kicker">Milestone unlocked</span>
        <strong id="dtw-milestone-title" className="dtw-milestone-title">
          Bạn đã đạt cột mốc {formatCount(milestone)} ảnh!
        </strong>
        <p>
          Vừa tạo thêm {formatCount(justCreated)} ảnh watermark. Bộ sưu tập Đoan Trang đang lên mood rất xịn.
        </p>
        <button className="dtw-milestone-button" type="button" onClick={onClose}>
          Tiếp tục tạo ảnh
        </button>
      </div>
    </div>,
    document.body
  );
}

function DoanTrangExportSuccessCelebration({ burst, onClose }) {
  const pieces = buildExportConfettiPieces(burst?.count);

  return createPortal(
    <AnimatePresence>
      {burst && (
        <motion.div
          key={burst.id}
          className="dtw-export-success-backdrop"
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1150,
            overflow: 'hidden',
            background: 'rgba(136, 14, 79, 0.08)',
            pointerEvents: 'auto',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={onClose}
        >
          {pieces.map((piece) => (
            <motion.span
              key={piece.id}
              className="dtw-export-confetti"
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '50%',
                top: '44%',
                width: `${piece.size}px`,
                height: `${piece.size * 1.45}px`,
                background: piece.color,
                borderRadius: '999px',
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.16)',
                pointerEvents: 'none',
              }}
              initial={{
                x: 0,
                y: 0,
                rotate: 0,
                scale: 0.7,
                opacity: 1,
              }}
              animate={{
                x: piece.x,
                y: piece.y,
                rotate: piece.rotate,
                scale: [0.7, 1, 0.95],
                opacity: [1, 1, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.4,
                delay: piece.delay,
                ease: 'easeOut',
              }}
            />
          ))}

          {/* <motion.div
            className="dtw-export-success-toast"
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 'min(12vh, 110px)',
              transform: 'translateX(-50%)',
              minWidth: 'min(90vw, 320px)',
              maxWidth: 'min(90vw, 360px)',
              padding: '1rem 1.15rem',
              borderRadius: '18px',
              background: 'rgba(255, 255, 255, 0.96)',
              border: '1px solid rgba(219, 39, 119, 0.18)',
              boxShadow: '0 24px 60px rgba(136, 14, 79, 0.18)',
              color: '#3e0020',
              textAlign: 'center',
              pointerEvents: 'auto',
              backdropFilter: 'blur(12px)',
            }}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <strong>Xuất ảnh thành công</strong>
            <p>Tải xuống {burst.count} ảnh thành công</p>
          </motion.div> */}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function WatermarkImageZoom({ image, onClose }) {
  if (!image) return null;

  return createPortal(
    <div
      className="wm-preview-backdrop dtw-preview-backdrop"
      role="presentation"
      onPointerDown={onClose}
    >
      <div
        className="wm-preview-modal wm-preview-modal--zoom"
        role="dialog"
        aria-modal="true"
        aria-label={`Phóng to ${image.title}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="wm-preview-header">
          <div className="wm-preview-title-wrap">
            <span className="wm-preview-kicker">{image.kicker || 'Xem ảnh'}</span>
            <strong className="wm-preview-title" title={image.title}>
              {image.title}
            </strong>
          </div>
          <button
            className="wm-preview-close"
            type="button"
            onClick={onClose}
            aria-label="Đóng ảnh phóng to"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="wm-preview-image-frame">
          <img src={image.url} alt={image.title} />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function DoanTrangWatermarkPage() {
  const { user } = useAuth();
  const heroInputRef = useRef(null);
  const imageDropzoneShellRef = useRef(null);
  const galleryShellRef = useRef(null);
  const imageDragDepthRef = useRef(0);
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoName, setLogoName] = useState(null);
  const [images, setImages] = useState([]);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [totalCreated, setTotalCreated] = useState(0);
  const [personalCreated, setPersonalCreated] = useState(0);
  const [lastCreated, setLastCreated] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [zoomImage, setZoomImage] = useState(null);
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroImageName, setHeroImageName] = useState('');
  const [heroImageError, setHeroImageError] = useState('');
  const [heroImageLoading, setHeroImageLoading] = useState(true);
  const [heroImageUploading, setHeroImageUploading] = useState(false);
  const [heroImageStorageUrl, setHeroImageStorageUrl] = useState('');
  const [milestoneCelebration, setMilestoneCelebration] = useState(null);
  const [exportSuccessBurst, setExportSuccessBurst] = useState(null);
  const [createButtonHovered, setCreateButtonHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [visitorId] = useState(() => getOrCreateWatermarkVisitorId());

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

  const closeMilestoneCelebration = useCallback(() => {
    setMilestoneCelebration(null);
  }, []);

  const closeExportSuccessCelebration = useCallback(() => {
    setExportSuccessBurst(null);
  }, []);

  useEffect(() => {
    document.body.classList.add('dtw-watermark-theme');

    return () => {
      document.body.classList.remove('dtw-watermark-theme');
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    loadDoanTrangHeroImage()
      .then((result) => {
        if (!isActive) return;

        if (result) {
          setHeroImageUrl(result.url);
          setHeroImageName(result.name);
        }
      })
      .catch((error) => {
        console.warn('[DoanTrangWatermark] Could not load hero image', error);
      })
      .finally(() => {
        if (isActive) {
          setHeroImageLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!visitorId) {
      return undefined;
    }

    let isActive = true;

    Promise.all([
      getWatermarkImageCountTotal({ sourcePage: DOANTRANG_COUNT_SOURCE_PAGE }),
      getWatermarkImageCountTotal({
        sourcePage: DOANTRANG_COUNT_SOURCE_PAGE,
        visitorId,
      }),
    ]).then(([totalResult, personalResult]) => {
      if (!isActive) return;

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
    if (!milestoneCelebration) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeMilestoneCelebration();
      }
    };

    const timeoutId = window.setTimeout(closeMilestoneCelebration, 6800);
    document.addEventListener('keydown', handleEscape);
    document.body.classList.add('wm-modal-open');

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('wm-modal-open');
    };
  }, [closeMilestoneCelebration, milestoneCelebration]);

  useEffect(() => () => {
    if (heroImageUrl) {
      URL.revokeObjectURL(heroImageUrl);
    }
  }, [heroImageUrl]);

  useEffect(() => {
    if (!exportSuccessBurst) return undefined;

    const timeoutId = window.setTimeout(() => {
      setExportSuccessBurst(null);
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [exportSuccessBurst]);

  const handleHeroImageChange = async (event) => {
    const file = event.target.files?.[0];
    setHeroImageError('');

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setHeroImageError('Vui lòng chọn file ảnh hợp lệ.');
      event.target.value = '';
      return;
    }

    try {
      await saveDoanTrangHeroImage(file);
      const nextUrl = URL.createObjectURL(file);

      if (heroImageUrl) {
        URL.revokeObjectURL(heroImageUrl);
      }

      setHeroImageUrl(nextUrl);
      setHeroImageName(file.name);
      setHeroImageStorageUrl('');
      setHeroImageUploading(true);
      const uploadResult = await uploadDoanTrangHeroPreview({
        userId: user?.id,
        file,
      });

      if (uploadResult.error) {
        setHeroImageError(uploadResult.error);
        return;
      }

      setHeroImageStorageUrl(uploadResult.data?.image_url || '');
    } catch (error) {
      console.error('[DoanTrangWatermark] Could not save hero image', error);
      setHeroImageError('Chưa lưu được ảnh preview vào IndexedDB. Bạn thử lại nhé.');
    } finally {
      setHeroImageUploading(false);
      event.target.value = '';
    }
  };

  const handleCreate = async () => {
    if (!logoUrl) return alert('Vui lòng chọn logo trước.');
    if (!images.length) return alert('Vui lòng chọn ít nhất 1 ảnh.');
    if (!visitorId) return alert('Đang khởi tạo mã người dùng, bạn thử lại sau vài giây.');

    setProcessing(true);
    const newResults = [];

    for (let i = 0; i < images.length; i++) {
      try {
        const blob = await processWatermark(images[i].file, logoUrl, options);
        const url = URL.createObjectURL(blob);
        const fileName = buildFileName(options.productName, i, images.length);
        newResults.push({ url, blob, fileName });
      } catch (error) {
        console.error(`[DoanTrangWatermark] Error processing image ${i}:`, error);
      }
    }

    setResults(newResults);
    setProcessing(false);

    if (newResults.length > 0) {
      const displayName = user ? getUserDisplayName(user, null) : null;
      const result = await createWatermarkImageCount({
        userId: user?.id,
        visitorId,
        displayName,
        imageCount: newResults.length,
        sourcePage: DOANTRANG_COUNT_SOURCE_PAGE,
      });

      if (result.error) {
        console.warn('[DoanTrangWatermark] Could not save image count', result.error);
      } else {
        const nextPersonalCreated = personalCreated + newResults.length;
        const reachedMilestone = getReachedImageMilestone(personalCreated, nextPersonalCreated);

        setTotalCreated((current) => current + newResults.length);
        setPersonalCreated(nextPersonalCreated);
        setLastCreated(newResults.length);
        setStatsError(null);

        if (reachedMilestone) {
          setMilestoneCelebration({
            milestone: reachedMilestone,
            justCreated: newResults.length,
          });
        }
      }
    }

    setTimeout(() => {
      document.getElementById('dtw-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  const handleDownloadAll = useCallback(async (mode) => {
    if (!results.length) return;

    setExportSuccessBurst({
      id: `${Date.now()}-${mode}-${results.length}`,
      count: results.length,
      mode,
    });

    for (const result of results) {
      let blob = result.blob;
      let fileName = getDownloadFileName(result.fileName);

      if (mode === '800x600') {
        try {
          blob = await resizeBlob(blob, 800, 600);
          fileName = getDownloadFileName(result.fileName);
        } catch {
          /* Use original blob. */
        }
      } else if (mode === 'ImageCompress') {
        try {
          blob = await compressAndResizeBlob(blob, 800, 600, 100);
          fileName = getDownloadFileName(result.fileName);
        } catch {
          /* Use original blob. */
        }
      }

      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = fileName;
      anchor.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }, [results]);

  const handleClear = useCallback(() => {
    results.forEach((result) => URL.revokeObjectURL(result.url));
    setResults([]);
  }, [results]);

  const handleRenameResult = useCallback((index, nextName) => {
    setResults((current) => current.map((result, resultIndex) => (
      resultIndex === index ? { ...result, fileName: nextName } : result
    )));
  }, []);

  useEffect(() => {
    const shell = imageDropzoneShellRef.current;
    if (!shell) return undefined;

    const dropzoneIcon = shell.querySelector('.wm-dropzone-icon');
    if (!dropzoneIcon) return undefined;

    if (isDragging) {
      const animation = dropzoneIcon.animate(
        iconVariants.dragging.y.map((position) => ({ transform: `translateY(${position}px)` })),
        {
          duration: iconVariants.dragging.transition.duration * 1000,
          iterations: Infinity,
          easing: 'ease-in-out',
        }
      );

      return () => animation.cancel();
    } else {
      dropzoneIcon.getAnimations().forEach((animation) => animation.cancel());
    }

    return () => {
      dropzoneIcon.getAnimations().forEach((animation) => animation.cancel());
    };
  }, [isDragging]);

  useEffect(() => {
    const shell = imageDropzoneShellRef.current;
    if (!shell) return undefined;

    const applyStaggerReveal = (selector) => {
      const cards = Array.from(shell.querySelectorAll(selector));

      cards.forEach((card, index) => {
        card.animate(
          [
            {
              opacity: imageCardVariants.hidden.opacity,
              transform: `translateY(${imageCardVariants.hidden.y}px)`,
            },
            {
              opacity: imageCardVariants.visible.opacity,
              transform: `translateY(${imageCardVariants.visible.y}px)`,
            },
          ],
          {
            duration: 340,
            delay: index * 80,
            fill: 'both',
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }
        );
      });
    };

    applyStaggerReveal('.wm-thumb');
    return undefined;
  }, [images]);

  useEffect(() => {
    const shell = galleryShellRef.current;
    if (!shell) return undefined;

    const cards = Array.from(shell.querySelectorAll('.wm-result-card'));
    cards.forEach((card, index) => {
      card.animate(
        [
          {
            opacity: imageCardVariants.hidden.opacity,
            transform: `translateY(${imageCardVariants.hidden.y}px)`,
          },
          {
            opacity: imageCardVariants.visible.opacity,
            transform: `translateY(${imageCardVariants.visible.y}px)`,
          },
        ],
        {
          duration: 340,
          delay: index * 80,
          fill: 'both',
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }
      );
    });

    return undefined;
  }, [results]);

  const isImageDrag = useCallback((event) => {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes('Files');
  }, []);

  const handleImageDropzoneDragEnter = useCallback((event) => {
    if (!isImageDrag(event)) return;
    event.preventDefault();
    imageDragDepthRef.current += 1;
    setIsDragging(true);
  }, [isImageDrag]);

  const handleImageDropzoneDragOver = useCallback((event) => {
    if (!isImageDrag(event)) return;
    event.preventDefault();
    setIsDragging(true);
  }, [isImageDrag]);

  const handleImageDropzoneDragLeave = useCallback((event) => {
    if (!isImageDrag(event)) return;
    event.preventDefault();
    imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1);
    if (imageDragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }, [isImageDrag]);

  const handleImageDropzoneDrop = useCallback((event) => {
    if (!isImageDrag(event)) return;
    event.preventDefault();
    imageDragDepthRef.current = 0;
    setIsDragging(false);
  }, [isImageDrag]);

  const hasCreateInputs = Boolean(logoUrl && images.length > 0);
  const canCreate = hasCreateInputs && !processing;
  const createHeartIcon = hasCreateInputs && createButtonHovered ? '♥' : '♡';

  return (
    <>
      <Helmet>
        <title>Watermark just for Đoan Trang</title>  
        <meta
          name="description"
          content="Tạo watermark ảnh phong cách nữ tính, màu hồng tinh tế, dễ dùng và tải xuống nhanh chóng."
        />
      </Helmet>

      <style>{`
        .dtw-wm-page .dtw-dropzone-shell {
          transform-origin: center;
        }

        .dtw-wm-page .dtw-dropzone-shell--dragging .wm-dropzone {
          border-color: #db2777;
          background: rgba(251, 207, 232, 0.3);
          box-shadow: 0 0 0 4px rgba(219, 39, 119, 0.12);
        }

        .dtw-wm-page .dtw-dropzone-shell--dragging .wm-dropzone-title {
          color: #880e4f;
        }

        .dtw-wm-page .dtw-dropzone-shell--dragging .wm-dropzone-icon {
          color: #db2777;
        }
      `}</style>

      <div className="dtw-page dtw-wm-page">
        <div className="wm-container dtw-container">
          <section className="dtw-hero">
            <div className="dtw-hero-copy">
              <span className="dtw-kicker">Boutique watermark studio</span>
              <h1>
                Watermark
                <span> Đoan Trang</span>
              </h1>
              <p>
                Chọn logo, chọn nhiều ảnh, tinh chỉnh vị trí và xuất gallery giống trang watermark chính.
              </p>
              <div className="dtw-hero-chips" aria-hidden="true">
                <span>Logo watermark</span>
                <span>Batch export</span>
                <span>Rose UI</span>
              </div>
            </div>

            <div className={`dtw-hero-preview ${heroImageUrl ? 'has-image' : 'is-empty'}`}>
              <input
                ref={heroInputRef}
                className="dtw-hero-file-input"
                type="file"
                accept="image/*"
                onChange={handleHeroImageChange}
              />

              <div className="dtw-hero-photo">
                <div className="dtw-hero-photo-inner">
                  {heroImageUrl ? (
                    <>
                      <button
                        className="dtw-hero-image-button"
                        type="button"
                        onClick={() => openZoom({
                          url: heroImageUrl,
                          title: heroImageName || 'Ảnh preview Đoan Trang',
                          kicker: 'Hero preview',
                        })}
                        aria-label="Phóng to ảnh preview Đoan Trang"
                      >
                        <img src={heroImageUrl} alt={heroImageName || 'Ảnh preview Đoan Trang'} />
                      </button>
                      <button
                        className="dtw-hero-change-button"
                        type="button"
                        onClick={() => heroInputRef.current?.click()}
                      >
                        Thay ảnh
                      </button>
                    </>
                  ) : (
                    <div className="dtw-hero-empty">
                      <span className="dtw-hero-empty-mark" aria-hidden="true">DT</span>
                      <strong>{heroImageLoading ? 'Đang tải ảnh...' : 'Chưa có ảnh preview'}</strong>
                      {!heroImageLoading && (
                        <button
                          className="dtw-hero-upload-button"
                          type="button"
                          onClick={() => heroInputRef.current?.click()}
                        >
                          Chọn ảnh preview
                        </button>
                      )}
                      {heroImageError && <small>{heroImageError}</small>}
                    </div>
                  )}
                  <span className="dtw-hero-mark">Đoan Trang</span>
                </div>
              </div>
              <div className="dtw-hero-note">
                <strong>{images.length || 0} ảnh</strong>
                <span>
                  {heroImageError && heroImageUrl
                    ? heroImageError
                    : heroImageUploading
                    ? 'Đang tải preview lên Supabase'
                    : heroImageStorageUrl
                      ? 'Preview đã lưu Supabase'
                      : heroImageUrl
                        ? 'Ảnh preview đã lưu trình duyệt'
                        : logoUrl
                          ? 'Logo đã sẵn sàng'
                          : 'Chưa chọn logo'}
                </span>
              </div>
            </div>
          </section>

          <DoanTrangCountBoard
            totalCreated={totalCreated}
            personalCreated={personalCreated}
            lastCreated={lastCreated}
            selectedCount={images.length}
            isLoading={statsLoading}
            error={statsError}
            dashboardHref="/watermark/dashboard"
          />

          <section className="wm-layout dtw-layout" aria-label="Công cụ tạo watermark Đoan Trang">
            <div className="wm-panel-column wm-panel-column--narrow">
              <motion.div
                ref={imageDropzoneShellRef}
                className="wm-card wm-card--spaced"
                variants={containerVariants}
                animate="idle"
              >
                <LogoUploader
                  logoUrl={logoUrl}
                  logoName={logoName}
                  onLogoChange={handleLogoChange}
                  onImagePreview={openZoom}
                />
              </motion.div>

              <motion.div
                ref={imageDropzoneShellRef}
                className={`wm-card dtw-dropzone-shell${isDragging ? ' dtw-dropzone-shell--dragging' : ''}`}
                onDragEnter={handleImageDropzoneDragEnter}
                onDragOver={handleImageDropzoneDragOver}
                onDragLeave={handleImageDropzoneDragLeave}
                onDrop={handleImageDropzoneDrop}
                variants={containerVariants}
                animate={isDragging ? 'dragging' : 'idle'}
              >
                <ImageUploader
                  images={images}
                  onImagesChange={setImages}
                  onImagePreview={openZoom}
                />
              </motion.div>
            </div>

            <div className="wm-panel-column wm-panel-column--wide">
              <div className="wm-card wm-card--full">
                <WatermarkControls options={options} onChange={setOptions} />

                <hr className="wm-divider" />

                <div className="wm-action-bar">
                  <motion.button
                    className="wm-btn-primary wm-create-btn"
                    type="button"
                    onClick={handleCreate}
                    disabled={!canCreate}
                    variants={buttonVariants}
                    whileHover={canCreate ? 'hover' : undefined}
                    whileTap={canCreate ? 'tap' : undefined}
                    onHoverStart={() => setCreateButtonHovered(true)}
                    onHoverEnd={() => setCreateButtonHovered(false)}
                  >
                    {processing ? (
                      <>
                        <span className="wm-spinner" role="status" aria-label="Đang xử lý" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <motion.span
                          className="wm-inline-icon"
                          aria-hidden="true"
                          variants={heartVariants}
                        >
                          {createHeartIcon}
                        </motion.span>
                        Tạo ảnh watermark
                      </>
                    )}
                  </motion.button>

                  <span className="wm-create-hint">
                    {!logoUrl && 'Chưa có logo · '}
                    {images.length === 0 ? 'Chưa có ảnh nào' : `${images.length} ảnh đã chọn`}
                  </span>
                </div>

                {!logoUrl && (
                  <div className="wm-tip-alert">
                    <span className="wm-inline-icon" aria-hidden="true">◇</span>
                    Logo sẽ được lưu tự động vào trình duyệt để lần sau mở trang vẫn còn sẵn.
                  </div>
                )}
              </div>
            </div>
          </section>

          <div id="dtw-gallery">
            <motion.div
              ref={galleryShellRef}
              variants={galleryVariants}
              initial="hidden"
              animate={results.length > 0 ? 'visible' : 'hidden'}
            >
              <WatermarkGallery
                results={results}
                onClear={handleClear}
                onDownloadAll={handleDownloadAll}
                onRenameFile={handleRenameResult}
                isProcessing={processing}
              />
            </motion.div>
          </div>
        </div>
      </div>

      <WatermarkImageZoom image={zoomImage} onClose={closeZoom} />
      <DoanTrangMilestoneCelebration
        milestone={milestoneCelebration?.milestone}
        justCreated={milestoneCelebration?.justCreated}
        onClose={closeMilestoneCelebration}
      />
      <DoanTrangExportSuccessCelebration
        burst={exportSuccessBurst}
        onClose={closeExportSuccessCelebration}
      />
    </>
  );
}
