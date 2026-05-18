import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { chatService } from './chat.service';
import {
    SendMessageInput
} from '../../validators/chat.validator';

export class ChatController {
    /**
     * POST /chat/message
     */
    async sendMessage(req: AuthRequest<Record<string, never>, Record<string, never>, SendMessageInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await chatService.sendMessage(user_id, req.body);
            
            // Check if token limit reached
            if (result.error && result.code === 'DAILY_TOKEN_LIMIT') {
                res.status(429).json({
                    success: false,
                    code: result.code,
                    message: result.message,
                    data: {
                        tokens_used: result.tokens_used,
                        token_limit: result.token_limit
                    }
                });
                return;
            }

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /chat/history
     */
    async getChatHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const session_id = req.query.session_id as string;
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

            const result = await chatService.getChatHistory(user_id, session_id, limit);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /chat/sessions
     */
    async getChatSessions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

            const result = await chatService.getChatSessions(user_id, limit);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /chat/sessions/:id/end
     */
    async endSession(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const session_id = req.params.id;

            const result = await chatService.endSession(user_id, session_id);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }
}

export const chatController = new ChatController();

