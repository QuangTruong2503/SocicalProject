import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Helmet } from "react-helmet-async";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import JSZip from "jszip";
import { toast } from "react-toastify";
import LogoUploader from "../components/watermark/LogoUploader";
import ImageUploader from "../components/watermark/ImageUploader";
import WatermarkControls from "../components/watermark/WatermarkControls";
import WatermarkGallery from "../components/watermark/WatermarkGallery";
import {
  buildFileName,
  compressAndResizeBlob,
  processWatermark,
  resizeBlob,
} from "../hooks/useWatermarkProcessor";
import { useAuth } from "../hooks/useAuth.js";
import { getUserDisplayName } from "../utils/userProfile.js";
import { loadDoanTrangWatermarkOptions, saveDoanTrangWatermarkOptions } from "../hooks/useIndexedDB.js";
import { getOrCreateWatermarkVisitorId } from "../utils/watermarkVisitor.js";
import { useHeroImagePreview } from "../hooks/useHeroImagePreview.js";
import { useImageDropzoneDrag } from "../hooks/useImageDropzoneDrag.js";
import { useWatermarkStats } from "../hooks/useWatermarkStats.js";
import "../styles/Watermark-girly-pink-complete.css";
import "../styles/DoanTrangWatermark.css";

const DEFAULT_OPTIONS = {
  size: 60,
  opacity: 60,
  tiled: false,
  productName: "doan-trang",
  logoPosition: "center",
};
const buttonVariants = {
  hover: { scale: 1.05, boxShadow: "0px 5px 15px rgba(219, 39, 119, 0.4)" },
  tap: { scale: 0.95 },
};
const heartVariants = {
  hover: {
    scale: [1, 1.2, 1, 1.2, 1],
    transition: { duration: 1.3, repeat: Infinity },
  },
};
const containerVariants = {
  idle: {
    scale: 1,
    borderColor: "#f472b6",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
  },
  dragging: {
    scale: 1.02,
    borderColor: "#db2777",
    backgroundColor: "rgba(251, 207, 232, 0.3)",
    transition: { repeat: Infinity, repeatType: "reverse", duration: 0.8 },
  },
};
const iconVariants = {
  dragging: {
    y: [0, -10, 0],
    transition: { repeat: Infinity, duration: 1, ease: "easeInOut" },
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
    transition: { type: "spring", stiffness: 100, damping: 15 },
  },
};
const exportConfettiColors = ["#db2777", "#f472b6", "#ffffff"];
const milestoneFireworkColors = [
  "#fb7185",
  "#f97316",
  "#facc15",
  "#60a5fa",
  "#34d399",
  "#f472b6",
];

// Some lint setups in this repo do not count JSX tag usage for namespace imports.
void motion;

function runStaggerReveal(container, selector) {
  if (!container) return;

  const cards = Array.from(container.querySelectorAll(selector));

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
        fill: "both",
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    );
  });
}

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
    const driftX =
      Math.cos(angle) * distance + (Math.random() * 90 - 45) * burstScale;
    const driftY =
      Math.sin(angle) * distance * 0.5 + 120 + Math.random() * 120 * burstScale;

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
          color:
            milestoneFireworkColors[
              (burstIndex + index) % milestoneFireworkColors.length
            ],
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

function normalizeFileName(fileName, fallbackBase = "image") {
  const trimmed = (fileName || "").trim();
  const baseName = trimmed ? trimmed.replace(/\.[^.]+$/, "") : fallbackBase;
  return `${baseName || fallbackBase}.jpg`;
}

function getDownloadFileName(fileName, suffix = "") {
  const normalized = normalizeFileName(fileName);
  const baseName = normalized.replace(/\.jpg$/i, "");
  return `${baseName}${suffix}.jpg`;
}

function formatCount(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value) || 0);
}

const AnimatedCount = React.memo(function AnimatedCount({
  value,
  duration = 1.5,
  shouldAnimate,
}) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) =>
    Math.round(latest).toLocaleString("vi-VN"),
  );

  useEffect(() => {
    if (!shouldAnimate) {
      count.set(0);
      return undefined;
    }

    const animation = animate(count, Number(value) || 0, {
      duration,
      ease: "easeOut",
    });
    return animation.stop;
  }, [count, duration, shouldAnimate, value]);

  return <motion.span>{rounded}</motion.span>;
});

