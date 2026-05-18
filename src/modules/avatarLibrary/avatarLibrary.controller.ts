import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { avatarLibraryService } from './avatarLibrary.service';
import {
    AvatarRecordIdParamInput,
    SaveStreamojiAvatarInput
} from '../../validators/avatarLibrary.validator';
import { UnauthorizedError } from '../../utils/errors';

export class AvatarLibraryController {
    async saveAvatar(
        req: AuthRequest<Record<string, never>, Record<string, never>, SaveStreamojiAvatarInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const userId = this.requireUserId(req);
            const result = await avatarLibraryService.saveStreamojiAvatar(userId, req.body);
            res.status(201).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async listAvatars(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = this.requireUserId(req);
            const result = await avatarLibraryService.listAvatars(userId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getActiveAvatar(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = this.requireUserId(req);
            const result = await avatarLibraryService.getActiveAvatar(userId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getLatestAvatar(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = this.requireUserId(req);
            const result = await avatarLibraryService.getLatestAvatar(userId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async setActiveAvatar(req: AuthRequest<AvatarRecordIdParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = this.requireUserId(req);
            const result = await avatarLibraryService.setActiveAvatar(userId, req.params.avatarRecordId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    private requireUserId(req: AuthRequest) {
        const userId = req.user?.user_id;
        if (!userId) {
            throw new UnauthorizedError();
        }
        return userId;
    }
}

export const avatarLibraryController = new AvatarLibraryController();
