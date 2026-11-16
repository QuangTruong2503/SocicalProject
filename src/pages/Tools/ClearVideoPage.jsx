import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FiArrowLeft, FiArrowRight, FiAlertTriangle, FiCheckCircle, FiDownload, FiFolder, FiInfo, FiSearch, FiShield, FiTrash2, FiVideo } from 'react-icons/fi';
import Dialog from '../../components/dialog/Dialog.jsx';
import { CLEAR_VIDEO_PAGE_SIZE, VIDEO_EXTENSIONS, supportsClearVideo, videoBytes, videoScope } from '../../utils/clearVideo.js';
import useClearVideo from './useClearVideo.js';
import styles from './Tools.module.css';

const RESULT_LABELS = { deleted: 'Đã xóa', skipped: 'Giữ lại · Cần quét lại', failed: 'Lỗi · Xem báo cáo', cancelled: 'Chưa xử lý' };

function DeleteConfirmation({ tool }) {
  const [phrase, setPhrase] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const expected = `XÓA ${tool.plan.length}`;
  const allowed = acknowledged && phrase.trim().normalize('NFC').toUpperCase() === expected;
  return (
    <Dialog title="Xóa các video đã chọn?" onClose={tool.cancelReview} busy={!!tool.busy}>
      <div className={styles.confirmContent}>
        <p>Thao tác xóa trực tiếp trên máy và có thể không hoàn tác được. Chỉ các tệp đã chọn trong danh sách vừa quét được xử lý.</p>
        <div className={styles.confirmFacts}><strong>{tool.root.name}</strong><span>{videoScope(tool.report.scan.recursive)}</span><span>{tool.plan.length} video · {videoBytes(tool.plan.reduce((sum, video) => sum + video.size, 0))}</span></div>
        <ul className={styles.confirmFiles}>{tool.plan.slice(0, 20).map((video) => <li key={video.id}>{video.path}</li>)}{tool.plan.length > 20 && <li>Và {tool.plan.length - 20} video đã chọn khác.</li>}</ul>
        <label className={styles.checkline}><input type="checkbox" checked={acknowledged} disabled={!!tool.busy} onChange={(event) => setAcknowledged(event.target.checked)} /><span>Tôi đã kiểm tra danh sách, sao lưu khi cần và hiểu rằng việc xóa có thể không hoàn tác được.</span></label>
        <label className={styles.confirmLabel} htmlFor="clear-video-confirm">Nhập <strong>{expected}</strong> để xác nhận</label>
        <input id="clear-video-confirm" className={styles.textInput} value={phrase} disabled={!!tool.busy} autoComplete="off" spellCheck={false} onChange={(event) => setPhrase(event.target.value)} />
        {tool.dialogError && <p className={styles.errorText} role="alert">{tool.dialogError}</p>}
        <div className={styles.confirmActions}><button className={styles.button} type="button" disabled={!!tool.busy} onClick={tool.cancelReview}>Quay lại</button><button className={`${styles.button} ${styles.dangerButton}`} type="button" disabled={!allowed || !!tool.busy} onClick={() => tool.confirmDelete(phrase, acknowledged)}><FiTrash2 aria-hidden="true" />{tool.busy ? 'Đang xin quyền…' : 'Cấp quyền & xóa'}</button></div>
      </div>
    </Dialog>
  );
}

