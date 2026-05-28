import { ChatSession, IChatSession } from '../../models/ChatSession.model';
import { ChatMessage } from '../../models/ChatSession.model';
import { Patient } from '../../models/Patient.model';
import { Doctor } from '../../models/Doctor.model';
import { User } from '../../models/User.model';
import { Notification } from '../../models/Notification.model';
import { AvatarLibrary } from '../../models/AvatarLibrary.model';
import { Tier, NotificationType } from '../../models/enums';
import { encrypt, decrypt } from '../../utils/encryption';
import { redisService } from '../../services/redis.service';
import { aiService } from '../../services/ai.service';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { Types } from 'mongoose';

import { Response } from 'express';
export class ChatService {
    /**
     * Send message synchronously (legacy non-streaming)
     */
    async sendMessage(user_id: string, data: {
        message: string;
        session_id?: string;
    }) {
        const user = await User.findById(user_id);
        if (!user) throw new NotFoundError('User not found');
        const patient = await Patient.findOne({ user_id });
        if (!patient) throw new NotFoundError('Patient profile not found');

        // Check token limit for free users
        if (user.tier === Tier.FREE) {
            const tokens_used = await redisService.getChatTokensUsedToday(patient._id.toString());
            if (tokens_used >= 2000) {
                return {
                    error: true,
                    code: 'DAILY_TOKEN_LIMIT',
                    message: 'Daily chat limit reached. Upgrade to continue chatting.',
                    tokens_used,
                    token_limit: 2000
                };
            }
        }

        // Get or create session
        let session: IChatSession;
        if (data.session_id) {
            if (!Types.ObjectId.isValid(data.session_id)) {
                throw new BadRequestError('Invalid session ID format');
            }
            const existing_session = await ChatSession.findOne({
                _id: data.session_id,
                patient_id: patient._id
            });
            if (!existing_session) throw new NotFoundError('Chat session not found');
            session = existing_session;
        } else {
            session = await ChatSession.create({
                patient_id: patient._id,
                started_at: new Date(),
                message_count: 0,
                tokens_used: 0
            });
        }

        // Fetch history BEFORE saving the current user message so it is not
        // included in the context (ai.service appends the current message itself).
        const history = await this.getConversationHistory(session._id.toString(), 10);

        const user_message_tokens = aiService.countTokens(data.message);
        await ChatMessage.create({
            session_id: session._id,
            role: 'user',
            content: encrypt(data.message),
            token_count: user_message_tokens,
            is_crisis_flagged: false
        });

        const avatar = await AvatarLibrary.findOne({ patient_id: patient._id, is_active: true });

        const ai_response = await aiService.streamChatResponse(
            data.message,
            '', // No viewer session for legacy
            history.map(msg => ({ role: msg.role as any, content: msg.content })),
            { patient_id: patient._id.toString() },
            undefined,
            undefined,
            avatar?.avatar_gender
        );

        const assistant_message = await ChatMessage.create({
            session_id: session._id,
            role: 'assistant',
            content: encrypt(ai_response.text),
            token_count: ai_response.token_count,
            is_crisis_flagged: ai_response.is_crisis
        });

        const total_tokens = user_message_tokens + ai_response.token_count;
        session.message_count += 2;
        session.tokens_used += total_tokens;
        await session.save();

        await redisService.incrementChatTokens(patient._id.toString(), total_tokens);
        if (ai_response.is_crisis && patient.doctor_id) {
            await this.notifyDoctorOfCrisis(patient.doctor_id.toString(), patient._id.toString());
        }

        const tokens_used_today = await redisService.getChatTokensUsedToday(patient._id.toString());
        const token_limit = user.tier === Tier.FREE ? 2000 : user.tier === Tier.BASIC ? 10000 : 999999;

        return {
            session_id: session._id.toString(),
            message_id: assistant_message._id.toString(),
            response: ai_response.text,
            is_crisis: ai_response.is_crisis,
            tokens_used: total_tokens,
            tokens_used_today,
            token_limit,
            tokens_remaining: Math.max(0, token_limit - tokens_used_today)
        };
    }

    /**
     * Stream message and get AI response via SSE
     */
    async streamMessage(user_id: string, data: {
        message: string;
        session_id?: string;
        viewer_session_id?: string;
    }, res: Response) {
        const user = await User.findById(user_id);
        if (!user) {
            res.write(`data: ${JSON.stringify({ error: 'User not found' })}\n\n`);
            res.end();
            return;
        }

        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            res.write(`data: ${JSON.stringify({ error: 'Patient profile not found' })}\n\n`);
            res.end();
            return;
        }

