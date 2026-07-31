import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { useTheme } from './hooks/useTheme';
import './styles/auth.css';
import Watermark from './pages/Watermark.jsx';
import DoanTrangWatermarkPage from './pages/DoanTrangWatermarkPage.jsx';
import WatermarkDashboardPage from './pages/WatermarkDashboardPage.jsx';
import Quotation from './pages/Quotation/Quotation.jsx';
import QuotationList from './pages/Quotation/QuotationList.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import ScrollToTopButton from './components/ScrollToTopButton.jsx';
import MemoryGame from './pages/MemoryGame.jsx';
import SEOKeywords from './pages/SEOKeywords.jsx';
import SeoExcelGenerator from './pages/SeoExcelGenerator.jsx';
import AuthPage from './pages/AuthPage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PublicRoute from './components/PublicRoute.jsx';
import AISEO from './pages/AISEO.jsx';

function FeatureCard({ icon, title, description, buttonText, link, badge, delay }) {
  return (
    <NavLink to={link} className="feature-card-link">
      <div className="feature-card" style={{ animationDelay: `${delay}ms` }}>
        <div className="feature-card-header">
          <div className="feature-icon">{icon}</div>
          {badge && <span className="badge-new">{badge}</span>}
        </div>

        <h3 className="feature-title">{title}</h3>
        <p className="feature-description">{description}</p>

        <div className="feature-footer">
          <button className="feature-button">
            {buttonText}
            <span className="button-arrow">→</span>
          </button>
        </div>

        <div className="feature-gradient-overlay"></div>
      </div>
    </NavLink>
  );
}

