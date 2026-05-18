import mongoose, { Schema, Document, Model } from 'mongoose';

export type AvatarViewerSessionStatus = 'active' | 'expired' | 'revoked';

export interface IAvatarViewerSession extends Document {
    _id: mongoose.Types.ObjectId;
    session_id: string;
    user_id: mongoose.Types.ObjectId;
    patient_id: mongoose.Types.ObjectId;
    avatar_record_id: mongoose.Types.ObjectId;
    status: AvatarViewerSessionStatus;
    expires_at: Date;
    created_at: Date;
    updated_at: Date;
}

const AvatarViewerSessionSchema = new Schema<IAvatarViewerSession>(
    {
        session_id: { type: String, required: true, unique: true },
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
        avatar_record_id: { type: Schema.Types.ObjectId, ref: 'AvatarLibrary', required: true },
        status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active' },
        expires_at: { type: Date, required: true }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'avatar_viewer_sessions'
    }
);

AvatarViewerSessionSchema.index({ session_id: 1 });
AvatarViewerSessionSchema.index({ user_id: 1, created_at: -1 });
AvatarViewerSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 3600 });

export const AvatarViewerSession: Model<IAvatarViewerSession> =
    mongoose.models.AvatarViewerSession ||
    mongoose.model<IAvatarViewerSession>('AvatarViewerSession', AvatarViewerSessionSchema);
