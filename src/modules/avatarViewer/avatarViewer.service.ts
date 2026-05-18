import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { IncomingMessage } from 'http';
import type { Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import { AvatarLibrary } from '../../models/AvatarLibrary.model';
import { AvatarViewerSession } from '../../models/AvatarViewerSession.model';
import { Patient } from '../../models/Patient.model';
import { User } from '../../models/User.model';
import { Role } from '../../models/enums';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { avatarLibraryService } from '../avatarLibrary/avatarLibrary.service';
import { AvatarViewerCommandInput } from '../../validators/avatarViewer.validator';
import { logger } from '../../utils/logger';
import { r2StorageService } from '../../services/r2Storage.service';

type ViewerTokenPayload = {
    type: 'avatar_viewer_session';
    sessionId: string;
    userId: string;
    patientId: string;
};

type AvatarViewerSocket = WebSocket & {
    isAlive?: boolean;
    sessionId?: string;
};

export class AvatarViewerService {
    private readonly sockets = new Map<string, Set<AvatarViewerSocket>>();
    private webSocketServer?: WebSocketServer;
    private heartbeat?: NodeJS.Timeout;

    async createSession(userId: string) {
        const [user, patient, avatar] = await Promise.all([
            User.findById(userId),
            Patient.findOne({ user_id: userId }),
            AvatarLibrary.findOne({ user_id: userId, is_active: true })
        ]);

        if (!user) {
            throw new NotFoundError('User not found');
        }

        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        if (!avatar) {
            throw new NotFoundError('Active avatar not found');
        }

        const sessionId = crypto.randomUUID();
        const ttlSeconds = Number(process.env.AVATAR_VIEWER_SESSION_TTL_SECONDS || 15 * 60);
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

        await AvatarViewerSession.create({
            session_id: sessionId,
            user_id: user._id,
            patient_id: patient._id,
            avatar_record_id: avatar._id,
            status: 'active',
            expires_at: expiresAt
        });

        const token = this.signViewerToken({
            type: 'avatar_viewer_session',
            sessionId,
            userId,
            patientId: patient._id.toString()
        }, ttlSeconds);
        const viewerBaseUrl = (process.env.AVATAR_VIEWER_BASE_URL || 'https://avatar-viewer.Apothecary.com').replace(/\/+$/, '');

        return {
            sessionId,
            viewerUrl: `${viewerBaseUrl}/viewer?session=${encodeURIComponent(token)}`,
            webSocketUrl: this.buildWebSocketUrl(token),
            token,
            expiresAt,
            expiresInSeconds: ttlSeconds
        };
    }

    async resolveSessionFromAuthHeader(authHeader?: string) {
        const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
        return this.resolveSessionFromToken(token);
    }

    async resolveSessionFromToken(token?: string | null) {
        const payload = this.verifyViewerToken(token);
        const session = await AvatarViewerSession.findOne({ session_id: payload.sessionId });

        if (!session || session.status !== 'active' || session.expires_at <= new Date()) {
            throw new UnauthorizedError('Viewer session is invalid or expired');
        }

        const avatar = await AvatarLibrary.findOne({ _id: session.avatar_record_id, user_id: session.user_id });
        if (!avatar) {
            throw new NotFoundError('Viewer avatar not found');
        }

        return {
            session,
            avatar,
            data: {
                sessionId: session.session_id,
                userId: session.user_id.toString(),
                patientId: session.patient_id.toString(),
                avatar: avatarLibraryService.formatAvatar(avatar, this.buildAvatarProxyUrl(token || '')),
                animations: avatarLibraryService.getAnimationManifest(avatar.avatar_gender, (animation) => (
                    this.buildAnimationProxyUrl(token || '', animation.id)
                )),
                animationCategories: avatarLibraryService.getAnimationCategories(avatar.avatar_gender),
                initialState: {
                    expression: 'calm',
                    animation: avatar.avatar_gender?.toLowerCase() === 'female' ? 'f_idle_01' : 'm_idle_01'
                }
            }
        };
    }

    attachWebSocketServer(server: HttpServer) {
        if (this.webSocketServer) {
            return;
        }

        const webSocketServer = new WebSocketServer({ noServer: true });
        this.webSocketServer = webSocketServer;

        server.on('upgrade', async (request, socket, head) => {
            const url = new URL(request.url || '', 'http://localhost');

            if (url.pathname !== '/avatar-viewer/ws') {
                return;
            }

            try {
                const resolved = await this.resolveSessionFromToken(url.searchParams.get('session'));
                webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
                    this.handleConnection(webSocket as AvatarViewerSocket, request, resolved);
                });
            } catch (error) {
                this.rejectUpgrade(socket, error);
            }
        });

        this.heartbeat = setInterval(() => this.pingSockets(), 30000);
        logger.info('Avatar viewer WebSocket server mounted at /avatar-viewer/ws');
    }

    async sendCommand(sessionId: string, command: AvatarViewerCommandInput, actor?: { user_id: string; role: Role }) {
        const session = await AvatarViewerSession.findOne({ session_id: sessionId });

        if (!session || session.status !== 'active' || session.expires_at <= new Date()) {
            throw new NotFoundError('Active viewer session not found');
        }

        if (actor?.role === Role.PATIENT && session.user_id.toString() !== actor.user_id) {
            throw new ForbiddenError('Cannot command another patient viewer session');
        }

        const commandEnvelope = {
            type: 'command',
            commandId: crypto.randomUUID(),
            sentAt: new Date().toISOString(),
            payload: command
        };
        const delivered = this.broadcast(sessionId, commandEnvelope);

        return {
            sessionId,
            command,
            commandId: commandEnvelope.commandId,
            delivered
        };
    }

    async getAvatarGlb(token?: string | null) {
        const resolved = await this.resolveSessionFromToken(token);
        const storageKey = resolved.avatar.storage_key;

        if (!storageKey) {
            throw new NotFoundError('Viewer avatar GLB is not available');
        }

        const asset = await r2StorageService.getObjectBuffer(storageKey);

        return {
            buffer: asset.buffer,
            contentType: asset.contentType || 'model/gltf-binary'
        };
    }

    async getAnimationSourceUrl(animationId: string, token?: string | null) {
        const resolved = await this.resolveSessionFromToken(token);

        const animation = avatarLibraryService.getAnimationById(animationId, resolved.avatar.avatar_gender);
        if (!animation) {
            throw new NotFoundError('Viewer animation GLB is not available');
        }

        // Prefer our own R2 public CDN — animations are pre-uploaded there.
        // Falls back to the Streamoji source URL if R2 base URL is not configured (local dev).
        const r2Base = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, '');
        const prefix = (process.env.STREAMOJI_ANIMATIONS_R2_PREFIX || 'animations/streamoji').replace(/^\/+|\/+$/g, '');

        if (r2Base) {
            const storageKey = `${prefix}/${animation.fileName}`;
            return `${r2Base}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
        }

        // Fallback: serve directly from Streamoji's public CDN
        return animation.sourceUrl;
    }

    shutdownWebSockets() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = undefined;
        }

        for (const clients of this.sockets.values()) {
            for (const socket of clients) {
                socket.close(1001, 'Server shutting down');
            }
        }

        this.sockets.clear();
        this.webSocketServer?.close();
        this.webSocketServer = undefined;
    }

    private handleConnection(
        socket: AvatarViewerSocket,
        _request: IncomingMessage,
        resolved: Awaited<ReturnType<AvatarViewerService['resolveSessionFromToken']>>
    ) {
        const sessionId = resolved.session.session_id;
        socket.sessionId = sessionId;
        socket.isAlive = true;

        this.addSocket(sessionId, socket);
        this.send(socket, {
            type: 'ready',
            sessionId,
            data: resolved.data
        });

        socket.on('pong', () => {
            socket.isAlive = true;
        });

        socket.on('message', (raw) => {
            this.handleViewerMessage(socket, raw.toString());
        });

        socket.on('close', () => {
            this.removeSocket(sessionId, socket);
        });

        socket.on('error', (error) => {
            logger.warn(`Avatar viewer socket error for ${sessionId}: ${error.message}`);
        });
    }

    private handleViewerMessage(socket: AvatarViewerSocket, raw: string) {
        try {
            const message = JSON.parse(raw) as { type?: string; commandId?: string; error?: string };

            if (message.type === 'ack') {
                logger.info(`Avatar viewer acknowledged command ${message.commandId || 'unknown'} for ${socket.sessionId}`);
                return;
            }

            if (message.type === 'viewer_error') {
                logger.warn(`Avatar viewer reported error for ${socket.sessionId}: ${message.error || 'unknown error'}`);
            }
        } catch {
            this.send(socket, {
                type: 'error',
                message: 'Invalid viewer socket message'
            });
        }
    }

    private addSocket(sessionId: string, socket: AvatarViewerSocket) {
        const clients = this.sockets.get(sessionId) || new Set<AvatarViewerSocket>();
        clients.add(socket);
        this.sockets.set(sessionId, clients);
    }

    private removeSocket(sessionId: string, socket: AvatarViewerSocket) {
        const clients = this.sockets.get(sessionId);
        if (!clients) {
            return;
        }

        clients.delete(socket);
        if (!clients.size) {
            this.sockets.delete(sessionId);
        }
    }

    private broadcast(sessionId: string, payload: unknown) {
        const clients = this.sockets.get(sessionId);
        if (!clients?.size) {
            return 0;
        }

        let delivered = 0;
        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                this.send(client, payload);
                delivered += 1;
            }
        }

        return delivered;
    }

    private send(socket: WebSocket, payload: unknown) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(payload));
        }
    }

    private pingSockets() {
        for (const [sessionId, clients] of this.sockets.entries()) {
            for (const socket of clients) {
                if (socket.isAlive === false) {
                    socket.terminate();
                    this.removeSocket(sessionId, socket);
                    continue;
                }

                socket.isAlive = false;
                socket.ping();
            }
        }
    }

    private rejectUpgrade(socket: Duplex, error: unknown) {
        const message = error instanceof Error ? error.message : 'Unauthorized';
        socket.write([
            'HTTP/1.1 401 Unauthorized',
            'Connection: close',
            'Content-Type: application/json',
            '',
            JSON.stringify({ success: false, message })
        ].join('\r\n'));
        socket.destroy();
    }


    private signViewerToken(payload: ViewerTokenPayload, ttlSeconds: number) {
        const options: SignOptions = {
            expiresIn: ttlSeconds,
            issuer: 'Apothecary-plus',
            audience: 'Apothecary-avatar-viewer'
        };

        return jwt.sign(payload, this.getViewerSecret(), options);
    }

    private verifyViewerToken(token?: string | null) {
        if (!token) {
            throw new UnauthorizedError('Viewer session token is required');
        }

        const payload = jwt.verify(token, this.getViewerSecret(), {
            issuer: 'Apothecary-plus',
            audience: 'Apothecary-avatar-viewer'
        }) as ViewerTokenPayload;

        if (payload.type !== 'avatar_viewer_session' || !payload.sessionId) {
            throw new UnauthorizedError('Invalid viewer session token');
        }

        return payload;
    }

    private getViewerSecret() {
        const secret = process.env.AVATAR_VIEWER_SESSION_SECRET || process.env.JWT_SECRET;
        if (!secret) {
            throw new BadRequestError('Avatar viewer session secret is not configured');
        }

        return secret;
    }

    private buildWebSocketUrl(token: string) {
        const baseUrl = process.env.AVATAR_VIEWER_WS_BASE_URL || process.env.APP_URL || 'http://localhost:5000';
        const url = new URL(baseUrl);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.pathname = '/avatar-viewer/ws';
        url.search = `session=${encodeURIComponent(token)}`;
        return url.toString();
    }

    private buildAvatarProxyUrl(token: string) {
        return `/api/v1/avatar-viewer/assets/avatar.glb?session=${encodeURIComponent(token)}`;
    }

    private buildAnimationProxyUrl(token: string, animationId: string) {
        // The animation redirect endpoint validates the session then sends a 302 to the public CDN URL.
        return `/api/v1/avatar-viewer/assets/animations/${encodeURIComponent(animationId)}.glb?session=${encodeURIComponent(token)}`;
    }
}

export const avatarViewerService = new AvatarViewerService();