function HomePage() {
  const features = [
    {
      icon: '🤖',
      title: 'AI SEO Generator',
      description: 'Tạo nội dung SEO-optimized tự động cho sản phẩm, bài viết, và quảng cáo của bạn.',
      buttonText: 'Mo AISEO',
      link: '/aiseo',
      badge: 'Popular',
      delay: 100,
    },
    {
      icon: '🔐',
      title: 'Authentication',
      description: 'Đăng ký, đăng nhập và quản lý phiên người dùng với Supabase Authentication.',
      buttonText: 'Mo Auth',
      link: '/auth',
      badge: 'New',
      delay: 150,
    },
    {
      icon: '🔍',
      title: 'SEO Keywords Generator',
      description: 'Tạo bộ từ khóa SEO toàn diện cho sản phẩm của bạn.',
      buttonText: 'Mo Tool',
      link: '/seo-keywords',
      badge: 'New',
      delay: 200,
    },
    {
      icon: '📊',
      title: 'SEO Excel Generator',
      description: 'Upload Excel, tạo tag SEO bằng AI và lưu tiến độ realtime để không mất dữ liệu.',
      buttonText: 'Mo Tool',
      link: '/seo-excel-generator',
      badge: 'New',
      delay: 225,
    },
    {
      icon: '🎮',
      title: 'Memory Match Game',
      description: 'Chơi trò chơi ghép hình thú vị, test trí nhớ của bạn với giao diện hiện đại.',
      buttonText: 'Choi Ngay',
      link: '/memory-game',
      badge: 'New',
      delay: 250,
    },
    {
      icon: '🎨',
      title: 'Watermark Tool',
      description: 'Thêm watermark vào ảnh của bạn để bảo vệ quyền sở hữu trí tuệ.',
      buttonText: 'Mo Tool',
      link: '/watermark',
      badge: null,
      delay: 300,
    },
    {
      icon: '🧾',
      title: 'Quotation Builder',
      description: 'Tạo phiếu báo giá / đơn hàng, tự tính VAT, lưu draft và in hóa đơn A4.',
      buttonText: 'Mo Tool',
      link: '/admin/bao-gia',
      badge: 'New',
      delay: 325,
    },
  ];

  return (
    <>
      <Helmet>
        <title>Trang Chủ - AISEO Tools Suite</title>
        <meta name="description" content="Bộ công cụ AI toàn diện: SEO Generator, Authentication, Memory Game, Watermark Tool" />
      </Helmet>

      <div className="home-page-wrapper loaded">
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-badge">✨ Welcome to AISEO Suite</div>

            <h1 className="hero-title">
              <span className="gradient-text">Công Cụ AI</span>
              <br />
              Toàn Diện Cho Bạn
            </h1>

            <p className="hero-subtitle">
              Nâng cao hiệu suất làm việc với bộ công cụ AI được thiết kế thân thiện, mạnh mẽ và dễ sử dụng.
            </p>

            <div className="hero-stats">
              <div className="stat-item">
                <span className="stat-number">6+</span>
                <span className="stat-label">Tools</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">100%</span>
                <span className="stat-label">Free</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">24/7</span>
                <span className="stat-label">Available</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-blob-1"></div>
            <div className="hero-blob-2"></div>
            <div className="hero-blob-3"></div>
            <div className="hero-emoji-grid">
              <span>🤖</span>
              <span>🔐</span>
              <span>🎮</span>
            </div>
          </div>
        </section>

        <section className="features-section">
          <div className="section-header">
            <h2 className="section-title">Các Công Cụ Của Chúng Tôi</h2>
            <p className="section-subtitle">
              Khám phá bộ sưu tập đầy đủ các công cụ được cung cấp bởi AI
            </p>
          </div>

          <div className="features-grid">
            {features.map((feature, index) => (
              <FeatureCard
                key={index}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                buttonText={feature.buttonText}
                link={feature.link}
                badge={feature.badge}
                delay={feature.delay}
              />
            ))}
          </div>
        </section>

        <section className="cta-section">
          <div className="cta-content">
            <h2 className="cta-title">Sẵn Sàng Bắt Đầu?</h2>
            <p className="cta-description">
              Chọn công cụ bạn muốn sử dụng và bắt đầu ngay hôm nay - hoàn toàn miễn phí!
            </p>

            <div className="cta-buttons">
              <NavLink to="/auth" className="btn-primary">
                Vào Màn Hình Auth
              </NavLink>
              <NavLink to="/memory-game" className="btn-secondary">
                Chơi Game
              </NavLink>
            </div>
          </div>

          <div className="cta-background">
            <div className="gradient-ball-1"></div>
            <div className="gradient-ball-2"></div>
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

function AISEOFallbackPage() {
  return <Navigate to="/" replace />;
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
    path: '/seo-keywords',
    element: <SEOKeywords />,
    title: 'SEO Keywords cần tài khoản để lưu và đồng bộ dữ liệu.',
    description: 'Công cụ này có thể tạo nội dung gắn với lịch sử sử dụng, nên mình yêu cầu đăng nhập để giữ trải nghiệm nhất quán.',
    details: [
      'Lưu lịch sử kết quả',
      'Đồng bộ dữ liệu cá nhân',
      'Truy cập tài nguyên đầy đủ',
    ],
    loginLabel: 'Đăng nhập để dùng SEO Keywords',
  },
  // {
  //   path: '/watermark',
  //   element: <Watermark />,
  //   title: 'Watermark Tool cần đăng nhập để lưu trạng thái làm việc.',
  //   description: 'Trang này có thể xử lý dữ liệu người dùng và cần phiên đăng nhập để đồng bộ thao tác an toàn hơn.',
  //   details: [
  //     'Bảo toàn lịch sử thao tác',
  //     'Đồng bộ dữ liệu cá nhân',
  //     'Giữ phiên làm việc ổn định',
  //   ],
  //   loginLabel: 'Đăng nhập để mở Watermark',
  // },
  {
    path: '/memory-game',
    element: <MemoryGame />,
    title: 'Memory Game cần đăng nhập để theo dõi tiến trình.',
    description: 'Mình yêu cầu xác thực để giữ điểm số, trạng thái và lịch sử chơi của bạn đồng bộ giữa các phiên.',
    details: [
      'Lưu điểm số tốt nhất',
      'Theo dõi tiến trình chơi',
      'Đồng bộ qua nhiều phiên',
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
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/aiseo" element={<AISEO />} />
            <Route path="/watermark" element={<Watermark />} />
            <Route path="/watermark/doantrang" element={<DoanTrangWatermarkPage />} />
            <Route path="/watermark/dashboard" element={<WatermarkDashboardPage />} />
            <Route path="/quotation" element={<Navigate to="/admin/bao-gia/tao-moi" replace />} />
            <Route path="/admin/bao-gia" element={<ProtectedRoute title="Quản lý báo giá cần đăng nhập." description="Khu vực dành cho nhân viên và quản trị viên." details={['Lưu và chỉnh sửa báo giá', 'Xuất Excel, PDF và in A4']} loginLabel="Đăng nhập để quản lý báo giá"><QuotationList /></ProtectedRoute>} />
            <Route path="/admin/bao-gia/tao-moi" element={<ProtectedRoute title="Tạo báo giá cần đăng nhập." description="Khu vực dành cho nhân viên và quản trị viên." details={['Tạo báo giá theo mẫu công ty']} loginLabel="Đăng nhập để tạo báo giá"><Quotation /></ProtectedRoute>} />
            <Route path="/admin/bao-gia/:id/chinh-sua" element={<ProtectedRoute title="Chỉnh sửa báo giá cần đăng nhập." description="Khu vực dành cho nhân viên và quản trị viên." details={['Chỉnh sửa báo giá đã lưu']} loginLabel="Đăng nhập để chỉnh sửa"><Quotation /></ProtectedRoute>} />
            <Route path="/seo-excel-generator" element={<SeoExcelGenerator />} />
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
        </main>

        {!isAuthPage && <Footer />}
        {!isAuthPage && <ScrollToTopButton />}
      </div>
    </HelmetProvider>
  );
}
