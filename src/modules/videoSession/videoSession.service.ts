import crypto from 'crypto';
import mongoose from 'mongoose';
import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { CareRequest } from '../../models/CareRequest.model';
import { Doctor as DoctorModel } from '../../models/Doctor.model';
import { Patient } from '../../models/Patient.model';
import { SessionBooking } from '../../models/SessionBooking.model';
import { User } from '../../models/User.model';
import { VideoSession } from '../../models/VideoSession.model';
import { Role, SessionStatus, UserStatus } from '../../models/enums';
import { config } from '../../config/config';
import { JwtPayload } from '../../utils/jwt';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { triageChatService } from '../triageChat/triageChat.service';

const openCareStatuses = ['assigned', 'in_treatment', 'follow_up_needed', 'patient_requested_closure'];
const activeVideoStatuses = ['scheduled', 'active'];
const rtcTokenMaxSeconds = 2 * 60;

class VideoSessionService {
    async listForCareRequest(careRequestId: string, actor: JwtPayload) {
        const request = await this.getAuthorizedCareRequest(careRequestId, actor, false);
        const sessions = await VideoSession.find({ care_request_id: request._id })
            .sort({ scheduled_start_at: -1 })
            .populate('slot_id', 'scheduled_at duration_mins status mode')
            .populate({ path: 'doctor_id', select: 'user_id specialty credential_status personal_info', populate: { path: 'user_id', select: 'email status' } })
            .lean();

        return {
            video_sessions: sessions.map(session => this.formatSession(session))
        };
    }

    async listAvailableSlots(careRequestId: string, actor: JwtPayload, query: { start_date?: string; end_date?: string }) {
        const request = await this.getAuthorizedCareRequest(careRequestId, actor, true);
        if (actor.role !== Role.DOCTOR && actor.role !== Role.SUPER_ADMIN) {
            throw new ForbiddenError('Only the assigned Doctor or admin can schedule video sessions');
        }

        const now = new Date();
        const startDate = query.start_date ? new Date(`${query.start_date}T00:00:00Z`) : now;
        const endDate = query.end_date ? new Date(`${query.end_date}T23:59:59Z`) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const slots = await SessionBooking.find({
            doctor_id: request.doctor_id,
            status: SessionStatus.AVAILABLE,
            mode: { $in: ['video', 'either'] },
            scheduled_at: { $gte: startDate, $lte: endDate }
        }).sort({ scheduled_at: 1 }).lean();

        return {
            slots: slots.map(slot => ({
                slot_id: slot._id.toString(),
                scheduled_at: slot.scheduled_at,
                duration_mins: slot.duration_mins,
                status: slot.status,
                mode: slot.mode
            }))
        };
    }

