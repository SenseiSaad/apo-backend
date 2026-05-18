import jwt, { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { Role, Tier } from '../models/enums';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'Apothecary_dev_secret_minimum_32_characters_long';
const JWT_EXPIRES_IN: StringValue | number = (process.env.JWT_EXPIRES_IN || '15m') as StringValue;
const REFRESH_TOKEN_EXPIRES_IN: StringValue | number = (process.env.REFRESH_TOKEN_EXPIRES_IN || '7d') as StringValue;

export interface JwtPayload {
    user_id: string;
    email: string;
    role: Role;
    tier: Tier;
    patient_id?: string;
    doctor_id?: string;
    assistant_id?: string;
    jti: string; // JWT ID for blacklist
    iat?: number;
    exp?: number;
}

export interface TokenPair {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

/**
 * Generate access token (15 minutes)
 */
export const generateAccessToken = (payload: {
    user_id: string;
    email: string;
    role: Role;
    tier: Tier;
    patient_id?: string;
    doctor_id?: string;
    assistant_id?: string;
}): string => {
    const jti = crypto.randomBytes(16).toString('hex');
    
    const options: SignOptions = {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'Apothecary-plus',
        audience: 'Apothecary-client'
    };
    
    return jwt.sign(
        {
            ...payload,
            jti
        },
        JWT_SECRET,
        options
    );
};

/**
 * Generate refresh token (7 days)
 */
export const generateRefreshToken = (user_id: string): string => {
    const options: SignOptions = {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
        issuer: 'Apothecary-plus'
    };
    
    return jwt.sign(
        { user_id },
        JWT_SECRET,
        options
    );
};

/**
 * Verify access token
 */
export const verifyAccessToken = (token: string): JwtPayload => {
    return jwt.verify(token, JWT_SECRET, {
        issuer: 'Apothecary-plus',
        audience: 'Apothecary-client'
    }) as JwtPayload;
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): { user_id: string } => {
    return jwt.verify(token, JWT_SECRET, {
        issuer: 'Apothecary-plus'
    }) as { user_id: string };
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokenPair = (user: {
    user_id: string;
    email: string;
    role: Role;
    tier: Tier;
    patient_id?: string;
    doctor_id?: string;
    assistant_id?: string;
}): TokenPair => {
    const access_token = generateAccessToken(user);
    const refresh_token = generateRefreshToken(user.user_id);
    
    // Calculate expires_in in seconds
    const decoded = jwt.decode(access_token) as JwtPayload;
    const expires_in = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 900;
    
    return {
        access_token,
        refresh_token,
        expires_in
    };
};

/**
 * Get token expiry date
 */
export const getTokenExpiry = (token: string): Date | null => {
    try {
        const decoded = jwt.decode(token) as JwtPayload;
        if (decoded?.exp) {
            return new Date(decoded.exp * 1000);
        }
        return null;
    } catch {
        return null;
    }
};

/**
 * Decode token without verification (for debugging)
 */
export const decodeToken = (token: string): JwtPayload | null => {
    try {
        return jwt.decode(token) as JwtPayload;
    } catch {
        return null;
    }
};
