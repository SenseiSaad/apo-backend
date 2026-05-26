import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { triageChatService } from './triageChat.service';
import {
    CareRequestIdParamInput,
    ConversationIdParamInput,
    ListMessagesQueryInput,
    ListTriageConversationsQueryInput,
    SendTriageMessageInput,
    UpdateHandoffNotesInput
} from '../../validators/triageChat.validator';

export class TriageChatController {
    async ensureConversation(
        req: AuthRequest<CareRequestIdParamInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await triageChatService.ensureConversationForCareRequest(req.params.careRequestId, req.user!);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async listConversations(
        req: AuthRequest<Record<string, never>, Record<string, never>, Record<string, never>, ListTriageConversationsQueryInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await triageChatService.listConversations(req.user!, req.query);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getConversation(
        req: AuthRequest<ConversationIdParamInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await triageChatService.getConversation(req.params.conversationId, req.user!);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async listMessages(
        req: AuthRequest<ConversationIdParamInput, Record<string, never>, Record<string, never>, ListMessagesQueryInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await triageChatService.listMessages(req.params.conversationId, req.user!, req.query);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async sendMessage(
        req: AuthRequest<ConversationIdParamInput, Record<string, never>, SendTriageMessageInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await triageChatService.sendMessage(req.params.conversationId, req.user!, req.body.body);
            res.status(201).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async markRead(
        req: AuthRequest<ConversationIdParamInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await triageChatService.markRead(req.params.conversationId, req.user!);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updateHandoffNotes(
        req: AuthRequest<ConversationIdParamInput, Record<string, never>, UpdateHandoffNotesInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await triageChatService.updateHandoffNotes(req.params.conversationId, req.user!, req.body.doctor_handoff_notes);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
}

export const triageChatController = new TriageChatController();
