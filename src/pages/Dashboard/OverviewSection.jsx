import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaCircleCheck,
  FaDroplet,
  FaFileInvoiceDollar,
  FaFileLines,
  FaImage,
  FaImages,
  FaLink,
  FaRegCircle,
  FaShieldHalved,
} from 'react-icons/fa6';
import { useAuth } from '../../hooks/useAuth.js';
import { getMyDashboardSummary } from '../../services/dashboardService.js';
import { describeProductLinkLog } from '../../utils/productLinkLog.js';
import { formatDateTime, formatNumber, formatRelative } from '../../utils/formatters.js';
import { getUserAvatarUrl } from '../../utils/userProfile.js';
import UploadGallery from './UploadGallery.jsx';
import { getProductLinkLevelLabel } from './dashboardLabels.js';
import { useUserUploads } from './useUserUploads.js';
import styles from './Dashboard.module.css';

const RECENT_UPLOADS = 6;

function StatTile({ icon, label, value, hint, loading }) {
  const Icon = icon;

  return (
    <article className="dashboard-stat-card-v2">
      <span className="dashboard-stat-icon"><Icon aria-hidden="true" /></span>
      <div>
        <span>{label}</span>
        {loading ? <i className={`${styles.skeleton} ${styles.skeletonValue}`} aria-hidden="true" /> : <strong>{value}</strong>}
        {!loading && hint && <small className={styles.statHint}>{hint}</small>}
      </div>
    </article>
  );
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** One line of "Hoạt động gần đây" from my_dashboard_summary().recent. */
function describeActivity(entry) {
  switch (entry.kind) {
    case 'watermark':
      return { icon: FaDroplet, text: `Tạo ${formatNumber(entry.image_count)} ảnh watermark` };
    case 'quotation':
      return {
        icon: FaFileInvoiceDollar,
        text: `Lập báo giá ${entry.quotation_no}${entry.customer_name ? ` cho ${entry.customer_name}` : ''}`,
        to: entry.id ? `/bao-gia-minh-triet/${entry.id}/chinh-sua` : null,
      };
    case 'product_link': {
      const { verb, target, extra } = describeProductLinkLog(entry);
      return { icon: FaLink, text: `${capitalize(verb)}${target ? ` ${target}` : ''}`, extra };
    }
    case 'upload':
      return { icon: FaImage, text: 'Tải ảnh lên', extra: entry.file_name };
    default:
      return { icon: FaRegCircle, text: entry.kind };
  }
}

export default function OverviewSection({ refreshToken }) {
  const { user, profile, latestUpload } = useAuth();
  const [summary, setSummary] = useState({ data: null, loading: true, error: '' });
  const [localToken, setLocalToken] = useState(0);
  const uploads = useUserUploads({ pageSize: RECENT_UPLOADS, reloadToken: refreshToken });

  useEffect(() => {
    let isActive = true;

    async function load() {
      setSummary((current) => ({ ...current, loading: true }));
      const result = await getMyDashboardSummary();
      if (!isActive) return;
      setSummary((current) => ({
        data: result.error ? current.data : result.data,
        loading: false,
        error: result.error || '',
      }));
    }

    load();
    return () => { isActive = false; };
  }, [refreshToken, localToken]);

  const data = summary.data;
  const loading = summary.loading && !data;
  const isAdmin = profile?.role === 'admin';
  const level = Number(data?.product_links_level) || 0;

  const tools = [
    { to: '/watermark', label: 'Watermark', desc: 'Đóng dấu ảnh hàng loạt', icon: FaDroplet },
    { to: '/bao-gia-minh-triet', label: 'Báo giá Minh Triết', desc: 'Tạo, lưu và in báo giá', icon: FaFileInvoiceDollar },
    { to: '/bao-gia-knm', label: 'Báo giá KNM', desc: 'Báo giá máy móc, thiết bị', icon: FaFileLines },
    (level > 0 || isAdmin) && { to: '/link-anh-san-pham', label: 'Link ảnh sản phẩm', desc: 'Copy link, đánh dấu hoàn thành', icon: FaLink },
    isAdmin && { to: '/admin', label: 'Quản trị', desc: 'Người dùng, phân quyền, thống kê', icon: FaShieldHalved },
  ].filter(Boolean);

  const checklist = [
    { done: Boolean(getUserAvatarUrl(user, profile, latestUpload)), label: 'Thêm ảnh đại diện', to: '/dashboard/avatar' },
    { done: Boolean(profile?.full_name?.trim()), label: 'Cập nhật họ tên', to: '/dashboard/profile' },
    { done: Boolean(profile?.phone?.trim()), label: 'Thêm số điện thoại', to: '/dashboard/profile' },
    { done: Boolean(profile?.city?.trim() || profile?.country?.trim()), label: 'Cho biết khu vực', to: '/dashboard/profile' },
    data && 'has_password' in data && {
      done: Boolean(data.has_password),
      label: 'Đặt mật khẩu đăng nhập',
      hint: 'Để đăng nhập bằng email khi không dùng Google',
      to: '/dashboard/security',
    },
  ].filter(Boolean);
  const doneCount = checklist.filter((item) => item.done).length;
  const completion = Math.round((doneCount / checklist.length) * 100);

  return (
    <div className={styles.overview}>
      {summary.error && (
        <div className={styles.inlineError} role="alert">
          <span>{summary.error}</span>
          <button type="button" onClick={() => setLocalToken((token) => token + 1)}>Thử lại</button>
        </div>
      )}

      <div className="dashboard-stats-grid" aria-label="Số liệu của bạn">
        {(loading || data?.watermark_images !== undefined) && (
          <StatTile
            icon={FaDroplet}
            label="Ảnh watermark"
            value={formatNumber(data?.watermark_images)}
            hint={`+${formatNumber(data?.watermark_images_7d)} trong 7 ngày`}
            loading={loading}
          />
        )}
        {(loading || data?.quotations !== undefined) && (
          <StatTile
            icon={FaFileInvoiceDollar}
            label="Báo giá đã lập"
            value={formatNumber(data?.quotations)}
            hint={data?.quotations_last_at ? `Gần nhất ${formatRelative(data.quotations_last_at)}` : 'Chưa có báo giá'}
            loading={loading}
          />
        )}
        <StatTile
          icon={FaImages}
          label="Ảnh đã tải lên"
          value={formatNumber(uploads.total)}
          hint="Ảnh mới nhất là avatar"
          loading={uploads.loading && !uploads.loaded}
        />
        {(loading || data?.product_links_level !== undefined) && (
          <StatTile
            icon={FaLink}
            label="Link ảnh sản phẩm"
            value={isAdmin ? 'Toàn quyền' : getProductLinkLevelLabel(level)}
            hint={level > 0 || isAdmin ? `${formatNumber(data?.product_links_done)} việc đã hoàn thành` : 'Liên hệ quản trị viên để được cấp quyền'}
            loading={loading}
          />
        )}
      </div>

      <div className={styles.overviewGrid}>
        <section className={`dashboard-panel ${styles.card}`}>
          <div className="dashboard-panel-head">
            <div>
              <span className="dashboard-panel-kicker">Công cụ</span>
              <h3>Mở nhanh</h3>
            </div>
          </div>
          <ul className={styles.toolList}>
            {tools.map((tool) => (
              <li key={tool.to}>
                <Link to={tool.to} className={styles.toolLink}>
                  <span className={styles.toolIcon}><tool.icon aria-hidden="true" /></span>
                  <span>
                    <strong>{tool.label}</strong>
                    <small>{tool.desc}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={`dashboard-panel ${styles.card}`}>
          <div className="dashboard-panel-head">
            <div>
              <span className="dashboard-panel-kicker">Hồ sơ</span>
              <h3>Hoàn thiện tài khoản</h3>
            </div>
            <span className="dashboard-panel-chip">{completion}%</span>
          </div>
          <div
            className={styles.progress}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completion}
            aria-label="Mức hoàn thiện tài khoản"
          >
            <span style={{ width: `${completion}%` }} />
          </div>
          <ul className={styles.checklist}>
            {checklist.map((item) => (
              <li key={item.label} className={item.done ? styles.checkDone : undefined}>
                {item.done ? <FaCircleCheck aria-hidden="true" /> : <FaRegCircle aria-hidden="true" />}
                {item.done ? (
                  <span>{item.label}<span className={styles.srOnly}> (đã xong)</span></span>
                ) : (
                  <Link to={item.to}>
                    {item.label}
                    {item.hint && <small>{item.hint}</small>}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className={`dashboard-panel ${styles.card}`}>
          <div className="dashboard-panel-head">
            <div>
              <span className="dashboard-panel-kicker">Gần đây</span>
              <h3>Hoạt động của bạn</h3>
            </div>
          </div>
          {loading ? (
            <ul className={styles.activityList} aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => <li key={index}><i className={`${styles.skeleton} ${styles.skeletonLine}`} /></li>)}
            </ul>
          ) : !data?.recent?.length ? (
            <p className={styles.mutedText}>Chưa có hoạt động nào. Hãy thử một công cụ ở mục “Mở nhanh”.</p>
          ) : (
            <ul className={styles.activityList}>
              {data.recent.map((entry, index) => {
                const { icon: Icon, text, extra, to } = describeActivity(entry);
                return (
                  <li key={`${entry.kind}-${entry.at}-${index}`}>
                    <span className={styles.activityIcon}><Icon aria-hidden="true" /></span>
                    <div>
                      {to ? <Link to={to}>{text}</Link> : <span>{text}</span>}
                      {extra && <small>{extra}</small>}
                    </div>
                    <time dateTime={entry.at} title={formatDateTime(entry.at)}>{formatRelative(entry.at)}</time>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`dashboard-panel ${styles.card}`}>
          <div className="dashboard-panel-head">
            <div>
              <span className="dashboard-panel-kicker">Ảnh</span>
              <h3>Ảnh tải lên gần đây</h3>
            </div>
            {uploads.total > RECENT_UPLOADS && <Link to="/dashboard/uploads" className="dashboard-panel-chip">Xem tất cả</Link>}
          </div>
          <UploadGallery uploads={uploads} limit={RECENT_UPLOADS} emptyText="Chưa có ảnh nào. Tải ảnh đầu tiên ở mục Avatar." />
        </section>
      </div>
    </div>
  );
}
