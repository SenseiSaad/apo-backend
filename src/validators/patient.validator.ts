import { z } from 'zod';

// Update patient profile
export const updateProfileSchema = z.object({
    full_name: z.string().trim().min(2).max(120).optional(),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD').optional(),
    phone_number: z.string().trim().min(7).max(30).optional(),
    timezone: z.string().trim().min(2).max(80).optional(),
    illness_description: z.string().trim().max(2000).optional(),
    preferences: z.object({
        notifications_enabled: z.boolean().optional(),
        email_notifications: z.boolean().optional(),
        push_notifications: z.boolean().optional(),
        theme: z.enum(['light', 'dark', 'system']).optional()
    }).optional()
}).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one profile field is required' }
);

// Assign initial avatar (onboarding only)
export const assignAvatarSchema = z.object({
    gender: z.enum(['girl', 'boy', 'female', 'male'])
});

export const updateCareStatusSchema = z.object({
    care_status: z.enum(['needs_care', 'treated']),
    illness_description: z.string().trim().max(2000).optional()
});

// Doctor request form (for free users)
export const DoctorRequestSchema = z.object({
    reason: z.string().min(10, 'Please provide at least 10 characters'),
    preferred_specialty: z.string().optional(),
    availability: z.string().optional(),
    additional_notes: z.string().optional()
});

export const patientInviteIdParamSchema = z.object({
    inviteId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid invite ID')
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateCareStatusInput = z.infer<typeof updateCareStatusSchema>;
export type AssignAvatarInput = z.infer<typeof assignAvatarSchema>;
export type DoctorRequestInput = z.infer<typeof DoctorRequestSchema>;
export type PatientInviteIdParamInput = z.infer<typeof patientInviteIdParamSchema>;