const DoanTrangCountBoard = React.memo(function DoanTrangCountBoard({
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
      },
    );

    observer.observe(boardElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  const rows = [
    {
      label: "Tổng ảnh đã tạo",
      value: totalCreated,
      isLoading,
      note: error
        ? "Chưa tải được dữ liệu Supabase"
        : "Chỉ tính trang Watermark Đoan Trang",
      tone: error ? "warning" : "primary",
    },
    {
      label: "Ảnh của bạn",
      value: personalCreated,
      isLoading,
      note: "Số ảnh bạn đã tạo trên trình duyệt này",
      tone: "success",
    },
    {
      label: "Lần tạo gần nhất",
      value: lastCreated,
      isLoading,
      note:
        selectedCount > 0
          ? `${formatCount(selectedCount)} ảnh đang chọn`
          : "Chưa chọn ảnh",
      tone: "neutral",
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
          <article
            className={`dtw-count-card dtw-count-card--${row.tone}`}
            key={row.label}
          >
            <span className="dtw-count-card__label">{row.label}</span>
            <strong>
              {row.isLoading ? (
                "..."
              ) : (
                <AnimatedCount value={row.value} shouldAnimate={isInView} />
              )}
            </strong>
            <span className="dtw-count-card__note">{row.note}</span>
          </article>
        ))}
      </div>
    </section>
  );
});

