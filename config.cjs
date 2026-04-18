
require('dotenv').config();

const config = {
    database: {
        host: process.env.DATABASE_HOST,
        port: process.env.DATABASE_PORT,
        name: process.env.DATABASE_NAME,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        ssl_ca: process.env.DATABASE_SSL_CA
    },
    auth: {
        jwtSecret: process.env.JWT_SECRET || 'please-change-this-secret',
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h'
    }
};

module.exports = config;
module.exports.default = config;
