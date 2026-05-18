import { Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { AuthRequest } from '../types/express.d';

type ValidateTarget = 'body' | 'query' | 'params';

export const validate = (schema: ZodSchema, target: ValidateTarget = 'body') => {
    return (req: AuthRequest, _res: Response, next: NextFunction): void => {
        try {
            const data = schema.parse(req[target]);
            req[target] = data;
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                const errors = error.issues.map((e: z.ZodIssue) => ({
                    field: e.path.join('.'),
                    message: e.message,
                }));

                _res.status(422).json({
                    success: false,
                    message: 'Validation failed',
                    errors,
                });
                return;
            }
            next(error);
        }
    };
};
