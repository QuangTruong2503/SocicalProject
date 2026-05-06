import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { useTheme } from './hooks/useTheme';
import './styles/auth.css';
import Watermark from './pages/Watermark.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import ScrollToTopButton from './components/ScrollToTopButton.jsx';
import MemoryGame from './pages/MemoryGame.jsx';
import SEOKeywords from './pages/SEOKeywords.jsx';
import AuthPage from './pages/AuthPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PublicRoute from './components/PublicRoute.jsx';
import { fetchPublicMemoryCards } from './services/memoryCardService.js';

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
  const [publicCards, setPublicCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardsError, setCardsError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadPublicCards() {
      setCardsLoading(true);

      const result = await fetchPublicMemoryCards();

      if (!isMounted) {
        return;
      }

      if (result.error) {
        setCardsError(result.error);
        setPublicCards([]);
      } else {
        setPublicCards(result.data ?? []);
        setCardsError('');
      }

      setCardsLoading(false);
    }

    loadPublicCards();

    return () => {
      isMounted = false;
    };
  }, []);

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
                <span className="stat-number">4+</span>
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

        <section className="features-section">
          <div className="section-header">
            <h2 className="section-title">Memory Cards Công Khai</h2>
            <p className="section-subtitle">
              Danh sách này được tải từ service layer mới của bảng <code>memory_cards</code>.
            </p>
          </div>

          {cardsLoading ? (
            <p className="feature-description">Đang tải memory cards...</p>
          ) : cardsError ? (
            <p className="feature-description">Không thể tải memory cards: {cardsError}</p>
          ) : publicCards.length === 0 ? (
            <p className="feature-description">Chưa có memory card nào trong Supabase.</p>
          ) : (
            <ul className="feature-description">
              {publicCards.slice(0, 6).map((card) => (
                <li key={card.id}>
                  Card #{card.id} - {card.image}
                </li>
              ))}
            </ul>
          )}
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

export default function App() {
  const location = useLocation();
  const { theme } = useTheme();
  const isHomePage = location.pathname === '/';
  const isAuthPage = location.pathname === '/auth';

  return (
    <HelmetProvider>
      <div className={`app-container theme-${theme}`} data-theme={theme}>
        {!isAuthPage && <Header />}

        <main className={`app-main ${isHomePage ? 'home-page' : 'content-page'} ${isAuthPage ? 'auth-page-shell' : ''}`}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/aiseo" element={<AISEOFallbackPage />} />
            <Route path="/watermark" element={<Watermark />} />
            <Route path="/memory-game" element={<MemoryGame />} />
            <Route path="/seo-keywords" element={<SEOKeywords />} />
            <Route
              path="/auth"
              element={(
                <PublicRoute>
                  <AuthPage />
                </PublicRoute>
              )}
            />
            <Route
              path="/dashboard"
              element={(
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              )}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        {!isAuthPage && <Footer />}
        {!isAuthPage && <ScrollToTopButton />}
      </div>
    </HelmetProvider>
  );
}
