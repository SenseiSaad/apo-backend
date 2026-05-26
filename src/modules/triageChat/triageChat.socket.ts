import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken, JwtPayload } from '../../utils/jwt';
import { redisService } from '../../services/redis.service';
import { Role } from '../../models/enums';
import { logger } from '../../utils/logger';
import { triageChatService } from './triageChat.service';

type AuthedSocket = Socket & {
    user?: JwtPayload;
};

class TriageChatSocketService {
    private io?: Server;

    attach(server: HttpServer, allowedOrigins: string[]) {
        this.io = new Server(server, {
            path: '/triage-chat/socket.io',
            cors: {
                origin: allowedOrigins,
                credentials: true,
                methods: ['GET', 'POST']
            },
            transports: ['websocket', 'polling']
        });

        this.io.use(async (socket: AuthedSocket, next) => {
            try {
                const token = this.getToken(socket);
                if (!token) {
                    return next(new Error('Unauthorized'));
                }

                const payload = verifyAccessToken(token);
                const blacklisted = await redisService.isTokenBlacklisted(payload.jti);
                if (blacklisted) {
                    return next(new Error('Token revoked'));
                }

                socket.user = payload;
                socket.join(`user:${payload.user_id}`);
                socket.join(`role:${payload.role}`);
                next();
            } catch (error) {
                next(error instanceof Error ? error : new Error('Unauthorized'));
            }
        });

        this.io.on('connection', (socket: AuthedSocket) => {
            socket.emit('triage:connected', {
                user_id: socket.user?.user_id,
                role: socket.user?.role
            });

            socket.on('conversation.join', async (payload: { conversation_id?: string }, ack?: (response: unknown) => void) => {
                try {
                    if (!socket.user || !payload.conversation_id) {
                        throw new Error('Conversation ID is required');
                    }
                    await triageChatService.getConversation(payload.conversation_id, socket.user);
                    socket.join(`triage:${payload.conversation_id}`);
                    ack?.({ success: true });
                } catch (error) {
                    ack?.({ success: false, message: error instanceof Error ? error.message : 'Unable to join conversation' });
                }
            });

            socket.on('conversation.leave', (payload: { conversation_id?: string }) => {
                if (payload.conversation_id) {
                    socket.leave(`triage:${payload.conversation_id}`);
                }
            });

            socket.on('message.send', async (payload: { conversation_id?: string; body?: string }, ack?: (response: unknown) => void) => {
                try {
                    if (!socket.user || !payload.conversation_id || !payload.body?.trim()) {
                        throw new Error('Conversation and message are required');
                    }
                    const result = await triageChatService.sendMessage(payload.conversation_id, socket.user, payload.body.trim());
                    ack?.({ success: true, data: result });
                } catch (error) {
                    ack?.({ success: false, message: error instanceof Error ? error.message : 'Unable to send message' });
                }
            });

            socket.on('message.read', async (payload: { conversation_id?: string }, ack?: (response: unknown) => void) => {
                try {
                    if (!socket.user || !payload.conversation_id) {
                        throw new Error('Conversation ID is required');
                    }
                    const result = await triageChatService.markRead(payload.conversation_id, socket.user);
                    ack?.({ success: true, data: result });
                } catch (error) {
                    ack?.({ success: false, message: error instanceof Error ? error.message : 'Unable to mark read' });
                }
            });

            socket.on('typing.start', async (payload: { conversation_id?: string }) => {
                if (socket.user && payload.conversation_id) {
                    await triageChatService.emitTyping(payload.conversation_id, socket.user, true).catch(() => undefined);
                }
            });

            socket.on('typing.stop', async (payload: { conversation_id?: string }) => {
                if (socket.user && payload.conversation_id) {
                    await triageChatService.emitTyping(payload.conversation_id, socket.user, false).catch(() => undefined);
                }
            });
        });

        triageChatService.setRealtimePublisher((event, payload, rooms) => {
            for (const room of rooms) {
                this.io?.to(room).emit(event, payload);
            }
        });

        logger.info('Triage chat Socket.IO mounted at /triage-chat/socket.io');
    }

    shutdown() {
        this.io?.close();
    }

    private getToken(socket: Socket) {
        const authToken = socket.handshake.auth?.token;
        if (typeof authToken === 'string') {
            return authToken;
        }

        const header = socket.handshake.headers.authorization;
        if (header?.startsWith('Bearer ')) {
            return header.slice(7);
        }

        const queryToken = socket.handshake.query.token;
        return typeof queryToken === 'string' ? queryToken : undefined;
    }
}

export const triageChatSocketService = new TriageChatSocketService();
