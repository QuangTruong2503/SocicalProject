import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import AISEO from './pages/AISEO.jsx';
import Watermark from './pages/Watermark.jsx';
import Footer from './components/Footer.jsx';
function HomePage() {
  return (
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

    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="container py-5">
      <div className="alert alert-warning">Trang không tồn tại.</div>
      <NavLink to="/" className="btn btn-secondary">
        Quay về Trang chủ
      </NavLink>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="bg-light min-vh-100">
        <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom">
          <div className="container">
            <NavLink className="navbar-brand" to="/">
              <img src="/zeplao.png" alt="Logo" width="128" height="64" className="d-inline-block align-text-top me-2 rounded-1" />
            </NavLink>
            <div className="navbar-nav">
              <NavLink className="nav-link" to="/">
                Trang chủ
              </NavLink>
              <NavLink className="nav-link" to="/aiseo">
                AISEO
              </NavLink>
              <NavLink className="nav-link" to="/watermark">
                Watermark
              </NavLink>
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/aiseo" element={<AISEO />} />
          <Route path="/watermark" element={<Watermark />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      <Footer />
    </BrowserRouter>
  );
}