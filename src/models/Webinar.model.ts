import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWebinar extends Document {
    _id: mongoose.Types.ObjectId;
    doctor_id: mongoose.Types.ObjectId;
    title: string;
    description: string;
    scheduled_at: Date;
    capacity: number;
    price: number;
    stripe_product_id?: string;
    join_link?: string;
    created_at: Date;
    updated_at: Date;
}

export interface IWebinarPurchase extends Document {
    _id: mongoose.Types.ObjectId;
    webinar_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    stripe_payment_id: string;
    attended: boolean;
    purchased_at: Date;
}

const WebinarSchema = new Schema<IWebinar>(
    {
        doctor_id: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
        title: { type: String, required: true },
        description: { type: String, required: true },
        scheduled_at: { type: Date, required: true },
        capacity: { type: Number, required: true },
        price: { type: Number, required: true },
        stripe_product_id: { type: String },
        join_link: { type: String }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'webinars'
    }
);

const WebinarPurchaseSchema = new Schema<IWebinarPurchase>(
    {
        webinar_id: { type: Schema.Types.ObjectId, ref: 'Webinar', required: true },
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        stripe_payment_id: { type: String, required: true },
        attended: { type: Boolean, default: false },
        purchased_at: { type: Date, default: Date.now }
    },
    {
        timestamps: false,
        collection: 'webinar_purchases'
    }
);

// Indexes
WebinarSchema.index({ doctor_id: 1, scheduled_at: -1 });
WebinarSchema.index({ scheduled_at: 1 });
WebinarPurchaseSchema.index({ webinar_id: 1, user_id: 1 }, { unique: true });
WebinarPurchaseSchema.index({ user_id: 1 });

export const Webinar: Model<IWebinar> = mongoose.models.Webinar || mongoose.model<IWebinar>('Webinar', WebinarSchema);
export const WebinarPurchase: Model<IWebinarPurchase> = mongoose.models.WebinarPurchase || mongoose.model<IWebinarPurchase>('WebinarPurchase', WebinarPurchaseSchema);
