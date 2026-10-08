import { useState } from 'react';
import { normalizeProductCode } from '../../utils/productLinkParser.js';
import ModalShell from './ModalShell.jsx';
import styles from './ProductLinks.module.css';

const URL_PATTERN = /https?:\/\/[^\s"'<>,;|]+/gi;

function extractLinks(text) {
  return [...new Set(text.match(URL_PATTERN) ?? [])];
}

/**
 * mode 'create' | 'edit' → code, links, note (editor)
 * mode 'note'            → note only (checker)
 */
export default function ProductLinkEditModal({ mode, item, saving, onSubmit, onClose }) {
  const [code, setCode] = useState(item?.code ?? '');
  const [linksText, setLinksText] = useState((item?.links ?? []).join('\n'));
  const [note, setNote] = useState(item?.note ?? '');
  const [error, setError] = useState('');
  const noteOnly = mode === 'note';
  const links = extractLinks(linksText);

  function submit(event) {
    event.preventDefault();

    if (noteOnly) {
      onSubmit({ note });
      return;
    }

    const cleanCode = normalizeProductCode(code);
    if (!cleanCode) {
      setError('Nhập mã sản phẩm.');
      return;
    }
    setError('');
    onSubmit({ code: cleanCode, links, note });
  }

  const title = noteOnly ? `Ghi chú · ${item.code}` : mode === 'create' ? 'Thêm sản phẩm' : `Sửa · ${item.code}`;

  return (
    <ModalShell
      title={title}
      description={noteOnly ? 'Ghi chú hiển thị cho mọi người, ví dụ: thiếu ảnh, ảnh lỗi, cần chụp lại…' : null}
      busy={saving}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={submit}>
        {!noteOnly && (
          <>
            <label className={styles.field}>
              <span>Mã sản phẩm</span>
              <input data-dialog-initial value={code} onChange={(e) => setCode(e.target.value)} placeholder="KINGTONY 653532M" />
            </label>
            <label className={styles.field}>
              <span>Link ảnh <em>{links.length} link hợp lệ · mỗi dòng một link</em></span>
              <textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} rows={9} spellCheck={false} placeholder="https://..." />
            </label>
          </>
        )}
        <label className={styles.field}>
          <span>Ghi chú</span>
          <textarea
            data-dialog-initial={noteOnly ? '' : undefined}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={noteOnly ? 4 : 2}
            maxLength={500}
            placeholder="Không bắt buộc"
          />
        </label>
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={saving}>Hủy</button>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </form>
    </ModalShell>
  );
}
