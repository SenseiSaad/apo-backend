import 'dotenv/config';
import './config/newrelic';
import app, { allowedOrigins } from './app';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database';
import { avatarViewerService } from './modules/avatarViewer/avatarViewer.service';
import { triageChatSocketService } from './modules/triageChat/triageChat.socket';
import cron from 'node-cron';

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
        triageChatSocketService.attach(server, allowedOrigins);

        cron.schedule('*/5 * * * *', async () => {
            try {
                const { videoSessionService } = await import('./modules/videoSession/videoSession.service');
                const result = await videoSessionService.cleanupExpired();
                if (result.closed > 0) {
                    logger.info(`Video session cleanup closed ${result.closed} expired session(s)`);
                }
            } catch (error) {
                logger.error('Video session cleanup failed:', error);
            }
        });

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            logger.info(`Received ${signal}. Starting graceful shutdown...`);
            avatarViewerService.shutdownWebSockets();
            triageChatSocketService.shutdown();
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
