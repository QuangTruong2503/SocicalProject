import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import LogoUploader from '../components/watermark/LogoUploader';
import WatermarkControls from '../components/watermark/WatermarkControls';
import WatermarkLivePreview from '../components/watermark/WatermarkLivePreview';
import ImageLightbox from '../components/watermark/ImageLightbox';
import ProductFolderPicker from '../components/watermark/auto/ProductFolderPicker.jsx';
import AutoProcessingProgress from '../components/watermark/auto/AutoProcessingProgress.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useAiNamingAccess } from '../hooks/useAiNamingAccess.js';
import { useTheme } from '../hooks/useTheme.js';
import { useWatermarkAutoProcessor } from '../hooks/useWatermarkAutoProcessor.js';
import { loadWatermarkOptions, saveWatermarkOptions } from '../hooks/useIndexedDB.js';
import { buildThemeAccentVars } from '../utils/colorTools.js';
import { createWatermarkEngine } from '../utils/watermarkEngine.js';
import { DEFAULT_OPTIONS, mergeWatermarkOptions } from '../utils/watermarkOptions.js';
import {
  DEFAULT_IMAGE_NAME_MODEL,
  DEFAULT_IMAGE_NAME_PROMPT,
  IMAGE_NAME_LIMITS,
  IMAGE_NAME_MODELS,
  loadSavedImageNamePrompt,
  saveImageNamePrompt,
} from '../utils/aiImageNaming.js';
import { describeAiNamingAccess } from '../utils/aiNamingAccess.js';
import { AI_NAMING_ERRORS } from '../services/imageNameService.js';
import {
  REPORT_CSV_HEADER,
  buildReportRows,
  describeRunSummary,
  reportRowsToCsvRows,
  reportToText,
} from '../utils/watermarkAutoNaming.js';
import { downloadCsv } from '../utils/csv.js';
import { getUserDisplayName } from '../utils/userProfile.js';
import { getOrCreateWatermarkVisitorId } from '../utils/watermarkVisitor.js';
import { createWatermarkImageCount } from '../services/watermarkImageCountService.js';
import { trackUsageEvent, trackUsageEvents } from '../services/usageTelemetryService.js';
import { buildApplyEvents, buildCreateEvent, buildDownloadEvent, createSubject } from '../utils/usageEvents.js';
import '../styles/Watermark.css';
import '../styles/WatermarkAuto.css';

const SOURCE_PAGE = 'watermark/auto';
const OUTPUT_SIZE_KEY = 'watermark_auto_output_size';
const OUTPUT_SIZES = [
  { id: '800x600', label: '800 × 600 px' },
  { id: 'original', label: 'Kích thước gốc' },
];
const AI_PAUSE_CODES_WITH_ACCESS_CHECK = new Set([AI_NAMING_ERRORS.accessDenied, AI_NAMING_ERRORS.modelDenied, AI_NAMING_ERRORS.accessCheckFailed]);

const SUPPORT_MESSAGES = {
  insecure: 'Trang cần mở qua HTTPS (hoặc localhost) thì trình duyệt mới cho lưu thẳng vào thư mục.',
  no_picker: 'Trình duyệt này chưa hỗ trợ chọn và ghi thư mục trực tiếp. Hãy mở trang bằng Chrome hoặc Edge trên máy tính.',
};

const START_ERRORS = {
  busy: 'Đang có thao tác khác, vui lòng đợi.',
  engine: 'Bộ xử lý ảnh chưa sẵn sàng. Hãy thử lại sau giây lát.',
  no_images: 'Chưa chọn sản phẩm nào có ảnh hợp lệ.',
  auth: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi chọn lại thư mục.',
};

