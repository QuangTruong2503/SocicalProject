import { lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { FiArrowRight, FiFileText, FiImage, FiLink2, FiPlayCircle, FiUser } from 'react-icons/fi';
import { useTheme } from './hooks/useTheme';
import './styles/auth.css';
const Watermark = lazy(() => import('./pages/Watermark.jsx'));
const Quotation = lazy(() => import('./pages/Quotation/Quotation.jsx'));
const QuotationList = lazy(() => import('./pages/Quotation/QuotationList.jsx'));
const QuotationKnm = lazy(() => import('./pages/QuotationKnm/QuotationKnm.jsx'));
const QuotationKnmList = lazy(() => import('./pages/QuotationKnm/QuotationKnmList.jsx'));
const ProductLinks = lazy(() => import('./pages/ProductLinks/ProductLinks.jsx'));
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import ScrollToTopButton from './components/ScrollToTopButton.jsx';
const MemoryGame = lazy(() => import('./pages/MemoryGame.jsx'));
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage.jsx'));
const DashboardPage = lazy(() => import('./pages/Dashboard/DashboardPage.jsx'));
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import PublicRoute from './components/PublicRoute.jsx';
const AdminLayout = lazy(() => import('./pages/Admin/AdminLayout.jsx'));
const AdminDashboardPage = lazy(() => import('./pages/Admin/AdminDashboardPage.jsx'));
const AdminUsersPage = lazy(() => import('./pages/Admin/AdminUsersPage.jsx'));
const AdminQuotationsPage = lazy(() => import('./pages/Admin/AdminQuotationsPage.jsx'));
const AdminWatermarkPage = lazy(() => import('./pages/Admin/AdminWatermarkPage.jsx'));
const AdminMemoryCardsPage = lazy(() => import('./pages/Admin/AdminMemoryCardsPage.jsx'));
const AdminProductLinksPage = lazy(() => import('./pages/Admin/AdminProductLinksPage.jsx'));
const AdminNotificationsPage = lazy(() => import('./pages/Admin/AdminNotificationsPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'));

function ToolCard({ icon, title, description, link }) {
  return (
    <NavLink to={link} className="home-tool-card">
      <span className="home-tool-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="home-tool-action">Mở công cụ <FiArrowRight aria-hidden="true" /></span>
    </NavLink>
  );
}

function HomePage() {
  const tools = [
    {
      icon: <FiFileText />,
      title: 'Báo giá Minh Triết',
      description: 'Tạo, lưu và in báo giá A4.',
      link: '/bao-gia-minh-triet',
    },
    {
      icon: <FiFileText />,
      title: 'Báo giá KNM',
      description: 'Xem trước báo giá và xuất PDF.',
      link: '/bao-gia-knm',
    },
    {
      icon: <FiLink2 />,
      title: 'Link ảnh sản phẩm',
      description: 'Tìm và sao chép link theo mã sản phẩm.',
      link: '/link-anh-san-pham',
    },
    {
      icon: <FiImage />,
      title: 'Watermark',
      description: 'Thêm dấu bản quyền vào ảnh.',
      link: '/watermark',
    },
  ];

  return (
    <>
      <Helmet>
        <title>Trang Chủ - AISEO Tools Suite</title>
        <meta name="description" content="Mở nhanh công cụ tạo báo giá, tìm link ảnh sản phẩm và thêm watermark tại AISEO Tools Suite." />
      </Helmet>

      <div className="home-page-wrapper">
        <section className="home-intro" aria-labelledby="home-title">
          <div>
            <span className="home-eyebrow">Bộ công cụ làm việc</span>
            <h1 id="home-title">Bạn muốn làm gì hôm nay?</h1>
            <p>Chọn đúng công cụ và bắt đầu công việc trong vài giây.</p>
          </div>
          <NavLink to="/bao-gia-minh-triet/tao-moi" className="home-primary-action">
            Tạo báo giá mới <FiArrowRight aria-hidden="true" />
          </NavLink>
        </section>

        <section className="home-tools-section" aria-labelledby="home-tools-title">
          <div className="home-section-heading">
            <h2 id="home-tools-title">Công cụ chính</h2>
            <span>4 công cụ</span>
          </div>
          <div className="home-tools-grid">
            {tools.map((tool) => (
              <ToolCard key={tool.link} {...tool} />
            ))}
          </div>
        </section>

        <section className="home-more-section" aria-labelledby="home-more-title">
          <div className="home-section-heading">
            <h2 id="home-more-title">Khác</h2>
          </div>
          <div className="home-more-links">
            <NavLink to="/memory-game"><FiPlayCircle aria-hidden="true" /> Memory Game <FiArrowRight aria-hidden="true" /></NavLink>
            <NavLink to="/dashboard/overview"><FiUser aria-hidden="true" /> Hồ sơ của tôi <FiArrowRight aria-hidden="true" /></NavLink>
          </div>
        </section>
      </div>
    </>
  );
}

function NotFoundPage() {
  return (
    <>
      <Helmet>
        <title>404 - Trang Không Tồn Tại</title>
      </Helmet>

      <div className="error-page-wrapper">
        <div className="error-content">
          <div className="error-code">404</div>
          <h1 className="error-title">Trang Không Tồn Tại</h1>
          <p className="error-description">
            Rất tiếc, trang bạn đang tìm kiếm không được tìm thấy. Có thể nó đã bị xóa hoặc URL không chính xác.
          </p>

          <NavLink to="/" className="error-button">
            ← Quay về Trang Chủ
          </NavLink>

          <div className="error-visual">
            <div className="error-blob"></div>
          </div>
        </div>
      </div>
    </>
  );
}

const protectedRouteConfigs = [
  {
    path: '/dashboard',
    element: <DashboardPage />,
    title: 'Dashboard cần đăng nhập để tiếp tục.',
    description: 'Trang dashboard chứa thông tin phiên, hồ sơ cá nhân và dữ liệu tải lên nên chỉ mở cho người dùng đã xác thực.',
    details: [
      'Quản lý hồ sơ và avatar',
      'Xem ảnh đã tải lên gần đây',
      'Theo dõi trạng thái phiên đăng nhập',
    ],
    loginLabel: 'Đăng nhập để vào dashboard',
  },
  {
    path: '/dashboard/:section',
    element: <DashboardPage />,
    title: 'Dashboard cần đăng nhập để tiếp tục.',
    description: 'Trang dashboard chứa thông tin phiên, hồ sơ cá nhân và dữ liệu tải lên nên chỉ mở cho người dùng đã xác thực.',
    details: [
      'Quản lý hồ sơ và avatar',
      'Đổi mật khẩu và bảo mật tài khoản',
      'Xem ảnh đã tải lên gần đây',
    ],
    loginLabel: 'Đăng nhập để vào dashboard',
  },
  {
    path: '/watermark',
    element: <Watermark />,
    title: 'Watermark Tool cần đăng nhập để lưu trạng thái làm việc.',
    description: 'Trang này có thể xử lý dữ liệu người dùng và cần phiên đăng nhập để đồng bộ thao tác an toàn hơn.',
    details: [
      'Bảo toàn lịch sử thao tác',
      'Đồng bộ dữ liệu cá nhân',
      'Giữ phiên làm việc ổn định',
    ],
    loginLabel: 'Đăng nhập để mở Watermark',
  },
  {
    path: '/memory-game',
    element: <MemoryGame />,
    title: 'Đăng nhập để chơi Ghép thẻ trí nhớ.',
    description: 'Kỷ lục và ván đang chơi được lưu riêng cho tài khoản trên thiết bị. Khi kết nối được, tiến trình được đồng bộ và bạn có thể tham gia thử thách xếp hạng hằng ngày.',
    details: [
      'Chọn chủ đề và độ khó',
      'Lưu kỷ lục, lịch sử và tiếp tục ván chơi',
      'Thử thách hằng ngày và bảng xếp hạng',
    ],
    loginLabel: 'Đăng nhập để chơi tiếp',
  },
];

export default function App() {
  const location = useLocation();
  const { theme } = useTheme();
  const isHomePage = location.pathname === '/';
  const isAuthPage = location.pathname.startsWith('/auth');

  return (
    <HelmetProvider>
      <div className={`app-container theme-${theme}`} data-theme={theme}>
        {!isAuthPage && <Header />}

        <main className={`app-main ${isHomePage ? 'home-page' : 'content-page'} ${isAuthPage ? 'auth-page-shell' : ''}`}>
          <Suspense fallback={<div role="status" style={{ padding: '48px 24px', textAlign: 'center' }}>Đang tải công cụ…</div>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/notifications" element={<ProtectedRoute title="Đăng nhập để xem thông báo"><NotificationsPage /></ProtectedRoute>} />
            <Route path="/watermark/dashboard" element={<Navigate to="/admin/watermark" replace />} />
            <Route path="/quotation" element={<Navigate to="/bao-gia-minh-triet/tao-moi" replace />} />
            <Route path="/bao-gia-knm" element={<ProtectedRoute title="Báo giá KNM cần đăng nhập." description="Khu vực dành cho nhân viên và quản trị viên." details={['Tạo báo giá máy móc, thiết bị công nghiệp', 'Xem trước realtime, xuất PDF và in ngay']} loginLabel="Đăng nhập để tạo báo giá KNM"><QuotationKnm /></ProtectedRoute>} />
            <Route path="/bao-gia-knm/quan-ly" element={<ProtectedRoute title="Quản lý báo giá KNM cần đăng nhập." description="Khu vực dành cho nhân viên và quản trị viên." details={['Lưu và chỉnh sửa báo giá KNM']} loginLabel="Đăng nhập để quản lý báo giá KNM"><QuotationKnmList /></ProtectedRoute>} />
            <Route path="/bao-gia-knm/:id/chinh-sua" element={<ProtectedRoute title="Chỉnh sửa báo giá KNM cần đăng nhập." description="Khu vực dành cho nhân viên và quản trị viên." details={['Chỉnh sửa báo giá KNM đã lưu']} loginLabel="Đăng nhập để chỉnh sửa"><QuotationKnm /></ProtectedRoute>} />
            <Route path="/link-anh-san-pham" element={<ProtectedRoute title="Link ảnh sản phẩm cần đăng nhập." description="Khu vực dành cho nhân viên được quản trị viên cấp quyền." details={['Copy nhanh link ảnh sản phẩm', 'Đánh dấu sản phẩm đã làm', 'Xem hoạt động của cả nhóm theo thời gian thực']} loginLabel="Đăng nhập để mở trang"><ProductLinks /></ProtectedRoute>} />
            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="quotations" element={<AdminQuotationsPage />} />
              <Route path="watermark" element={<AdminWatermarkPage />} />
              <Route path="memory-cards" element={<AdminMemoryCardsPage />} />
              <Route path="product-links" element={<AdminProductLinksPage />} />
              <Route path="notifications" element={<AdminNotificationsPage />} />
            </Route>
            <Route path="/bao-gia-minh-triet" element={<ProtectedRoute title="Quản lý báo giá cần đăng nhập." description="Khu vực dành cho nhân viên và quản trị viên." details={['Lưu và chỉnh sửa báo giá', 'Xuất Excel, PDF và in A4']} loginLabel="Đăng nhập để quản lý báo giá"><QuotationList /></ProtectedRoute>} />
            <Route path="/bao-gia-minh-triet/tao-moi" element={<ProtectedRoute title="Tạo báo giá cần đăng nhập." description="Khu vực dành cho nhân viên và quản trị viên." details={['Tạo báo giá theo mẫu công ty']} loginLabel="Đăng nhập để tạo báo giá"><Quotation /></ProtectedRoute>} />
            <Route path="/bao-gia-minh-triet/:id/chinh-sua" element={<ProtectedRoute title="Chỉnh sửa báo giá cần đăng nhập." description="Khu vực dành cho nhân viên và quản trị viên." details={['Chỉnh sửa báo giá đã lưu']} loginLabel="Đăng nhập để chỉnh sửa"><Quotation /></ProtectedRoute>} />
            <Route
              path="/auth"
              element={(
                <PublicRoute>
                  <AuthPage />
                </PublicRoute>
              )}
            />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            {protectedRouteConfigs.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={(
                  <ProtectedRoute
                    title={route.title}
                    description={route.description}
                    details={route.details}
                    loginLabel={route.loginLabel}
                  >
                    {route.element}
                  </ProtectedRoute>
                )}
              />
            ))}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
        </main>

        {!isAuthPage && <Footer />}
        {!isAuthPage && <ScrollToTopButton />}
      </div>
    </HelmetProvider>
  );
}
