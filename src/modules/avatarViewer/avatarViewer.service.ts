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

        const ttlSeconds = Number(process.env.AVATAR_VIEWER_SESSION_TTL_SECONDS || 15 * 60);
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

        let session = await AvatarViewerSession.findOne({
            user_id: user._id,
            patient_id: patient._id,
            avatar_record_id: avatar._id,
            status: 'active',
            expires_at: { $gt: new Date() }
        });

        if (session) {
            session.expires_at = expiresAt;
            await session.save();
        } else {
            session = await AvatarViewerSession.create({
                session_id: crypto.randomUUID(),
                user_id: user._id,
                patient_id: patient._id,
                avatar_record_id: avatar._id,
                expires_at: expiresAt,
                status: 'active'
            });
        }

        const token = this.signViewerToken({
            type: 'avatar_viewer_session',
            sessionId: session.session_id,
            userId: user._id.toString(),
            patientId: patient._id.toString()
        }, ttlSeconds);
        const viewerBaseUrl = (process.env.AVATAR_VIEWER_BASE_URL || 'https://avatar-viewer.Apothecary.com').replace(/\/+$/, '');

        return {
            sessionId: session.session_id,
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
        const payload = this.verifyViewerToken(token, true);
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

    async extendSession(token?: string | null) {
        const payload = this.verifyViewerToken(token, true);
        const session = await AvatarViewerSession.findOne({ session_id: payload.sessionId });

        if (!session || session.status !== 'active') {
            throw new UnauthorizedError('Viewer session is invalid');
        }

        const ttlSeconds = Number(process.env.AVATAR_VIEWER_SESSION_TTL_SECONDS || 15 * 60);
        session.expires_at = new Date(Date.now() + ttlSeconds * 1000);
        await session.save();

        return { success: true, expiresAt: session.expires_at };
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

    /**
     * Send a WebSocket command using the viewer JWT token (not the raw UUID).
     *
     * This is the correct method to call from ai.service.ts. The frontend passes
     * the signed JWT it received from createSession(), NOT the raw UUID session_id.
     * This method decodes the JWT, extracts the UUID, validates the session is still
     * active, and broadcasts the command — without requiring callers to know the UUID.
     *
     * Returns silently (no throw) if the token is missing, invalid, or the session
     * has expired, so AI chat continues uninterrupted even when no avatar is configured.
     */
    async sendCommandFromToken(viewerToken: string | undefined | null, command: AvatarViewerCommandInput): Promise<void> {
        if (!viewerToken) return;

        try {
            // verifyViewerToken decodes + validates the JWT and returns the payload
            // which contains sessionId (the UUID stored in AvatarViewerSession.session_id)
            const payload = this.verifyViewerToken(viewerToken, true);
            const sessionId = payload.sessionId;

            // Verify the session is still active in DB before broadcasting
            const session = await AvatarViewerSession.findOne({ session_id: sessionId });
            if (!session || session.status !== 'active' || session.expires_at <= new Date()) {
                logger.warn(`Avatar sendCommandFromToken: session ${sessionId} is inactive or expired — skipping`);
                return;
            }

            const commandEnvelope = {
                type: 'command',
                commandId: crypto.randomUUID(),
                sentAt: new Date().toISOString(),
                payload: command
            };

            this.broadcast(sessionId, commandEnvelope);
        } catch (e) {
            // Token invalid / expired — do not throw. AI chat must continue without avatar.
            logger.warn(`Avatar sendCommandFromToken: failed to send command — ${(e as Error).message}`);
        }
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

    private verifyViewerToken(token?: string | null, ignoreExpiration = false) {
        if (!token) {
            throw new UnauthorizedError('Viewer session token is required');
        }

        const payload = jwt.verify(token, this.getViewerSecret(), {
            issuer: 'Apothecary-plus',
            audience: 'Apothecary-avatar-viewer',
            ignoreExpiration
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
