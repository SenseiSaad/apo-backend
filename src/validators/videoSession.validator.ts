import { z } from 'zod';

export const careRequestVideoParamSchema = z.object({
    careRequestId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid care request ID')
});

export const videoSessionIdParamSchema = z.object({
    sessionId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid video session ID')
});

export const createVideoSessionSchema = z.object({
    care_request_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid care request ID'),
    slot_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid slot ID')
});

export const availableVideoSlotsQuerySchema = z.object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid start date').optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid end date').optional()
});

export const cancelVideoSessionSchema = z.object({
    reason: z.string().trim().max(1000).optional()
});

export type CareRequestVideoParamInput = z.infer<typeof careRequestVideoParamSchema>;
export type VideoSessionIdParamInput = z.infer<typeof videoSessionIdParamSchema>;
export type CreateVideoSessionInput = z.infer<typeof createVideoSessionSchema>;
export type AvailableVideoSlotsQueryInput = z.infer<typeof availableVideoSlotsQuerySchema>;
export type CancelVideoSessionInput = z.infer<typeof cancelVideoSessionSchema>;
