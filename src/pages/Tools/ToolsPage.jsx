import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FiArrowRight, FiCheck, FiFolder, FiImage, FiSearch, FiShield, FiVideo, FiX } from 'react-icons/fi';
import { TOOL_CATALOG, filterTools } from './toolCatalog.js';
import styles from './Tools.module.css';

export default function ToolsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const searchRef = useRef(null);
  const categories = [...new Set(TOOL_CATALOG.map((tool) => tool.category))];
  const tools = filterTools(TOOL_CATALOG, query, category);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Tools - AISEO Tools Suite</title>
        <meta name="description" content="Bộ sưu tập công cụ tiện ích của AISEO. Khám phá Watermark để đóng dấu ảnh và Clear Video để quét, dọn video trên máy của bạn." />
      </Helmet>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>AISEO / TOOLBOX</span>
        <h1>Công cụ nhỏ.<br />Hiệu quả lớn.</h1>
        <div className={styles.heroBottom}>
          <p>Một nơi cho những tiện ích giúp công việc nhẹ nhàng hơn.<br className={styles.desktopBreak} /> Khám phá, chọn công cụ và bắt đầu.</p>
          <span className={styles.collectionCount}><strong>{String(TOOL_CATALOG.length).padStart(2, '0')}</strong> công cụ sẵn sàng</span>
        </div>
      </header>

      <section aria-labelledby="tools-title">
        <div className={styles.catalogHead}>
          <h2 id="tools-title">Khám phá Tools <span>{String(TOOL_CATALOG.length).padStart(2, '0')}</span></h2>
          <div className={styles.search}>
            <FiSearch aria-hidden="true" />
            <input ref={searchRef} type="search" aria-label="Tìm công cụ" placeholder="Tìm công cụ…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <kbd title="Ctrl+K hoặc ⌘K">⌘ K</kbd>
          </div>
        </div>
        <div className={styles.filters} role="group" aria-label="Danh mục công cụ">
          <button className={category === 'all' ? styles.filterActive : ''} type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Tất cả công cụ <span>{TOOL_CATALOG.length}</span></button>
          {categories.map((item) => <button key={item} className={category === item ? styles.filterActive : ''} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
        <p className={styles.srOnly} role="status">{tools.length} công cụ được tìm thấy</p>
        {tools.length ? <div className={styles.toolGrid}>
          {tools.map((tool) => (
            <Link key={tool.id} to={tool.path} className={styles.toolCard} aria-label={`Mở ${tool.name}`}>
              <div className={styles.cardPreview} aria-hidden="true">
                <span className={styles.previewTop}><span>{tool.icon === 'image' ? <FiImage /> : <FiVideo />} {tool.category}</span><span>{String(TOOL_CATALOG.indexOf(tool) + 1).padStart(2, '0')} / {tool.local ? 'LOCAL TOOL' : 'IMAGE TOOL'}</span></span>
                <div className={styles.previewFolder}>{tool.icon === 'image' ? <FiImage /> : <FiFolder />}<span>{tool.previewTitle}</span></div>
                <div className={styles.previewSteps}>{tool.steps.map((step) => <span key={step}><FiCheck /> {step}</span>)}</div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitle}><h3>{tool.name}</h3><span className={styles.statusBadge}><span /> Sẵn sàng</span></div>
                <p>{tool.description}</p>
                <div className={styles.cardTags}><span>{tool.category}</span>{tool.local && <span>Xử lý trên máy</span>}{tool.requiresAuth && <span>Cần đăng nhập</span>}</div>
                <div className={styles.cardAction}>Mở công cụ <FiArrowRight aria-hidden="true" /></div>
              </div>
            </Link>
          ))}
          <aside className={styles.collectionNote}>
            <span className={styles.eyebrow}>ĐANG TIẾP TỤC XÂY DỰNG</span>
            <h3>Bộ công cụ sẽ<br />còn lớn hơn.</h3>
            <p>Những tiện ích mới sẽ được tập hợp tại đây. Chọn công cụ bạn cần và quay lại để khám phá thêm.</p>
            <span className={styles.noteLine}>Từng công cụ, một việc làm tốt.</span>
          </aside>
        </div> : <div className={styles.noResults}>
          <FiSearch aria-hidden="true" /><h3>Chưa tìm thấy công cụ</h3><p>Thử tên công cụ hoặc từ khóa khác.</p>
          <button type="button" className={styles.button} onClick={() => { setQuery(''); setCategory('all'); searchRef.current?.focus(); }}><FiX aria-hidden="true" /> Xóa bộ lọc</button>
        </div>}
      </section>
      <div className={styles.privacyNote}><FiShield aria-hidden="true" /><p><strong>Tệp của bạn, trên máy của bạn.</strong> Clear Video đọc và xử lý tệp tại chỗ, không tải nội dung video lên máy chủ.</p></div>
    </div>
  );
}
