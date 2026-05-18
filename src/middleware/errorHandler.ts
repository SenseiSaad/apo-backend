import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { ResponseHelper } from '../utils/response';
import { logger } from '../utils/logger';

export const errorHandler = (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    try {
        // Log unexpected errors
        if (!(err instanceof AppError)) {
            logger.error('Error Trace:', {
                message: err.message,
                status: err.statusCode || err.status || 500,
                name: err.constructor?.name,
                stack: err.stack,
            });
        }

        // 🟢 Case 1: Custom App Errors (Our own errors)
        if (err instanceof AppError) {
            const errorCode = (err as any).code;
            ResponseHelper.error(res, err.message, err.statusCode, err.errors, errorCode);
            return;
        }

        // 🟢 Case 2: Mongoose Database Errors
        if (err.name === 'MongoServerError' && err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] || 'field';
            ResponseHelper.error(res, `This ${field} is already in use`, 409);
            return;
        }

        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors || {}).map((e: any) => ({
                field: e.path,
                message: e.message
            }));
            ResponseHelper.error(res, 'Database validation failed', 400, errors);
            return;
        }

        if (err.name === 'CastError') {
            ResponseHelper.error(res, `Invalid ${err.path}: ${err.value}`, 400);
            return;
        }

        // 🟢 Case 3: Zod Validation Errors (Client input gaps)
        if (err.name === 'ZodError') {
            const errors = (err as any).issues?.map((issue: any) => ({
                field: issue.path.join('.'),
                message: issue.message
            }));
            ResponseHelper.error(res, 'Input validation failed', 422, errors);
            return;
        }

        // 🟢 Case 4: JWT & Authentication Errors
        if (err.name === 'JsonWebTokenError') {
            ResponseHelper.error(res, 'Invalid authentication token', 401);
            return;
        }
        if (err.name === 'TokenExpiredError') {
            ResponseHelper.error(res, 'Authentication token has expired', 401);
            return;
        }

        // 🟢 Case 5: Default Fallback for all other errors
        const status = err.statusCode || err.status || 500;
        const message = err.message || 'An unexpected server error occurred';
        
        ResponseHelper.error(res, message, status);
        
    } catch (criticalError) {
        // If the error handler itself crashes, send a hardcoded JSON response
        console.error('CRITICAL: Error Handler Crashed:', criticalError);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error (Error Handler Failed)',
        });
    }
};
