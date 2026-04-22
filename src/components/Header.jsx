import React from "react";
import { NavLink } from "react-router-dom";
export default function Header() {
  return (
    <header className="mt-5">
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom">
        <div className="container">
          <NavLink className="navbar-brand" to="/">
            <img
              src="/zeplao.png"
              alt="Logo"
              width="128"
              height="64"
              className="d-inline-block align-text-top me-2 rounded-1"
            />
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
    </header>
  );
}
