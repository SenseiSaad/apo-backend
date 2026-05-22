import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { avatarViewerService } from './avatarViewer.service';
import {
    AvatarViewerCommandInput,
    ViewerSessionIdParamInput
} from '../../validators/avatarViewer.validator';
import { UnauthorizedError } from '../../utils/errors';

export class AvatarViewerController {
    async createSession(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.user_id;
            if (!userId) {
                throw new UnauthorizedError();
            }

            const result = await avatarViewerService.createSession(userId);
            res.status(201).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async resolveSession(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await avatarViewerService.resolveSessionFromAuthHeader(req.headers.authorization);
            res.json({ success: true, data: result.data });
        } catch (error) {
            next(error);
        }
    }

    async extendSession(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const token = req.body.viewerToken;
            const result = await avatarViewerService.extendSession(token);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async streamAvatarGlb(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const sessionToken = typeof req.query.session === 'string' ? req.query.session : '';
            const asset = await avatarViewerService.getAvatarGlb(sessionToken);

            res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
            this.sendGlb(res, asset, 'avatar.glb');
        } catch (error) {
            next(error);
        }
    }

    async streamAnimationGlb(req: Request<{ animationId: string }>, res: Response, next: NextFunction): Promise<void> {
        try {
            const sessionToken = typeof req.query.session === 'string' ? req.query.session : '';
            const sourceUrl = await avatarViewerService.getAnimationSourceUrl(req.params.animationId, sessionToken);

            // Redirect the client directly to the public CDN — no buffer through the dyno.
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.redirect(302, sourceUrl);
        } catch (error) {
            next(error);
        }
    }

    async sendCommand(
        req: AuthRequest<ViewerSessionIdParamInput, Record<string, never>, AvatarViewerCommandInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await avatarViewerService.sendCommand(req.params.sessionId, req.body, req.user);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    private sendGlb(res: Response, asset: { buffer: Buffer; contentType: string }, fileName: string) {
        res.setHeader('Content-Type', asset.contentType);
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.send(asset.buffer);
    }
}

export const avatarViewerController = new AvatarViewerController();
