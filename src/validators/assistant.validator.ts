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

export type AssistantPatientIdParamInput = z.infer<typeof AssistantPatientIdParamSchema>;
export type AssistantBookingIdParamInput = z.infer<typeof AssistantBookingIdParamSchema>;
export type UpdateAssistantBookingStatusInput = z.infer<typeof updateAssistantBookingStatusSchema>;
export type SendAssistantPatientMessageInput = z.infer<typeof sendAssistantPatientMessageSchema>;
export type AssignAssistantPatientDoctorInput = z.infer<typeof assignAssistantPatientDoctorSchema>;
