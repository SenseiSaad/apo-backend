import 'dotenv/config';
import './config/newrelic';
import app from './app';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database';
import { avatarViewerService } from './modules/avatarViewer/avatarViewer.service';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
    try {
        // Connect to database
        await connectDatabase();
        logger.info('✅ Database connected successfully');

        // Connect to Redis (optional)
        try {
            const { redisService } = await import('./services/redis.service');
            await redisService.connect();
        } catch (error) {
            logger.warn('⚠️  Redis connection failed - continuing without Redis');
        }

        // Start server
        const server = app.listen(PORT, () => {
            logger.info(`🚀 Apothecary API running on port ${PORT}`);
            logger.info(`📍 Environment: ${process.env.NODE_ENV}`);
            logger.info(`🌐 Base URL: ${process.env.APP_URL}`);
        });

        avatarViewerService.attachWebSocketServer(server);

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            logger.info(`Received ${signal}. Starting graceful shutdown...`);
            avatarViewerService.shutdownWebSockets();
            server.close(async () => {
                const mongoose = await import('mongoose');
                await mongoose.disconnect();
                
                const { redisService } = await import('./services/redis.service');
                await redisService.disconnect();
                
                logger.info('Server and database connections closed.');
                process.exit(0);
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            process.exit(1);
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Only run bootstrap in non-serverless environmentss
if (process.env.VERCEL !== '1') {
    bootstrap();
}

// Export for Vercel serverless
export default app;
