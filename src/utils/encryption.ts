import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

// Get encryption key from environment or use a development fallback
const getEncryptionKey = (): Buffer => {
    const envKey = process.env.PHI_ENCRYPTION_KEY;
    
    if (!envKey) {
        console.warn('⚠️  WARNING: PHI_ENCRYPTION_KEY not set. Using development fallback key.');
        // Development fallback - 32 bytes (64 hex chars)
        return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
    }
    
    const key = Buffer.from(envKey, 'hex');
    
    if (key.length !== 32) {
        console.error(`❌ ERROR: PHI_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters). Current length: ${key.length} bytes`);
        console.error('Generate a valid key with: openssl rand -hex 32');
        // Use development fallback
        return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
    }
    
    return key;
};

const KEY = getEncryptionKey();

/**
 * Encrypt sensitive PHI data before storing in database
 * @param text - Plain text to encrypt
 * @returns Encrypted string in format: iv:encryptedData
 */
export function encrypt(text: string): string {
    if (!text) return text;
    
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
        const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt PHI data when retrieving from database
 * @param text - Encrypted string in format: iv:encryptedData
 * @returns Decrypted plain text
 */
export function decrypt(text: string): string {
    if (!text || !text.includes(':')) return text;
    
    try {
        const [ivHex, encryptedHex] = text.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const encryptedText = Buffer.from(encryptedHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Hash sensitive data for comparison (one-way)
 * @param text - Text to hash
 * @returns SHA-256 hash
 */
export function hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Fields that must be encrypted before DB storage (HIPAA requirement)
 */
export const ENCRYPTED_FIELDS = {
    USER: ['email', 'stripeCustomerId', 'mfaSecret'],
    Doctor: ['licenseNumber'],
    ACTIVITY: ['instructions', 'doctorNote'],
    CHAT_MESSAGE: ['content'],
    AI_EMBEDDING: ['chunkText'],
    SESSION: ['notes']
};
