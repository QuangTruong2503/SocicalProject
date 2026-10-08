import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaClockRotateLeft,
  FaFileImport,
  FaMagnifyingGlass,
  FaPlus,
  FaRotate,
  FaXmark,
} from 'react-icons/fa6';
import { useAuth } from '../../hooks/useAuth.js';
import AccessGateModal from '../../components/auth/AccessGateModal.jsx';
import {
  ACCESS_LEVEL_OPTIONS,
  createProductLinkItem,
  deleteProductLinkItem,
  getMyProductLinkLevel,
  importProductLinks,
  listProductLinkItems,
  listProductLinkLogs,
  logProductLinkCopy,
  setProductLinkDone,
  subscribeProductLinks,
  updateProductLinkItem,
  updateProductLinkNote,
} from '../../services/productLinkService.js';
import { productCodeKey } from '../../utils/productLinkParser.js';
import { getUserDisplayName } from '../../utils/userProfile.js';
import ProductLinkCard from './ProductLinkCard.jsx';
import ProductLinkActivity from './ProductLinkActivity.jsx';
import ProductLinkImportModal from './ProductLinkImportModal.jsx';
import ProductLinkEditModal from './ProductLinkEditModal.jsx';
import ModalShell from './ModalShell.jsx';
import styles from './ProductLinks.module.css';

const PAGE_SIZE = 30;
const LOG_PAGE_SIZE = 40;
const COPY_LOG_THROTTLE_MS = 2 * 60 * 1000;
const LEVEL_KEYS = ['', 'viewer', 'checker', 'editor'];

const FILTERS = [
  { value: 'todo', label: 'Chưa làm' },
  { value: 'done', label: 'Đã làm' },
  { value: 'all', label: 'Tất cả' },
];

const SORTS = [
  { value: 'seq', label: 'Thứ tự nhập' },
  { value: 'code', label: 'Mã A → Z' },
  { value: 'recent', label: 'Mới cập nhật' },
];

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function upsertById(list, row) {
  const index = list.findIndex((item) => item.id === row.id);
  if (index === -1) return [...list, row].sort((a, b) => a.seq - b.seq);
  const next = list.slice();
  next[index] = row;
  return next;
}