function loadOutputSize() {
  try {
    const saved = localStorage.getItem(OUTPUT_SIZE_KEY);
    if (OUTPUT_SIZES.some((size) => size.id === saved)) return saved;
  } catch {
    // Default below.
  }
  return '800x600';
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function useTicker(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export default function WatermarkAuto() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const aiAccess = useAiNamingAccess();
  const [engine, setEngine] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoName, setLogoName] = useState(null);
  const [logoState, setLogoState] = useState({ version: 0, ready: false });
  const [zoomLogo, setZoomLogo] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [optionsHydrated, setOptionsHydrated] = useState(false);
  const [outputSize, setOutputSize] = useState(loadOutputSize);
  const [model, setModel] = useState(DEFAULT_IMAGE_NAME_MODEL);
  const [prompt, setPrompt] = useState(loadSavedImageNamePrompt);
  const [previewProductId, setPreviewProductId] = useState(null);
  const [startError, setStartError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [visitorId] = useState(() => getOrCreateWatermarkVisitorId());
  const userId = user?.id ?? null;
  // Fixed when a run starts, so its events stay with that account.
  const runContextRef = useRef(null);
  const pageThemeVars = useMemo(() => buildThemeAccentVars(options.accentColor, isDark), [options.accentColor, isDark]);

  // Statistics per finished segment (start / resume / retry), same semantics as /watermark:
  // "created" = rendered for the first time, "download" = written to Named with close() done.
  const handleSegmentEnd = useCallback(({ imageBatchId, config, segment }) => {
    const context = runContextRef.current;
    if (!context) return;
    const { subject } = context;
    const { create, write } = segment;

    if (create.requested > 0) {
      trackUsageEvent(buildCreateEvent({
        subject,
        imageBatchId,
        requested: create.requested,
        succeeded: create.succeeded,
        failed: create.failed,
        skipped: 0,
        cancelled: create.requested - create.succeeded - create.failed,
        aborted: segment.aborted,
        durationMs: segment.durationMs,
        sourcePage: SOURCE_PAGE,
      }));
    }
    if (write.requested > 0) {
      const notDelivered = write.written < write.requested;
      trackUsageEvent(buildDownloadEvent({
        subject,
        imageBatchId,
        method: 'direct',
        imageSize: config.outputSize === '800x600' ? '800x600' : 'original',
        requested: write.requested,
        outcome: {
          prepared: write.attempted,
          delivered: write.written,
          outputFiles: write.written,
          delivery: 'file_written',
          cancelled: segment.aborted,
          error: !segment.aborted && notDelivered ? { stage: write.failed ? 'write' : 'prepare' } : null,
          stage: write.failed ? 'write' : 'prepare',
        },
        durationMs: segment.durationMs,
        sourcePage: SOURCE_PAGE,
      }));
    }
    if (segment.applied.size) {
      trackUsageEvents(buildApplyEvents({
        subject,
        imageBatchId,
        sourcePage: SOURCE_PAGE,
        groups: [...segment.applied].map(([aiRunId, count]) => ({ aiRunId, applied: count, aiUnchanged: count, edited: 0 })),
      }));
    }
    if (create.succeeded > 0 && context.visitorId) {
      void createWatermarkImageCount({
        userId: context.userId,
        visitorId: context.visitorId,
        displayName: context.displayName,
        userColor: context.accentColor,
        imageCount: create.succeeded,
        sourcePage: SOURCE_PAGE,
      }).catch(() => {});
    }
  }, []);

  const { snapshot, runner } = useWatermarkAutoProcessor({
    engine,
    onSegmentEnd: handleSegmentEnd,
    onAccessRejected: aiAccess.reportRejection,
  });
  const { products, run, notices, picking, granting, support } = snapshot;
  const locked = run?.state === 'running' || run?.state === 'stopping';
  const now = useTicker(Boolean(run?.pause?.until));

  useEffect(() => {
    const nextEngine = createWatermarkEngine();
    setEngine(nextEngine);
    return () => nextEngine.dispose();
  }, []);

  useEffect(() => {
    if (!engine) return undefined;
    let active = true;
    engine.setLogo(logoUrl)
      .then(() => { if (active) setLogoState((state) => ({ version: state.version + 1, ready: Boolean(logoUrl) })); })
      .catch(() => {
        if (!active) return;
        setLogoState((state) => ({ version: state.version + 1, ready: false }));
        toast.error('Không thể đọc logo. Hãy chọn một file ảnh hợp lệ.');
      });
    return () => { active = false; };
  }, [engine, logoUrl]);

  const handleLogoChange = useCallback((url, name) => {
    setLogoUrl(url);
    setLogoName(name);
  }, []);

  useEffect(() => {
    document.body.classList.add('wm-watermark-theme');
    return () => document.body.classList.remove('wm-watermark-theme');
  }, []);

  // The same saved watermark settings as /watermark.
  useEffect(() => {
    let isActive = true;
    loadWatermarkOptions()
      .then((saved) => { if (isActive && saved) setOptions(mergeWatermarkOptions(saved)); })
      .catch(() => {})
      .finally(() => { if (isActive) setOptionsHydrated(true); });
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    if (!optionsHydrated) return undefined;
    const timer = window.setTimeout(() => {
      saveWatermarkOptions(options).catch(() => {});
    }, 350);
    return () => window.clearTimeout(timer);
  }, [options, optionsHydrated]);

  useEffect(() => { saveImageNamePrompt(prompt); }, [prompt]);

  useEffect(() => {
    try {
      localStorage.setItem(OUTPUT_SIZE_KEY, outputSize);
    } catch {
      // Not remembered; the run still uses the chosen size.
    }
  }, [outputSize]);

  // Leaving with a run in progress: the browser asks first.
  useEffect(() => {
    if (!locked) return undefined;
    const warn = (event) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [locked]);

  const availableModels = IMAGE_NAME_MODELS.filter(({ id }) => aiAccess.models.includes(id));
  const selectedModel = availableModels.some(({ id }) => id === model) ? model : availableModels[0]?.id ?? '';
  const selectedProducts = products.filter((product) => product.selected);
  const selectedImageCount = selectedProducts.reduce((sum, product) => sum + product.imageIds.length, 0);
  const missingPermission = selectedProducts.filter((product) => product.permission !== 'granted');
  const runProducts = run ? products.filter((product) => run.productIds.includes(product.id)) : [];

  const previewCandidates = products.filter((product) => product.images.length > 0);
  const previewProduct = previewCandidates.find((product) => product.id === previewProductId) ?? previewCandidates[0] ?? null;
  const previewImages = useMemo(() => (previewProduct?.images ?? []).map((image) => ({
    id: image.id,
    name: image.sourceName,
    getFile: () => image.handle.getFile(),
  })), [previewProduct?.images]);

  const accessCopy = aiAccess.status === 'allowed' ? null : describeAiNamingAccess(aiAccess.status, aiAccess.error);

  const blockers = [];
  if (!support.supported) blockers.push('Trình duyệt chưa hỗ trợ lưu trực tiếp vào thư mục.');
  if (!selectedImageCount) blockers.push('Chọn ít nhất một sản phẩm có ảnh hợp lệ.');
  if (missingPermission.length) blockers.push(`Cần cấp quyền ghi cho: ${missingPermission.map((product) => product.name).join(', ')}.`);
  if (!logoState.ready) blockers.push('Chọn logo (bắt buộc với watermark tự động).');
  if (aiAccess.status === 'loading') blockers.push('Đang kiểm tra quyền Đặt tên AI…');
  else if (aiAccess.status !== 'allowed') blockers.push(accessCopy?.message || 'Tài khoản chưa được dùng Đặt tên AI.');
  else if (!selectedModel) blockers.push('Chưa có model AI được cấp quyền.');
  if (prompt.length > IMAGE_NAME_LIMITS.maxPromptLength) blockers.push(`Prompt tối đa ${IMAGE_NAME_LIMITS.maxPromptLength} ký tự.`);
  if (!engine || !optionsHydrated) blockers.push('Đang chuẩn bị bộ xử lý ảnh…');
  const canStart = blockers.length === 0 && !locked && !picking && !granting && !starting;

  const handleStart = async () => {
    if (!canStart) return;
    setStartError(null);
    setStarting(true);
    runContextRef.current = {
      subject: createSubject(userId, visitorId),
      userId,
      visitorId,
      displayName: user ? getUserDisplayName(user, null) : null,
      accentColor: options.accentColor,
    };
    try {
      const result = await runner.start({
        renderOptions: {
          size: options.size,
          opacity: options.opacity,
          margin: options.margin,
          tiled: options.tiled,
          logoPosition: options.logoPosition,
        },
        outputSize,
        model: selectedModel,
        prompt,
      });
      if (!result.ok) {
        if (result.reason === 'permission') setStartError(`Chưa có quyền ghi cho: ${result.products.join(', ')}. Bấm “Cấp quyền” ở từng thư mục.`);
        else if (result.reason === 'product_name') setStartError(`Tên thư mục cần sửa trên máy rồi chọn lại: ${result.products.join(', ')}.`);
        else setStartError(START_ERRORS[result.reason] || 'Chưa bắt đầu được. Vui lòng thử lại.');
      }
    } finally {
      setStarting(false);
    }
  };

  const reportRows = () => buildReportRows(runProducts);
  const summaryText = () => (run ? describeRunSummary(run) : '');

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportToText(reportRows(), summaryText()));
      toast.success('Đã sao chép báo cáo.');
    } catch {
      toast.error('Không sao chép được. Hãy dùng “Tải CSV”.');
    }
  };

  const handleDownloadJson = () => {
    const report = { createdAt: new Date().toISOString(), summary: summaryText(), outputSize: run?.config.outputSize, images: reportRows() };
    downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `watermark-auto-${Date.now()}.json`);
  };

  const handleDownloadCsv = () => {
    downloadCsv(REPORT_CSV_HEADER, reportRowsToCsvRows(reportRows()), `watermark-auto-${Date.now()}.csv`, { neutralizeFormulas: true });
  };

  const handleRequestLogin = () => navigate('/auth', { state: { from: '/watermark/auto' } });

  const pauseCode = run?.pause?.code;
  const pauseActions = run?.state === 'paused' && (
    pauseCode === AI_NAMING_ERRORS.authRequired ? (
      <button type="button" className="wm-btn-outline wm-btn-small" onClick={handleRequestLogin}>Đăng nhập lại</button>
    ) : AI_PAUSE_CODES_WITH_ACCESS_CHECK.has(pauseCode) ? (
      <button type="button" className="wm-btn-outline wm-btn-small" onClick={aiAccess.refresh}>Kiểm tra lại quyền</button>
    ) : null
  );

  return (
    <>
      <Helmet>
        <title>Watermark tự động - Đóng logo và đặt tên ảnh theo thư mục</title>
      </Helmet>
      <div className="wm-page wma-page" style={pageThemeVars}>
        <div className="wm-container">
          <nav className="wma-breadcrumb" aria-label="Điều hướng">
            <Link to="/watermark">← Quay lại Watermark</Link>
          </nav>
          <header className="wm-workspace-heading">
            <h1>Watermark tự động</h1>
            <p>Chọn thư mục sản phẩm. Công cụ tự chèn logo, đặt tên AI và lưu vào Named.</p>
          </header>

          {!support.supported && (
            <div className="wma-notice wma-notice--error wma-support" role="alert">
              <span>
                <strong>Chưa lưu trực tiếp được trên trình duyệt này.</strong> {SUPPORT_MESSAGES[support.reason]}
                {' '}Trang không tạo file ZIP thay thế, vì ZIP không tạo được thư mục Named trên máy.
              </span>
            </div>
          )}

          <div className="wma-steps">
            <ProductFolderPicker
              products={products}
              notices={notices}
              picking={picking}
              granting={granting}
              locked={locked}
              supported={support.supported}
              onAddProduct={() => runner.addProductFolder()}
              onDropFolders={(dataTransfer) => runner.addDroppedFolders(dataTransfer)}
              onAddParent={() => runner.addParentFolder()}
              onClear={() => runner.clearProducts()}
              onRemove={(id) => runner.removeProduct(id)}
              onToggle={(id, selected) => runner.setSelected(id, selected)}
              onToggleAll={(selected) => runner.setAllSelected(selected)}
              onRequestPermission={(id) => runner.requestPermission(id)}
              onRequestAllPermissions={() => runner.requestAllPermissions()}
              onRescan={(id) => runner.rescanProduct(id)}
              onDismissNotice={(id) => runner.dismissNotice(id)}
            />

            <section className="wm-card wma-step" aria-labelledby="wma-step-config">
              <header className="wma-step-head">
                <span className="wma-step-num" aria-hidden="true">2</span>
                <div>
                  <h2 id="wma-step-config">Cấu hình chung</h2>
                  <p>Áp dụng cho mọi sản phẩm của lượt chạy.{locked ? ' Đang chạy: cấu hình đã được khóa.' : ''}</p>
                </div>
              </header>

              <div className="wma-config" inert={locked || undefined}>
                <div className="wma-config-col">
                  <LogoUploader logoUrl={logoUrl} logoName={logoName} onLogoChange={handleLogoChange} onImagePreview={setZoomLogo} />
                  <div inert={!optionsHydrated || undefined}>
                    <WatermarkControls options={options} onChange={setOptions} showFileName={false} />
                  </div>
                </div>

                <div className="wma-config-col">
                  <label className="wma-field">
                    <span className="wm-section-label">Kích thước ảnh xuất</span>
                    <select className="wm-input" value={outputSize} onChange={(event) => setOutputSize(event.target.value)}>
                      {OUTPUT_SIZES.map((size) => <option key={size.id} value={size.id}>{size.label}</option>)}
                    </select>
                    <small className="wm-muted-text">Ảnh xuất dạng JPG. 800 × 600 giữ tỷ lệ và thêm nền trắng khi cần.</small>
                  </label>

                  <label className="wma-field">
                    <span className="wm-section-label">Model AI</span>
                    <select
                      className="wm-input"
                      value={selectedModel}
                      onChange={(event) => setModel(event.target.value)}
                      disabled={aiAccess.status !== 'allowed'}
                    >
                      {!availableModels.length && <option value="">Chưa có model được cấp quyền</option>}
                      {availableModels.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>

                  {accessCopy && aiAccess.status !== 'loading' && (
                    <div className="wma-notice wma-notice--warning" role="status">
                      <span>{accessCopy.message}</span>
                      {aiAccess.status === 'signed_out' && (
                        <button type="button" className="wm-btn-outline wm-btn-small" onClick={handleRequestLogin}>Đăng nhập</button>
                      )}
                      {aiAccess.status !== 'signed_out' && (
                        <button type="button" className="wm-btn-outline wm-btn-small" onClick={aiAccess.refresh}>Kiểm tra lại</button>
                      )}
                    </div>
                  )}

                  <details className="wma-advanced">
                    <summary>Nâng cao: prompt đặt tên</summary>
                    <label className="wma-field">
                      <span className="wma-field-row">
                        <span className="wm-section-label">Nội dung prompt</span>
                        <small aria-hidden="true">{prompt.length}/{IMAGE_NAME_LIMITS.maxPromptLength}</small>
                      </span>
                      <textarea
                        className="wm-input wma-prompt"
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        maxLength={IMAGE_NAME_LIMITS.maxPromptLength}
                        rows={8}
                      />
                    </label>
                    <div className="wma-field-row">
                      <small className="wm-muted-text">
                        {'{{productName}}'} được thay bằng tên thư mục sản phẩm. Dùng chung prompt đã lưu với trang Watermark.
                      </small>
                      <button
                        type="button"
                        className="wm-btn-outline wm-btn-small"
                        onClick={() => setPrompt(DEFAULT_IMAGE_NAME_PROMPT)}
                        disabled={prompt === DEFAULT_IMAGE_NAME_PROMPT}
                      >
                        Khôi phục mặc định
                      </button>
                    </div>
                  </details>

                  <p className="wma-privacy">
                    <span aria-hidden="true">ⓘ</span> Ảnh được xử lý trên máy. Bản ảnh nhỏ được gửi tới dịch vụ AI để đặt tên.
                  </p>
                  <p className="wma-hint">
                    Nơi lưu: <code>&lt;thư mục sản phẩm&gt;/Named</code>. Ảnh gốc không bị đổi tên, di chuyển hay ghi đè.
                    Không chỉnh thư mục Named bằng ứng dụng khác trong lúc chạy.
                  </p>
                </div>
              </div>

              {previewProduct && (
                <div className="wma-preview">
                  {previewCandidates.length > 1 && (
                    <label className="wma-field wma-preview-product">
                      <span className="wm-section-label">Xem trước sản phẩm</span>
                      <select className="wm-input" value={previewProduct.id} onChange={(event) => setPreviewProductId(event.target.value)}>
                        {previewCandidates.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                      </select>
                    </label>
                  )}
                  <WatermarkLivePreview
                    images={previewImages}
                    engine={engine}
                    options={options}
                    logoVersion={logoState.version}
                    paused={locked}
                    outputSize={outputSize}
                  />
                </div>
              )}
            </section>

            <AutoProcessingProgress
              run={run}
              busy={picking || granting}
              runProducts={runProducts}
              canStart={canStart}
              blockers={blockers}
              now={now}
              pauseActions={pauseActions}
              onStart={handleStart}
              onStop={() => runner.stop()}
              onResume={() => runner.resume()}
              onRetry={() => runner.retryErrors()}
              onCopyReport={handleCopyReport}
              onDownloadJson={handleDownloadJson}
              onDownloadCsv={handleDownloadCsv}
            />
            {startError && <p className="wma-row-error wma-start-error" role="alert">{startError}</p>}
          </div>
        </div>
      </div>

      {zoomLogo && <ImageLightbox items={[zoomLogo]} initialIndex={0} onClose={() => setZoomLogo(null)} />}
    </>
  );
}
