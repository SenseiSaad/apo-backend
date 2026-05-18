import mongoose, { Schema, Document, Model } from 'mongoose';
import { Tier } from './enums';

export interface IAvatarSettings extends Document {
    _id: mongoose.Types.ObjectId;
    key: string;
    avatar_limits: Record<Tier, number>;
    created_at: Date;
    updated_at: Date;
}

const AvatarSettingsSchema = new Schema<IAvatarSettings>(
    {
        key: { type: String, required: true, unique: true, default: 'global' },
        avatar_limits: {
            free: { type: Number, required: true, default: 3 },
            basic: { type: Number, required: true, default: 5 },
            premium: { type: Number, required: true, default: 7 }
        }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'avatar_settings'
    }
);

export const AvatarSettings: Model<IAvatarSettings> =
    mongoose.models.AvatarSettings || mongoose.model<IAvatarSettings>('AvatarSettings', AvatarSettingsSchema);
