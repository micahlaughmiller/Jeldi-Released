// Unit tests never touch a real database or need real secrets, but modules read these at import time
process.env.TOKEN_ENCRYPTION_KEY ||= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL ||= "pglite://memory";
process.env.JWT_SECRET ||= "unit-test-jwt-secret-that-is-long-enough-0123456789";
