import { z } from 'zod';

export const conversationIdParamSchema = z.object({
    conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID')
});

export const careRequestIdParamSchema = z.object({
    careRequestId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid care request ID')
});

export const listTriageConversationsQuerySchema = z.object({
    status: z.enum(['open', 'closed', 'archived', 'all']).optional().default('open'),
    page: z.preprocess(
        value => value === undefined ? undefined : Number(value),
        z.number().int().min(1).optional().default(1)
    ),
    limit: z.preprocess(
        value => value === undefined ? undefined : Number(value),
        z.number().int().min(1).max(100).optional().default(50)
    )
});

export const listMessagesQuerySchema = z.object({
    limit: z.preprocess(
        value => value === undefined ? undefined : Number(value),
        z.number().int().min(1).max(100).optional().default(50)
    ),
    before: z.string().datetime().optional()
});

export const sendTriageMessageSchema = z.object({
    body: z.string().trim().min(1).max(4000)
});

export const updateHandoffNotesSchema = z.object({
    doctor_handoff_notes: z.string().trim().max(6000)
});

export type ConversationIdParamInput = z.infer<typeof conversationIdParamSchema>;
export type CareRequestIdParamInput = z.infer<typeof careRequestIdParamSchema>;
export type ListTriageConversationsQueryInput = z.infer<typeof listTriageConversationsQuerySchema>;
export type ListMessagesQueryInput = z.infer<typeof listMessagesQuerySchema>;
export type SendTriageMessageInput = z.infer<typeof sendTriageMessageSchema>;
export type UpdateHandoffNotesInput = z.infer<typeof updateHandoffNotesSchema>;
