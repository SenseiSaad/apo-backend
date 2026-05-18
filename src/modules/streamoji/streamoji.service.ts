import { BadRequestError, AppError } from '../../utils/errors';

const STREAMOJI_AUTH_URL = 'https://us-central1-streamoji-265f4.cloudfunctions.net/getAuthToken';

type StreamojiAuthResponse = {
    success?: boolean;
    authToken?: string;
    token?: string;
    data?: {
        authToken?: string;
        token?: string;
    };
    error?: string;
    message?: string;
};

export class StreamojiService {
    async createAuthToken(data: {
        userId: string;
        userName: string;
        maxAvatarsCreations?: number;
    }) {
        const clientId = process.env.STREAMOJI_CLIENT_ID;
        const clientSecret = process.env.STREAMOJI_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new AppError('Streamoji credentials are not configured', 500);
        }

        const response = await fetch(STREAMOJI_AUTH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Client-Id': clientId,
                'Client-Secret': clientSecret
            },
            body: JSON.stringify({
                userId: data.userId,
                userName: data.userName,
                ...(data.maxAvatarsCreations
                    ? { maxAvatarsCreations: data.maxAvatarsCreations }
                    : {})
            })
        });

        const payload = await this.parseResponse(response);

        if (!response.ok || payload.success === false) {
            throw new BadRequestError(
                payload.error ||
                payload.message ||
                `Streamoji auth token request failed with status ${response.status}`
            );
        }

        const authToken = this.readAuthToken(payload);

        if (!authToken) {
            throw new AppError('Streamoji response did not include an auth token', 502);
        }

        return {
            authToken,
            expiresInSeconds: 30 * 60
        };
    }

    private async parseResponse(response: Response): Promise<StreamojiAuthResponse> {
        const text = await response.text();

        if (!text) {
            return {};
        }

        try {
            return JSON.parse(text) as StreamojiAuthResponse;
        } catch {
            return { message: text };
        }
    }

    private readAuthToken(payload: StreamojiAuthResponse) {
        return (
            payload.authToken ||
            payload.token ||
            payload.data?.authToken ||
            payload.data?.token ||
            null
        );
    }
}

export const streamojiService = new StreamojiService();
