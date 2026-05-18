import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

class RedisService {
    private client: RedisClientType | null = null;
    private isConnected: boolean = false;

    async connect(): Promise<void> {
        if (this.isConnected && this.client) {
            return;
        }

        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            
            this.client = createClient({
                url: redisUrl,
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > 10) {
                            logger.error('Redis: Max reconnection attempts reached');
                            return new Error('Max reconnection attempts reached');
                        }
                        return Math.min(retries * 100, 3000);
                    }
                }
            });

            this.client.on('error', (err) => {
                logger.error('Redis Client Error:', err);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                logger.info('✅ Redis connected');
                this.isConnected = true;
            });

            this.client.on('disconnect', () => {
                logger.warn('⚠️  Redis disconnected');
                this.isConnected = false;
            });

            await this.client.connect();
        } catch (error) {
            logger.warn('⚠️  Redis not available - using in-memory fallback');
            logger.warn('For production, please install and configure Redis');
            // Don't throw error - allow app to continue without Redis
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.isConnected = false;
            logger.info('Redis disconnected');
        }
    }

    getClient(): RedisClientType {
        if (!this.client || !this.isConnected) {
            logger.warn('Redis not connected - operation skipped');
            throw new Error('Redis client not connected');
        }
        return this.client;
    }

    // JWT Blacklist methods
    async blacklistToken(jti: string, expiresIn: number): Promise<void> {
        try {
            const key = `jwt:blacklist:${jti}`;
            await this.getClient().setEx(key, expiresIn, '1');
        } catch (error) {
            logger.warn('Redis blacklist failed - token not blacklisted');
        }
    }

    async isTokenBlacklisted(jti: string): Promise<boolean> {
        try {
            const key = `jwt:blacklist:${jti}`;
            const result = await this.getClient().get(key);
            return result !== null;
        } catch (error) {
            logger.warn('Redis check failed - assuming token not blacklisted');
            return false;
        }
    }

    // Rate limiting methods
    async incrementRateLimit(key: string, ttl: number): Promise<number> {
        const client = this.getClient();
        const count = await client.incr(key);
        
        if (count === 1) {
            await client.expire(key, ttl);
        }
        
        return count;
    }

    async getRateLimit(key: string): Promise<number> {
        const result = await this.getClient().get(key);
        return result ? parseInt(result, 10) : 0;
    }

    // Chat token tracking
    async getChatTokensUsedToday(patient_id: string): Promise<number> {
        try {
            const today = new Date().toISOString().split('T')[0];
            const key = `chat:tokens:${patient_id}:${today}`;
            const result = await this.getClient().get(key);
            return result ? parseInt(result, 10) : 0;
        } catch (error) {
            logger.warn('Redis getChatTokensUsedToday failed - returning 0');
            return 0;
        }
    }

    async incrementChatTokens(patient_id: string, tokens: number): Promise<number> {
        const today = new Date().toISOString().split('T')[0];
        const key = `chat:tokens:${patient_id}:${today}`;
        const client = this.getClient();
        
        const count = await client.incrBy(key, tokens);
        
        // Set expiry to end of day
        const now = new Date();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const ttl = Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
        
        if (count === tokens) {
            await client.expire(key, ttl);
        }
        
        return count;
    }

    // Content views tracking
    async getContentViewsToday(patient_id: string): Promise<number> {
        try {
            const today = new Date().toISOString().split('T')[0];
            const key = `content:views:${patient_id}:${today}`;
            const result = await this.getClient().get(key);
            return result ? parseInt(result, 10) : 0;
        } catch (error) {
            logger.warn('Redis getContentViewsToday failed - returning 0');
            return 0;
        }
    }

    async incrementContentViews(patient_id: string): Promise<number> {
        const today = new Date().toISOString().split('T')[0];
        const key = `content:views:${patient_id}:${today}`;
        const client = this.getClient();
        
        const count = await client.incr(key);
        
        // Set expiry to end of day
        const now = new Date();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const ttl = Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
        
        if (count === 1) {
            await client.expire(key, ttl);
        }
        
        return count;
    }

    // Generic cache methods
    async set(key: string, value: string, ttl?: number): Promise<void> {
        if (ttl) {
            await this.getClient().setEx(key, ttl, value);
        } else {
            await this.getClient().set(key, value);
        }
    }

    async get(key: string): Promise<string | null> {
        return await this.getClient().get(key);
    }

    async del(key: string): Promise<void> {
        await this.getClient().del(key);
    }

    async exists(key: string): Promise<boolean> {
        const result = await this.getClient().exists(key);
        return result === 1;
    }
}

export const redisService = new RedisService();