    async create(actor: JwtPayload, data: { care_request_id: string; slot_id: string }) {
        const request = await this.getAuthorizedCareRequest(data.care_request_id, actor, true);
        if (actor.role !== Role.DOCTOR && actor.role !== Role.SUPER_ADMIN) {
            throw new ForbiddenError('Only the assigned Doctor or admin can schedule video sessions');
        }
        if (!request.doctor_id) {
            throw new BadRequestError('Assign a Doctor before scheduling video');
        }
        if (!openCareStatuses.includes(request.status)) {
            throw new BadRequestError('Video sessions can only be scheduled for assigned or in-treatment cases');
        }

        const doctorId = request.doctor_id._id?.toString() || request.doctor_id.toString();
        const patientId = request.patient_id._id?.toString() || request.patient_id.toString();
        const maxMinutes = Math.min(config.agora.sessionMaxMinutes || 50, 50);
        const slot = await SessionBooking.findOneAndUpdate(
            {
                _id: data.slot_id,
                doctor_id: doctorId,
                status: SessionStatus.AVAILABLE,
                mode: { $in: ['video', 'either'] },
                scheduled_at: { $gte: new Date() }
            },
            {
                $set: {
                    patient_id: patientId,
                    status: SessionStatus.CONFIRMED
                }
            },
            { new: true }
        );

        if (!slot) {
            throw new ConflictError('This slot is no longer available. Refresh and choose another slot.');
        }

        const duration = Math.min(slot.duration_mins || maxMinutes, maxMinutes);
        const scheduledEnd = new Date(slot.scheduled_at.getTime() + duration * 60 * 1000);
        try {
// TOCTOU Fix: Optimistic creation followed by overlap validation
            const videoSession = await VideoSession.create({
                care_request_id: request._id,
                patient_id: patientId,
                doctor_id: doctorId,
                slot_id: slot._id,
                created_by: actor.user_id,
                status: 'scheduled',
                scheduled_start_at: slot.scheduled_at,
                scheduled_end_at: scheduledEnd,
                max_duration_minutes: duration,
                agora_channel_name: this.buildChannelName(request._id.toString(), slot._id.toString()),
                patient_uid: this.numericUid(patientId, 1),
                doctor_uid: this.numericUid(doctorId, 2)
            });

            // Check if another concurrent request created an overlapping session
            const overlaps = await VideoSession.find({
                doctor_id: doctorId,
                status: { $in: activeVideoStatuses },
                scheduled_start_at: { $lt: scheduledEnd },
                scheduled_end_at: { $gt: slot.scheduled_at }
            }).sort({ _id: 1 }); // Sort by creation order

            if (overlaps.length > 1 && overlaps[0]._id.toString() !== videoSession._id.toString()) {
                // We lost the race! Revert our session and slot
                await VideoSession.findByIdAndDelete(videoSession._id);
                await SessionBooking.findByIdAndUpdate(slot._id, {
                    $unset: { patient_id: '' },
                    $set: { status: SessionStatus.AVAILABLE }
                });
                throw new ConflictError('Doctor already has a video session overlapping this slot');
            }

            await triageChatService.addSystemMessageForCareRequest(
                request._id.toString(),
                `Video session scheduled for ${slot.scheduled_at.toLocaleString()} (${duration} minutes).`
            );

            return {
                message: 'Video session scheduled',
                video_session: this.formatSession(await videoSession.populate('slot_id', 'scheduled_at duration_mins status mode'))
            };

        } catch (error) {
            await SessionBooking.findByIdAndUpdate(slot._id, {
                $unset: { patient_id: '' },
                $set: { status: SessionStatus.AVAILABLE }
            });
            throw error;
        }
    }

    async joinToken(sessionId: string, actor: JwtPayload) {
        const liveActor = await this.getLiveActiveActor(actor, [Role.PATIENT, Role.DOCTOR, Role.SUPER_ADMIN]);
        const videoSession = await VideoSession.findById(sessionId).populate('slot_id', 'status patient_id doctor_id').populate('care_request_id');
        if (!videoSession) {
            throw new NotFoundError('Video session not found');
        }

        const request = await this.assertCanAccessSession(videoSession, liveActor, { forJoin: true });
        this.assertAgoraConfigured();
        this.assertSessionStillBoundToRequest(videoSession, request);
        this.assertSlotJoinable(videoSession);
        const secondsUntilClose = this.assertJoinWindow(videoSession);

        const now = new Date();
        const updateFields: any = { last_presence_at: now };
        
        if (liveActor.role === Role.PATIENT && !videoSession.patient_joined_at) {
            updateFields.patient_joined_at = now;
        }
        if (liveActor.role === Role.DOCTOR && !videoSession.doctor_joined_at) {
            updateFields.doctor_joined_at = now;
        }

        // Atomically transition from scheduled to active (prevents duplicate messages)
        const activatedSession = await VideoSession.findOneAndUpdate(
            { _id: sessionId, status: 'scheduled' },
            { 
                $set: { 
                    status: 'active', 
                    started_at: now,
                    ...updateFields
                } 
            },
            { new: true }
        );

        if (activatedSession) {
            // We won the race to activate the session
            await SessionBooking.findByIdAndUpdate(this.idOf(videoSession.slot_id), { $set: { status: SessionStatus.IN_SESSION } });
            await triageChatService.addSystemMessageForCareRequest(this.idOf(videoSession.care_request_id), 'Video session started.');
            Object.assign(videoSession, activatedSession.toObject());
        } else {
            // Session was already active or in another state, just update presence atomically (prevents lost updates)
            const presenceSession = await VideoSession.findByIdAndUpdate(
                sessionId,
                { $set: updateFields },
                { new: true }
            );
            if (presenceSession) {
                Object.assign(videoSession, presenceSession.toObject());
            }
        }

        let uid;
        if (liveActor.role === Role.DOCTOR) uid = videoSession.doctor_uid;
        else if (liveActor.role === Role.PATIENT) uid = videoSession.patient_uid;
        else uid = this.numericUid(liveActor.user_id, 3); // Admins get UID 3
        const configuredTtl = config.agora.tokenTtlSeconds || rtcTokenMaxSeconds;
        const tokenTtl = Math.max(60, Math.min(configuredTtl, rtcTokenMaxSeconds, secondsUntilClose));
        const expiresAt = Math.floor(Date.now() / 1000) + tokenTtl;
        const token = RtcTokenBuilder.buildTokenWithUid(
            config.agora.appId,
            config.agora.appCertificate,
            videoSession.agora_channel_name,
            uid,
            RtcRole.PUBLISHER,
            tokenTtl,
            tokenTtl
        );

        return {
            app_id: config.agora.appId,
            channel_name: videoSession.agora_channel_name,
            token,
            uid,
            expires_at: new Date(expiresAt * 1000),
            video_session: this.formatSession(videoSession)
        };
    }

