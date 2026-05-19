import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAvatarState {
    gender?: 'girl' | 'boy';
    version?: number;
    storage_key?: string;
    glb_url?: string;
    assigned_at?: Date;
    posture: 'slouched' | 'relaxed' | 'upright';
    mood_expression: 'calm' | 'content' | 'joyful';
    outfit: string;
    glow_effect: boolean;
    accessories: string[];
}

export interface IPatient extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    doctor_id?: mongoose.Types.ObjectId;
    doctor_assigned_at?: Date;
    doctor_assigned_by?: mongoose.Types.ObjectId;
    doctor_assignment_source?: 'admin' | 'assistant' | 'invite' | 'system';
    care_status: 'needs_care' | 'assigned' | 'in_treatment' | 'treated' | 'inactive';
    illness_description?: string;
    care_status_updated_at?: Date;
    onboarding_source: 'invite' | 'self_register';
    full_name?: string;
    date_of_birth?: Date;
    phone_number?: string;
    timezone?: string;
    preferences: {
        notifications_enabled: boolean;
        email_notifications: boolean;
        push_notifications: boolean;
        theme?: 'light' | 'dark' | 'system';
    };
    avatar_state: IAvatarState;
    activity_score: number;
    current_streak: number;
    streak_last_date?: Date;
    chat_tokens_used_today: number;
    content_views_today: number;
    last_active?: Date;
    created_at: Date;
    updated_at: Date;
}

const AvatarStateSchema = new Schema<IAvatarState>({
    gender: { type: String, enum: ['girl', 'boy'] },
    version: { type: Number, min: 1, max: 6 },
    storage_key: { type: String },
    glb_url: { type: String },
    assigned_at: { type: Date },
    posture: { type: String, enum: ['slouched', 'relaxed', 'upright'], default: 'slouched' },
    mood_expression: { type: String, enum: ['calm', 'content', 'joyful'], default: 'calm' },
    outfit: { type: String, default: 'default' },
    glow_effect: { type: Boolean, default: false },
    accessories: [{ type: String }]
}, { _id: false });

const PatientPreferencesSchema = new Schema({
    notifications_enabled: { type: Boolean, default: true },
    email_notifications: { type: Boolean, default: true },
    push_notifications: { type: Boolean, default: true },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' }
}, { _id: false });

const PatientSchema = new Schema<IPatient>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        doctor_id: { type: Schema.Types.ObjectId, ref: 'Doctor' },
        doctor_assigned_at: { type: Date },
        doctor_assigned_by: { type: Schema.Types.ObjectId, ref: 'User' },
        doctor_assignment_source: {
            type: String,
            enum: ['admin', 'assistant', 'invite', 'system']
        },
        care_status: {
            type: String,
            enum: ['needs_care', 'assigned', 'in_treatment', 'treated', 'inactive'],
            default: 'needs_care',
            required: true
        },
        illness_description: { type: String, maxlength: 2000 },
        care_status_updated_at: { type: Date },
        onboarding_source: { type: String, enum: ['invite', 'self_register'], required: true },
        full_name: { type: String },
        date_of_birth: { type: Date },
        phone_number: { type: String },
        timezone: { type: String },
        preferences: {
            type: PatientPreferencesSchema,
            default: () => ({
                notifications_enabled: true,
                email_notifications: true,
                push_notifications: true,
                theme: 'system'
            })
        },
        avatar_state: { type: AvatarStateSchema, required: true },
        activity_score: { type: Number, default: 0 },
        current_streak: { type: Number, default: 0 },
        streak_last_date: { type: Date },
        chat_tokens_used_today: { type: Number, default: 0 },
        content_views_today: { type: Number, default: 0 },
        last_active: { type: Date }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'patients'
    }
);

// Indexes
PatientSchema.index({ user_id: 1 });
PatientSchema.index({ doctor_id: 1 });
PatientSchema.index({ care_status: 1, doctor_id: 1 });
PatientSchema.index({ current_streak: -1 });

export const Patient: Model<IPatient> = mongoose.models.Patient || mongoose.model<IPatient>('Patient', PatientSchema);
