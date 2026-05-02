import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { useState, useEffect } from 'react';
import AISEO from './pages/AISEO.jsx';
import Watermark from './pages/Watermark.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import MemoryGame from './pages/MemoryGame.jsx';
import './styles/App.css';

// Feature Card Component - Reusable
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

// Home Page with Grid Layout
function HomePage() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const features = [
    {
      icon: '🤖',
      title: 'AI SEO Generator',
      description: 'Tạo nội dung SEO-optimized tự động cho sản phẩm, bài viết, và quảng cáo của bạn.',
      buttonText: 'Mở AISEO',
      link: '/aiseo',
      badge: 'Popular',
      delay: 100,
    },
    {
      icon: '🎮',
      title: 'Memory Match Game',
      description: 'Chơi trò chơi ghép hình thú vị, test trí nhớ của bạn với giao diện hiện đại.',
      buttonText: 'Chơi Ngay',
      link: '/memory-game',
      badge: 'New',
      delay: 200,
    },
    {
      icon: '🎨',
      title: 'Watermark Tool',
      description: 'Thêm watermark vào ảnh của bạn để bảo vệ quyền sở hữu trí tuệ.',
      buttonText: 'Mở Tool',
      link: '/watermark',
      badge: null,
      delay: 300,
    },
  ];

  return (
    <>
      <Helmet>
        <title>Trang Chủ - AISEO Tools Suite</title>
        <meta name="description" content="Bộ công cụ AI toàn diện: SEO Generator, Memory Game, Watermark Tool" />
      </Helmet>

      <div className={`home-page-wrapper ${isLoading ? 'loading' : 'loaded'}`}>
        {/* Hero Section */}
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
                <span className="stat-number">3+</span>
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
              <span>🎮</span>
              <span>🎨</span>
            </div>
          </div>
        </section>

        {/* Features Section */}
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

        {/* CTA Section */}
        <section className="cta-section">
          <div className="cta-content">
            <h2 className="cta-title">Sẵn Sàng Bắt Đầu?</h2>
            <p className="cta-description">
              Chọn công cụ bạn muốn sử dụng và bắt đầu ngay hôm nay - hoàn toàn miễn phí!
            </p>

            <div className="cta-buttons">
              <NavLink to="/aiseo" className="btn-primary">
                Khám Phá AISEO
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

// Not Found Page
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

// Main App Component
export default function App() {
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <HelmetProvider>
      <div className="app-container">
        <Header />

        <main className={`app-main ${isHomePage ? 'home-page' : 'content-page'}`}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/aiseo" element={<AISEO />} />
            <Route path="/watermark" element={<Watermark />} />
            <Route path="/memory-game" element={<MemoryGame />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </HelmetProvider>
  );
}