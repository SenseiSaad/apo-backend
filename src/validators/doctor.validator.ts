import { z } from 'zod';

const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm format');

export const updateDoctorPersonalInfoSchema = z.object({
    full_name: z.string().trim().min(2).max(120).optional(),
    phone_number: z.string().trim().min(7).max(30).optional(),
    timezone: z.string().trim().min(2).max(80).optional(),
    profile_photo_url: z.string().url().optional()
}).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one personal info field is required' }
);

export const updateDoctorProfessionalInfoSchema = z.object({
    license_number: z.string().trim().min(2).max(120).optional(),
    specialty: z.string().trim().min(2).max(120).optional(),
    bio: z.string().trim().max(2000).optional(),
    credentials: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    years_experience: z.number().int().min(0).max(80).optional(),
    session_modalities: z.array(z.enum(['video', 'text', 'either'])).max(3).optional()
}).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one professional info field is required' }
);

export const updateDoctorAvailabilitySchema = z.object({
    availability: z.array(z.object({
        day_of_week: z.number().int().min(0).max(6),
        start_time: hhmmSchema,
        end_time: hhmmSchema,
        timezone: z.string().trim().min(2).max(80).optional(),
        video_link: z.string().url().optional(),
        is_available: z.boolean().optional().default(true)
    }).refine(
        slot => slot.start_time < slot.end_time,
        { message: 'End time must be after start time', path: ['end_time'] }
    )).max(100)
});

export const updateDoctorSettingsSchema = z.object({
    email_notifications: z.boolean().optional(),
    push_notifications: z.boolean().optional(),
    booking_notifications: z.boolean().optional(),
    ai_content_notifications: z.boolean().optional(),
    default_session_duration_mins: z.number().int().min(15).max(180).optional(),
    max_assistants: z.number().int().min(0).max(100).optional()
}).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one settings field is required' }
);

export const invitePatientSchema = z.object({
    email: z.string().email('Invalid email format'),
    note: z.string().trim().max(1000).optional()
});

const AssistantPermissionsSchema = z.object({
    can_view_assigned_patients: z.boolean().optional(),
    can_manage_bookings: z.boolean().optional(),
    can_send_communications: z.boolean().optional()
});

export const createDoctorAssistantSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(12).optional(),
    permissions: AssistantPermissionsSchema.optional(),
    otp_required: z.boolean().optional().default(false)
});

export const DoctorAssistantIdParamSchema = z.object({
    assistantId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Assistant ID')
});

export const updateDoctorAssistantSchema = z.object({
    permissions: AssistantPermissionsSchema.optional(),
    status: z.enum(['active', 'blocked', 'suspended', 'deactivated']).optional()
}).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one Assistant field is required' }
);

export type UpdateDoctorPersonalInfoInput = z.infer<typeof updateDoctorPersonalInfoSchema>;
export type UpdateDoctorProfessionalInfoInput = z.infer<typeof updateDoctorProfessionalInfoSchema>;
export type UpdateDoctorAvailabilityInput = z.infer<typeof updateDoctorAvailabilitySchema>;
export type UpdateDoctorSettingsInput = z.infer<typeof updateDoctorSettingsSchema>;
export type InvitePatientInput = z.infer<typeof invitePatientSchema>;
export type CreateDoctorAssistantInput = z.infer<typeof createDoctorAssistantSchema>;
export type DoctorAssistantIdParamInput = z.infer<typeof DoctorAssistantIdParamSchema>;
export type UpdateDoctorAssistantInput = z.infer<typeof updateDoctorAssistantSchema>;
