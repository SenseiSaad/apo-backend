import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRefreshToken extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    token: string;
    expires_at: Date;
    created_at: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        token: { type: String, required: true, unique: true },
        expires_at: { type: Date, required: true }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'refresh_tokens'
    }
);

// Indexes
RefreshTokenSchema.index({ token: 1 });
RefreshTokenSchema.index({ user_id: 1 });
RefreshTokenSchema.index({ expires_at: 1 }); // For cleanup cron job

export const RefreshToken: Model<IRefreshToken> = mongoose.models.RefreshToken || mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
