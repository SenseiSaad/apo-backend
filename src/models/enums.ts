// ================================
// Apothecary - ENUMS
// Clinic Platform
// ================================

export enum Role {
    SUPER_ADMIN = 'super_admin',
    DOCTOR = 'doctor',
    ASSISTANT = 'assistant',
    PATIENT = 'patient'
}

// Alias for backward compatibility
export { Role as UserRole };

export enum Tier {
    FREE = 'free',
    BASIC = 'basic',
    PREMIUM = 'premium'
}

export enum UserStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    BLOCKED = 'blocked',
    SUSPENDED = 'suspended',
    DEACTIVATED = 'deactivated'
}

export enum SubscriptionStatus {
    ACTIVE = 'active',
    PAST_DUE = 'past_due',
    CANCELED = 'canceled',
    GRACE_PERIOD = 'grace_period'
}

export enum ActivityType {
    BREATHING = 'breathing',
    MEDITATION = 'meditation',
    JOURNALING = 'journaling',
    MOOD_CHECKIN = 'mood_checkin',
    READING = 'reading',
    PHYSICAL = 'physical',
    CUSTOM = 'custom'
}

export enum SessionStatus {
    PENDING = 'pending',
    CONFIRMED = 'confirmed',
    CANCELLED = 'cancelled',
    COMPLETED = 'completed'
}

export enum DocumentStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    DEACTIVATED = 'deactivated'
}

export enum NotificationType {
    ACTIVITY_REMINDER = 'activity_reminder',
    SESSION_REMINDER = 'session_reminder',
    STREAK_ALERT = 'streak_alert',
    DOCTOR_MESSAGE = 'doctor_message',
    CRISIS = 'crisis'
}

export enum ContentType {
    ARTICLE = 'article',
    AUDIO = 'audio'
}

export enum ContentTopic {
    ANXIETY = 'anxiety',
    DEPRESSION = 'depression',
    SLEEP = 'sleep',
    RELATIONSHIPS = 'relationships',
    STRESS = 'stress'
}

export enum ContentDifficulty {
    BEGINNER = 'beginner',
    INTERMEDIATE = 'intermediate',
    ADVANCED = 'advanced'
}

export enum AvatarPosture {
    SLOUCHED = 'slouched',
    RELAXED = 'relaxed',
    UPRIGHT = 'upright'
}

export enum AvatarMood {
    CALM = 'calm',
    CONTENT = 'content',
    JOYFUL = 'joyful'
}

export enum AuditAction {
    PATIENT_VIEW = 'patient_view',
    CHAT_SENT = 'chat_sent',
    CHAT_HISTORY_VIEW = 'chat_history_view',
    TIER_UPGRADE = 'tier_upgrade',
    DOCUMENT_APPROVED = 'document_approved',
    DOCUMENT_REJECTED = 'document_rejected',
    SESSION_BOOKED = 'session_booked',
    SESSION_CANCELLED = 'session_cancelled',
    ACTIVITY_COMPLETED = 'activity_completed',
    LOGIN = 'login',
    LOGOUT = 'logout',
    MFA_ENABLED = 'mfa_enabled',
    PASSWORD_RESET = 'password_reset'
}
