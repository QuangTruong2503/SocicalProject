// Isolated browser QA entry. Never imported by the production app.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter,RouterProvider,Routes,Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ToastContainer } from 'react-toastify';
import { AuthContext } from '../../src/context/authContext.js';
import Users from '../../src/pages/Admin/AdminUsersPage.jsx';
import Products from '../../src/pages/Admin/AdminProductLinksPage.jsx';
import Config from '../../src/pages/Admin/AdminUsageConfig.jsx';
import { installUnifiedUsersBackend,ADMIN } from '../fixtures/unifiedUsersBackend.mjs';
import '../../src/styles/App.css';
import 'react-toastify/dist/ReactToastify.css';
installUnifiedUsersBackend();
const router=createBrowserRouter([{ path:'*',element:<>
  <div style={{ maxWidth:1440,margin:'auto',padding:'24px',fontFamily:'Open Sans, sans-serif' }}>
    <p style={{ fontSize:12,color:'#64748b' }}>Môi trường kiểm thử cục bộ · dữ liệu minh họa · không kết nối database thật</p>
    <Routes><Route path="/admin/users" element={<Users />} /><Route path="/admin/product-links" element={<Products />} /><Route path="/admin/usage" element={<Config />} /></Routes>
  </div><ToastContainer />
</> }]);
createRoot(document.getElementById('root')).render(
  <HelmetProvider><AuthContext.Provider value={{ user:{ id:ADMIN } }}><RouterProvider router={router} /></AuthContext.Provider></HelmetProvider>,
);