        // Check token limit for free users
        if (user.tier === Tier.FREE) {
            const tokens_used = await redisService.getChatTokensUsedToday(patient._id.toString());
            if (tokens_used >= 2000) {
                res.write(`data: ${JSON.stringify({
                    error: true,
                    code: 'DAILY_TOKEN_LIMIT',
                    message: 'Daily chat limit reached. Upgrade to continue chatting.',
                    tokens_used,
                    token_limit: 2000
                })}\n\n`);
                res.end();
                return;
            }
        }

        // Get or create session
        let session: IChatSession;
        if (data.session_id) {
            if (!Types.ObjectId.isValid(data.session_id)) {
                res.write(`data: ${JSON.stringify({ error: 'Invalid session ID format' })}\n\n`);
                res.end();
                return;
            }
            const existing_session = await ChatSession.findOne({
                _id: data.session_id,
                patient_id: patient._id
            });
            if (!existing_session) {
                res.write(`data: ${JSON.stringify({ error: 'Chat session not found' })}\n\n`);
                res.end();
                return;
            }
            session = existing_session;
        } else {
            session = await ChatSession.create({
                patient_id: patient._id,
                started_at: new Date(),
                message_count: 0,
                tokens_used: 0
            });
        }

        // Fetch history BEFORE saving the current user message so it is not
        // included in the context (ai.service appends the current message itself).
        const history = await this.getConversationHistory(session._id.toString(), 10);

        // Save user message
        const user_message_tokens = aiService.countTokens(data.message);
        
        await ChatMessage.create({
            session_id: session._id,
            role: 'user',
            content: encrypt(data.message),
            token_count: user_message_tokens,
            is_crisis_flagged: false
        });

        // Set up abort controller to kill Groq generation if client disconnects
        const abortController = new AbortController();
        res.on('close', () => {
            logger.info(`Client disconnected, aborting stream for session ${session._id}`);
            abortController.abort();
        });

        // Fetch active avatar to determine gender
        const avatar = await AvatarLibrary.findOne({ patient_id: patient._id, is_active: true });

        // Stream AI response
        const ai_response = await aiService.streamChatResponse(
            data.message,
            data.viewer_session_id || '',
            history.map(msg => ({ role: msg.role as any, content: msg.content })),
            { patient_id: patient._id.toString() },
            (chunk: string) => {
                res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
            },
            abortController.signal,
            avatar?.avatar_gender
        );

        // If request was aborted mid-stream, drop out so we don't save or bill tokens
        if (abortController.signal.aborted) {
            return;
        }

        // Save assistant message
        const assistant_message = await ChatMessage.create({
            session_id: session._id,
            role: 'assistant',
            content: encrypt(ai_response.text),
            token_count: ai_response.token_count,
            is_crisis_flagged: ai_response.is_crisis
        });

        // Update session stats
        const total_tokens = user_message_tokens + ai_response.token_count;
        session.message_count += 2;
        session.tokens_used += total_tokens;
        await session.save();

        await redisService.incrementChatTokens(patient._id.toString(), total_tokens);

        if (ai_response.is_crisis && patient.doctor_id) {
            await this.notifyDoctorOfCrisis(patient.doctor_id.toString(), patient._id.toString());
        }

        const tokens_used_today = await redisService.getChatTokensUsedToday(patient._id.toString());
        const token_limit = user.tier === Tier.FREE ? 2000 : user.tier === Tier.BASIC ? 10000 : 999999;

        logger.info(`Chat streamed for patient ${patient._id}, session ${session._id}`);