export default function ProductLinks() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const actorName = getUserDisplayName(user, profile);

  const [level, setLevel] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState('todo');
  const [sort, setSort] = useState('seq');
  // Paging resets whenever the filter/sort/search combination changes.
  const [paging, setPaging] = useState({ key: '', count: PAGE_SIZE });
  // Cards start collapsed; only ids in this set are open.
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [flashIds, setFlashIds] = useState(() => new Set());
  const [copiedLinks, setCopiedLinks] = useState(() => new Set());
  const [justCopied, setJustCopied] = useState('');

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsHasMore, setLogsHasMore] = useState(false);
  const [logsLoadingMore, setLogsLoadingMore] = useState(false);
  const [onlyOthers, setOnlyOthers] = useState(false);
  const [hideCopies, setHideCopies] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null); // { mode, item }
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  const searchRef = useRef(null);
  const sentinelRef = useRef(null);
  const listTopRef = useRef(null);
  const itemsRef = useRef(items);
  const pendingRef = useRef(pendingIds);
  const activityOpenRef = useRef(activityOpen);
  const copyLogTimesRef = useRef(new Map());
  const justCopiedTimerRef = useRef(0);

  // Realtime callbacks read the latest state through these refs.
  useEffect(() => {
    itemsRef.current = items;
    pendingRef.current = pendingIds;
    activityOpenRef.current = activityOpen;
  });

  // ── Access level ────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    getMyProductLinkLevel().then((result) => {
      if (!active) return;
      if (result.error) toast.error(result.error);
      setLevel(Number(result.data) || 0);
    });
    return () => { active = false; };
  }, [user?.id, profile?.role, profile?.status]);

  // ── Data + realtime ─────────────────────────────────────────────────
  const applyItemsResult = useCallback((result) => {
    setItemsLoading(false);
    if (result.error) {
      setLoadError(result.error);
      return;
    }
    setLoadError('');
    setItems(result.data);
  }, []);

  const reloadItems = useCallback(() => {
    setItemsLoading(true);
    listProductLinkItems().then(applyItemsResult);
  }, [applyItemsResult]);

  const flash = useCallback((id) => {
    setFlashIds((current) => new Set(current).add(id));
    window.setTimeout(() => {
      setFlashIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 1800);
  }, []);

  useEffect(() => {
    if (!level) return undefined;

    listProductLinkItems().then(applyItemsResult);
    listProductLinkLogs({ limit: LOG_PAGE_SIZE }).then((result) => {
      setLogsLoading(false);
      if (result.error) return;
      setLogs(result.data);
      setLogsHasMore(result.data.length === LOG_PAGE_SIZE);
    });

    return subscribeProductLinks({
      onItem: (event, row) => {
        if (!row?.id) return;
        if (event === 'DELETE') {
          setItems((current) => current.filter((item) => item.id !== row.id));
          return;
        }
        const existing = itemsRef.current.find((item) => item.id === row.id);
        const changedElsewhere = !pendingRef.current.has(row.id)
          && (!existing || existing.updated_at !== row.updated_at);
        setItems((current) => upsertById(current, row));
        if (changedElsewhere) flash(row.id);
      },
      onLog: (row) => {
        setLogs((current) => (current.some((log) => log.id === row.id) ? current : [row, ...current]));
        if (row.user_id !== user?.id && !activityOpenRef.current) setUnread((count) => count + 1);
      },
    });
  }, [level, applyItemsResult, flash, user?.id]);

  async function loadMoreLogs() {
    const last = logs[logs.length - 1];
    if (!last) return;
    setLogsLoadingMore(true);
    const result = await listProductLinkLogs({ limit: LOG_PAGE_SIZE, beforeId: last.id });
    setLogsLoadingMore(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setLogs((current) => [...current, ...result.data.filter((row) => !current.some((log) => log.id === row.id))]);
    setLogsHasMore(result.data.length === LOG_PAGE_SIZE);
  }

  // ── Derived lists ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const done = items.filter((item) => item.is_done).length;
    return {
      total: items.length,
      done,
      todo: items.length - done,
      links: items.reduce((sum, item) => sum + item.links.length, 0),
      percent: items.length ? Math.round((done / items.length) * 100) : 0,
    };
  }, [items]);

  const existingByKey = useMemo(
    () => new Map(items.map((item) => [productCodeKey(item.code), item])),
    [items],
  );

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    const rows = items.filter((item) => {
      if (filter === 'todo' && item.is_done) return false;
      if (filter === 'done' && !item.is_done) return false;
      if (!term) return true;
      return item.code.toLowerCase().includes(term)
        || (item.note ?? '').toLowerCase().includes(term)
        || item.links.some((link) => link.toLowerCase().includes(term));
    });

    if (sort === 'code') return rows.sort((a, b) => a.code.localeCompare(b.code, 'vi', { numeric: true }));
    if (sort === 'recent') return rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return rows;
  }, [items, filter, sort, deferredSearch]);

  const listKey = `${filter}|${sort}|${deferredSearch}`;
  const visibleCount = paging.key === listKey ? paging.count : PAGE_SIZE;
  const visible = filtered.slice(0, visibleCount);
  const showMore = useCallback(() => {
    setPaging((current) => ({
      key: listKey,
      count: (current.key === listKey ? current.count : PAGE_SIZE) + PAGE_SIZE,
    }));
  }, [listKey]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) showMore();
    }, { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible.length, filtered.length, showMore]);

  // "/" focuses search, Esc clears it.
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !document.querySelector('[role="dialog"]')) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────
  const toggleExpand = useCallback((item) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  function setAllExpanded(value) {
    setExpandedIds(value ? new Set(filtered.map((item) => item.id)) : new Set());
  }

  const markJustCopied = useCallback((key) => {
    setJustCopied(key);
    window.clearTimeout(justCopiedTimerRef.current);
    justCopiedTimerRef.current = window.setTimeout(() => setJustCopied(''), 1600);
  }, []);

  const logCopy = useCallback((item, details) => {
    const key = `${item.id}:${details.kind}:${details.label ?? ''}`;
    const last = copyLogTimesRef.current.get(key) ?? 0;
    if (Date.now() - last < COPY_LOG_THROTTLE_MS) return;
    copyLogTimesRef.current.set(key, Date.now());
    logProductLinkCopy({ userId: user?.id, actorName, item, details });
  }, [user?.id, actorName]);

  const copyLink = useCallback(async (item, link, label) => {
    if (!(await writeClipboard(link))) {
      toast.error('Trình duyệt chặn copy. Hãy thử lại.');
      return;
    }
    setCopiedLinks((current) => new Set(current).add(link));
    markJustCopied(`link:${link}`);
    logCopy(item, { kind: 'link', label, count: 1 });
  }, [markJustCopied, logCopy]);

  const copyAll = useCallback(async (item) => {
    if (!(await writeClipboard(item.links.join('\n')))) {
      toast.error('Trình duyệt chặn copy. Hãy thử lại.');
      return;
    }
    setCopiedLinks((current) => {
      const next = new Set(current);
      item.links.forEach((link) => next.add(link));
      return next;
    });
    markJustCopied(`all:${item.id}`);
    toast.success(`Đã copy ${item.links.length} link của ${item.code}`, { autoClose: 1800 });
    logCopy(item, { kind: 'all', count: item.links.length });
  }, [markJustCopied, logCopy]);

  const copyCode = useCallback(async (item) => {
    if (!(await writeClipboard(item.code))) return;
    markJustCopied(`code:${item.id}`);
    logCopy(item, { kind: 'code' });
  }, [markJustCopied, logCopy]);

  const toggleDone = useCallback(async (item) => {
    const nextDone = !item.is_done;
    setPendingIds((current) => new Set(current).add(item.id));
    setItems((current) => current.map((row) => (row.id === item.id
      ? { ...row, is_done: nextDone, done_by_name: nextDone ? actorName : null, done_at: nextDone ? new Date().toISOString() : null }
      : row)));
    // Finished cards fold away so the next one is in view.
    if (nextDone) {
      setExpandedIds((current) => {
        if (!current.has(item.id)) return current;
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }

    const result = await setProductLinkDone(item.id, nextDone);

    if (result.error) {
      toast.error(result.error);
      setItems((current) => current.map((row) => (row.id === item.id ? item : row)));
    } else {
      setItems((current) => upsertById(current, result.data));
    }
    setPendingIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }, [actorName]);

  async function submitImport(parsedItems, mode) {
    setSaving(true);
    const result = await importProductLinks(parsedItems, mode);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const { created = 0, updated = 0, skipped = 0 } = result.data ?? {};
    toast.success(`Đã lưu: ${created} sản phẩm mới, ${updated} cập nhật${skipped ? `, ${skipped} bỏ qua` : ''}.`);
    setImportOpen(false);
    reloadItems();
  }

  async function submitEdit(values) {
    if (!editing) return;
    setSaving(true);
    const { mode, item } = editing;
    const result = mode === 'note'
      ? await updateProductLinkNote(item.id, values.note)
      : mode === 'create'
        ? await createProductLinkItem(values)
        : await updateProductLinkItem(item.id, values);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    setItems((current) => upsertById(current, result.data));
    setEditing(null);
    toast.success(mode === 'create' ? `Đã thêm ${result.data.code}.` : 'Đã lưu.');
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSaving(true);
    const result = await deleteProductLinkItem(deleting.id);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setItems((current) => current.filter((item) => item.id !== deleting.id));
    toast.success(`Đã xóa ${deleting.code}.`);
    setDeleting(null);
  }

  const openEditNote = useCallback((item) => setEditing({ mode: 'note', item }), []);
  const openEdit = useCallback((item) => setEditing({ mode: 'edit', item }), []);
  const openDelete = useCallback((item) => setDeleting(item), []);

  function selectCodeFromLog(code) {
    setSearch(code);
    setFilter('all');
    setActivityOpen(false);
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openActivity() {
    setActivityOpen(true);
    setUnread(0);
  }

  // ── Render ──────────────────────────────────────────────────────────
  if (level === null) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-ring"></div>
        <p>Đang kiểm tra quyền truy cập...</p>
      </div>
    );
  }

  if (level === 0) {
    return (
      <AccessGateModal
        title="Bạn chưa được cấp quyền vào trang này."
        description="Trang Link ảnh sản phẩm chỉ mở cho tài khoản được quản trị viên cấp quyền. Hãy liên hệ quản trị viên để được thêm vào."
        details={[]}
        primaryActionLabel="Quay về trang chủ"
        secondaryActionLabel="Về Dashboard"
        onPrimaryAction={() => navigate('/', { replace: true })}
        onSecondaryAction={() => navigate('/dashboard/overview', { replace: true })}
      />
    );
  }

  const levelLabel = ACCESS_LEVEL_OPTIONS.find((option) => option.value === LEVEL_KEYS[level])?.label;
  const filterCounts = { todo: stats.todo, done: stats.done, all: stats.total };

  return (
    <div className={styles.page}>
      <Helmet><title>Link ảnh sản phẩm</title></Helmet>

      <header className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.overline}>Công cụ nội bộ</span>
          <h1>Link ảnh sản phẩm</h1>
          <p>Bấm vào một link để copy. Tick vào ô tròn khi đã làm xong — mọi người thấy ngay theo thời gian thực.</p>
        </div>
        <div className={styles.heroActions}>
          <span className={styles.levelBadge} title="Quyền của bạn trên trang này">
            {profile?.role === 'admin' ? 'Quản trị viên' : levelLabel}
          </span>
          {level >= 3 && (
            <>
              <button type="button" className={styles.btnGhost} onClick={() => setEditing({ mode: 'create', item: null })}>
                <FaPlus /> Thêm sản phẩm
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => setImportOpen(true)}>
                <FaFileImport /> Nhập dữ liệu
              </button>
            </>
          )}
        </div>
      </header>

      <section className={styles.stats} aria-label="Tiến độ">
        <div className={styles.progressBlock}>
          <div className={styles.progressLabel}>
            <span>Tiến độ</span>
            <strong>{stats.percent}%</strong>
          </div>
          <div className={styles.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.percent}>
            <div className={styles.progressFill} style={{ width: `${stats.percent}%` }} />
          </div>
        </div>
        <div className={styles.stat}><span>Sản phẩm</span><strong>{stats.total}</strong></div>
        <div className={`${styles.stat} ${styles.statDone}`}><span>Đã làm</span><strong>{stats.done}</strong></div>
        <div className={`${styles.stat} ${styles.statTodo}`}><span>Còn lại</span><strong>{stats.todo}</strong></div>
        <div className={styles.stat}><span>Tổng link</span><strong>{stats.links}</strong></div>
      </section>

      <div className={styles.layout}>
        <section className={styles.main} ref={listTopRef}>
          <div className={styles.toolbar}>
            <label className={styles.search}>
              <FaMagnifyingGlass />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setSearch(''); }}
                placeholder="Tìm mã sản phẩm, link, ghi chú…"
                aria-label="Tìm kiếm"
              />
              {search ? (
                <button type="button" className={styles.searchClear} onClick={() => setSearch('')} aria-label="Xóa tìm kiếm"><FaXmark /></button>
              ) : (
                <kbd>/</kbd>
              )}
            </label>

            <div className={styles.segmented} role="tablist" aria-label="Lọc theo trạng thái">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === option.value}
                  className={filter === option.value ? styles.segmentActive : ''}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label} <span>{filterCounts[option.value]}</span>
                </button>
              ))}
            </div>

            <div className={styles.toolbarRight}>
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sắp xếp">
                {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button type="button" className={styles.btnText} onClick={() => setAllExpanded(true)}>Mở hết</button>
              <button type="button" className={styles.btnText} onClick={() => setAllExpanded(false)}>Thu gọn</button>
              <button type="button" className={styles.iconBtn} onClick={reloadItems} title="Tải lại" aria-label="Tải lại" disabled={itemsLoading}>
                <FaRotate className={itemsLoading ? styles.spin : ''} />
              </button>
              <button type="button" className={`${styles.btnGhost} ${styles.activityToggle}`} onClick={openActivity}>
                <FaClockRotateLeft /> Nhật ký
                {unread > 0 && <span className={styles.unread}>{unread > 99 ? '99+' : unread}</span>}
              </button>
            </div>
          </div>

          {loadError && (
            <div className={styles.errorBox}>
              {loadError} <button type="button" className={styles.linkBtn} onClick={reloadItems}>Thử lại</button>
            </div>
          )}

          {itemsLoading && items.length === 0 ? (
            <div className={styles.skeletonList}>
              {[0, 1, 2].map((key) => <div key={key} className={styles.skeleton} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {items.length === 0 ? (
                <>
                  <strong>Chưa có sản phẩm nào.</strong>
                  {level >= 3
                    ? <button type="button" className={styles.btnPrimary} onClick={() => setImportOpen(true)}><FaFileImport /> Nhập dữ liệu đầu tiên</button>
                    : <span>Chờ người quản lý nhập dữ liệu.</span>}
                </>
              ) : search ? (
                <>
                  <strong>Không tìm thấy “{search}”.</strong>
                  <button type="button" className={styles.linkBtn} onClick={() => setSearch('')}>Xóa tìm kiếm</button>
                </>
              ) : filter === 'todo' ? (
                <strong>🎉 Đã làm xong tất cả sản phẩm!</strong>
              ) : (
                <strong>Chưa có sản phẩm nào được đánh dấu.</strong>
              )}
            </div>
          ) : (
            <div className={styles.cardList}>
              {visible.map((item) => (
                <ProductLinkCard
                  key={item.id}
                  item={item}
                  level={level}
                  expanded={expandedIds.has(item.id)}
                  pending={pendingIds.has(item.id)}
                  flash={flashIds.has(item.id)}
                  copiedLinks={copiedLinks}
                  justCopied={justCopied}
                  onToggleDone={toggleDone}
                  onToggleExpand={toggleExpand}
                  onCopyLink={copyLink}
                  onCopyAll={copyAll}
                  onCopyCode={copyCode}
                  onEditNote={openEditNote}
                  onEdit={openEdit}
                  onDelete={openDelete}
                />
              ))}
              {visible.length < filtered.length && (
                <div ref={sentinelRef} className={styles.sentinel}>
                  <button type="button" className={styles.btnGhost} onClick={showMore}>
                    Xem thêm ({filtered.length - visible.length} sản phẩm)
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <div className={`${styles.activityDrawer} ${activityOpen ? styles.activityDrawerOpen : ''}`}>
          <div className={styles.activityBackdrop} onClick={() => setActivityOpen(false)} aria-hidden="true" />
          <ProductLinkActivity
            logs={logs}
            loading={logsLoading}
            hasMore={logsHasMore}
            loadingMore={logsLoadingMore}
            currentUserId={user?.id}
            onlyOthers={onlyOthers}
            hideCopies={hideCopies}
            onOnlyOthersChange={setOnlyOthers}
            onHideCopiesChange={setHideCopies}
            onLoadMore={loadMoreLogs}
            onSelectCode={selectCodeFromLog}
            onClose={() => setActivityOpen(false)}
          />
        </div>
      </div>

      {importOpen && (
        <ProductLinkImportModal
          existingByKey={existingByKey}
          saving={saving}
          onSubmit={submitImport}
          onClose={() => setImportOpen(false)}
        />
      )}

      {editing && (
        <ProductLinkEditModal
          mode={editing.mode}
          item={editing.item}
          saving={saving}
          onSubmit={submitEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ModalShell
          title={`Xóa ${deleting.code}?`}
          description={`Sản phẩm và ${deleting.links.length} link sẽ bị xóa khỏi Supabase cho tất cả mọi người. Thao tác được ghi vào nhật ký.`}
          busy={saving}
          onClose={() => setDeleting(null)}
          footer={(
            <>
              <button type="button" className={styles.btnGhost} onClick={() => setDeleting(null)} disabled={saving}>Hủy</button>
              <button type="button" className={styles.btnDanger} onClick={confirmDelete} disabled={saving} data-dialog-initial>
                {saving ? 'Đang xóa…' : 'Xóa sản phẩm'}
              </button>
            </>
          )}
        />
      )}
    </div>
  );
}
