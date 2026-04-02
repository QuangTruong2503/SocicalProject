import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import AISEO from './pages/AISEO.jsx';
function HomePage() {
  return (
    <div className="container py-5">
      <div className="card shadow-sm">
        <div className="card-body">
          <h1 className="card-title">Chào mừng đến với AISEO</h1>
          <p className="card-text">
            Đây là trang chính của ứng dụng. Bạn có thể qua trang AISEO để tạo nội dung cho sản phẩm của mình.
          </p>
          <Link to="/aiseo" className="btn btn-primary">
            Mở AISEO
          </Link>
        </div>
      </div>

    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="container py-5">
      <div className="alert alert-warning">Trang không tồn tại.</div>
      <Link to="/" className="btn btn-secondary">
        Quay về Trang chủ
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="bg-light min-vh-100">
        <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom">
          <div className="container">
            <Link className="navbar-brand" to="/">
              AISEO App
            </Link>
            <div className="navbar-nav">
              <Link className="nav-link" to="/">
                Trang chủ
              </Link>
              <Link className="nav-link" to="/aiseo">
                AISEO
              </Link>
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/aiseo" element={<AISEO />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}