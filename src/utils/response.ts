import { Response } from 'express';
import { ApiResponse, PaginationMeta, ValidationError } from '../types';

export class ResponseHelper {
    static success<T>(
        res: Response,
        data: T,
        message = 'Success',
        statusCode = 200,
        meta?: PaginationMeta
    ): Response {
        const response: ApiResponse<T> = {
            success: true,
            message,
            data,
            ...(meta && { meta }),
        };
        return res.status(statusCode).json(response);
    }

    static created<T>(res: Response, data: T, message = 'Created successfully'): Response {
        return this.success(res, data, message, 201);
    }

    static error(
        res: Response,
        message: string,
        statusCode = 500,
        errors?: ValidationError[],
        errorCode?: string
    ): Response {
        const response: ApiResponse = {
            success: false,
            message,
            ...(errors && { errors }),
            ...(errorCode && { error: { code: errorCode } }),
        };
        return res.status(statusCode).json(response);
    }

    static badRequest(res: Response, message: string, errors?: ValidationError[]): Response {
        return this.error(res, message, 400, errors);
    }

    static unauthorized(res: Response, message = 'Unauthorized'): Response {
        return this.error(res, message, 401);
    }

    static forbidden(res: Response, message = 'Access denied'): Response {
        return this.error(res, message, 403);
    }

    static notFound(res: Response, message = 'Resource not found'): Response {
        return this.error(res, message, 404);
    }

    static conflict(res: Response, message: string): Response {
        return this.error(res, message, 409);
    }

    static validationError(res: Response, errors: ValidationError[]): Response {
        return this.error(res, 'Validation failed', 422, errors);
    }

    static paginate<T>(
        res: Response,
        data: T[],
        total: number,
        page: number,
        limit: number,
        message = 'Data retrieved successfully'
    ): Response {
        const totalPages = Math.ceil(total / limit);
        const meta: PaginationMeta = {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        };
        return this.success(res, data, message, 200, meta);
    }
}
