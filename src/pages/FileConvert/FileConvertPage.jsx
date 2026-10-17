import { useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { FiFileText, FiImage, FiLayers, FiScissors, FiShield } from 'react-icons/fi';
import ImageToPdfTool from './ImageToPdfTool.jsx';
import MergePdfTool from './MergePdfTool.jsx';
import PdfToImageTool from './PdfToImageTool.jsx';
import SplitPdfTool from './SplitPdfTool.jsx';
import styles from './FileConvert.module.css';

const TOOLS = [
  { id: 'anh-sang-pdf', label: 'Ảnh sang PDF', description: 'Ghép JPG, PNG thành một PDF', icon: FiFileText, Component: ImageToPdfTool },
  { id: 'pdf-sang-anh', label: 'PDF sang ảnh', description: 'Xuất trang PDF thành PNG, JPEG', icon: FiImage, Component: PdfToImageTool },
  { id: 'gop-pdf', label: 'Gộp PDF', description: 'Nối nhiều PDF theo thứ tự', icon: FiLayers, Component: MergePdfTool },
  { id: 'tach-pdf', label: 'Tách trang PDF', description: 'Trích các trang thành PDF mới', icon: FiScissors, Component: SplitPdfTool },
];

export default function FileConvertPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('cong-cu');
  const active = TOOLS.some((tool) => tool.id === requested) ? requested : TOOLS[0].id;
  // Tools stay mounted after their first visit so switching tabs keeps their files.
  const [visited, setVisited] = useState(() => new Set([active]));
  const tabRefs = useRef([]);
  const activeTool = TOOLS.find((tool) => tool.id === active);

  if (!visited.has(active)) setVisited(new Set([...visited, active]));

  function select(id, focus = false) {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('cong-cu', id);
      return next;
    }, { replace: true });
    if (focus) tabRefs.current[TOOLS.findIndex((tool) => tool.id === id)]?.focus();
  }

  function handleKeyDown(event, index) {
    const last = TOOLS.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(TOOLS[target].id, true);
  }

  return (
    <div className={styles.page}>
      <Helmet>
        <title>{`${activeTool.label} - Chuyển đổi file - AISEO Tools Suite`}</title>
        <meta name="description" content="Chuyển ảnh JPG, PNG sang PDF, PDF sang ảnh, gộp và tách trang PDF ngay trên trình duyệt, không tải file lên máy chủ." />
      </Helmet>

      <header className={styles.pageHead}>
        <span className={styles.eyebrow}>Công cụ PDF</span>
        <h1>Chuyển đổi file</h1>
        <p className={styles.privacy}>
          <FiShield aria-hidden="true" /> File được xử lý ngay trên trình duyệt của bạn, không tải lên máy chủ.
        </p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Chọn công cụ">
        {TOOLS.map((tool, index) => {
          const Icon = tool.icon;
          const selected = tool.id === active;
          return (
            <button
              key={tool.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              type="button"
              role="tab"
              id={`tab-${tool.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tool.id}`}
              tabIndex={selected ? 0 : -1}
              className={`${styles.tab} ${selected ? styles.tabActive : ''}`}
              onClick={() => select(tool.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <Icon className={styles.tabIcon} aria-hidden="true" />
              <span className={styles.tabText}>
                <strong>{tool.label}</strong>
                <small>{tool.description}</small>
              </span>
            </button>
          );
        })}
      </div>

      {TOOLS.map((tool) => {
        const ToolComponent = tool.Component;
        return (
          <section
            key={tool.id}
            id={`panel-${tool.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${tool.id}`}
            hidden={tool.id !== active}
            className={styles.panel}
          >
            {visited.has(tool.id) && <ToolComponent />}
          </section>
        );
      })}
    </div>
  );
}