    async end(sessionId: string, actor: JwtPayload) {
        const videoSession = await VideoSession.findById(sessionId);
        if (!videoSession) {
            throw new NotFoundError('Video session not found');
        }
        await this.assertCanAccessSession(videoSession, actor);
        if (actor.role !== Role.DOCTOR && actor.role !== Role.SUPER_ADMIN) {
            throw new ForbiddenError('Only Doctor or admin can end a video session');
        }
        return this.closeSession(videoSession, 'completed', actor.user_id, 'Video session completed.');
    }

    async cancel(sessionId: string, actor: JwtPayload, reason?: string) {
        const videoSession = await VideoSession.findById(sessionId);
        if (!videoSession) {
            throw new NotFoundError('Video session not found');
        }
        await this.assertCanAccessSession(videoSession, actor);
        if (videoSession.status === 'completed') {
            throw new BadRequestError('Completed sessions cannot be cancelled');
        }
        videoSession.cancel_reason = reason;
        return this.closeSession(videoSession, 'cancelled', actor.user_id, reason || 'Video session cancelled.');
    }

    
    async ping(sessionId: string, actor: JwtPayload) {
        const videoSession = await VideoSession.findById(sessionId);
        if (!videoSession) throw new NotFoundError('Video session not found');
        
        if (videoSession.status === 'active') {
            await VideoSession.updateOne({ _id: sessionId }, { $set: { last_presence_at: new Date() } });
        }
        return { message: 'Ping recorded' };
    }

    async cleanupExpired() {
        const now = new Date();
        const graceMs = (config.agora.graceMinutes || 10) * 60 * 1000;
        const scheduledExpired = await VideoSession.find({
            status: 'scheduled',
            scheduled_end_at: { $lte: new Date(now.getTime() - graceMs) }
        });
        const activeExpired = await VideoSession.find({
            status: 'active',
            scheduled_end_at: { $lte: new Date(now.getTime() - graceMs) }
        });

        const abandonedActive = await VideoSession.find({
            status: 'active',
            last_presence_at: { $lte: new Date(now.getTime() - 5 * 60 * 1000) }
        });

        const uniqueActiveToClose = new Map();
        for (const s of activeExpired) uniqueActiveToClose.set(s._id.toString(), { session: s, reason: 'Video session expired and was closed automatically.' });
        for (const s of abandonedActive) uniqueActiveToClose.set(s._id.toString(), { session: s, reason: 'Video session ended automatically due to inactivity.' });

        let closed = 0;
        for (const session of scheduledExpired) {
            await this.closeSession(session, 'missed', undefined, 'Video session missed.');
            closed += 1;
        }
        const uniqueValues = Array.from(uniqueActiveToClose.values());
        for (const { session, reason } of uniqueValues) {
            await this.closeSession(session, 'expired', undefined, reason);
            closed += 1;
        }

        return { closed };
    }

