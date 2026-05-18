import mongoose, { Schema, Document, Model } from 'mongoose';
import { Role, Tier, UserStatus } from './enums';

export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    email: string; // Plain text for searching (not PHI)
    password_hash: string;
    role: Role;
    tier: Tier;
    stripe_customer_id?: string; // Encrypted
    mfa_enabled: boolean;
    mfa_secret?: string; // Encrypted TOTP secret
    otp_required: boolean;
    must_change_password: boolean;
    email_verified: boolean;
    status: UserStatus;
    created_at: Date;
    updated_at: Date;
}

const UserSchema = new Schema<IUser>(
    {
        email: { type: String, required: true, unique: true },
        password_hash: { type: String, required: true },
        role: { type: String, enum: Object.values(Role), required: true },
        tier: { type: String, enum: Object.values(Tier), default: Tier.FREE },
        stripe_customer_id: { type: String },
        mfa_enabled: { type: Boolean, default: false },
        mfa_secret: { type: String },
        otp_required: { type: Boolean, default: false },
        must_change_password: { type: Boolean, default: false },
        email_verified: { type: Boolean, default: false },
        status: { type: String, enum: Object.values(UserStatus), default: UserStatus.ACTIVE }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'users'
    }
);

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ stripe_customer_id: 1 }, { sparse: true });

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