const DoanTrangMilestoneCelebration = React.memo(
  function DoanTrangMilestoneCelebration({ milestone, justCreated, onClose }) {
    const fireworkBursts = useMemo(
      () => buildMilestoneFireworkBursts(milestone),
      [milestone],
    );

    if (!milestone) return null;

  return createPortal(
    <div
      className="dtw-milestone-backdrop"
      role="presentation"
      onPointerDown={onClose}
    >
      <div className="dtw-milestone-fireworks" aria-hidden="true">
        {fireworkBursts.map((burst) => (
          <span
            key={burst.id}
            className="dtw-milestone-firework"
            style={{
              left: `${burst.left}%`,
              top: `${burst.top}%`,
              "--dtw-firework-delay": `${burst.delay}s`,
              "--dtw-firework-scale": burst.scale,
            }}
          >
            {burst.particles.map((particle) => (
              <motion.span
                key={particle.id}
                className="dtw-milestone-spark"
                style={{
                  "--dtw-spark-color": particle.color,
                  "--dtw-spark-size": `${particle.size}px`,
                  "--dtw-spark-delay": `${particle.delay}s`,
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
                  ease: "easeOut",
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
                "--dtw-confetti-angle": `${index * 20}deg`,
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
          Vừa tạo thêm {formatCount(justCreated)} ảnh watermark. Bộ sưu tập Đoan
          Trang đang lên mood rất xịn.
        </p>
        <button
          className="dtw-milestone-button"
          type="button"
          onClick={onClose}
        >
          Tiếp tục tạo ảnh
        </button>
      </div>
    </div>,
    document.body,
    );
  },
);

const DoanTrangExportSuccessCelebration = React.memo(
  function DoanTrangExportSuccessCelebration({ burst, onClose }) {
    const pieces = useMemo(
      () => buildExportConfettiPieces(burst?.count),
      [burst?.count],
    );

    return createPortal(
      <AnimatePresence>
        {burst && (
          <motion.div
            key={burst.id}
            className="dtw-export-success-backdrop"
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1150,
              overflow: "hidden",
              background: "rgba(136, 14, 79, 0.08)",
              pointerEvents: "auto",
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
                  position: "absolute",
                  left: "50%",
                  top: "44%",
                  width: `${piece.size}px`,
                  height: `${piece.size * 1.45}px`,
                  background: piece.color,
                  borderRadius: "999px",
                  boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.16)",
                  pointerEvents: "none",
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
                  ease: "easeOut",
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
      document.body,
    );
  },
);

const WatermarkImageZoom = React.memo(function WatermarkImageZoom({
  image,
  onClose,
}) {
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
            <span className="wm-preview-kicker">
              {image.kicker || "Xem ảnh"}
            </span>
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
    document.body,
  );
});

const HeroPreviewSkeleton = React.memo(function HeroPreviewSkeleton() {
  return (
    <div className="dtw-hero-skeleton" aria-hidden="true">
      <div className="dtw-hero-skeleton__card">
        <div className="dtw-skeleton dtw-skeleton--hero-image" />
        <div className="dtw-hero-skeleton__overlay">
          <span className="dtw-skeleton dtw-skeleton--hero-chip" />
          <span className="dtw-skeleton dtw-skeleton--hero-chip" />
        </div>
      </div>
      <div className="dtw-hero-skeleton__meta">
        <span className="dtw-skeleton dtw-skeleton--hero-line dtw-skeleton--hero-line-lg" />
        <span className="dtw-skeleton dtw-skeleton--hero-line" />
        <span className="dtw-skeleton dtw-skeleton--hero-button" />
      </div>
    </div>
  );
});

export default function DoanTrangWatermarkPage() {
  const { user } = useAuth();
  const heroInputRef = useRef(null);
  const logoCardShellRef = useRef(null);
  const imageDropzoneShellRef = useRef(null);
  const galleryShellRef = useRef(null);
  const workerRef = useRef(null);
  const workerTaskIdRef = useRef(0);
  const pendingWorkerTasksRef = useRef(new Map());
  const downloadProgressTimerRef = useRef(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoName, setLogoName] = useState(null);
  const [logoBlob, setLogoBlob] = useState(null);
  const [images, setImages] = useState([]);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [, setProcessingProgress] = useState({
    current: 0,
    total: 0,
  });
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [zoomImage, setZoomImage] = useState(null);
  const [exportSuccessBurst, setExportSuccessBurst] = useState(null);
  const [createButtonHovered, setCreateButtonHovered] = useState(false);
  const [visitorId] = useState(() => getOrCreateWatermarkVisitorId());
  const {
    heroImageUrl,
    heroImageName,
    heroImageError,
    heroImageLoading,
    heroImageUploading,
    heroImageStorageUrl,
    handleHeroImageChange,
  } = useHeroImagePreview(user?.id);
  const {
    totalCreated,
    personalCreated,
    lastCreated,
    statsLoading,
    statsError,
    milestoneCelebration,
    recordCreated,
    closeMilestoneCelebration,
  } = useWatermarkStats(visitorId);
  const {
    isDragging,
    handleImageDropzoneDragEnter,
    handleImageDropzoneDragOver,
    handleImageDropzoneDragLeave,
    handleImageDropzoneDrop,
  } = useImageDropzoneDrag();

  const handleLogoChange = useCallback((url, name, blob) => {
    setLogoUrl(url);
    setLogoName(name);
    setLogoBlob(blob || null);
  }, []);

  const openZoom = useCallback((image) => {
    setZoomImage(image);
  }, []);

  const closeZoom = useCallback(() => {
    setZoomImage(null);
  }, []);

  const closeExportSuccessCelebration = useCallback(() => {
    setExportSuccessBurst(null);
  }, []);

  useEffect(() => {
    document.body.classList.add("dtw-watermark-theme");

    return () => {
      document.body.classList.remove("dtw-watermark-theme");
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    loadDoanTrangWatermarkOptions()
      .then((storedOptions) => {
        if (!isActive || !storedOptions) return;
        setOptions((current) => ({ ...current, ...storedOptions }));
      })
      .catch((error) => {
        console.warn(
          "[DoanTrangWatermark] Could not load watermark options",
          error,
        );
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveDoanTrangWatermarkOptions(options).catch((error) => {
        console.warn(
          "[DoanTrangWatermark] Could not save watermark options",
          error,
        );
      });
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [options]);

  useEffect(() => {
    if (!zoomImage) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeZoom();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.classList.add("wm-modal-open");

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.classList.remove("wm-modal-open");
    };
  }, [closeZoom, zoomImage]);

  useEffect(() => {
    if (!milestoneCelebration) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeMilestoneCelebration();
      }
    };

    const timeoutId = window.setTimeout(closeMilestoneCelebration, 6800);
    document.addEventListener("keydown", handleEscape);
    document.body.classList.add("wm-modal-open");

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleEscape);
      document.body.classList.remove("wm-modal-open");
    };
  }, [closeMilestoneCelebration, milestoneCelebration]);

  useEffect(() => {
    if (!exportSuccessBurst) return undefined;

    const timeoutId = window.setTimeout(() => {
      setExportSuccessBurst(null);
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [exportSuccessBurst]);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return undefined;
    }

    const pendingTasks = pendingWorkerTasksRef.current;
    const worker = new Worker(
      new URL("../workers/doanTrangWatermarkWorker.js", import.meta.url),
      {
        type: "module",
      },
    );

    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { id, ok, blob, error } = event.data || {};
      const task = pendingTasks.get(id);

      if (!task) {
        return;
      }

      pendingTasks.delete(id);

      if (ok) {
        task.resolve(blob);
      } else {
        task.reject(new Error(error || "Worker processing failed"));
      }
    };

    worker.onerror = (event) => {
      console.error(
        "[DoanTrangWatermark] Watermark worker failed",
        event.error || event.message,
      );
      pendingTasks.forEach(({ reject }) =>
        reject(new Error("Watermark worker crashed")),
      );
      pendingTasks.clear();
      workerRef.current = null;
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingTasks.forEach(({ reject }) =>
        reject(new Error("Watermark worker stopped")),
      );
      pendingTasks.clear();
    };
  }, []);

  const processWatermarkWithWorker = useCallback(
    async (sourceFile, activeOptions) => {
      let activeLogoBlob = logoBlob;

      if (!activeLogoBlob && logoUrl) {
        try {
          activeLogoBlob = await fetch(logoUrl).then((response) =>
            response.blob(),
          );
        } catch (error) {
          console.warn(
            "[DoanTrangWatermark] Could not hydrate logo blob for worker",
            error,
          );
        }
      }

      if (!workerRef.current || !activeLogoBlob) {
        return processWatermark(sourceFile, logoUrl, activeOptions);
      }

      const taskId = `dtw-watermark-${Date.now()}-${(workerTaskIdRef.current += 1)}`;

      return new Promise((resolve, reject) => {
        pendingWorkerTasksRef.current.set(taskId, { resolve, reject });

        try {
          workerRef.current.postMessage({
            id: taskId,
            type: "process",
            payload: {
              sourceFile,
              logoBlob: activeLogoBlob,
              options: activeOptions,
            },
          });
        } catch (error) {
          pendingWorkerTasksRef.current.delete(taskId);
          reject(error);
        }
      });
    },
    [logoBlob, logoUrl],
  );

  const resizeBlobWithWorker = useCallback(
    async (sourceBlob, width, height) => {
      if (!workerRef.current) {
        return resizeBlob(sourceBlob, width, height);
      }

      const taskId = `dtw-resize-${Date.now()}-${(workerTaskIdRef.current += 1)}`;

      return new Promise((resolve, reject) => {
        pendingWorkerTasksRef.current.set(taskId, { resolve, reject });

        try {
          workerRef.current.postMessage({
            id: taskId,
            type: "resize",
            payload: {
              blob: sourceBlob,
              width,
              height,
            },
          });
        } catch (error) {
          pendingWorkerTasksRef.current.delete(taskId);
          reject(error);
        }
      });
    },
    [],
  );

  const handleCreate = async () => {
    if (!logoUrl) return toast.warning("Vui lòng chọn logo trước.");
    if (!images.length) return toast.warning("Vui lòng chọn ít nhất 1 ảnh.");
    if (!visitorId)
      return toast.info("Đang khởi tạo mã người dùng, bạn thử lại sau vài giây.");

    setProcessing(true);
    setProcessingProgress({ current: 0, total: images.length });
    const newResults = [];
    const loadingToastId = toast.loading(
      `Đang tạo ảnh watermark (0/${images.length})…`,
    );

    for (let i = 0; i < images.length; i++) {
      try {
        const blob = await processWatermarkWithWorker(images[i].file, options);
        const url = URL.createObjectURL(blob);
        const fileName = buildFileName(options.productName, i, images.length);
        newResults.push({ url, blob, fileName });
      } catch (error) {
        console.error(
          `[DoanTrangWatermark] Error processing image ${i}:`,
          error,
        );
      }

      setProcessingProgress({ current: i + 1, total: images.length });
      toast.update(loadingToastId, {
        render: `Đang tạo ảnh watermark (${i + 1}/${images.length})…`,
        progress: (i + 1) / images.length,
      });
    }

    setResults((current) => {
      current.forEach((result) => URL.revokeObjectURL(result.url));
      return newResults;
    });
    setProcessing(false);

    if (newResults.length > 0) {
      const displayName = user ? getUserDisplayName(user, null) : null;
      await recordCreated({
        userId: user?.id,
        displayName,
        imageCount: newResults.length,
      });
    }

    toast.update(loadingToastId, {
      render:
        newResults.length === images.length
          ? `Đã tạo xong ${newResults.length} ảnh watermark.`
          : `Đã tạo ${newResults.length}/${images.length} ảnh. Một số ảnh bị lỗi.`,
      type: newResults.length === images.length ? "success" : "warning",
      isLoading: false,
      progress: undefined,
      autoClose: 3500,
      closeButton: true,
    });

    window.setTimeout(() => {
      document
        .getElementById("dtw-gallery")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  };

  const handleDownloadAll = useCallback(
    async (mode) => {
      if (!results.length) return;

      const shouldZip = results.length > 5;
      const prepareBlob = async (result) => {
        let blob = result.blob;
        let fileName = getDownloadFileName(result.fileName);

        if (mode === "800x600") {
          try {
            blob = await resizeBlobWithWorker(blob, 800, 600);
            fileName = getDownloadFileName(result.fileName);
          } catch {
            /* Use original blob. */
          }
        } else if (mode === "ImageCompress") {
          try {
            blob = await compressAndResizeBlob(blob, 800, 600, 100);
            fileName = getDownloadFileName(result.fileName);
          } catch {
            /* Use original blob. */
          }
        }

        return { blob, fileName };
      };

      const loadingToastId = toast.loading(
        `Đang chuẩn bị tải xuống (0/${results.length})…`,
      );

      try {
        if (shouldZip) {
          const zip = new JSZip();
          const total = results.length;

          setDownloadProgress({
            current: 0,
            total,
            phase: "preparing",
            percent: 0,
            message: "Đang gom ảnh vào một file .zip",
          });

          for (let i = 0; i < results.length; i++) {
            const prepared = await prepareBlob(results[i]);
            zip.file(prepared.fileName, prepared.blob);
            setDownloadProgress({
              current: i + 1,
              total,
              phase: "preparing",
              percent: Math.round(((i + 1) / total) * 100),
              message: `Đã thêm ${i + 1}/${total} ảnh vào gói tải`,
            });
            toast.update(loadingToastId, {
              render: `Đang gom ảnh vào file ZIP (${i + 1}/${total})…`,
              progress: (i + 1) / total,
            });
          }

          const zipBlob = await zip.generateAsync(
            {
              type: "blob",
              compression: "DEFLATE",
              compressionOptions: { level: 6 },
            },
            (metadata) => {
              setDownloadProgress({
                current: total,
                total,
                phase: "compressing",
                percent: Math.max(
                  0,
                  Math.min(100, Math.round(metadata.percent || 0)),
                ),
                message: "Đang nén file .zip trước khi tải xuống",
              });
              toast.update(loadingToastId, {
                render: `Đang nén file ZIP (${Math.round(metadata.percent || 0)}%)…`,
                progress: (metadata.percent || 0) / 100,
              });
            },
          );

          const zipName = `doan-trang-watermark-${Date.now()}.zip`;
          const anchor = document.createElement("a");
          anchor.href = URL.createObjectURL(zipBlob);
          anchor.download = zipName;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1500);
          setDownloadProgress({
            current: total,
            total,
            phase: "complete",
            percent: 100,
            message: "Đã tạo file zip, trình duyệt đang tải xuống",
          });
        } else {
          const total = results.length;

          setDownloadProgress({
            current: 0,
            total,
            phase: "downloading",
            percent: 0,
            message: "Đang tải từng ảnh xuống",
          });

          for (let i = 0; i < results.length; i++) {
            const prepared = await prepareBlob(results[i]);
            const anchor = document.createElement("a");
            const objectUrl = URL.createObjectURL(prepared.blob);
            anchor.href = objectUrl;
            anchor.download = prepared.fileName;
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);

            setDownloadProgress({
              current: i + 1,
              total,
              phase: "downloading",
              percent: Math.round(((i + 1) / total) * 100),
              message: `Đã tải ${i + 1}/${total} ảnh`,
            });
            toast.update(loadingToastId, {
              render: `Đang tải ảnh (${i + 1}/${total})…`,
              progress: (i + 1) / total,
            });

            await new Promise((resolve) => setTimeout(resolve, 80));
          }
        }

        toast.update(loadingToastId, {
          render: shouldZip
            ? `Đã tạo và tải file ZIP gồm ${results.length} ảnh.`
            : `Đã tải xuống ${results.length} ảnh.`,
          type: "success",
          isLoading: false,
          progress: undefined,
          autoClose: 3500,
          closeButton: true,
        });
      } catch (error) {
        console.error("[DoanTrangWatermark] Download failed", error);
        toast.update(loadingToastId, {
          render: "Không thể tải ảnh xuống. Vui lòng thử lại.",
          type: "error",
          isLoading: false,
          progress: undefined,
          autoClose: 4500,
          closeButton: true,
        });
      } finally {
        if (downloadProgressTimerRef.current) {
          window.clearTimeout(downloadProgressTimerRef.current);
        }

        downloadProgressTimerRef.current = window.setTimeout(() => {
          setDownloadProgress(null);
          downloadProgressTimerRef.current = null;
        }, 1400);
      }
    },
    [results, resizeBlobWithWorker],
  );

  useEffect(
    () => () => {
      if (downloadProgressTimerRef.current) {
        window.clearTimeout(downloadProgressTimerRef.current);
      }
    },
    [],
  );

  const handleClear = useCallback(() => {
    results.forEach((result) => URL.revokeObjectURL(result.url));
    setResults([]);
  }, [results]);

  const handleRenameResult = useCallback((index, nextName) => {
    setResults((current) =>
      current.map((result, resultIndex) =>
        resultIndex === index ? { ...result, fileName: nextName } : result,
      ),
    );
  }, []);

  useEffect(() => {
    const shell = imageDropzoneShellRef.current;
    if (!shell) return undefined;

    const dropzoneIcon = shell.querySelector(".wm-dropzone-icon");
    if (!dropzoneIcon) return undefined;

    if (isDragging) {
      const animation = dropzoneIcon.animate(
        iconVariants.dragging.y.map((position) => ({
          transform: `translateY(${position}px)`,
        })),
        {
          duration: iconVariants.dragging.transition.duration * 1000,
          iterations: Infinity,
          easing: "ease-in-out",
        },
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

    runStaggerReveal(shell, ".wm-thumb");
    return undefined;
  }, [images]);

  useEffect(() => {
    const shell = galleryShellRef.current;
    if (!shell) return undefined;

    runStaggerReveal(shell, ".wm-result-card");

    return undefined;
  }, [results]);

  const hasCreateInputs = Boolean(logoUrl && images.length > 0);
  const canCreate = hasCreateInputs && !processing;
  const createHeartIcon = hasCreateInputs && createButtonHovered ? "♥" : "♡";
  const shouldShowGallery =
    results.length > 0 || processing || Boolean(downloadProgress);

  return (
    <>
      <Helmet>
        <title>Watermark just for Đoan Trang</title>
        <meta
          name="description"
          content="Tạo watermark ảnh phong cách nữ tính, màu hồng tinh tế, dễ dùng và tải xuống nhanh chóng."
        />
      </Helmet>

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
                Chọn logo, chọn nhiều ảnh, tinh chỉnh vị trí và xuất gallery
                giống trang watermark chính.
              </p>
              <div className="dtw-hero-chips" aria-hidden="true">
                <span>Logo watermark</span>
                <span>Batch export</span>
                <span>Rose UI</span>
              </div>
            </div>

            <div
              className={`dtw-hero-preview ${heroImageUrl ? "has-image" : "is-empty"}${heroImageLoading ? " is-loading" : ""}`}
            >
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
                        onClick={() =>
                          openZoom({
                            url: heroImageUrl,
                            title: heroImageName || "Ảnh preview Đoan Trang",
                            kicker: "Hero preview",
                          })
                        }
                        aria-label="Phóng to ảnh preview Đoan Trang"
                      >
                        <img
                          src={heroImageUrl}
                          alt={heroImageName || "Ảnh preview Đoan Trang"}
                        />
                      </button>
                      <button
                        className="dtw-hero-change-button"
                        type="button"
                        onClick={() => heroInputRef.current?.click()}
                      >
                        Thay ảnh
                      </button>
                    </>
                  ) : heroImageLoading ? (
                    <HeroPreviewSkeleton />
                  ) : (
                    <div className="dtw-hero-empty">
                      <span className="dtw-hero-empty-mark" aria-hidden="true">
                        DT
                      </span>
                      <strong>Chưa có ảnh preview</strong>
                      <button
                        className="dtw-hero-upload-button"
                        type="button"
                        onClick={() => heroInputRef.current?.click()}
                      >
                        Chọn ảnh preview
                      </button>
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
                      ? "Đang tải preview lên Supabase"
                      : heroImageStorageUrl
                        ? "Preview đã lưu Supabase"
                        : heroImageUrl
                          ? "Ảnh preview đã lưu trình duyệt"
                          : logoUrl
                            ? "Logo đã sẵn sàng"
                            : "Chưa chọn logo"}
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
          />

          <section
            className="wm-layout dtw-layout"
            aria-label="Công cụ tạo watermark Đoan Trang"
          >
            <div className="wm-panel-column wm-panel-column--narrow">
              <motion.div
                ref={logoCardShellRef}
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
                className={`wm-card dtw-dropzone-shell${isDragging ? " dtw-dropzone-shell--dragging" : ""}`}
                onDragEnter={handleImageDropzoneDragEnter}
                onDragOver={handleImageDropzoneDragOver}
                onDragLeave={handleImageDropzoneDragLeave}
                onDrop={handleImageDropzoneDrop}
                variants={containerVariants}
                animate={isDragging ? "dragging" : "idle"}
              >
                <ImageUploader
                  images={images}
                  onImagesChange={setImages}
                  onImagePreview={openZoom}
                  logoUrl={logoUrl}
                  options={options}
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
                    whileHover={canCreate ? "hover" : undefined}
                    whileTap={canCreate ? "tap" : undefined}
                    onHoverStart={() => setCreateButtonHovered(true)}
                    onHoverEnd={() => setCreateButtonHovered(false)}
                  >
                    {processing ? (
                      <>
                        <span
                          className="wm-spinner"
                          role="status"
                          aria-label="Đang xử lý"
                        />
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
                    {!logoUrl && "Chưa có logo · "}
                    {images.length === 0
                      ? "Chưa có ảnh nào"
                      : `${images.length} ảnh đã chọn`}
                  </span>
                </div>

                {!logoUrl && (
                  <div className="wm-tip-alert">
                    <span className="wm-inline-icon" aria-hidden="true">
                      ◇
                    </span>
                    Logo sẽ được lưu tự động vào trình duyệt để lần sau mở trang
                    vẫn còn sẵn.
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
              animate={shouldShowGallery ? "visible" : "hidden"}
            >
              <WatermarkGallery
                results={results}
                onClear={handleClear}
                onDownloadAll={handleDownloadAll}
                onRenameFile={handleRenameResult}
                isProcessing={false}
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
