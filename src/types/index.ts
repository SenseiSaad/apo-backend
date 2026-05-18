import { UserStatus, SubscriptionStatus, UserRole, Tier } from '../models/enums';

// ================================
// Auth Types
// ================================
export interface JwtPayload {
    userId: string;
    email: string;
    role: UserRole;
    subscriptionStatus?: SubscriptionStatus;
    iat?: number;
    exp?: number;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

// ================================
// Request Types (extend Express)
// ================================
export interface AuthenticatedUser {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    subscription?: {
        tier: Tier;
        status: SubscriptionStatus;
        trialEndsAt?: Date | null;
        isTrialActive?: boolean;
        trialDaysRemaining?: number | null;
    } | null;
}

// ================================
// API Response Types
// ================================
export interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data?: T;
    meta?: PaginationMeta;
    errors?: ValidationError[];
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}

export interface ValidationError {
    field: string;
    message: string;
}

// ================================
// Pagination
// ================================
export interface PaginationQuery {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
}

// ================================
// Filter Types
// ================================
export interface ProviderSearchFilters {
    state?: string;
    city?: string;
    certifications?: string[];
    availableDate?: string;
    groupAffiliated?: boolean;
    minRate?: number;
    maxRate?: number;
    page?: number;
    limit?: number;
}

export interface BookingFilters {
    status?: string;
    providerId?: string;
    requesterId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
}

// ================================
// Email Types
// ================================
export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

// ================================
// Feature Access
// ================================
export interface FeatureAccess {
    canSearch: boolean;
    canBook: boolean;
    canChat: boolean;
    canViewAnalytics: boolean;
    canManageTeam: boolean;
    canManageMultiLocation: boolean;
    maxTeamMembers: number;
}
