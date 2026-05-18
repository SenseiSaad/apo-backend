import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAvailabilitySlot {
    day_of_week: number; // 0-6 (Sunday-Saturday)
    start_time: string; // HH:mm format
    end_time: string;
    timezone?: string;
    video_link?: string;
    is_available?: boolean;
}

export interface IDoctorPersonalInfo {
    full_name?: string;
    phone_number?: string;
    timezone?: string;
    profile_photo_url?: string;
}

export interface IDoctorProfessionalInfo {
    bio?: string;
    credentials?: string[];
    years_experience?: number;
    session_modalities?: Array<'video' | 'text' | 'either'>;
}

export interface IDoctorPortalSettings {
    email_notifications: boolean;
    push_notifications: boolean;
    booking_notifications: boolean;
    ai_content_notifications: boolean;
    default_session_duration_mins: number;
    can_onboard_assistants: boolean;
    max_assistants: number;
}

export interface IDoctor extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    license_number: string; // Encrypted
    specialty?: string;
    max_patients: number;
    availability: IAvailabilitySlot[];
    personal_info?: IDoctorPersonalInfo;
    professional_info?: IDoctorProfessionalInfo;
    portal_settings: IDoctorPortalSettings;
    credential_status: 'pending' | 'verified' | 'rejected';
    credential_notes?: string;
    invited_by?: mongoose.Types.ObjectId;
    created_at: Date;
    updated_at: Date;
}

const AvailabilitySlotSchema = new Schema<IAvailabilitySlot>({
    day_of_week: { type: Number, required: true, min: 0, max: 6 },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    timezone: { type: String },
    video_link: { type: String },
    is_available: { type: Boolean, default: true }
}, { _id: false });

const DoctorPersonalInfoSchema = new Schema<IDoctorPersonalInfo>({
    full_name: { type: String },
    phone_number: { type: String },
    timezone: { type: String },
    profile_photo_url: { type: String }
}, { _id: false });

const DoctorProfessionalInfoSchema = new Schema<IDoctorProfessionalInfo>({
    bio: { type: String },
    credentials: [{ type: String }],
    years_experience: { type: Number, min: 0, max: 80 },
    session_modalities: [{
        type: String,
        enum: ['video', 'text', 'either']
    }]
}, { _id: false });

const DoctorPortalSettingsSchema = new Schema<IDoctorPortalSettings>({
    email_notifications: { type: Boolean, default: true },
    push_notifications: { type: Boolean, default: true },
    booking_notifications: { type: Boolean, default: true },
    ai_content_notifications: { type: Boolean, default: true },
    default_session_duration_mins: { type: Number, default: 50, min: 15, max: 180 },
    can_onboard_assistants: { type: Boolean, default: false },
    max_assistants: { type: Number, default: 5, min: 0, max: 100 }
}, { _id: false });

const DoctorSchema = new Schema<IDoctor>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        license_number: { type: String, required: true }, // Encrypted
        specialty: { type: String },
        max_patients: { type: Number, default: 20 },
        availability: [AvailabilitySlotSchema],
        personal_info: DoctorPersonalInfoSchema,
        professional_info: DoctorProfessionalInfoSchema,
        portal_settings: {
            type: DoctorPortalSettingsSchema,
            default: () => ({
                email_notifications: true,
                push_notifications: true,
                booking_notifications: true,
                ai_content_notifications: true,
                default_session_duration_mins: 50,
                can_onboard_assistants: false,
                max_assistants: 5
            })
        },
        credential_status: {
            type: String,
            enum: ['pending', 'verified', 'rejected'],
            default: 'pending'
        },
        credential_notes: { type: String },
        invited_by: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'doctors'
    }
);

// Indexes
DoctorSchema.index({ user_id: 1 });
DoctorSchema.index({ credential_status: 1 });

export const Doctor: Model<IDoctor> = mongoose.models.Doctor || mongoose.model<IDoctor>('Doctor', DoctorSchema);