export default function ClearVideoPage() {
  const tool = useClearVideo();
  const [page, setPage] = useState(0);
  const selectAllRef = useRef(null);
  const supported = supportsClearVideo();
  const locked = !!tool.busy || !!tool.plan;
  const selectedVideos = tool.videos.filter((video) => tool.selected.has(video.id));
  const totalPages = Math.max(1, Math.ceil(tool.videos.length / CLEAR_VIDEO_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * CLEAR_VIDEO_PAGE_SIZE;
  const badge = tool.busy === 'scan' ? 'Đang quét' : tool.report?.deletion ? 'Cần quét lại' : tool.ready ? 'Đã quét' : tool.report?.scan.cancelled ? 'Đã dừng' : tool.report ? 'Quét chưa đầy đủ' : 'Chưa quét';
  const details = tool.report ? [...tool.report.scan.issues, ...(tool.report.deletion?.items || []).map((item) => ({ path: item.path, reason: `${RESULT_LABELS[item.status]}: ${item.message}` }))] : [];

  return (
    <div className={styles.page}>
      <Helmet><title>Clear Video - AISEO Tools Suite</title><meta name="description" content="Quét, chọn và xóa video trong thư mục trên máy. Xác minh video trước khi xóa, xử lý cục bộ và tải báo cáo kết quả." /></Helmet>
      <Link to="/tools" className={styles.backLink}><FiArrowLeft aria-hidden="true" /> Tất cả Tools</Link>
      <header className={styles.toolHead}>
        <div><span className={styles.eyebrow}>VIDEO / CÔNG CỤ CỤC BỘ</span><h1>Clear Video<span>.</span></h1><p>Dọn video, gọn không gian làm việc.<br />Chọn thư mục, kiểm tra danh sách và quyết định tệp cần xóa.</p></div>
        <span className={styles.localBadge}><FiShield aria-hidden="true" /> Không tải video lên máy chủ</span>
      </header>
      <div className={styles.warning}><FiAlertTriangle aria-hidden="true" /><p><strong>Xóa trực tiếp trên máy của bạn.</strong> Tệp có thể không vào Thùng rác và không thể hoàn tác. Hãy kiểm tra danh sách và sao lưu khi cần.</p></div>
      {!supported && <div className={styles.environment} role="alert"><FiInfo aria-hidden="true" /><p><strong>Trình duyệt chưa hỗ trợ truy cập thư mục.</strong> Mở trang trực tiếp bằng Chrome hoặc Edge trên máy tính, qua HTTPS hoặc localhost. Không dùng iframe hoặc mở file HTML trực tiếp.</p></div>}

      <div className={styles.workspace}>
        <aside className={styles.settings} aria-label="Thiết lập quét">
          <section><span className={styles.step}>01 / THƯ MỤC</span><h2>Bắt đầu từ đâu?</h2><p>Chọn thư mục chứa những video bạn muốn dọn.</p><button className={`${styles.button} ${styles.primaryButton} ${styles.full}`} type="button" disabled={!supported || locked} onClick={tool.pickFolder}><FiFolder aria-hidden="true" />{tool.busy === 'pick' ? 'Đang chọn…' : tool.root ? 'Đổi thư mục' : 'Chọn thư mục'}</button>
            <div className={styles.folderBox}><FiFolder aria-hidden="true" /><div><small>THƯ MỤC ĐANG CHỌN</small><strong>{tool.root?.name || 'Chưa chọn thư mục'}</strong></div></div><p className={styles.hint}>{tool.permission}</p>
            <details className={styles.folderHelp}><summary>Không chọn được Desktop / Downloads?</summary><p>Trình duyệt có thể chặn toàn bộ thư mục hệ thống. Hãy chọn một thư mục con chứa video, ví dụ Downloads/VideoCanDon. Nếu cần, chuyển video vào thư mục con bằng File Explorer trước.</p></details>
          </section>
          <section className={styles.scopeSection}><span className={styles.step}>02 / PHẠM VI</span><h2>Kiểm soát nơi quét</h2><label className={styles.checkline}><input type="checkbox" checked={tool.recursive} disabled={locked} onChange={(event) => { setPage(0); tool.changeScope(event.target.checked); }} /><span>Bao gồm tất cả thư mục con</span></label><p className={styles.hint}>{videoScope(tool.recursive)}</p><button className={`${styles.button} ${styles.full}`} type="button" disabled={!supported || !tool.root || locked} onClick={() => { setPage(0); tool.scan(); }}><FiSearch aria-hidden="true" />{tool.busy === 'scan' ? 'Đang quét video…' : 'Quét video'}</button><p className={styles.hint}>Không xóa thư mục. Đổi phạm vi sẽ yêu cầu quét lại.</p></section>
        </aside>

        <section className={styles.filePanel} aria-labelledby="video-list-title">
          <div className={styles.panelHead}><div><span className={styles.step}>03 / KIỂM TRA & CHỌN</span><h2 id="video-list-title">Danh sách video</h2></div><span className={`${styles.scanBadge} ${tool.ready ? styles.scanned : ''}`}>{badge}</span></div>
          <div className={styles.metrics}><div><strong>{tool.videos.length.toLocaleString('vi-VN')}</strong><span>VIDEO XÁC MINH</span></div><div><strong>{tool.selected.size.toLocaleString('vi-VN')}</strong><span>ĐÃ CHỌN</span></div><div><strong>{videoBytes(selectedVideos.reduce((sum, video) => sum + video.size, 0))}</strong><span>DUNG LƯỢNG ĐÃ CHỌN</span></div></div>
          <div className={styles.listToolbar}><label className={styles.checkline}><input ref={(node) => { selectAllRef.current = node; if (node) node.indeterminate = tool.selected.size > 0 && tool.selected.size < tool.videos.length; }} type="checkbox" checked={!!tool.videos.length && tool.selected.size === tool.videos.length} disabled={!tool.ready || !tool.videos.length || locked} onChange={(event) => tool.selectAll(event.target.checked)} /><span>Chọn tất cả</span></label><span>{tool.videos.length ? `${start + 1}–${Math.min(start + CLEAR_VIDEO_PAGE_SIZE, tool.videos.length)} / ${tool.videos.length}` : 'Chỉ xóa tệp bạn chọn'}</span></div>
          {tool.videos.length ? <div className={styles.tableScroll}><table className={styles.fileTable}><thead><tr><th scope="col"><span className={styles.srOnly}>Chọn</span></th><th scope="col">Tên tệp / Đường dẫn</th><th scope="col">Dung lượng</th><th scope="col">Trạng thái</th></tr></thead><tbody>{tool.videos.slice(start, start + CLEAR_VIDEO_PAGE_SIZE).map((video) => <tr key={video.id}><td><input type="checkbox" aria-label={`Chọn ${video.path}`} checked={tool.selected.has(video.id)} disabled={!tool.ready || locked} onChange={() => tool.toggle(video.id)} /></td><td><strong>{video.name}</strong><small>{video.path}</small></td><td>{videoBytes(video.size)}</td><td className={video.result?.status === 'deleted' ? styles.deletedText : ''}>{video.result ? RESULT_LABELS[video.result.status] : `${video.width} × ${video.height}`}</td></tr>)}</tbody></table></div> : <div className={styles.emptyState}><FiVideo aria-hidden="true" /><h3>{tool.busy === 'scan' ? 'Đang tìm video trong thư mục…' : tool.ready ? 'Không tìm thấy video xác minh được' : 'Video của bạn sẽ xuất hiện ở đây'}</h3><p>{tool.ready ? 'Các tệp khác và video không đọc được siêu dữ liệu được giữ lại.' : 'Chọn thư mục, kiểm tra phạm vi rồi nhấn “Quét video”.'}</p><div aria-hidden="true"><span>01 Chọn thư mục</span><FiArrowRight /><span>02 Quét video</span><FiArrowRight /><span>03 Kiểm tra</span></div></div>}
          {totalPages > 1 && <nav className={styles.pagination} aria-label="Phân trang video"><button type="button" className={styles.button} disabled={!currentPage || locked} onClick={() => setPage(currentPage - 1)}>← Trước</button><span>Trang {currentPage + 1} / {totalPages}</span><button type="button" className={styles.button} disabled={currentPage + 1 >= totalPages || locked} onClick={() => setPage(currentPage + 1)}>Sau →</button></nav>}
          <div className={styles.listActions}><p>{tool.report?.deletion ? 'Lần xử lý đã kết thúc. Quét lại để tiếp tục.' : 'Mặc định không chọn tệp nào. Bạn luôn kiểm tra và xác nhận trước khi xóa.'}</p><button type="button" className={`${styles.button} ${styles.dangerButton}`} disabled={!tool.ready || !tool.selected.size || locked} onClick={tool.review}><FiTrash2 aria-hidden="true" /> Xem lại & xóa{tool.selected.size ? ` (${tool.selected.size})` : ''}</button></div>
        </section>
      </div>

      <section className={styles.progressBox} data-tone={tool.message.tone} aria-label="Tiến trình xử lý"><div><FiCheckCircle aria-hidden="true" /><p role="status" aria-live="polite">{tool.message.text}</p>{['scan', 'delete'].includes(tool.busy) && <button type="button" className={styles.button} disabled={tool.stopping} onClick={tool.stop}>{tool.stopping ? 'Đang dừng…' : 'Dừng'}</button>}</div>{['scan', 'delete'].includes(tool.busy) && <progress aria-label="Tiến trình xử lý video" max={tool.progress?.total || 1} value={tool.progress ? tool.progress.done : undefined} />}</section>

      {tool.report && <details className={styles.detail} key={tool.report.deletion ? 'deletion' : 'scan'} open={tool.report.deletion ? true : undefined}><summary>Báo cáo quét{tool.report.deletion ? ' & kết quả xóa' : ' & các tệp giữ lại'}</summary><div className={styles.detailBody}><p>Đã xem {tool.report.scan.filesSeen.toLocaleString('vi-VN')} tệp trong {tool.report.scan.directoriesSeen.toLocaleString('vi-VN')} thư mục. {tool.report.scan.otherFiles.toLocaleString('vi-VN')} tệp không có đuôi video được giữ lại; {tool.report.scan.issues.length.toLocaleString('vi-VN')} mục có lưu ý.</p><button type="button" className={styles.button} disabled={!!tool.busy} onClick={tool.downloadReport}><FiDownload aria-hidden="true" /> Tải báo cáo JSON</button>{!!details.length && <ul className={styles.reportIssues}>{details.slice(0, 200).map((item, index) => <li key={`${item.path}-${index}`}><strong>{item.path}</strong> — {item.reason}</li>)}</ul>}{details.length > 200 && <p>Chỉ hiển thị 200 mục đầu. Tải JSON để xem đầy đủ.</p>}</div></details>}
      <details className={styles.detail}><summary>Cách nhận diện video & giới hạn</summary><div className={styles.detailBody}><p>Chỉ đưa vào danh sách khi đuôi tệp được hỗ trợ và trình duyệt xác minh được siêu dữ liệu có chiều rộng, chiều cao lớn hơn 0. Tệp âm thanh, ảnh hoặc tài liệu đổi đuôi thành .mp4 không được coi là video chỉ dựa trên tên hoặc MIME.</p><p>Video hỏng, codec không hỗ trợ hoặc xác minh quá 12 giây được giữ lại. Đuôi ứng viên: <code>{[...VIDEO_EXTENSIONS].map((extension) => `.${extension}`).join(', ')}</code>.</p><p>Trước khi xóa, công cụ kiểm tra lại đường dẫn, đối tượng tệp, dung lượng, thời điểm sửa và siêu dữ liệu. Không đổi tên, di chuyển hoặc sửa tệp khi công cụ đang chạy: trình duyệt không hỗ trợ khóa thư mục để ngăn thay đổi từ ứng dụng khác.</p><p>Không lưu quyền truy cập hoặc thư mục. Có thể thu hồi quyền tại cài đặt trang web của trình duyệt. Khi rời trang, công việc đang chạy được dừng; thao tác xóa đã gửi có thể vẫn hoàn tất.</p></div></details>
      {tool.plan && <DeleteConfirmation tool={tool} />}
    </div>
  );
}
