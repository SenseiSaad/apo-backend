import { z } from 'zod';
import { Role } from '../models/enums';

// Register validation
export const registerSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    role: z.nativeEnum(Role),
    invite_token: z.string().optional(),
    illness_description: z.string().trim().max(2000).optional()
});

// Login validation
export const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
    mfa_code: z.string().length(6, 'MFA code must be 6 digits').optional()
});

// Email verification
export const verifyEmailSchema = z.object({
    user_id: z.string().min(1, 'User ID is required'),
    otp: z.string().length(6, 'OTP must be 6 digits')
});

// Resend OTP
export const resendOtpSchema = z.object({
    email: z.string().email('Invalid email format')
});

// MFA Setup
export const mfaSetupSchema = z.object({
    password: z.string().min(1, 'Password is required')
});

// MFA Verify
export const mfaVerifySchema = z.object({
    code: z.string().length(6, 'MFA code must be 6 digits')
});

// MFA Disable
export const mfaDisableSchema = z.object({
    password: z.string().min(1, 'Password is required'),
    code: z.string().length(6, 'MFA code must be 6 digits')
});

// Forgot password
export const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email format')
});

// Reset password
export const resetPasswordSchema = z.object({
    email: z.string().email('Invalid email format'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
});

// Refresh token
export const refreshTokenSchema = z.object({
    refresh_token: z.string().min(1, 'Refresh token is required')
});

// Invite validation
export const validateInviteSchema = z.object({
    token: z.string().min(1, 'Invite token is required')
});

// Complete invite
export const completeInviteSchema = z.object({
    token: z.string().min(1, 'Invite token is required'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type MfaSetupInput = z.infer<typeof mfaSetupSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ValidateInviteInput = z.infer<typeof validateInviteSchema>;
export type CompleteInviteInput = z.infer<typeof completeInviteSchema>;
