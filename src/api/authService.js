const API_BASE = 'http://localhost:5000/api/auth';

export async function registerUser({ username, email, password, full_name }) {
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                email,
                password,
                full_name: full_name || null
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Đăng ký thất bại');
        }

        return {
            success: true,
            data: data.data
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

export async function loginUser({ username, email, password }) {
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username || null,
                email: email || null,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Đăng nhập thất bại');
        }

        // Lưu token vào localStorage
        if (data.token) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
        }

        return {
            success: true,
            data: data
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

export function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
}

export function getAuthToken() {
    return localStorage.getItem('authToken');
}

export function getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

export function isAuthenticated() {
    return !!getAuthToken();
}
