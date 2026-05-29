import { z } from 'zod';

export const conversationIdParamSchema = z.object({
    conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID')
});

export const careRequestIdParamSchema = z.object({
    careRequestId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid care request ID')
});

export const listTriageConversationsQuerySchema = z.object({
    status: z.enum(['open', 'closed', 'archived', 'all']).optional().default('open'),
    assistant_user_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid assistant user ID').optional(),
    patient_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid patient ID').optional(),
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

export const triageHandoffSchema = z.object({
    patient_concern: z.string().trim().max(2000).optional(),
    symptoms: z.string().trim().max(2000).optional(),
    urgency: z.string().trim().max(120).optional(),
    preferred_specialty: z.string().trim().max(120).optional(),
    preferred_doctor_gender: z.string().trim().max(40).optional(),
    availability: z.string().trim().max(1000).optional(),
    red_flags: z.string().trim().max(2000).optional(),
    suggested_doctor_type: z.string().trim().max(120).optional(),
    internal_comments: z.string().trim().max(2000).optional()
});

export const updateHandoffNotesSchema = z.object({
    doctor_handoff_notes: z.string().trim().max(6000).optional(),
    doctor_handoff: triageHandoffSchema.optional()
}).refine(
    data => data.doctor_handoff_notes !== undefined || data.doctor_handoff !== undefined,
    { message: 'At least one handoff field is required' }
);

export type ConversationIdParamInput = z.infer<typeof conversationIdParamSchema>;
export type CareRequestIdParamInput = z.infer<typeof careRequestIdParamSchema>;
export type ListTriageConversationsQueryInput = z.infer<typeof listTriageConversationsQuerySchema>;
export type ListMessagesQueryInput = z.infer<typeof listMessagesQuerySchema>;
export type SendTriageMessageInput = z.infer<typeof sendTriageMessageSchema>;
export type UpdateHandoffNotesInput = z.infer<typeof updateHandoffNotesSchema>;
