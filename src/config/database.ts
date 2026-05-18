import mongoose from 'mongoose';
import { logger } from '../utils/logger';

const connectDatabase = async () => {
    try {
        const uri = process.env.DATABASE_URL || '';
        await mongoose.connect(uri);
        logger.info('✅ Database connected successfully');
    } catch (error) {
        logger.error('❌ Database connection failed:', error);
        process.exit(1);
    }
};

export { connectDatabase };
