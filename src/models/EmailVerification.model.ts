import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmailVerification extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    email: string;
    otp: string;
    expires_at: Date;
    verified_at?: Date;
    created_at: Date;
}

const EmailVerificationSchema = new Schema<IEmailVerification>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        email: { type: String, required: true },
        otp: { type: String, required: true },
        expires_at: { type: Date, required: true },
        verified_at: { type: Date }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'email_verifications'
    }
);

// Indexes
EmailVerificationSchema.index({ user_id: 1, verified_at: 1 });
EmailVerificationSchema.index({ expires_at: 1 });

export const EmailVerification: Model<IEmailVerification> = mongoose.models.EmailVerification || mongoose.model<IEmailVerification>('EmailVerification', EmailVerificationSchema);
