import React, { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import AuthForm from './AuthForm';
import { isAuthenticated, getUser, logout } from '../api/authService';

const AuthModal = () => {
    const [showModal, setShowModal] = useState(false);
    const [isAuth, setIsAuth] = useState(false);
    const [user, setUser] = useState(null);

    useEffect(() => {
        checkAuthStatus();
        // Listen for storage changes (logout from another tab)
        window.addEventListener('storage', checkAuthStatus);
        return () => window.removeEventListener('storage', checkAuthStatus);
    }, []);

    const checkAuthStatus = () => {
        setIsAuth(isAuthenticated());
        setUser(getUser());
    };

    const handleLoginSuccess = (userData) => {
        setUser(userData);
        setIsAuth(true);
        setShowModal(false);
    };

    const handleLogout = () => {
        logout();
        setIsAuth(false);
        setUser(null);
    };

    const handleCloseModal = () => {
        setShowModal(false);
    };

    return (
        <>
            {/* Nút Đăng nhập/Đăng ký hoặc Tài khoản */}
            {!isAuth ? (
                <button
                    className="btn btn-primary"
                    onClick={() => setShowModal(true)}
                >
                    Đăng nhập / Đăng ký
                </button>
            ) : (
                <div className="d-flex align-items-center gap-2">
                    <span className="text-muted small">
                        Xin chào, <strong>{user?.username || 'Bạn'}</strong>
                    </span>
                    <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={handleLogout}
                        title="Đăng xuất"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <AuthForm 
                        onSuccess={handleLoginSuccess}
                        onClose={handleCloseModal}
                    />
                </div>
            )}
        </>
    );
};

export default AuthModal;
