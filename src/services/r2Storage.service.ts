import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AppError } from '../utils/errors';

export class R2StorageService {
    private client?: S3Client;

    async uploadBuffer(key: string, buffer: Buffer, contentType: string) {
        const config = this.getConfig();
        const client = this.getClient(config);

        await client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000, immutable'
        }));

        return {
            storageKey: key,
            url: `${config.publicBaseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
        };
    }

    async deleteObject(key: string) {
        const config = this.getConfig();
        const client = this.getClient(config);

        await client.send(new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: key
        }));
    }

    async getObjectBuffer(key: string) {
        try {
            const config = this.getConfig();
            const client = this.getClient(config);

            const response = await client.send(new GetObjectCommand({
                Bucket: config.bucket,
                Key: key
            }));

            if (!response.Body) {
                throw new AppError(`Storage object is empty: ${key}`, 404);
            }

            // Read stream into buffer
            const stream = response.Body as any;
            const chunks: any[] = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            return {
                buffer: buffer,
                contentType: response.ContentType || 'application/octet-stream'
            };
        } catch (error) {
            console.error('R2 getObjectBuffer error for key:', key, error);
            throw error;
        }
    }

    getPublicUrl(key: string) {
        const config = this.getConfig();
        return `${config.publicBaseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
    }

    private getClient(config: ReturnType<R2StorageService['getConfig']>) {
        if (!this.client) {
            this.client = new S3Client({
                region: 'auto',
                endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId: config.accessKeyId,
                    secretAccessKey: config.secretAccessKey
                }
            });
        }

        return this.client;
    }

    private getConfig() {
        const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
        const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
        const bucket = process.env.CLOUDFLARE_R2_BUCKET;
        const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;

        if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
            throw new AppError('Cloudflare R2 storage is not configured', 500);
        }

        return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
    }
}

export const r2StorageService = new R2StorageService();
