export const config = {
    app: {
        name: 'SedationSync',
        version: '1.0.0',
        env: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT || '5000'),
        url: process.env.APP_URL || 'http://localhost:5000',
        clientUrl: process.env.CLIENT_URL || '',
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'fallback-secret',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    },

    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    },

    email: {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT || '587'),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.FROM_EMAIL || 'noreply@Apothecary.com',
        fromName: process.env.FROM_NAME || 'Apothecary',
    },

    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
        messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
    },

    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        region: process.env.AWS_REGION || 'us-east-1',
        s3Bucket: process.env.AWS_S3_BUCKET || 'Apothecary-files',
    },

    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
        apiKey: process.env.CLOUDINARY_API_KEY || '',
        apiSecret: process.env.CLOUDINARY_API_SECRET || '',
        url: process.env.CLOUDINARY_URL || '',
    },

    encryption: {
        key: process.env.ENCRYPTION_KEY || 'fallback-encryption-key-32chars!!',
    },

    trial: {
        days: parseInt(process.env.TRIAL_DAYS || '14'),
    },

    plans: {
        soloProvider: {
            priceId: process.env.STRIPE_PRICE_SOLO_PROVIDER || '',
            amount: parseInt(process.env.PLAN_SOLO_PROVIDER_PRICE || '9900'),
            name: 'Solo Provider',
            interval: 'month',
        },
        dentalOffice: {
            priceId: process.env.STRIPE_PRICE_DENTAL_OFFICE || '',
            amount: parseInt(process.env.PLAN_DENTAL_OFFICE_PRICE || '7900'),
            name: 'Dental Office',
            interval: 'month',
        },
        group: {
            priceId: process.env.STRIPE_PRICE_GROUP_BASE || '',
            memberPriceId: process.env.STRIPE_PRICE_GROUP_MEMBER || '',
            amount: parseInt(process.env.PLAN_GROUP_BASE_PRICE || '19900'),
            memberAmount: parseInt(process.env.PLAN_GROUP_MEMBER_PRICE || '4900'),
            name: 'Anesthesia Group',
            interval: 'month',
        },
        dso: {
            priceId: process.env.STRIPE_PRICE_DSO_BASE || '',
            memberPriceId: process.env.STRIPE_PRICE_DSO_MEMBER || '',
            amount: parseInt(process.env.PLAN_DSO_BASE_PRICE || '29900'),
            memberAmount: parseInt(process.env.PLAN_DSO_MEMBER_PRICE || '5900'),
            name: 'DSO',
            interval: 'month',
        },
    },

    upload: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
    },

    booking: {
        autoExpireHours: 48,     // auto-expire unanswered requests after 48h
        cancellationWindowHours: 24, // cancellation allowed up to 24h before
    },

    ai: {
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        maxFileSizeForScan: 10 * 1024 * 1024, // 10MB
        allowedScanTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    },
};

export type Config = typeof config;
