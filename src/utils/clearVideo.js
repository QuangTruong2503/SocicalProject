// File-system behavior ported from the supplied video-cleaner/index.html.
// Handles stay in memory. Only plain metadata is included in exported reports.
export const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'mpeg', 'mpg', '3gp', '3g2', 'ogv', 'ts', 'mts', 'm2ts', 'vob']);
export const CLEAR_VIDEO_PAGE_SIZE = 100;

export function isVideoCandidate(name) {
  const index = name.lastIndexOf('.');
  return index > 0 && VIDEO_EXTENSIONS.has(name.slice(index + 1).toLowerCase());
}

export function videoBytes(value) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toLocaleString('vi-VN', { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}

export function videoError(error) {
  return {
    NotAllowedError: 'Không được cấp quyền hoặc quyền đã bị thu hồi.',
    SecurityError: 'Trình duyệt chặn thao tác. Hãy dùng Chrome/Edge trên máy tính qua localhost hoặc HTTPS.',
    NotFoundError: 'Tệp hoặc thư mục không còn tồn tại.',
    NotReadableError: 'Không đọc được tệp; tệp có thể đang bị khóa hoặc chưa tải từ đám mây.',
    InvalidModificationError: 'Mục đã thay đổi hoặc đang là thư mục; không xóa.',
    AbortError: 'Đã hủy thao tác.',
  }[error?.name] || error?.message || 'Lỗi không xác định.';
}

export function videoScope(recursive) {
  return recursive ? 'Thư mục đã chọn và tất cả thư mục con.' : 'Chỉ tệp nằm trực tiếp trong thư mục đã chọn.';
}

export function supportsClearVideo() {
  return window.isSecureContext && location.protocol !== 'file:'
    && typeof window.showDirectoryPicker === 'function'
    && typeof window.FileSystemDirectoryHandle !== 'undefined'
    && 'removeEntry' in window.FileSystemDirectoryHandle.prototype
    && typeof window.FileSystemHandle !== 'undefined'
    && 'requestPermission' in window.FileSystemHandle.prototype;
}

function abortCheck(signal) {
  if (signal.aborted) throw new DOMException('Đã dừng thao tác.', 'AbortError');
}
const now = () => new Date().toISOString();
const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

// Read metadata from a local Blob; no playback, network upload or MIME-only check.
export function probeLocalVideo(file, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Đã dừng.', 'AbortError')); return; }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (value, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (error) reject(error); else resolve(value);
    };
    const onAbort = () => done(null, new DOMException('Đã dừng.', 'AbortError'));
    const timer = setTimeout(() => done({ valid: false, reason: 'Giữ lại: quá 12 giây mà chưa xác minh được video.' }), 12000);
    signal.addEventListener('abort', onAbort, { once: true });
    video.onloadedmetadata = () => done({ valid: video.videoWidth > 0 && video.videoHeight > 0, width: video.videoWidth, height: video.videoHeight, reason: 'Giữ lại: không tìm thấy luồng hình ảnh video.' });
    video.onerror = () => done({ valid: false, reason: 'Giữ lại: không đọc được siêu dữ liệu video (tệp hỏng, sai loại hoặc codec không hỗ trợ).' });
    video.src = url;
  });
}

export async function scanLocalVideos(root, { recursive = false, signal, probe = probeLocalVideo, onProgress = () => {} }) {
  const scan = { startedAt: now(), finishedAt: null, recursive, filesSeen: 0, directoriesSeen: 0, otherFiles: 0, candidates: 0, verified: 0, issues: [], complete: false, cancelled: false };
  const videos = [];
  let fatal = false;
  try {
    const stack = [{ dir: root, parts: [] }];
    while (stack.length) {
      abortCheck(signal);
      const { dir, parts } = stack.pop();
      scan.directoriesSeen++;
      try {
        for await (const [name, handle] of dir.entries()) {
          abortCheck(signal);
          const path = [...parts, name].join('/');
          if (handle.kind === 'directory') {
            if (recursive) stack.push({ dir: handle, parts: [...parts, name] });
            continue;
          }
          if (handle.kind !== 'file') continue;
          scan.filesSeen++;
          if (scan.filesSeen % 100 === 0) { await yieldToBrowser(); abortCheck(signal); }
          if (!isVideoCandidate(name)) { scan.otherFiles++; continue; }
          scan.candidates++;
          onProgress(`Đang quét: ${path} · Đã xem ${scan.filesSeen.toLocaleString('vi-VN')} tệp. Chưa xóa tệp nào.`);
          try {
            const file = await handle.getFile();
            const meta = await probe(file, signal);
            abortCheck(signal);
            if (meta.valid) videos.push({ id: videos.length, name, path, parts: [...parts, name], parent: dir, handle, size: file.size, lastModified: file.lastModified, width: meta.width, height: meta.height });
            else scan.issues.push({ path, reason: meta.reason });
          } catch (error) {
            if (signal.aborted) throw error;
            fatal = true;
            scan.issues.push({ path, reason: videoError(error) });
          }
        }
      } catch (error) {
        if (signal.aborted) throw error;
        fatal = true;
        scan.issues.push({ path: parts.join('/') || '.', reason: `Không quét đầy đủ thư mục: ${videoError(error)}` });
      }
    }
    abortCheck(signal);
    scan.complete = !fatal;
  } catch (error) {
    scan.cancelled = signal.aborted;
    if (!scan.cancelled) scan.issues.push({ path: '.', reason: videoError(error) });
  }
  scan.finishedAt = now();
  scan.verified = videos.length;
  return { scan, videos: scan.cancelled ? [] : videos.sort((a, b) => a.path.localeCompare(b.path, 'vi')) };
}