    async cancelOpenSessionsForCareRequest(careRequestId: string, actorUserId: string, reason: string) {
        const sessions = await VideoSession.find({ care_request_id: careRequestId, status: { $in: activeVideoStatuses } });
        for (const session of sessions) {
            session.cancel_reason = reason;
            await this.closeSession(session, 'cancelled', actorUserId, reason);
        }
    }

    private async closeSession(videoSession: any, status: 'completed' | 'cancelled' | 'expired' | 'missed', actorUserId?: string, message?: string) {
        if (!activeVideoStatuses.includes(videoSession.status)) {
            return { message: 'Video session already closed', video_session: this.formatSession(videoSession) };
        }

        const now = new Date();
        videoSession.status = status;
        videoSession.ended_at = now;
        if (status === 'cancelled') {
            videoSession.cancelled_at = now;
        }
        await videoSession.save();

        const slotStatus = status === 'cancelled' && videoSession.started_at === undefined
            ? SessionStatus.AVAILABLE
            : status === 'missed'
                ? SessionStatus.MISSED
                : status === 'expired'
                    ? SessionStatus.EXPIRED
                    : SessionStatus.COMPLETED;

        const slotUpdate = status === 'cancelled' && videoSession.started_at === undefined
            ? { $set: { status: slotStatus }, $unset: { patient_id: '' } }
            : { $set: { status: slotStatus } };
        await SessionBooking.findByIdAndUpdate(this.idOf(videoSession.slot_id), slotUpdate);

        await triageChatService.addSystemMessageForCareRequest(this.idOf(videoSession.care_request_id), message || `Video session ${status}.`);

        return {
            message: `Video session ${status}`,
            video_session: this.formatSession(videoSession)
        };
    }

    private async getAuthorizedCareRequest(careRequestId: string, actor: Pick<JwtPayload, 'user_id' | 'role'>, requireDoctorAssignment: boolean) {
        const request = await CareRequest.findById(careRequestId)
            .populate({ path: 'patient_id', populate: { path: 'user_id', select: 'email role status' } })
            .populate({ path: 'doctor_id', populate: { path: 'user_id', select: 'email role status' } });
        if (!request) {
            throw new NotFoundError('Care request not found');
        }
        if (requireDoctorAssignment && !request.doctor_id) {
            throw new BadRequestError('Doctor must be assigned before scheduling video');
        }

        if (actor.role === Role.SUPER_ADMIN) return request;

        const patient = request.patient_id as any;
        const patientUser = patient?.user_id;
        const patientUserId = patient?.user_id?._id?.toString() || patient?.user_id?.toString();
        if (actor.role === Role.PATIENT && patientUserId === actor.user_id && patientUser?.status === UserStatus.ACTIVE) {
            return request;
        }

        const doctor = request.doctor_id as any;
        const doctorUser = doctor?.user_id;
        const doctorUserId = doctor?.user_id?._id?.toString() || doctor?.user_id?.toString();
        if (actor.role === Role.DOCTOR && doctorUserId === actor.user_id && doctorUser?.status === UserStatus.ACTIVE) {
            return request;
        }

        throw new ForbiddenError('Not allowed to access this video session');
    }

    private async assertCanAccessSession(videoSession: any, actor: Pick<JwtPayload, 'user_id' | 'role'>, options?: { forJoin?: boolean }) {
        const request = await CareRequest.findById(videoSession.care_request_id)
            .populate({ path: 'patient_id', populate: { path: 'user_id', select: 'email role status' } })
            .populate({ path: 'doctor_id', populate: { path: 'user_id', select: 'email role status' } });
        if (!request) {
            throw new NotFoundError('Care request not found');
        }
        if (options?.forJoin && !openCareStatuses.includes(request.status)) {
            throw new BadRequestError('This care request is closed and the video session is no longer joinable');
        }
        await this.getAuthorizedCareRequest(request._id.toString(), actor, false);
        return request;
    }

