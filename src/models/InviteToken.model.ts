import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInviteToken extends Document {
    _id: mongoose.Types.ObjectId;
    email: string;
    token: string;
    patient_id?: mongoose.Types.ObjectId; // Pre-assigned patient record
    doctor_id?: mongoose.Types.ObjectId; // Inviting Doctor
    status: 'pending' | 'accepted' | 'declined' | 'revoked';
    expires_at: Date;
    used_at?: Date;
    declined_at?: Date;
    created_at: Date;
}

const InviteTokenSchema = new Schema<IInviteToken>(
    {
        email: { type: String, required: true },
        token: { type: String, required: true, unique: true },
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient' },
        doctor_id: { type: Schema.Types.ObjectId, ref: 'Doctor' },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined', 'revoked'],
            default: 'pending'
        },
        expires_at: { type: Date, required: true },
        used_at: { type: Date },
        declined_at: { type: Date }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'invite_tokens'
    }
);

// Indexes
InviteTokenSchema.index({ token: 1 });
InviteTokenSchema.index({ email: 1, used_at: 1 });
InviteTokenSchema.index({ doctor_id: 1, created_at: -1 });
InviteTokenSchema.index({ expires_at: 1 });

export const InviteToken: Model<IInviteToken> = mongoose.models.InviteToken || mongoose.model<IInviteToken>('InviteToken', InviteTokenSchema);
