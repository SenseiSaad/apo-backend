import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { videoSessionService } from './videoSession.service';
import {
    AvailableVideoSlotsQueryInput,
    CancelVideoSessionInput,
    CareRequestVideoParamInput,
    CreateVideoSessionInput,
    VideoSessionIdParamInput
} from '../../validators/videoSession.validator';

export class VideoSessionController {
    async listForCareRequest(req: AuthRequest<CareRequestVideoParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await videoSessionService.listForCareRequest(req.params.careRequestId, req.user!);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async availableSlots(
        req: AuthRequest<CareRequestVideoParamInput, Record<string, never>, Record<string, never>, AvailableVideoSlotsQueryInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await videoSessionService.listAvailableSlots(req.params.careRequestId, req.user!, req.query);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async create(req: AuthRequest<Record<string, never>, Record<string, never>, CreateVideoSessionInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await videoSessionService.create(req.user!, req.body);
            res.status(201).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async joinToken(req: AuthRequest<VideoSessionIdParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await videoSessionService.joinToken(req.params.sessionId, req.user!);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async end(req: AuthRequest<VideoSessionIdParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await videoSessionService.end(req.params.sessionId, req.user!);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async cancel(req: AuthRequest<VideoSessionIdParamInput, Record<string, never>, CancelVideoSessionInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await videoSessionService.cancel(req.params.sessionId, req.user!, req.body.reason);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async cleanup(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await videoSessionService.cleanupExpired();
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
}

export const videoSessionController = new VideoSessionController();
