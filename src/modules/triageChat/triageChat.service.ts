import mongoose from 'mongoose';
import { Assistant } from '../../models/Assistant.model';
import { CareRequest } from '../../models/CareRequest.model';
import { Notification } from '../../models/Notification.model';
import { Patient } from '../../models/Patient.model';
import { TriageConversation, TriageMessage } from '../../models/TriageChat.model';
import { Role, NotificationType } from '../../models/enums';
import { JwtPayload } from '../../utils/jwt';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';

type PublishRealtime = (event: string, payload: unknown, rooms: string[]) => void;

const activeCareRequestStatuses = [
    'new_request',
    'triage_claimed',
    'triage_in_progress',
    'pending_assignment',
    'assigned',
    'in_treatment',
    'follow_up_needed',
    'patient_requested_closure'
];

class TriageChatService {
    private publishRealtime?: PublishRealtime;

    setRealtimePublisher(publisher: PublishRealtime) {
        this.publishRealtime = publisher;
    }

    async ensureConversationForCareRequest(careRequestId: string, actor: JwtPayload) {
        const request = await CareRequest.findById(careRequestId).populate({
            path: 'patient_id',
            populate: { path: 'user_id', select: 'email status role' }
        });

        if (!request) {
            throw new NotFoundError('Care request not found');
        }

        await this.assertCanAccessCareRequest(request, actor, true);

        const existing = await TriageConversation.findOne({ care_request_id: request._id });
        if (existing) {
            return {
                conversation: await this.formatConversation(existing._id.toString(), actor)
            };
        }

        const assistant = actor.role === Role.ASSISTANT ? await Assistant.findOne({ user_id: actor.user_id }) : null;
        const conversation = await TriageConversation.create({
            care_request_id: request._id,
            patient_id: request.patient_id,
            assistant_user_id: request.claimed_by || (actor.role === Role.ASSISTANT ? new mongoose.Types.ObjectId(actor.user_id) : undefined),
            assistant_id: request.claimed_assistant_id || assistant?._id,
            status: 'open',
            last_message_at: new Date()
        });

        await this.createSystemMessage(conversation, 'Triage chat opened for this care request.');

        return {
            conversation: await this.formatConversation(conversation._id.toString(), actor)
        };
    }

