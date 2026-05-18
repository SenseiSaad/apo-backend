import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAvatarLibrary extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    patient_id: mongoose.Types.ObjectId;
    streamoji_avatar_id: string;
    avatar_glb_url: string;
    thumbnail_url?: string;
    avatar_gender?: string;
    storage_key: string;
    is_active: boolean;
    streamoji_avatar_url?: string;
    downloaded_at?: Date;
    created_at: Date;
    updated_at: Date;
}

const AvatarLibrarySchema = new Schema<IAvatarLibrary>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
        streamoji_avatar_id: { type: String, required: true },
        avatar_glb_url: { type: String, required: true },
        thumbnail_url: { type: String },
        avatar_gender: { type: String },
        storage_key: { type: String, required: true },
        is_active: { type: Boolean, default: false },
        streamoji_avatar_url: { type: String },
        downloaded_at: { type: Date }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'avatar_library'
    }
);

AvatarLibrarySchema.index({ user_id: 1, created_at: -1 });
AvatarLibrarySchema.index({ user_id: 1, streamoji_avatar_id: 1 }, { unique: true });
AvatarLibrarySchema.index(
    { user_id: 1, is_active: 1 },
    { unique: true, partialFilterExpression: { is_active: true } }
);

export const AvatarLibrary: Model<IAvatarLibrary> =
    mongoose.models.AvatarLibrary || mongoose.model<IAvatarLibrary>('AvatarLibrary', AvatarLibrarySchema);
