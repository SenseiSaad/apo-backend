import { z } from 'zod';

export const AssistantPatientIdParamSchema = z.object({
    patientId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid patient ID')
});

export const AssistantBookingIdParamSchema = z.object({
    bookingId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid booking ID')
});

export const updateAssistantBookingStatusSchema = z.object({
    status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']),
    note: z.string().trim().max(1000).optional()
});

export const sendAssistantPatientMessageSchema = z.object({
    message: z.string().trim().min(1).max(2000)
});

export const assignAssistantPatientDoctorSchema = z.object({
    doctor_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Doctor ID'),
    force: z.boolean().optional().default(false)
});

export const AssistantCareRequestIdParamSchema = z.object({
    careRequestId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid care request ID')
});

export const assistantCareRequestsQuerySchema = z.object({
    page: z.preprocess(
        value => value === undefined ? undefined : Number(value),
        z.number().int().min(1).optional().default(1)
    ),
    limit: z.preprocess(
        value => value === undefined ? undefined : Number(value),
        z.number().int().min(1).max(200).optional().default(20)
    ),
    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['open', 'new_request', 'triage_claimed', 'triage_in_progress', 'pending_assignment', 'assigned', 'patient_requested_closure']).optional(),
    queue: z.enum(['unclaimed', 'mine', 'pending_assignment', 'all']).optional().default('unclaimed')
});

export const updateAssistantCareRequestTriageSchema = z.object({
    status: z.enum(['triage_in_progress', 'pending_assignment', 'cancelled']).optional(),
    triage_notes: z.string().trim().max(4000).optional()
}).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one triage field is required' }
);

export type AssistantPatientIdParamInput = z.infer<typeof AssistantPatientIdParamSchema>;
export type AssistantBookingIdParamInput = z.infer<typeof AssistantBookingIdParamSchema>;
export type UpdateAssistantBookingStatusInput = z.infer<typeof updateAssistantBookingStatusSchema>;
export type SendAssistantPatientMessageInput = z.infer<typeof sendAssistantPatientMessageSchema>;
export type AssignAssistantPatientDoctorInput = z.infer<typeof assignAssistantPatientDoctorSchema>;
export type AssistantCareRequestIdParamInput = z.infer<typeof AssistantCareRequestIdParamSchema>;
export type AssistantCareRequestsQueryInput = z.infer<typeof assistantCareRequestsQuerySchema>;
export type UpdateAssistantCareRequestTriageInput = z.infer<typeof updateAssistantCareRequestTriageSchema>;