export function createVideoReport(root, scan, videos) {
  return {
    version: 1, folder: root.name, scope: videoScope(scan.recursive), scan,
    videos: videos.map(({ path, size, lastModified, width, height }) => ({ path, size, lastModified, width, height })),
    deletion: null,
  };
}

// Recheck path, identity and metadata immediately before deleting each file.
export async function verifyCurrentVideo(root, scan, video, { signal, probe = probeLocalVideo }) {
  abortCheck(signal);
  const relative = await root.resolve(video.handle);
  if (!relative || JSON.stringify(relative) !== JSON.stringify(video.parts) || (!scan.recursive && relative.length !== 1)) return { ok: false, reason: 'Đường dẫn đã đổi hoặc nằm ngoài phạm vi đã xác nhận.' };
  const current = await video.parent.getFileHandle(video.name, { create: false });
  if (current.kind !== 'file' || !isVideoCandidate(current.name) || !await current.isSameEntry(video.handle)) return { ok: false, reason: 'Mục hiện tại không còn là tệp video đã quét.' };
  const file = await current.getFile();
  if (file.size !== video.size || file.lastModified !== video.lastModified) return { ok: false, reason: 'Tệp đã thay đổi sau khi quét. Hãy quét lại.' };
  const meta = await probe(file, signal);
  abortCheck(signal);
  if (!meta.valid) return { ok: false, reason: meta.reason };
  // File System Access has no atomic compare-and-delete operation.
  const final = await video.parent.getFileHandle(video.name, { create: false });
  const latest = await final.getFile();
  if (!await final.isSameEntry(current) || latest.size !== video.size || latest.lastModified !== video.lastModified) return { ok: false, reason: 'Tệp thay đổi trong lúc kiểm tra.' };
  abortCheck(signal);
  return { ok: true };
}

export async function deleteLocalVideos(root, scan, plan, { signal, probe = probeLocalVideo, onProgress = () => {} }) {
  if (!scan.complete || scan.cancelled || !plan.length) throw new Error('Cần quét đầy đủ và chọn video trước khi xóa.');
  const deletion = { startedAt: now(), finishedAt: null, requested: plan.length, deleted: 0, failed: 0, skipped: 0, cancelled: 0, bytesDeleted: 0, items: [] };
  let halt = false;
  for (const video of plan) {
    const item = { path: video.path, size: video.size, status: '', message: '' };
    if (signal.aborted || halt) {
      item.status = 'cancelled';
      item.message = halt ? 'Chưa xử lý vì quyền truy cập không còn khả dụng.' : 'Chưa xử lý vì người dùng dừng.';
      deletion.cancelled++;
    } else {
      try {
        onProgress({ done: deletion.items.length, total: plan.length, path: video.path });
        const check = await verifyCurrentVideo(root, scan, video, { signal, probe });
        abortCheck(signal);
        if (!check.ok) {
          item.status = 'skipped'; item.message = check.reason; deletion.skipped++;
        } else {
          // Only individual file names; never delete directories or recurse.
          await video.parent.removeEntry(video.name, { recursive: false });
          item.status = 'deleted'; item.message = 'Đã xóa.';
          deletion.deleted++; deletion.bytesDeleted += video.size;
        }
      } catch (error) {
        if (signal.aborted && error.name === 'AbortError') {
          item.status = 'cancelled'; item.message = 'Dừng trước khi xóa tệp này.'; deletion.cancelled++;
        } else {
          item.status = 'failed'; item.message = videoError(error); deletion.failed++;
          if (['NotAllowedError', 'SecurityError'].includes(error.name)) halt = true;
        }
      }
    }
    deletion.items.push(item);
    onProgress({ done: deletion.items.length, total: plan.length, path: video.path });
    await yieldToBrowser();
  }
  deletion.finishedAt = now();
  return deletion;
}
