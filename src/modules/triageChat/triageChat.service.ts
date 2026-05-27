import mongoose from 'mongoose';
import { Assistant } from '../../models/Assistant.model';
import { CareRequest } from '../../models/CareRequest.model';
import { Doctor as DoctorModel } from '../../models/Doctor.model';
import { Notification } from '../../models/Notification.model';
import { Patient } from '../../models/Patient.model';
import { TriageConversation, TriageMessage } from '../../models/TriageChat.model';
import { Role, NotificationType } from '../../models/enums';
import { JwtPayload } from '../../utils/jwt';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

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
        } else if (actor.role === Role.DOCTOR) {
            match.doctor_user_id = new mongoose.Types.ObjectId(actor.user_id);
        } else if (actor.role !== Role.SUPER_ADMIN) {
            throw new ForbiddenError('Only patients, Doctors, Assistants, and admins can access triage chat');
        }

        const conversationQuery = TriageConversation.find(match)
            .sort({ last_message_at: -1, updated_at: -1 })
            .skip(skip)
            .limit(limit)
            .populate({
                path: 'care_request_id',
                select: 'patient_id doctor_id status urgency reason claimed_by claim_expires_at',
                populate: [
                    { path: 'patient_id', select: 'full_name user_id', populate: { path: 'user_id', select: 'email' } },
                    { path: 'doctor_id', select: 'personal_info user_id', populate: { path: 'user_id', select: 'email' } }
                ]
            })
            .populate('assistant_user_id', 'email')
            .populate('doctor_user_id', 'email')
            .lean();

        const [items, total] = await Promise.all([
            conversationQuery,
            TriageConversation.countDocuments(match)
        ]);

        return {
            conversations: items.map(item => this.formatConversationDocument(item, actor)),
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

        const messages = await TriageMessage.find(match)
            .sort({ created_at: -1, _id: -1 })
            .limit(query.limit)
            .lean();
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

        const update: Record<string, unknown> = {
            last_message_at: message.created_at
        };
        if (senderRole === 'patient') {
            update.$inc = { assistant_unread_count: 1, admin_unread_count: 1 };
            void this.notifyAssistant(conversation);
        } else if (senderRole === 'assistant') {
            update.$inc = { patient_unread_count: 1, admin_unread_count: 1 };
            void this.notifyPatient(conversation);
        } else if (senderRole === 'admin') {
            update.$inc = { patient_unread_count: 1, assistant_unread_count: 1 };
        } else if (senderRole === 'doctor') {
            update.$inc = { patient_unread_count: 1, assistant_unread_count: 1, admin_unread_count: 1 };
        }
        const updatedConversation = await TriageConversation.findByIdAndUpdate(conversation._id, update, { new: true });

        const formattedMessage = this.formatMessage(message);
        const formattedConversation = await this.formatConversation((updatedConversation || conversation)._id.toString(), actor);
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

        await conversation.save();
        void TriageMessage.updateMany({ conversation_id: conversation._id }, { $set: update }).catch(error => {
            logger.warn(`Triage read receipt update failed: ${error instanceof Error ? error.message : String(error)}`);
        });

        this.publish('triage:read', {
            conversation_id: conversation._id.toString(),
            role: this.getSenderRole(actor),
            read_at: now
        }, this.getRooms(conversation));

        return {
            conversation: await this.formatConversation(conversationId, actor)
        };
    }

    async updateHandoffNotes(conversationId: string, actor: JwtPayload, data: { doctor_handoff_notes?: string; doctor_handoff?: Record<string, string | undefined> }) {
        const conversation = await TriageConversation.findById(conversationId);
        if (!conversation) {
            throw new NotFoundError('Triage conversation not found');
        }

        await this.assertCanAccessConversation(conversation, actor, true);
        if (![Role.ASSISTANT, Role.SUPER_ADMIN].includes(actor.role)) {
            throw new ForbiddenError('Only Assistants and admins can update handoff notes');
        }

        if (data.doctor_handoff_notes !== undefined) {
            conversation.doctor_handoff_notes = data.doctor_handoff_notes;
        }
        if (data.doctor_handoff !== undefined) {
            conversation.doctor_handoff = data.doctor_handoff;
        }
        await conversation.save();

        this.publish('triage:notes_updated', {
            conversation: await this.formatConversation(conversationId, actor)
        }, this.getRooms(conversation));

        return {
            conversation: await this.formatConversation(conversationId, actor)
        };
    }

    async onboardDoctorForCareRequest(careRequestId: string, actorUserId: string) {
        const request = await CareRequest.findById(careRequestId)
            .populate({
                path: 'patient_id',
                populate: { path: 'user_id', select: 'email' }
            })
            .populate({
                path: 'doctor_id',
                populate: { path: 'user_id', select: 'email role status' }
            });

        if (!request) {
            throw new NotFoundError('Care request not found');
        }

        const doctor = request.doctor_id as any;
        const doctorUser = doctor?.user_id;
        if (!doctor?._id || !doctorUser?._id) {
            throw new BadRequestError('Care request does not have an assigned Doctor');
        }

        let conversation = await TriageConversation.findOne({ care_request_id: request._id });
        if (!conversation) {
            conversation = await TriageConversation.create({
                care_request_id: request._id,
                patient_id: request.patient_id,
                assistant_user_id: request.claimed_by,
                assistant_id: request.claimed_assistant_id,
                status: 'open',
                last_message_at: new Date()
            });
            await this.createSystemMessage(conversation, 'Care thread opened for Doctor onboarding.');
        }

        const previousDoctorUserId = conversation.doctor_user_id?.toString();
        conversation.doctor_id = doctor._id;
        conversation.doctor_user_id = doctorUser._id;
        conversation.status = 'open';
        await conversation.save();

        if (previousDoctorUserId !== doctorUser._id.toString()) {
            const doctorName = doctor.personal_info?.full_name || this.formatNameFromEmail(doctorUser.email || '');
            await this.createSystemMessage(conversation, `${doctorName} joined this care thread as the assigned Doctor.`);
        }

        this.publish('triage:doctor_onboarded', {
            conversation: await this.formatConversation(conversation._id.toString(), {
                user_id: actorUserId,
                role: Role.SUPER_ADMIN,
                email: '',
                jti: ''
            } as JwtPayload)
        }, this.getRooms(conversation));
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
        }).populate({
            path: 'doctor_id',
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

        if (actor.role === Role.DOCTOR) {
            const doctor = request.doctor_id as any;
            const doctorUserId = doctor?.user_id?._id?.toString() || doctor?.user_id?.toString();
            if (conversation.doctor_user_id?.toString() !== actor.user_id && doctorUserId !== actor.user_id) {
                throw new ForbiddenError('Doctor can access only assigned care threads');
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
                select: 'patient_id doctor_id status urgency reason claimed_by claim_expires_at',
                populate: [
                    { path: 'patient_id', select: 'full_name user_id', populate: { path: 'user_id', select: 'email' } },
                    { path: 'doctor_id', select: 'personal_info user_id specialty', populate: { path: 'user_id', select: 'email' } }
                ]
            })
            .populate('assistant_user_id', 'email')
            .populate('doctor_user_id', 'email');

        if (!conversation) {
            throw new NotFoundError('Triage conversation not found');
        }

        return this.formatConversationDocument(conversation, actor);
    }

    private formatConversationDocument(conversation: any, actor: JwtPayload) {
        const request = conversation.care_request_id as any;
        const patient = request?.patient_id;
        const patientUser = patient?.user_id;
        const doctor = request?.doctor_id;
        const doctorUser = doctor?.user_id;
        const assistantUser = conversation.assistant_user_id as any;
        const doctorParticipantUser = conversation.doctor_user_id as any;

        return {
            conversation_id: conversation._id.toString(),
            care_request_id: request?._id?.toString() || conversation.care_request_id.toString(),
            patient_id: patient?._id?.toString() || conversation.patient_id.toString(),
            patient_name: patient?.full_name || this.formatNameFromEmail(patientUser?.email || ''),
            patient_email: patientUser?.email,
            assistant_user_id: assistantUser?._id?.toString() || conversation.assistant_user_id?.toString() || null,
            assistant_email: assistantUser?.email || null,
            doctor_user_id: doctorParticipantUser?._id?.toString() || conversation.doctor_user_id?.toString() || doctorUser?._id?.toString() || null,
            doctor_id: doctor?._id?.toString() || request?.doctor_id?.toString() || null,
            doctor_name: doctor?.personal_info?.full_name || this.formatNameFromEmail(doctorUser?.email || ''),
            doctor_email: doctorUser?.email || doctorParticipantUser?.email || null,
            doctor_specialty: doctor?.specialty || null,
            status: conversation.status,
            care_request_status: request?.status,
            urgency: request?.urgency,
            reason: request?.reason,
            doctor_handoff_notes: conversation.doctor_handoff_notes || '',
            doctor_handoff: conversation.doctor_handoff || {},
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
        if (actor.role === Role.DOCTOR) return 'doctor';
        if (actor.role === Role.SUPER_ADMIN) return 'admin';
        throw new ForbiddenError('Unsupported triage chat role');
    }

    private getRooms(conversation: any) {
        return [
            `triage:${conversation._id.toString()}`,
            `user:${conversation.patient_id?.toString()}`,
            conversation.assistant_user_id ? `user:${conversation.assistant_user_id.toString()}` : '',
            conversation.doctor_user_id ? `user:${conversation.doctor_user_id.toString()}` : '',
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
