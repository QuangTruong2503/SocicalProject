import { formatNumber } from '../../utils/formatters.js';
import UploadGallery from './UploadGallery.jsx';
import { useUserUploads } from './useUserUploads.js';

const PAGE_SIZE = 24;

export default function UploadsSection({ refreshToken }) {
  const uploads = useUserUploads({ pageSize: PAGE_SIZE, reloadToken: refreshToken });

  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-head">
        <div>
          <span className="dashboard-panel-kicker">Thư viện</span>
          <h3>Ảnh đã tải lên</h3>
        </div>
        <span className="dashboard-panel-chip">
          {uploads.loading && !uploads.loaded ? 'Đang tải…' : `${formatNumber(uploads.total)} ảnh`}
        </span>
      </div>
      <UploadGallery uploads={uploads} emptyText="Chưa có ảnh nào được tải lên." showLoadMore />
    </section>
  );
}
