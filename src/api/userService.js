const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
const API_URL = `${serverUrl}/api`;

// Lấy IP và user-agent từ client
const getClientInfo = async () => {
    try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const { ip } = await ipRes.json();
        return {
            ip_address: ip,
            user_agent: navigator.userAgent
        };
    } catch (error) {
        console.error('Lỗi lấy IP client:', error);
        return {
            ip_address: null,
            user_agent: navigator.userAgent
        };
    }
};

// API: Đăng ký tài khoản mới
export const registerUser = async (userData) => {
    try {
        const clientInfo = await getClientInfo();
        
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                ...userData, 
                ...clientInfo 
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Đăng ký thất bại');
        }
        
        return data;
    } catch (error) {
        console.error('Lỗi đăng ký:', error);
        throw error;
    }
};

// API: Lấy thông tin profile
export const getUserProfile = async (userId) => {
    try {
        const response = await fetch(`${API_URL}/users/${userId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Không thể lấy thông tin profile');
        }
        
        return data;
    } catch (error) {
        console.error('Lỗi lấy profile:', error);
        throw error;
    }
};

// API: Cập nhật trạng thái người dùng
export const updateUserStatus = async (userId, status) => {
    try {
        const clientInfo = await getClientInfo();
        
        const response = await fetch(`${API_URL}/users/${userId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status,
                ...clientInfo
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Cập nhật trạng thái thất bại');
        }
        
        return data;
    } catch (error) {
        console.error('Lỗi cập nhật status:', error);
        throw error;
    }
};

// API: Lấy danh sách hoạt động người dùng
export const getActivities = async (options = {}) => {
    try {
        const { 
            module = null, 
            username = null, 
            limit = 50, 
            offset = 0 
        } = options;

        const queryParams = new URLSearchParams();
        
        if (module && module !== 'all') {
            queryParams.append('module', module);
        }
        if (username) {
            queryParams.append('username', username);
        }
        queryParams.append('limit', limit);
        queryParams.append('offset', offset);

        const response = await fetch(`${API_URL}/activities?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Không thể lấy danh sách hoạt động');
        }
        
        return data;
    } catch (error) {
        console.error('Lỗi lấy activities:', error);
        throw error;
    }
};

// API: Lấy danh sách các modules
export const getActivityModules = async () => {
    try {
        const response = await fetch(`${API_URL}/activities/modules`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Không thể lấy danh sách modules');
        }
        
        return data;
    } catch (error) {
        console.error('Lỗi lấy modules:', error);
        throw error;
    }
};