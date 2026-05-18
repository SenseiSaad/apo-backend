import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { streamojiService } from './streamoji.service';
import { CreateStreamojiAuthTokenInput } from '../../validators/streamoji.validator';

export class StreamojiController {
    async createAuthToken(
        req: AuthRequest<Record<string, never>, Record<string, never>, CreateStreamojiAuthTokenInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const user = req.user;

            if (!user?.user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const userName = req.body.userName || this.defaultUserName(user.email);
            const result = await streamojiService.createAuthToken({
                userId: user.user_id,
                userName,
                maxAvatarsCreations: req.body.maxAvatarsCreations
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    private defaultUserName(email: string) {
        return email.split('@')[0].replace(/[._-]+/g, ' ') || 'Apothecary User';
    }
}

export const streamojiController = new StreamojiController();
