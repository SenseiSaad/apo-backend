import rateLimit from 'express-rate-limit';
import { Request } from 'express';

export const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests. Please try again later.',
    },
    skip: (req: Request) => {
        // Skip rate limiting for health check
        return req.path === '/health';
    },
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // stricter for auth endpoints
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many auth attempts. Please try again in 15 minutes.',
    },
});

export const strictRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many attempts. Please try again in an hour.',
    },
});
