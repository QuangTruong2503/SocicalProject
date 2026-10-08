import { useMemo, useRef, useState } from 'react';
import { FaCloudArrowUp, FaFileArrowUp, FaTriangleExclamation } from 'react-icons/fa6';
import { parseProductLinks, productCodeKey, readProductLinkFile } from '../../utils/productLinkParser.js';
import ModalShell from './ModalShell.jsx';
import styles from './ProductLinks.module.css';

const MODES = [
  { value: 'merge', label: 'Gộp', hint: 'Thêm link mới vào sản phẩm đã có, giữ link cũ' },
  { value: 'replace', label: 'Thay thế', hint: 'Ghi đè toàn bộ link của sản phẩm đã có' },
  { value: 'skip', label: 'Bỏ qua', hint: 'Chỉ thêm sản phẩm mới, không đụng sản phẩm đã có' },
];

const PLACEHOLDER = `KINGTONY 653532M
https://cdn.hstatic.net/files/.../tuyp-...-dau-luc-giac.jpg
https://cdn.hstatic.net/files/.../tuyp-...-hang-thuc-te.jpg

KINGTONY 653536M
https://cdn.hstatic.net/files/.../tuyp-...-khac-ma-san-pham.jpg`;

const TONE_CLASS = {
  new: styles.pillNew,
  update: styles.pillUpdate,
  skip: styles.pillSkip,
};

function previewStatus(parsed, existing, mode) {
  if (!existing) return { tone: 'new', label: 'Mới' };
  if (mode === 'skip') return { tone: 'skip', label: 'Bỏ qua' };

  if (mode === 'replace') {
    const same = existing.links.length === parsed.links.length
      && existing.links.every((link, i) => link === parsed.links[i]);
    return same
      ? { tone: 'skip', label: 'Không đổi' }
      : { tone: 'update', label: `Thay ${existing.links.length} → ${parsed.links.length} link` };
  }

  const added = parsed.links.filter((link) => !existing.links.includes(link)).length;
  return added > 0 ? { tone: 'update', label: `+${added} link mới` } : { tone: 'skip', label: 'Đã đủ link' };
}

export default function ProductLinkImportModal({ existingByKey, saving, onSubmit, onClose }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState('merge');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const parsed = useMemo(() => parseProductLinks(text), [text]);
  const rows = useMemo(() => parsed.items.map((item) => ({
    ...item,
    status: previewStatus(item, existingByKey.get(productCodeKey(item.code)), mode),
  })), [parsed.items, existingByKey, mode]);
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.status.tone]: (acc[row.status.tone] || 0) + 1 }), {});
  const willChange = (counts.new || 0) + (counts.update || 0);

  async function loadFile(file) {
    if (!file) return;
    setFileError('');
    try {
      const content = await readProductLinkFile(file);
      setText((current) => (current.trim() ? `${current.trim()}\n\n${content}` : content));
      setFileName(file.name);
    } catch (error) {
      console.error('[ProductLinkImportModal] read file failed', error);
      setFileError('Không đọc được file. Hãy dùng .txt, .csv, .xlsx hoặc .xls.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  }

  return (
    <ModalShell
      wide
      busy={saving}
      onClose={onClose}
      title="Nhập dữ liệu link ảnh"
      description={<>Dán danh sách hoặc kéo thả file. Dòng không phải link là <strong>mã sản phẩm</strong>, các link bên dưới thuộc về sản phẩm đó.</>}
      footer={(
        <>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={saving}>Hủy</button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={saving || willChange === 0}
            onClick={() => onSubmit(parsed.items, mode)}
          >
            <FaCloudArrowUp />
            {saving ? 'Đang lưu…' : willChange === 0 ? 'Chưa có gì để lưu' : `Lưu ${willChange} sản phẩm vào Supabase`}
          </button>
        </>
      )}
    >
      <div className={styles.importGrid}>
        <div className={styles.importInput}>
          <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <FaFileArrowUp />
            <span>
              Kéo thả file <b>.txt .csv .xlsx</b> vào đây hoặc{' '}
              <button type="button" className={styles.linkBtn} onClick={() => fileInput.current?.click()}>chọn file</button>
            </span>
            {fileName && <small>Đã đọc: {fileName}</small>}
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.csv,.tsv,.xlsx,.xls"
              hidden
              onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>
          {fileError && <p className={styles.formError}>{fileError}</p>}

          <label className={styles.field}>
            <span>Nội dung</span>
            <textarea
              data-dialog-initial
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={13}
              spellCheck={false}
            />
          </label>

          <fieldset className={styles.modeGroup}>
            <legend>Nếu mã sản phẩm đã tồn tại</legend>
            {MODES.map((option) => (
              <label key={option.value} className={`${styles.modeOption} ${mode === option.value ? styles.modeOptionActive : ''}`}>
                <input type="radio" name="pl-import-mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} />
                <span><b>{option.label}</b><small>{option.hint}</small></span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className={styles.importPreview}>
          <div className={styles.previewSummary}>
            <span><strong>{rows.length}</strong> sản phẩm · <strong>{parsed.linkCount}</strong> link</span>
            <div className={styles.previewPills}>
              {counts.new > 0 && <span className={`${styles.pill} ${styles.pillNew}`}>{counts.new} mới</span>}
              {counts.update > 0 && <span className={`${styles.pill} ${styles.pillUpdate}`}>{counts.update} cập nhật</span>}
              {counts.skip > 0 && <span className={`${styles.pill} ${styles.pillSkip}`}>{counts.skip} bỏ qua</span>}
            </div>
          </div>

          {parsed.orphanLinks.length > 0 && (
            <p className={styles.warning}>
              <FaTriangleExclamation />
              <span>{parsed.orphanLinks.length} link nằm trước mọi mã sản phẩm nên sẽ bị bỏ qua. Thêm một dòng mã sản phẩm phía trên chúng.</span>
            </p>
          )}

          {rows.length === 0 ? (
            <div className={styles.previewEmpty}>Bản xem trước sẽ hiện ở đây khi bạn dán dữ liệu.</div>
          ) : (
            <ul className={styles.previewList}>
              {rows.map((row) => (
                <li key={row.code}>
                  <span className={styles.previewCode}>{row.code}</span>
                  <span className={styles.previewCount}>{row.links.length} link</span>
                  <span className={`${styles.pill} ${TONE_CLASS[row.status.tone]}`}>{row.status.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
