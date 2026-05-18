import { Request } from 'express';
import { JwtPayload } from '../utils/jwt';

// Extend Express Request to include authenticated user
export interface AuthRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> extends Request<P, ResBody, ReqBody, ReqQuery> {
    user?: JwtPayload;
    requestId?: string;
}

// Re-export for convenience
export type { JwtPayload };
