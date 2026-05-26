import mongoose, { Schema, Document, Model } from 'mongoose';
import { SessionStatus } from './enums';

export interface ISessionBooking extends Document {
    _id: mongoose.Types.ObjectId;
    patient_id?: mongoose.Types.ObjectId;
    doctor_id: mongoose.Types.ObjectId;
    scheduled_at: Date;
    duration_mins: number;
    status: SessionStatus;
    video_link?: string;
    stripe_payment_id?: string;
    notes?: string; // Encrypted, Doctor only
    created_at: Date;
    updated_at: Date;
}

const SessionBookingSchema = new Schema<ISessionBooking>(
    {
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient' },
        doctor_id: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
        scheduled_at: { type: Date, required: true },
        duration_mins: { type: Number, default: 50 },
        status: { type: String, enum: Object.values(SessionStatus), default: SessionStatus.PENDING },
        video_link: { type: String },
        stripe_payment_id: { type: String },
        notes: { type: String } // Encrypted
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'session_bookings'
    }
);

// Indexes
SessionBookingSchema.index({ patient_id: 1, scheduled_at: -1 });
SessionBookingSchema.index({ doctor_id: 1, scheduled_at: 1 });
SessionBookingSchema.index({ status: 1, scheduled_at: 1 });

export const SessionBooking: Model<ISessionBooking> = mongoose.models.SessionBooking || mongoose.model<ISessionBooking>('SessionBooking', SessionBookingSchema);
