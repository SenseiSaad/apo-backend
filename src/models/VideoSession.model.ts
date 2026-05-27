import mongoose, { Schema, Document, Model } from 'mongoose';

export type VideoSessionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled' | 'expired' | 'missed';

export interface IVideoSession extends Document {
    _id: mongoose.Types.ObjectId;
    care_request_id: mongoose.Types.ObjectId;
    patient_id: mongoose.Types.ObjectId;
    doctor_id: mongoose.Types.ObjectId;
    slot_id: mongoose.Types.ObjectId;
    created_by: mongoose.Types.ObjectId;
    status: VideoSessionStatus;
    scheduled_start_at: Date;
    scheduled_end_at: Date;
    max_duration_minutes: number;
    agora_channel_name: string;
    patient_uid: number;
    doctor_uid: number;
    patient_joined_at?: Date;
    doctor_joined_at?: Date;
    started_at?: Date;
    ended_at?: Date;
    cancelled_at?: Date;
    cancel_reason?: string;
    last_presence_at?: Date;
    created_at: Date;
    updated_at: Date;
}

const VideoSessionSchema = new Schema<IVideoSession>(
    {
        care_request_id: { type: Schema.Types.ObjectId, ref: 'CareRequest', required: true, index: true },
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
        doctor_id: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
        slot_id: { type: Schema.Types.ObjectId, ref: 'SessionBooking', required: true, unique: true, index: true },
        created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: {
            type: String,
            enum: ['scheduled', 'active', 'completed', 'cancelled', 'expired', 'missed'],
            default: 'scheduled',
            required: true,
            index: true
        },
        scheduled_start_at: { type: Date, required: true, index: true },
        scheduled_end_at: { type: Date, required: true, index: true },
        max_duration_minutes: { type: Number, default: 50, min: 1, max: 50 },
        agora_channel_name: { type: String, required: true, unique: true },
        patient_uid: { type: Number, required: true },
        doctor_uid: { type: Number, required: true },
        patient_joined_at: { type: Date },
        doctor_joined_at: { type: Date },
        started_at: { type: Date },
        ended_at: { type: Date },
        cancelled_at: { type: Date },
        cancel_reason: { type: String, maxlength: 1000 },
        last_presence_at: { type: Date }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'video_sessions'
    }
);

VideoSessionSchema.index({ care_request_id: 1, scheduled_start_at: -1 });
VideoSessionSchema.index({ patient_id: 1, status: 1, scheduled_start_at: 1 });
VideoSessionSchema.index({ doctor_id: 1, status: 1, scheduled_start_at: 1 });
VideoSessionSchema.index({ status: 1, scheduled_end_at: 1 });

export const VideoSession: Model<IVideoSession> = mongoose.models.VideoSession || mongoose.model<IVideoSession>('VideoSession', VideoSessionSchema);
