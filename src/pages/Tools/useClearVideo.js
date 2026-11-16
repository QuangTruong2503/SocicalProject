import { useEffect, useRef, useState } from 'react';
import { createVideoReport, deleteLocalVideos, scanLocalVideos, videoBytes, videoError, videoScope } from '../../utils/clearVideo.js';

export default function useClearVideo() {
  const [root, setRoot] = useState(null);
  const [recursive, setRecursive] = useState(false);
  const [videos, setVideos] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [ready, setReady] = useState(false);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState({ text: 'Sẵn sàng. Chưa có tệp nào bị thay đổi.', tone: 'info' });
  const [permission, setPermission] = useState('Lúc chọn và quét chỉ cần quyền đọc. Quyền ghi/xóa được hỏi ở bước xác nhận.');
  const [plan, setPlan] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [stopping, setStopping] = useState(false);
  const operation = useRef(null);

  useEffect(() => {
    const beforeUnload = (event) => {
      if (operation.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      operation.current?.abort();
      operation.current = null;
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  function status(text, tone = 'info') { setMessage({ text, tone }); }
  function begin(mode) {
    if (operation.current) return null;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(mode); setStopping(false);
    return controller;
  }
  function isCurrent(controller) { return operation.current === controller; }
  function finish(controller) {
    if (isCurrent(controller)) { operation.current = null; setBusy(null); setProgress(null); setStopping(false); }
  }
  function invalidate() { setVideos([]); setSelected(new Set()); setReady(false); setReport(null); }

  async function pickFolder() {
    if (plan) return;
    const controller = begin('pick');
    if (!controller) return;
    try {
      const folder = await window.showDirectoryPicker({ id: 'don-video-local', mode: 'read' });
      if (!isCurrent(controller)) return;
      setRoot(folder); invalidate();
      setPermission('Đã cấp quyền đọc. Chưa yêu cầu quyền ghi/xóa.');
      status(`Đã chọn “${folder.name}”. ${videoScope(recursive)} Nhấn “Quét video” để xem danh sách.`);
    } catch (error) {
      if (isCurrent(controller)) status(error.name === 'AbortError' ? 'Đã hủy chọn thư mục. Lựa chọn trước đó được giữ nguyên.' : videoError(error), error.name === 'AbortError' ? 'info' : 'error');
    } finally { finish(controller); }
  }

  function changeScope(value) {
    if (operation.current || plan) return;
    setRecursive(value); invalidate(); status('Đã đổi phạm vi. Hãy quét lại để xem danh sách video.');
  }

  async function scan() {
    if (!root || plan) return;
    const controller = begin('scan');
    if (!controller) return;
    invalidate(); status('Đang xác minh video. Chưa có tệp nào bị xóa.');
    try {
      if (await root.requestPermission({ mode: 'read' }) !== 'granted') throw new DOMException('Chưa cấp quyền đọc.', 'NotAllowedError');
      if (!isCurrent(controller) || controller.signal.aborted) return;
      const result = await scanLocalVideos(root, {
        recursive, signal: controller.signal,
        onProgress: (text) => { if (isCurrent(controller)) status(text); },
      });
      if (!isCurrent(controller)) return;
      setVideos(result.videos); setReady(result.scan.complete && !result.scan.cancelled);
      setReport(createVideoReport(root, result.scan, result.videos));
      if (result.scan.cancelled) status('Đã dừng quét. Hãy quét lại trước khi chọn và xóa video.');
      else if (!result.scan.complete) status('Quét chưa đầy đủ do lỗi truy cập. Đã khóa chức năng xóa; xem báo cáo rồi quét lại.', 'error');
      else status(`Quét xong: ${result.videos.length.toLocaleString('vi-VN')} video xác minh được, ${result.scan.otherFiles.toLocaleString('vi-VN')} tệp khác giữ lại, ${result.scan.issues.length.toLocaleString('vi-VN')} mục có lưu ý. Chưa xóa tệp nào.`);
    } catch (error) {
      if (isCurrent(controller)) status(videoError(error), 'error');
    } finally { finish(controller); }
  }

  function toggle(id) {
    if (!ready || operation.current || plan) return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll(value) {
    if (ready && !operation.current && !plan) setSelected(value ? new Set(videos.map((video) => video.id)) : new Set());
  }
  function review() {
    if (!ready || operation.current || !selected.size) return;
    setDialogError(''); setPlan(Object.freeze(videos.filter((video) => selected.has(video.id))));
  }
  function cancelReview() { if (!operation.current) setPlan(null); }

  async function confirmDelete(phrase, acknowledged) {
    if (!ready || !plan?.length || !acknowledged || phrase.trim().normalize('NFC').toUpperCase() !== `XÓA ${plan.length}`) return;
    const controller = begin('permission');
    if (!controller) return;
    const snapshot = [...plan];
    setDialogError('');
    try {
      // Request directly in the confirm click, before asynchronous verification.
      if (await root.requestPermission({ mode: 'readwrite' }) !== 'granted') {
        if (isCurrent(controller)) {
          setPermission('Quyền ghi/xóa chưa được cấp. Bạn vẫn có thể quét và xem danh sách.');
          setDialogError('Chưa được cấp quyền ghi/xóa. Không tệp nào bị xóa. Bạn có thể thử cấp quyền lại.');
        }
        return;
      }
      if (!isCurrent(controller) || controller.signal.aborted) return;
      setPermission('Đã cấp quyền đọc và ghi/xóa cho phiên thao tác này.');
      setPlan(null); setReady(false); setBusy('delete');
      const deletion = await deleteLocalVideos(root, report.scan, snapshot, {
        signal: controller.signal,
        onProgress: (value) => {
          if (!isCurrent(controller)) return;
          setProgress(value);
          status(`Đang kiểm tra và xóa ${Math.min(value.done + 1, value.total)}/${value.total}: ${value.path}`);
        },
      });
      if (!isCurrent(controller)) return;
      setReport((previous) => ({ ...previous, deletion }));
      const results = new Map(deletion.items.map((item) => [item.path, item]));
      setVideos((previous) => previous.map((video) => ({ ...video, result: results.get(video.path) })));
      setSelected(new Set());
      status(`Kết quả: đã xóa ${deletion.deleted}/${deletion.requested} video (${videoBytes(deletion.bytesDeleted)}); ${deletion.failed} lỗi; ${deletion.skipped} bỏ qua; ${deletion.cancelled} chưa xử lý. Quét lại để tiếp tục.`, deletion.failed || deletion.skipped || deletion.cancelled ? 'info' : 'success');
    } catch (error) {
      if (isCurrent(controller)) { setDialogError(videoError(error)); status(videoError(error), 'error'); }
    } finally { finish(controller); }
  }

  function stop() {
    if (!operation.current || !['scan', 'delete'].includes(busy)) return;
    operation.current.abort(); setStopping(true);
    status('Đang dừng… Thao tác xóa đã gửi cho hệ thống có thể vẫn hoàn tất; các tệp tiếp theo sẽ không bị xóa.');
  }

  function downloadReport() {
    if (!report || operation.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `bao-cao-video-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { root, recursive, videos, selected, ready, report, busy, progress, message, permission, plan, dialogError, stopping, pickFolder, changeScope, scan, toggle, selectAll, review, cancelReview, confirmDelete, stop, downloadReport };
}