    async listConversations(actor: JwtPayload, query: { status?: string; page: number; limit: number }) {
        const page = query.page;
        const limit = query.limit;
        const skip = (page - 1) * limit;
        const match: Record<string, unknown> = {};

        if (query.status && query.status !== 'all') {
            match.status = query.status;
        }

        if (actor.role === Role.PATIENT) {
            const patient = await Patient.findOne({ user_id: actor.user_id });
            if (!patient) {
                throw new NotFoundError('Patient profile not found');
            }
            match.patient_id = patient._id;
        } else if (actor.role === Role.ASSISTANT) {
            match.assistant_user_id = new mongoose.Types.ObjectId(actor.user_id);
        } else if (actor.role !== Role.SUPER_ADMIN) {
            throw new ForbiddenError('Only patients, Assistants, and admins can access triage chat');
        }

        const [items, total] = await Promise.all([
            TriageConversation.find(match).sort({ last_message_at: -1, updated_at: -1 }).skip(skip).limit(limit),
            TriageConversation.countDocuments(match)
        ]);

        return {
            conversations: await Promise.all(items.map(item => this.formatConversation(item._id.toString(), actor))),
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
                has_next: page * limit < total,
                has_prev: page > 1
            }
        };
    }

    async getConversation(conversationId: string, actor: JwtPayload) {
        const conversation = await TriageConversation.findById(conversationId);
        if (!conversation) {
            throw new NotFoundError('Triage conversation not found');
        }

        await this.assertCanAccessConversation(conversation, actor, false);
        return {
            conversation: await this.formatConversation(conversationId, actor)
        };
    }

    async listMessages(conversationId: string, actor: JwtPayload, query: { limit: number; before?: string }) {
        const conversation = await TriageConversation.findById(conversationId);
        if (!conversation) {
            throw new NotFoundError('Triage conversation not found');
        }

        await this.assertCanAccessConversation(conversation, actor, false);

        const match: Record<string, unknown> = { conversation_id: conversation._id };
        if (query.before) {
            match.created_at = { $lt: new Date(query.before) };
        }

        const messages = await TriageMessage.find(match).sort({ created_at: -1 }).limit(query.limit);
        return {
            messages: messages.reverse().map(message => this.formatMessage(message))
        };
    }

    async sendMessage(conversationId: string, actor: JwtPayload, body: string) {
        const conversation = await TriageConversation.findById(conversationId);
        if (!conversation) {
            throw new NotFoundError('Triage conversation not found');
        }

        await this.assertCanAccessConversation(conversation, actor, true);
        if (conversation.status !== 'open') {
            throw new ConflictError('This triage conversation is closed');
        }

        const senderRole = this.getSenderRole(actor);
        const message = await TriageMessage.create({
            conversation_id: conversation._id,
            care_request_id: conversation.care_request_id,
            patient_id: conversation.patient_id,
            sender_user_id: new mongoose.Types.ObjectId(actor.user_id),
            sender_role: senderRole,
            message_type: 'text',
            body
        });

        conversation.last_message_at = message.created_at;
        if (senderRole === 'patient') {
            conversation.assistant_unread_count += 1;
            conversation.admin_unread_count += 1;
            await this.notifyAssistant(conversation);
        } else if (senderRole === 'assistant') {
            conversation.patient_unread_count += 1;
            conversation.admin_unread_count += 1;
            await this.notifyPatient(conversation);
        } else if (senderRole === 'admin') {
            conversation.patient_unread_count += 1;
            conversation.assistant_unread_count += 1;
        }
        await conversation.save();

        const formattedMessage = this.formatMessage(message);
        const formattedConversation = await this.formatConversation(conversationId, actor);
        this.publish('triage:message_created', {
            message: formattedMessage,
            conversation: formattedConversation
        }, this.getRooms(conversation));

        return {
            message: formattedMessage,
            conversation: formattedConversation
        };
    }

    async markRead(conversationId: string, actor: JwtPayload) {
        const conversation = await TriageConversation.findById(conversationId);
        if (!conversation) {
            throw new NotFoundError('Triage conversation not found');
        }

        await this.assertCanAccessConversation(conversation, actor, false);
        const now = new Date();
        const update: Record<string, Date | undefined> = {};

        if (actor.role === Role.PATIENT) {
            conversation.patient_unread_count = 0;
            update.read_by_patient_at = now;
        } else if (actor.role === Role.ASSISTANT) {
            conversation.assistant_unread_count = 0;
            update.read_by_assistant_at = now;
        } else if (actor.role === Role.SUPER_ADMIN) {
            conversation.admin_unread_count = 0;
            update.read_by_admin_at = now;
        }

        await Promise.all([
            TriageMessage.updateMany({ conversation_id: conversation._id }, { $set: update }),
            conversation.save()
        ]);

        this.publish('triage:read', {
            conversation_id: conversation._id.toString(),
            role: this.getSenderRole(actor),
            read_at: now
        }, this.getRooms(conversation));

        return {
            conversation: await this.formatConversation(conversationId, actor)
        };
    }

    async updateHandoffNotes(conversationId: string, actor: JwtPayload, doctorHandoffNotes: string) {
        const conversation = await TriageConversation.findById(conversationId);
        if (!conversation) {
            throw new NotFoundError('Triage conversation not found');
        }

        await this.assertCanAccessConversation(conversation, actor, true);
        if (![Role.ASSISTANT, Role.SUPER_ADMIN].includes(actor.role)) {
            throw new ForbiddenError('Only Assistants and admins can update handoff notes');
        }

        conversation.doctor_handoff_notes = doctorHandoffNotes;
        await conversation.save();

        this.publish('triage:notes_updated', {
            conversation: await this.formatConversation(conversationId, actor)
        }, this.getRooms(conversation));

        return {
            conversation: await this.formatConversation(conversationId, actor)
        };
    }

    async closeConversationForCareRequest(careRequestId: string, actorUserId: string, reason: string) {
        const conversation = await TriageConversation.findOne({ care_request_id: careRequestId });
        if (!conversation || conversation.status !== 'open') {
            return;
        }

        conversation.status = 'closed';
        conversation.closed_at = new Date();
        conversation.closed_by = new mongoose.Types.ObjectId(actorUserId);
        await conversation.save();
        await this.createSystemMessage(conversation, reason);

        this.publish('triage:conversation_closed', {
            conversation_id: conversation._id.toString(),
            reason
        }, this.getRooms(conversation));
    }

    async emitTyping(conversationId: string, actor: JwtPayload, isTyping: boolean) {
        const conversation = await TriageConversation.findById(conversationId);
        if (!conversation) {
            throw new NotFoundError('Triage conversation not found');
        }

        await this.assertCanAccessConversation(conversation, actor, false);
        this.publish(isTyping ? 'triage:typing_start' : 'triage:typing_stop', {
            conversation_id: conversationId,
            user_id: actor.user_id,
            role: this.getSenderRole(actor)
        }, this.getRooms(conversation));
    }

    private async assertCanAccessCareRequest(request: any, actor: JwtPayload, requireWrite: boolean) {
        if (!activeCareRequestStatuses.includes(request.status)) {
            throw new BadRequestError('This care request is not active');
        }

        if (actor.role === Role.SUPER_ADMIN) {
            return;
        }

        const patient = request.patient_id;
        const patientUserId = patient?.user_id?._id?.toString() || patient?.user_id?.toString();
        if (actor.role === Role.PATIENT && patientUserId === actor.user_id) {
            return;
        }

        if (actor.role === Role.ASSISTANT) {
            if (!request.claimed_by || request.claimed_by.toString() !== actor.user_id) {
                throw new ForbiddenError('Assistant must claim this care request before chatting');
            }
            if (request.claim_expires_at && new Date(request.claim_expires_at).getTime() <= Date.now()) {
                throw new ConflictError('Assistant claim has expired');
            }
            return;
        }

        if (requireWrite) {
            throw new ForbiddenError('Not allowed to write in this triage chat');
        }
        throw new ForbiddenError('Not allowed to access this triage chat');
    }

    private async assertCanAccessConversation(conversation: any, actor: JwtPayload, requireWrite: boolean) {
        const request = await CareRequest.findById(conversation.care_request_id).populate({
            path: 'patient_id',
            populate: { path: 'user_id', select: 'email status role' }
        });
        if (!request) {
            throw new NotFoundError('Care request not found');
        }

        if (actor.role === Role.PATIENT) {
            const patient = request.patient_id as any;
            const patientUserId = patient?.user_id?._id?.toString() || patient?.user_id?.toString();
            if (patientUserId !== actor.user_id) {
                throw new ForbiddenError('Patient can access only their own triage chat');
            }
            return;
        }

        if (actor.role === Role.ASSISTANT) {
            if (conversation.assistant_user_id?.toString() !== actor.user_id && request.claimed_by?.toString() !== actor.user_id) {
                throw new ForbiddenError('Assistant can access only claimed triage chats');
            }
            if (requireWrite && request.claim_expires_at && new Date(request.claim_expires_at).getTime() <= Date.now()) {
                throw new ConflictError('Assistant claim has expired');
            }
            return;
        }

        if (actor.role === Role.SUPER_ADMIN) {
            return;
        }

        throw new ForbiddenError('Not allowed to access this triage chat');
    }

    private async createSystemMessage(conversation: any, body: string) {
        const message = await TriageMessage.create({
            conversation_id: conversation._id,
            care_request_id: conversation.care_request_id,
            patient_id: conversation.patient_id,
            sender_role: 'system',
            message_type: 'system',
            body
        });
        conversation.last_message_at = message.created_at;
        await conversation.save();
        return message;
    }

    private async formatConversation(conversationId: string, actor: JwtPayload) {
        const conversation = await TriageConversation.findById(conversationId)
            .populate({
                path: 'care_request_id',
                populate: [
                    { path: 'patient_id', populate: { path: 'user_id', select: 'email' } },
                    { path: 'doctor_id', populate: { path: 'user_id', select: 'email' } }
                ]
            })
            .populate('assistant_user_id', 'email');

        if (!conversation) {
            throw new NotFoundError('Triage conversation not found');
        }

        const request = conversation.care_request_id as any;
        const patient = request?.patient_id;
        const patientUser = patient?.user_id;
        const doctor = request?.doctor_id;
        const doctorUser = doctor?.user_id;
        const assistantUser = conversation.assistant_user_id as any;

        return {
            conversation_id: conversation._id.toString(),
            care_request_id: request?._id?.toString() || conversation.care_request_id.toString(),
            patient_id: patient?._id?.toString() || conversation.patient_id.toString(),
            patient_name: patient?.full_name || this.formatNameFromEmail(patientUser?.email || ''),
            patient_email: patientUser?.email,
            assistant_user_id: assistantUser?._id?.toString() || conversation.assistant_user_id?.toString() || null,
            assistant_email: assistantUser?.email || null,
            doctor_id: doctor?._id?.toString() || request?.doctor_id?.toString() || null,
            doctor_name: doctor?.personal_info?.full_name || this.formatNameFromEmail(doctorUser?.email || ''),
            status: conversation.status,
            care_request_status: request?.status,
            urgency: request?.urgency,
            reason: request?.reason,
            doctor_handoff_notes: conversation.doctor_handoff_notes || '',
            unread_count: actor.role === Role.PATIENT
                ? conversation.patient_unread_count
                : actor.role === Role.ASSISTANT
                    ? conversation.assistant_unread_count
                    : conversation.admin_unread_count,
            patient_unread_count: conversation.patient_unread_count,
            assistant_unread_count: conversation.assistant_unread_count,
            admin_unread_count: conversation.admin_unread_count,
            last_message_at: conversation.last_message_at,
            closed_at: conversation.closed_at,
            created_at: conversation.created_at,
            updated_at: conversation.updated_at
        };
    }

    private formatMessage(message: any) {
        return {
            message_id: message._id.toString(),
            conversation_id: message.conversation_id.toString(),
            care_request_id: message.care_request_id.toString(),
            patient_id: message.patient_id.toString(),
            sender_user_id: message.sender_user_id?.toString() || null,
            sender_role: message.sender_role,
            message_type: message.message_type,
            body: message.body,
            read_by_patient_at: message.read_by_patient_at,
            read_by_assistant_at: message.read_by_assistant_at,
            read_by_admin_at: message.read_by_admin_at,
            created_at: message.created_at
        };
    }

    private async notifyPatient(conversation: any) {
        const patient = await Patient.findById(conversation.patient_id);
        if (!patient) return;
        await Notification.create({
            user_id: patient.user_id,
            type: NotificationType.TRIAGE_MESSAGE,
            title: 'New care team message',
            body: 'Your care team sent a new triage message.'
        });
    }

    private async notifyAssistant(conversation: any) {
        if (!conversation.assistant_user_id) return;
        await Notification.create({
            user_id: conversation.assistant_user_id,
            type: NotificationType.TRIAGE_MESSAGE,
            title: 'New patient reply',
            body: 'A patient replied in triage chat.'
        });
    }

    private getSenderRole(actor: JwtPayload) {
        if (actor.role === Role.PATIENT) return 'patient';
        if (actor.role === Role.ASSISTANT) return 'assistant';
        if (actor.role === Role.SUPER_ADMIN) return 'admin';
        throw new ForbiddenError('Unsupported triage chat role');
    }

    private getRooms(conversation: any) {
        return [
            `triage:${conversation._id.toString()}`,
            `user:${conversation.patient_id?.toString()}`,
            conversation.assistant_user_id ? `user:${conversation.assistant_user_id.toString()}` : '',
            'role:super_admin'
        ].filter(Boolean);
    }

    private publish(event: string, payload: unknown, rooms: string[]) {
        this.publishRealtime?.(event, payload, rooms);
    }

    private formatNameFromEmail(email: string) {
        return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) || 'User';
    }
}

export const triageChatService = new TriageChatService();
