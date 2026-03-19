import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import Project1 from './pages/Project1';
import Project2 from './pages/Project2';

function App() {
  return (
    <Router>
      <div className="min-vh-100 bg-light">
        {/* Navbar hiện đại */}
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm mb-4">
          <div className="container">
            <Link className="navbar-brand fw-bold" to="/">
              <i className="bi bi-cpu-fill me-2"></i>MINH TÂM DEV
            </Link>
            <div className="navbar-nav ms-auto d-flex flex-row gap-3">
              <NavLink className={({isActive}) => isActive ? "nav-link active fw-bold" : "nav-link"} to="/">Trang chủ</NavLink>
              <NavLink className={({isActive}) => isActive ? "nav-link active fw-bold" : "nav-link"} to="/project1">Dự án 1</NavLink>
              <NavLink className={({isActive}) => isActive ? "nav-link active fw-bold" : "nav-link"} to="/project2">Dự án 2</NavLink>
            </div>
          </div>
        </nav>

        {/* Khu vực nội dung chính */}
        <div className="container pb-5">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/project1" element={<Project1 />} />
            <Route path="/project2" element={<Project2 />} />
          </Routes>
          
          
        </div>
      </div>
    </Router>
  );
}

export default App;