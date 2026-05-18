import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Hash password
 */
export const hashPassword = async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

/**
 * Compare password
 */
export const comparePassword = async (password: string, hashed: string): Promise<boolean> => {
    return bcrypt.compare(password, hashed);
};

/**
 * Generate a unique booking number like SS-2024-00001
 */
export const generateBookingNumber = (): string => {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
    return `SS-${year}-${random}`;
};

/**
 * Generate a secure random token for password reset / email verification
 */
export const generateSecureToken = (): string => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate verification token (alias for generateSecureToken)
 */
export const generateVerificationToken = (): string => {
    return generateSecureToken();
};

/**
 * Generate OTP (6 digits)
 */
export const generateOTP = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate UUID
 */
export const generateId = (): string => crypto.randomUUID();

/**
 * Calculate trial end date
 */
export const getTrialEndDate = (trialDays: number): Date => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + trialDays);
    return endDate;
};

/**
 * Format date to readable string
 */
export const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

/**
 * Check if a date is in the past
 */
export const isPast = (date: Date): boolean => {
    return new Date() > date;
};

/**
 * Calculate pagination offset
 */
export const getPaginationOffset = (page: number, limit: number): number => {
    return (page - 1) * limit;
};

/**
 * Sanitize pagination params
 */
export const sanitizePagination = (
    page?: number | string,
    limit?: number | string
): { page: number; limit: number } => {
    const parsedPage = Math.max(1, parseInt(String(page || 1)));
    const parsedLimit = Math.min(100, Math.max(1, parseInt(String(limit || 20))));
    return { page: parsedPage, limit: parsedLimit };
};

/**
 * Mask sensitive data for logging
 */
export const maskEmail = (email: string): string => {
    const [user, domain] = email.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
};

/**
 * Convert time string "HH:MM" to minutes
 */
export const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

/**
 * Check time overlap
 */
export const hasTimeOverlap = (
    start1: string,
    end1: string,
    start2: string,
    end2: string
): boolean => {
    const s1 = timeToMinutes(start1);
    const e1 = timeToMinutes(end1);
    const s2 = timeToMinutes(start2);
    const e2 = timeToMinutes(end2);
    return s1 < e2 && e1 > s2;
};
