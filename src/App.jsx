import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import AISEO from './pages/AISEO.jsx';
import Watermark from './pages/Watermark.jsx';
import Footer from './components/Footer.jsx';
import ActivitiesPage from './pages/ActivitiesPage.jsx';
import Header from './components/Header.jsx';
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
      <Header />  
      <div className="bg-light min-vh-100">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/aiseo" element={<AISEO />} />
          <Route path="/watermark" element={<Watermark />} />
          <Route path="/activities" element={<ActivitiesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      <Footer />
    </BrowserRouter>
  );
}