        res.write(`data: ${JSON.stringify({
            done: true,
            session_id: session._id.toString(),
            message_id: assistant_message._id.toString(),
            is_crisis: ai_response.is_crisis,
            tokens_used: total_tokens,
            tokens_used_today,
            token_limit,
            tokens_remaining: Math.max(0, token_limit - tokens_used_today)
        })}\n\n`);
        res.end();
    }

    /**
     * Get chat history for a session
     */
    async getChatHistory(user_id: string, session_id?: string, limit: number = 50) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        const query: any = { patient_id: patient._id };
        
        if (session_id) {
            if (!Types.ObjectId.isValid(session_id)) {
                throw new BadRequestError('Invalid session ID format');
            }
            // Get specific session
            const session = await ChatSession.findOne({
                _id: session_id,
                patient_id: patient._id
            });

            if (!session) {
                throw new NotFoundError('Chat session not found');
            }

            const messages = await ChatMessage.find({ session_id })
                .sort({ created_at: 1 })
                .limit(limit);

            return {
                session_id: session._id.toString(),
                started_at: session.started_at,
                ended_at: session.ended_at,
                message_count: session.message_count,
                tokens_used: session.tokens_used,
                messages: messages.map(msg => ({
                    message_id: msg._id.toString(),
                    role: msg.role,
                    content: decrypt(msg.content),
                    token_count: msg.token_count,
                    is_crisis_flagged: msg.is_crisis_flagged,
                    created_at: msg.created_at
                }))
            };
        } else {
            // Get last session
            const last_session = await ChatSession.findOne(query)
                .sort({ started_at: -1 });

            if (!last_session) {
                return {
                    message: 'No chat history found',
                    sessions: []
                };
            }

            const messages = await ChatMessage.find({ session_id: last_session._id })
                .sort({ created_at: 1 })
                .limit(limit);

            return {
                session_id: last_session._id.toString(),
                started_at: last_session.started_at,
                ended_at: last_session.ended_at,
                message_count: last_session.message_count,
                tokens_used: last_session.tokens_used,
                messages: messages.map(msg => ({
                    message_id: msg._id.toString(),
                    role: msg.role,
                    content: decrypt(msg.content),
                    token_count: msg.token_count,
                    is_crisis_flagged: msg.is_crisis_flagged,
                    created_at: msg.created_at
                }))
            };
        }
    }

    /**
     * Get all chat sessions
     */
    async getChatSessions(user_id: string, limit: number = 20) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        const sessions = await ChatSession.find({ patient_id: patient._id })
            .sort({ started_at: -1 })
            .limit(limit)
            .lean();

        return {
            sessions: sessions.map(session => ({
                session_id: session._id.toString(),
                started_at: session.started_at,
                ended_at: session.ended_at,
                message_count: session.message_count,
                tokens_used: session.tokens_used
            })),
            total: sessions.length
        };
    }

    /**
     * End chat session
     */
    async endSession(user_id: string, session_id: string) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        if (!Types.ObjectId.isValid(session_id)) {
            throw new BadRequestError('Invalid session ID format');
        }

        const session = await ChatSession.findOne({
            _id: session_id,
            patient_id: patient._id
        });

        if (!session) {
            throw new NotFoundError('Chat session not found');
        }

        if (session.ended_at) {
            throw new BadRequestError('Session already ended');
        }

        session.ended_at = new Date();
        await session.save();

        return {
            message: 'Session ended successfully',
            session_id: session._id.toString(),
            ended_at: session.ended_at,
            total_messages: session.message_count,
            total_tokens: session.tokens_used
        };
    }

    /**
     * Get conversation history (decrypted)
     */
    private async getConversationHistory(session_id: string, limit: number = 10) {
        const messages = await ChatMessage.find({ session_id })
            .sort({ created_at: -1 })
            .limit(limit);

        return messages.reverse().map(msg => ({
            role: msg.role,
            content: decrypt(msg.content)
        }));
    }

    /**
     * Notify Doctor of crisis
     * patient.doctor_id → Doctor._id → Doctor.user_id → User (doctor's auth account)
     */
    private async notifyDoctorOfCrisis(doctor_record_id: string, patient_id: string) {
        try {
            // doctor_id on the Patient model is a ref to Doctor._id (not User._id)
            const doctorRecord = await Doctor.findById(doctor_record_id);
            if (!doctorRecord) {
                logger.warn(`Crisis alert: Doctor record ${doctor_record_id} not found for patient ${patient_id}`);
                return;
            }

            // Doctor.user_id is the User._id for the doctor's login account
            const doctorUserId = doctorRecord.user_id;

            await Notification.create({
                user_id: doctorUserId,
                type: NotificationType.CRISIS,
                title: 'Crisis Alert — Patient Needs Immediate Attention',
                body: `A patient has expressed crisis-related concerns in their AI chat session. Please review and reach out immediately.`,
                is_read: false
            });

            logger.warn(`Crisis notification sent to Doctor user ${doctorUserId} (record: ${doctor_record_id}) for patient ${patient_id}`);
        } catch (error) {
            logger.error('Failed to notify Doctor of crisis:', error);
        }
    }
}

export const chatService = new ChatService();
