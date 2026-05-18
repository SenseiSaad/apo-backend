import { z } from 'zod';

export const notificationIdParamsSchema = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid notification ID'),
});

export const getNotificationsQuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    unread: z.enum(['true', 'false']).optional(),
});

// Keep old exports for backward compatibility (deprecated)
export const notificationIdValidator = notificationIdParamsSchema;
export const getNotificationsValidator = getNotificationsQuerySchema;
