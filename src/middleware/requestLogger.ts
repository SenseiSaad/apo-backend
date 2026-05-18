import { Request, Response, NextFunction } from 'express';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

export const requestLogger = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const requestId = generateId();
    (req as any).requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info({
            requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });
    });

    next();
};
