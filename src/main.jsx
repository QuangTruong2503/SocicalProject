import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/App.css'
import './styles/Home.css'
import './styles/Brand.css'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import NotificationProvider from './context/NotificationProvider.jsx';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const router=createBrowserRouter([{ path:'*',element:
  <NotificationProvider>
    <App />
    <ToastContainer position="top-right" autoClose={3500} newestOnTop closeOnClick pauseOnHover theme="colored" />
  </NotificationProvider>,
}]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)

