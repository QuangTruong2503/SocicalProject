import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import AISEO from './pages/AISEO.jsx';
import Watermark from './pages/Watermark.jsx';
import Footer from './components/Footer.jsx';
import Banner from './components/Banner/Banner.jsx';
import Header from './components/Header.jsx';
import MemoryGame from './pages/MemoryGame.jsx';
function HomePage() {
  return (
    <>
      <Helmet>
        <title>Trang Chủ - AISEO</title>
      </Helmet>
      <div className="container py-5">
        <div className="card shadow-sm">
          <div className="card-body">
            <h1 className="card-title">Chào mừng đến với AISEO</h1>
            <p className="card-text">
              Đây là trang chính của ứng dụng. Bạn có thể qua trang AISEO để tạo nội dung cho sản phẩm của mình.
            </p>
            <NavLink to="/aiseo" className="btn btn-primary">
              Mở AISEO
            </NavLink>
          </div>
        </div>
        <div className="card shadow-sm">
          <div className="card-body">
            <h1 className="card-title">Chào mừng đến với Memory Game</h1>
            <p className="card-text">
              Đây là trang chính của ứng dụng. Bạn có thể qua trang Memory Game để chơi trò chơi ghép hình.
            </p>
            <NavLink to="/memory-game" className="btn btn-primary">
              Mở Memory Game
            </NavLink>
          </div>
        </div>


      </div>
    </>
  );
}

function NotFoundPage() {
  return (
    <>
      <Helmet>
        <title>Trang Không Tồn Tại - AISEO</title>
      </Helmet>
      <div className="container py-5">
        <div className="alert alert-warning">Trang không tồn tại.</div>
        <NavLink to="/" className="btn btn-secondary">
          Quay về Trang chủ
        </NavLink>
      </div>
    </>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <div className="bg-light z-1 min-vh-100">
          <Banner />
          <Header />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/aiseo" element={<AISEO />} />
            <Route path="/watermark" element={<Watermark />} />
            <Route path="*" element={<NotFoundPage />} />
            <Route path="/memory-game" element={<MemoryGame />} />
          </Routes>
        </div>
        <Footer />
      </BrowserRouter>
    </HelmetProvider>
  );
}