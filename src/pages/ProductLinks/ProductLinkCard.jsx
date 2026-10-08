import { memo, useMemo } from 'react';
import {
  FaCheck,
  FaChevronDown,
  FaCopy,
  FaImage,
  FaNoteSticky,
  FaPen,
  FaTrashCan,
  FaUpRightFromSquare,
} from 'react-icons/fa6';
import { buildLinkLabels } from '../../utils/productLinkParser.js';
import { formatDateTime } from '../../utils/productLinkLog.js';
import styles from './ProductLinks.module.css';

function ProductLinkCard({
  item,
  level,
  expanded,
  pending,
  flash,
  copiedLinks,
  justCopied,
  onToggleDone,
  onToggleExpand,
  onCopyLink,
  onCopyAll,
  onCopyCode,
  onEditNote,
  onEdit,
  onDelete,
}) {
  const labels = useMemo(() => buildLinkLabels(item.links), [item.links]);
  const copiedCount = item.links.filter((link) => copiedLinks.has(link)).length;
  const canCheck = level >= 2;
  const canEdit = level >= 3;
  const cardClass = [
    styles.card,
    item.is_done ? styles.cardDone : '',
    flash ? styles.cardFlash : '',
  ].join(' ');

  return (
    <article className={cardClass} id={`product-${item.id}`}>
      <header className={styles.cardHead}>
        <button
          type="button"
          className={styles.checkBtn}
          aria-pressed={item.is_done}
          aria-label={item.is_done ? `Bỏ đánh dấu ${item.code}` : `Đánh dấu ${item.code} đã làm`}
          title={canCheck ? (item.is_done ? 'Bỏ đánh dấu' : 'Đánh dấu đã làm') : 'Bạn chỉ có quyền xem'}
          disabled={!canCheck || pending}
          onClick={() => onToggleDone(item)}
        >
          <FaCheck />
        </button>

        <div className={styles.cardTitle}>
          <button
            type="button"
            className={`${styles.codeBtn} ${justCopied === `code:${item.id}` ? styles.codeBtnCopied : ''}`}
            onClick={() => onCopyCode(item)}
            title="Bấm để copy mã sản phẩm"
          >
            <span>{item.code}</span>
            {justCopied === `code:${item.id}` ? <FaCheck /> : <FaCopy />}
          </button>
          <div className={styles.cardMeta}>
            <span>{item.links.length} link</span>
            {copiedCount > 0 && (
              <span className={styles.metaCopied}>đã copy {copiedCount}/{item.links.length}</span>
            )}
            {item.is_done && (
              <span className={styles.metaDone}>
                <FaCheck /> {item.done_by_name || 'Không rõ'} · {formatDateTime(item.done_at)}
              </span>
            )}
          </div>
        </div>

        <div className={styles.cardActions}>
          <button
            type="button"
            className={`${styles.copyAllBtn} ${justCopied === `all:${item.id}` ? styles.copyAllBtnCopied : ''}`}
            onClick={() => onCopyAll(item)}
            disabled={item.links.length === 0}
          >
            {justCopied === `all:${item.id}` ? <FaCheck /> : <FaCopy />}
            <span>{justCopied === `all:${item.id}` ? 'Đã copy' : 'Copy tất cả'}</span>
          </button>
          {canCheck && (
            <button type="button" className={styles.iconBtn} onClick={() => onEditNote(item)} title="Ghi chú" aria-label="Ghi chú">
              <FaNoteSticky />
            </button>
          )}
          {canEdit && (
            <>
              <button type="button" className={styles.iconBtn} onClick={() => onEdit(item)} title="Sửa sản phẩm" aria-label="Sửa sản phẩm">
                <FaPen />
              </button>
              <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(item)} title="Xóa sản phẩm" aria-label="Xóa sản phẩm">
                <FaTrashCan />
              </button>
            </>
          )}
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.expandBtn} ${expanded ? styles.expandBtnOpen : ''}`}
            onClick={() => onToggleExpand(item)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Thu gọn' : 'Mở danh sách link'}
            title={expanded ? 'Thu gọn' : 'Mở danh sách link'}
          >
            <FaChevronDown />
          </button>
        </div>
      </header>

      {item.note && (
        <p className={styles.note}><FaNoteSticky /> {item.note}</p>
      )}

      {expanded && item.links.length > 0 && (
        <ul className={styles.linkList}>
          {item.links.map((link, index) => {
            const isCopied = copiedLinks.has(link);
            const isJust = justCopied === `link:${link}`;

            return (
              <li key={link} className={`${styles.linkRow} ${isCopied ? styles.linkRowCopied : ''} ${isJust ? styles.linkRowJust : ''}`}>
                <a className={styles.thumb} href={link} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden="true">
                  <FaImage className={styles.thumbFallback} />
                  <img
                    src={link}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
                  />
                  <span className={styles.thumbPreview}><img src={link} alt="" loading="lazy" /></span>
                </a>
                <button
                  type="button"
                  className={styles.linkMain}
                  onClick={() => onCopyLink(item, link, labels[index])}
                  title="Bấm để copy link"
                >
                  <span className={styles.linkIndex}>{index + 1}</span>
                  <span className={styles.linkText}>
                    <span className={styles.linkLabel}>{labels[index]}</span>
                    <span className={styles.linkUrl}>{link}</span>
                  </span>
                  <span className={styles.linkCopyState}>
                    {isJust ? <><FaCheck /> Đã copy</> : isCopied ? <FaCheck /> : <FaCopy />}
                  </span>
                </button>
                <a className={styles.iconBtn} href={link} target="_blank" rel="noreferrer" title="Mở ảnh trong tab mới" aria-label="Mở ảnh trong tab mới">
                  <FaUpRightFromSquare />
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {expanded && item.links.length === 0 && (
        <p className={styles.emptyLinks}>Sản phẩm chưa có link nào.</p>
      )}
    </article>
  );
}

export default memo(ProductLinkCard);
