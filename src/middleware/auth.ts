import { Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { redisService } from '../services/redis.service';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { AuthRequest } from '../types/express';
import { Role, Tier } from '../models/enums';

/**
 * Verify JWT middleware
 * 1. Extract Bearer token
 * 2. Verify JWT signature
 * 3. Check Redis blacklist
 * 4. Attach decoded payload to req.user
 */
export const verifyJWT = async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
        // Extract token from Authorization header
        let token: string | undefined;
        if (req.headers.authorization?.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            throw new UnauthorizedError('Not authorized to access this route');
        }

        // Verify JWT
        let decoded: JwtPayload;
        try {
            decoded = verifyAccessToken(token);
        } catch (error: any) {
            if (error.name === 'TokenExpiredError') {
                throw new UnauthorizedError('TOKEN_EXPIRED');
            }
            throw new UnauthorizedError('Invalid token');
        }

        // Check if token is blacklisted (logged out)
        const isBlacklisted = await redisService.isTokenBlacklisted(decoded.jti);
        if (isBlacklisted) {
            throw new UnauthorizedError('Token has been revoked');
        }

        // Attach user to request
        req.user = decoded;

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Require specific roles
 * Usage: router.get('/admin', verifyJWT, requireRole([Role.SUPER_ADMIN]), ...)
 */
export const requireRole = (allowedRoles: Role[]) => {
    return (req: AuthRequest, _res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new UnauthorizedError('Not authenticated'));
        }

        if (!allowedRoles.includes(req.user.role)) {
            return next(new ForbiddenError(`Role ${req.user.role} is not authorized to access this route`));
        }

        next();
    };
};

/**
 * Require specific tier (for premium features)
 * Usage: router.post('/sessions/book', verifyJWT, requireTier([Tier.PREMIUM]), ...)
 */
export const requireTier = (allowedTiers: Tier[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new UnauthorizedError('Not authenticated'));
        }

        if (!allowedTiers.includes(req.user.tier)) {
            return res.status(403).json({
                success: false,
                code: 'UPGRADE_REQUIRED',
                message: `This feature requires ${allowedTiers.join(' or ')} tier`,
                required_tier: allowedTiers[0]
            });
        }

        next();
    };
};

// Backward compatibility aliases
export const authenticate = verifyJWT;
export const authorize = requireRole;