    private assertJoinWindow(videoSession: any) {
        if (!activeVideoStatuses.includes(videoSession.status)) {
            throw new BadRequestError('This video session is not joinable');
        }
        const now = Date.now();
        const opensAt = new Date(videoSession.scheduled_start_at).getTime() - (config.agora.joinEarlyMinutes || 5) * 60 * 1000;
        const closesAt = new Date(videoSession.scheduled_end_at).getTime() + (config.agora.graceMinutes || 10) * 60 * 1000;
        if (now < opensAt) {
            throw new BadRequestError('This video session is not open yet');
        }
        if (now > closesAt) {
            throw new BadRequestError('This video session has expired');
        }
        return Math.max(60, Math.floor((closesAt - now) / 1000));
    }

    private async getLiveActiveActor(actor: JwtPayload, allowedRoles: Role[]) {
        if (!allowedRoles.includes(actor.role)) {
            throw new ForbiddenError('You are not allowed to join this video session');
        }

        const user = await User.findById(actor.user_id).select('role status email tier');
        if (!user) {
            throw new ForbiddenError('User account is no longer available');
        }
        if (user.role !== actor.role) {
            throw new ForbiddenError('User role changed. Please sign in again.');
        }
        if (user.status !== UserStatus.ACTIVE) {
            throw new ForbiddenError('User account is not active');
        }

        return {
            user_id: user._id.toString(),
            role: user.role
        };
    }

    private assertSessionStillBoundToRequest(videoSession: any, request: any) {
        const requestPatientId = request.patient_id?._id?.toString() || request.patient_id?.toString();
        const requestDoctorId = request.doctor_id?._id?.toString() || request.doctor_id?.toString();
        const sessionPatientId = videoSession.patient_id?.toString();
        const sessionDoctorId = videoSession.doctor_id?.toString();
        if (requestPatientId !== sessionPatientId || requestDoctorId !== sessionDoctorId) {
            throw new ForbiddenError('This video session is no longer attached to the current care team');
        }
    }

    private assertSlotJoinable(videoSession: any) {
        const slot = videoSession.slot_id as any;
        if (!slot || ![SessionStatus.CONFIRMED, SessionStatus.IN_SESSION].includes(slot.status)) {
            throw new BadRequestError('The booked slot is no longer joinable');
        }
    }

    private idOf(value: any) {
        return value?._id?.toString() || value?.toString();
    }

    private assertAgoraConfigured() {
        if (!config.agora.appId || !config.agora.appCertificate) {
            throw new BadRequestError('Agora is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE on the backend.');
        }
    }

    private buildChannelName(careRequestId: string, slotId: string) {
        // HIPAA-compliant cryptographically secure channel name
        return `apo_${crypto.randomBytes(24).toString('base64url')}`;
    }

    private numericUid(id: string, salt: number) {
        // To absolutely guarantee no collisions within the same channel, 
        // we map Patient to 1, Doctor to 2, Admin to 3+.
        return salt;
    }

    private formatSession(session: any) {
        const doctor = session.doctor_id;
        const doctorUser = doctor?.user_id;
        const slot = session.slot_id;
        return {
            video_session_id: session._id.toString(),
            care_request_id: session.care_request_id?.toString(),
            patient_id: session.patient_id?.toString(),
            doctor_id: doctor?._id?.toString() || session.doctor_id?.toString(),
            doctor_name: doctor?.personal_info?.full_name || this.formatNameFromEmail(doctorUser?.email || ''),
            doctor_email: doctorUser?.email,
            slot_id: slot?._id?.toString() || session.slot_id?.toString(),
            slot_status: slot?.status,
            status: session.status,
            scheduled_start_at: session.scheduled_start_at,
            scheduled_end_at: session.scheduled_end_at,
            max_duration_minutes: session.max_duration_minutes,
            patient_joined_at: session.patient_joined_at,
            doctor_joined_at: session.doctor_joined_at,
            started_at: session.started_at,
            ended_at: session.ended_at,
            cancelled_at: session.cancelled_at,
            cancel_reason: session.cancel_reason,
            last_presence_at: session.last_presence_at,
            created_at: session.created_at,
            updated_at: session.updated_at
        };
    }

    private formatNameFromEmail(email = '') {
        return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) || 'User';
    }
}

export const videoSessionService = new VideoSessionService();
