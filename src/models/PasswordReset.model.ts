import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPasswordReset extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    token: string;
    expires_at: Date;
    used_at?: Date;
    created_at: Date;
}

const PasswordResetSchema = new Schema<IPasswordReset>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        token: { type: String, required: true },
        expires_at: { type: Date, required: true },
        used_at: { type: Date }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'password_resets'
    }
);

// Indexes
PasswordResetSchema.index({ token: 1 });
PasswordResetSchema.index({ user_id: 1, used_at: 1 });
PasswordResetSchema.index({ expires_at: 1 });

export const PasswordReset: Model<IPasswordReset> = mongoose.models.PasswordReset || mongoose.model<IPasswordReset>('PasswordReset', PasswordResetSchema);
