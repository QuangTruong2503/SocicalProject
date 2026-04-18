const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const authModel = require('../models/authModel.cjs');
const config = require('../../config.cjs');

const JWT_SECRET = process.env.JWT_SECRET || config.auth?.jwtSecret || 'please-change-this-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || config.auth?.jwtExpiresIn || '1h';

async function register(req, res) {
    try {
        const { username, email, password, full_name } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username, email và password là bắt buộc.'
            });
        }

        const existingUser = await authModel.findUserByUsernameOrEmail(username, email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'Username hoặc email đã tồn tại.'
            });
        }

        const userId = uuidv4();
        const password_hash = await bcrypt.hash(password, 10);

        await authModel.createUser({ userId, username, email, password_hash, full_name });

        return res.status(201).json({
            success: true,
            message: 'Đăng ký thành công.',
            data: {
                userId,
                username,
                email
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                error: 'Username hoặc email đã tồn tại.'
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Lỗi server: ' + error.message
        });
    }
}

async function logUserActivity(userId, ip_address, user_agent) {
    const description = 'Đăng nhập thành công';
    return authModel.logUserActivity({
        userId,
        action: 'login',
        module: 'auth',
        description,
        ip_address,
        user_agent
    });
}

async function login(req, res) {
    try {
        const { username, email, password } = req.body;
        const identifier = username || email;

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username/email và password là bắt buộc.'
            });
        }

        const user = await authModel.getUserByIdentifier(identifier);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Thông tin đăng nhập không hợp lệ.'
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: 'Thông tin đăng nhập không hợp lệ.'
            });
        }

        const payload = {
            userId: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        logUserActivity(user.user_id, req.ip, req.get('User-Agent')).catch(err => {
            console.error('Lỗi ghi log hoạt động sau login:', err.message || err);
        });

        return res.json({
            success: true,
            token,
            user: {
                userId: user.user_id,
                username: user.username,
                email: user.email,
                role: user.role,
                status: user.status
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Lỗi server: ' + error.message
        });
    }
}

module.exports = {
    register,
    login
};
