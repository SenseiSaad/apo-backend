import { z } from 'zod';

const passwordSchema = z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const adminSignupSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: passwordSchema,
    otp_required: z.boolean().optional().default(false)
});

export const adminSigninSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required')
});

export const adminResendSignupOtpSchema = z.object({
    email: z.string().email('Invalid email format')
});

export const adminVerifyOtpSchema = z.object({
    email: z.string().email('Invalid email format'),
    otp: z.string().length(6, 'OTP must be 6 digits')
});

export const adminForgotPasswordSchema = z.object({
    email: z.string().email('Invalid email format')
});

export const adminResetPasswordSchema = z.object({
    email: z.string().email('Invalid email format'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
    password: passwordSchema
});

export const createDoctorAccountSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: passwordSchema.optional(),
    license_number: z.string().trim().min(2, 'License number must be at least 2 characters').optional(),
    specialty: z.string().min(2, 'Specialty must be at least 2 characters').optional(),
    max_patients: z.number().int().min(1).max(500).optional().default(20),
    can_onboard_assistants: z.boolean().optional().default(false),
    max_assistants: z.number().int().min(0).max(100).optional().default(5),
    credential_status: z.enum(['pending', 'verified']).optional().default('pending'),
    credential_notes: z.string().max(1000).optional(),
    otp_required: z.boolean().optional().default(false)
});

export const getActiveDoctorsQuerySchema = z.object({
    page: z.preprocess(
        value => value === undefined ? undefined : Number(value),
        z.number().int().min(1).optional().default(1)
    ),
    limit: z.preprocess(
        value => value === undefined ? undefined : Number(value),
        z.number().int().min(1).max(500).optional().default(20)
    ),
    search: z.string().trim().min(1).max(100).optional(),
    credential_status: z.enum(['pending', 'verified', 'rejected']).optional()
});

export const doctorIdParamSchema = z.object({
    doctorId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Doctor ID')
});

export const updateDoctorCredentialsSchema = z.object({
    license_number: z.string().min(2, 'License number must be at least 2 characters').optional(),
    specialty: z.string().min(2, 'Specialty must be at least 2 characters').optional(),
    max_patients: z.number().int().min(1).max(500).optional(),
    can_onboard_assistants: z.boolean().optional(),
    max_assistants: z.number().int().min(0).max(100).optional(),
    credential_status: z.enum(['pending', 'verified', 'rejected']).optional(),
    credential_notes: z.string().max(1000).optional()
}).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one credential field is required' }
);

export const updateDoctorAccountSchema = z.object({
    status: z.enum(['pending', 'active', 'blocked']).optional(),
    otp_required: z.boolean().optional()
}).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one account field is required' }
);

const AssistantPermissionsSchema = z.object({
    can_view_assigned_patients: z.boolean().optional(),
    can_manage_bookings: z.boolean().optional(),
    can_send_communications: z.boolean().optional()
});

export const createAssistantAccountSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: passwordSchema.optional(),
    assigned_doctor_ids: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Doctor ID')).optional().default([]),
    permissions: AssistantPermissionsSchema.optional(),
    otp_required: z.boolean().optional().default(false)
});

export const getActiveAssistantsQuerySchema = z.object({
    page: z.preprocess(
        value => value === undefined ? undefined : Number(value),
        z.number().int().min(1).optional().default(1)
    ),
    limit: z.preprocess(
        value => value === undefined ? undefined : Number(value),
        z.number().int().min(1).max(500).optional().default(20)
    ),
    search: z.string().trim().min(1).max(100).optional(),
    doctor_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Doctor ID').optional()
});

export const assistantIdParamSchema = z.object({
    assistantId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Assistant ID')
});

export const updateAssistantSchema = z.object({
    permissions: AssistantPermissionsSchema.optional(),
    status: z.enum(['pending', 'active', 'blocked', 'suspended', 'deactivated']).optional(),
    otp_required: z.boolean().optional(),
    must_change_password: z.boolean().optional()
}).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one Assistant field is required' }
);

export const setAssistantDoctorsSchema = z.object({
    doctor_ids: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Doctor ID')).max(100)
});

export const AssistantDoctorParamSchema = z.object({
    assistantId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Assistant ID'),
    doctorId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Doctor ID')
});

export const AssistantSetupTokenSchema = z.object({
    token: z.string().min(32, 'Setup token is required')
});

export const completeAssistantSetupSchema = z.object({
    token: z.string().min(32, 'Setup token is required'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
    password: passwordSchema
});

export type AdminSignupInput = z.infer<typeof adminSignupSchema>;
export type AdminSigninInput = z.infer<typeof adminSigninSchema>;
export type AdminResendSignupOtpInput = z.infer<typeof adminResendSignupOtpSchema>;
export type AdminVerifyOtpInput = z.infer<typeof adminVerifyOtpSchema>;
export type AdminForgotPasswordInput = z.infer<typeof adminForgotPasswordSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type CreateDoctorAccountInput = z.infer<typeof createDoctorAccountSchema>;
export type GetActiveDoctorsQueryInput = z.infer<typeof getActiveDoctorsQuerySchema>;
export type doctorIdParamInput = z.infer<typeof doctorIdParamSchema>;
export type UpdateDoctorCredentialsInput = z.infer<typeof updateDoctorCredentialsSchema>;
export type UpdateDoctorAccountInput = z.infer<typeof updateDoctorAccountSchema>;
export type CreateAssistantAccountInput = z.infer<typeof createAssistantAccountSchema>;
export type GetActiveAssistantsQueryInput = z.infer<typeof getActiveAssistantsQuerySchema>;
export type assistantIdParamInput = z.infer<typeof assistantIdParamSchema>;
export type UpdateAssistantInput = z.infer<typeof updateAssistantSchema>;
export type SetAssistantDoctorsInput = z.infer<typeof setAssistantDoctorsSchema>;
export type AssistantDoctorParamInput = z.infer<typeof AssistantDoctorParamSchema>;
export type AssistantSetupTokenInput = z.infer<typeof AssistantSetupTokenSchema>;
export type CompleteAssistantSetupInput = z.infer<typeof completeAssistantSetupSchema>;
