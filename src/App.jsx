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
      description: 'Tao noi dung SEO-optimized tu dong cho san pham, bai viet, va quang cao cua ban.',
      buttonText: 'Mo AISEO',
      link: '/aiseo',
      badge: 'Popular',
      delay: 100,
    },
    {
      icon: '🔐',
      title: 'Authentication',
      description: 'Dang ky, dang nhap va quan ly phien nguoi dung voi Supabase Authentication.',
      buttonText: 'Mo Auth',
      link: '/auth',
      badge: 'New',
      delay: 150,
    },
    {
      icon: '🔍',
      title: 'SEO Keywords Generator',
      description: 'Tao bo tu khoa SEO toan dien cho san pham cua ban.',
      buttonText: 'Mo Tool',
      link: '/seo-keywords',
      badge: 'New',
      delay: 200,
    },
    {
      icon: '🎮',
      title: 'Memory Match Game',
      description: 'Choi tro choi ghep hinh thu vi, test tri nho cua ban voi giao dien hien dai.',
      buttonText: 'Choi Ngay',
      link: '/memory-game',
      badge: 'New',
      delay: 250,
    },
    {
      icon: '🎨',
      title: 'Watermark Tool',
      description: 'Them watermark vao anh cua ban de bao ve quyen so huu tri tue.',
      buttonText: 'Mo Tool',
      link: '/watermark',
      badge: null,
      delay: 300,
    },
  ];

  return (
    <>
      <Helmet>
        <title>Trang Chu - AISEO Tools Suite</title>
        <meta name="description" content="Bo cong cu AI toan dien: SEO Generator, Authentication, Memory Game, Watermark Tool" />
      </Helmet>

      <div className="home-page-wrapper loaded">
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-badge">✨ Welcome to AISEO Suite</div>

            <h1 className="hero-title">
              <span className="gradient-text">Cong Cu AI</span>
              <br />
              Toan Dien Cho Ban
            </h1>

            <p className="hero-subtitle">
              Nang cao hieu suat lam viec voi bo cong cu AI duoc thiet ke than thien, manh me va de su dung.
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
            <h2 className="section-title">Cac Cong Cu Cua Chung Toi</h2>
            <p className="section-subtitle">
              Kham pha bo suu tap day du cac cong cu duoc cung cap boi AI
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
            <h2 className="cta-title">San Sang Bat Dau?</h2>
            <p className="cta-description">
              Chon cong cu ban muon su dung va bat dau ngay hom nay - hoan toan mien phi!
            </p>

            <div className="cta-buttons">
              <NavLink to="/auth" className="btn-primary">
                Vao Man Hinh Auth
              </NavLink>
              <NavLink to="/memory-game" className="btn-secondary">
                Choi Game
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
            <h2 className="section-title">Memory Cards Cong Khai</h2>
            <p className="section-subtitle">
              Danh sach nay duoc tai tu service layer moi cua bang <code>memory_cards</code>.
            </p>
          </div>

          {cardsLoading ? (
            <p className="feature-description">Dang tai memory cards...</p>
          ) : cardsError ? (
            <p className="feature-description">Khong the tai memory cards: {cardsError}</p>
          ) : publicCards.length === 0 ? (
            <p className="feature-description">Chua co memory card nao trong Supabase.</p>
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
        <title>404 - Trang Khong Ton Tai</title>
      </Helmet>

      <div className="error-page-wrapper">
        <div className="error-content">
          <div className="error-code">404</div>
          <h1 className="error-title">Trang Khong Ton Tai</h1>
          <p className="error-description">
            Rat tiec, trang ban dang tim kiem khong duoc tim thay. Co the no da bi xoa hoac URL khong chinh xac.
          </p>

          <NavLink to="/" className="error-button">
            ← Quay ve Trang Chu
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
