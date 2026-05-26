import { Patient, IPatient } from '../../models/Patient.model';
import { User } from '../../models/User.model';
import { Doctor as DoctorModel } from '../../models/Doctor.model';
import { ActivityCalendar } from '../../models/ActivityCalendar.model';
import { SessionBooking } from '../../models/SessionBooking.model';
import { ChatSession } from '../../models/ChatSession.model';
import { Subscription } from '../../models/Subscription.model';
import { InviteToken } from '../../models/InviteToken.model';
import { decrypt } from '../../utils/encryption';
import { redisService } from '../../services/redis.service';
import { avatarService } from '../../services/avatar.service';
import { careRequestService } from '../../services/careRequest.service';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../../utils/errors';
import { Tier } from '../../models/enums';
import { logger } from '../../utils/logger';
import { toZonedTime, formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addMinutes, isBefore, isAfter, parseISO } from 'date-fns';

export class PatientService {
    async getDoctorSlots(doctorId: string, start_date_str: string, end_date_str: string, patient_timezone: string) {
        const Doctor = await DoctorModel.findById(doctorId);
        if (!Doctor) throw new NotFoundError('Doctor not found');

        const slots: Array<{ start_time: Date, end_time: Date }> = [];
        const session_duration = Doctor.portal_settings?.default_session_duration_mins || 50;

        const startDate = new Date(`${start_date_str}T00:00:00Z`);
        const endDate = new Date(`${end_date_str}T23:59:59Z`);
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getUTCDay();
            const rules = Doctor.availability.filter(a => a.day_of_week === dayOfWeek && a.is_available !== false);
            
            for (const rule of rules) {
                const tz = rule.timezone || 'UTC';
                const dateString = d.toISOString().split('T')[0];
                const startTimeStr = `${dateString}T${rule.start_time}:00`;
                const endTimeStr = `${dateString}T${rule.end_time}:00`;

                const startZoned = fromZonedTime(startTimeStr, tz);
                const endZoned = fromZonedTime(endTimeStr, tz);

                let currentSlotStart = startZoned;
                while (true) {
                    const currentSlotEnd = addMinutes(currentSlotStart, session_duration);
                    if (isAfter(currentSlotEnd, endZoned)) {
                        break;
                    }
                    
                    if (isAfter(currentSlotStart, new Date())) {
                        slots.push({
                            start_time: currentSlotStart,
                            end_time: currentSlotEnd
                        });
                    }
                    
                    // Increment by 60 minutes for clean hour boundaries
                    currentSlotStart = addMinutes(currentSlotStart, 60);
                }
            }
        }

        const existingBookings = await SessionBooking.find({
            doctor_id: doctorId,
            status: { $in: ['pending', 'confirmed'] },
            scheduled_at: { $gte: startDate, $lte: endDate }
        });

        const availableSlots = slots.filter(slot => {
            for (const booking of existingBookings) {
                const bookingStart = booking.scheduled_at;
                const bookingEnd = addMinutes(bookingStart, booking.duration_mins);
                if (isBefore(slot.start_time, bookingEnd) && isAfter(slot.end_time, bookingStart)) {
                    return false;
                }
            }
            return true;
        });

        availableSlots.sort((a, b) => a.start_time.getTime() - b.start_time.getTime());

        return availableSlots.map(s => ({
            start_time: s.start_time.toISOString(),
            end_time: s.end_time.toISOString()
        }));
    }

    /**
     * Get patient profile with Doctor and tier info
     */
    async getProfile(user_id: string) {
        const user = await User.findById(user_id);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        const patient = await Patient.findOne({ user_id }).populate('doctor_id', 'user_id specialty');
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        // Get Doctor details if assigned
        let Doctor_info = null;
        if (patient.doctor_id) {
            const Doctor = await DoctorModel.findById(patient.doctor_id).populate('user_id', 'email');
            if (Doctor) {
                const Doctor_user = Doctor.user_id as any;
                Doctor_info = {
                    doctor_id: Doctor._id.toString(),
                    email: decrypt(Doctor_user.email),
                    specialty: Doctor.specialty
                };
            }
        }

        // Get subscription info
        const subscription = await Subscription.findOne({ user_id });

        return {
            user: {
                user_id: user._id.toString(),
                email: decrypt(user.email),
                role: user.role,
                tier: user.tier,
                status: user.status,
                email_verified: user.email_verified,
                mfa_enabled: user.mfa_enabled,
                must_change_password: user.must_change_password,
                created_at: user.created_at,
                updated_at: user.updated_at
            },
            patient: {
                patient_id: patient._id.toString(),
                full_name: patient.full_name,
                date_of_birth: patient.date_of_birth,
                phone_number: patient.phone_number,
                timezone: patient.timezone,
                preferences: this.getPatientPreferences(patient.preferences),
                care_status: patient.care_status,
                illness_description: patient.illness_description,
                care_status_updated_at: patient.care_status_updated_at,
                onboarding_source: patient.onboarding_source,
                activity_score: patient.activity_score,
                current_streak: patient.current_streak,
                streak_last_date: patient.streak_last_date,
                last_active: patient.last_active,
                created_at: patient.created_at,
                updated_at: patient.updated_at
            },
            Doctor: Doctor_info,
            subscription: subscription ? {
                tier: subscription.tier,
                status: subscription.status,
                current_period_end: subscription.current_period_end,
                cancel_at_period_end: subscription.cancel_at_period_end
            } : {
                tier: user.tier,
                status: 'none',
                current_period_end: null,
                cancel_at_period_end: false
            }
        };
    }

    /**
     * Update patient profile
     */
    async updateProfile(user_id: string, data: {
        full_name?: string;
        date_of_birth?: string;
        phone_number?: string;
        timezone?: string;
        illness_description?: string;
        preferences?: {
            notifications_enabled?: boolean;
            email_notifications?: boolean;
            push_notifications?: boolean;
            theme?: 'light' | 'dark' | 'system';
        };
    }) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        if (data.full_name !== undefined) {
            patient.full_name = data.full_name;
        }

        if (data.date_of_birth !== undefined) {
            patient.date_of_birth = new Date(`${data.date_of_birth}T00:00:00.000Z`);
        }

        if (data.phone_number !== undefined) {
            patient.phone_number = data.phone_number;
        }

        if (data.timezone !== undefined) {
            patient.timezone = data.timezone;
        }

        if (data.illness_description !== undefined) {
            patient.illness_description = data.illness_description;
            if (patient.care_status === 'treated' || patient.care_status === 'inactive') {
                patient.care_status = 'needs_care';
            }
            patient.care_status_updated_at = new Date();
        }

        if (data.preferences !== undefined) {
            patient.preferences = {
                ...this.toPlainObject(patient.preferences),
                ...data.preferences
            };
        }

        patient.last_active = new Date();
        await patient.save();

        logger.info(`Patient ${patient._id} profile updated`);

        return this.getProfile(user_id);
    }

    async updateCareStatus(user_id: string, data: {
        care_status: 'needs_care' | 'treated';
        illness_description?: string;
    }) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        if (data.care_status === 'needs_care') {
            await careRequestService.createForPatient(user_id, {
                reason: data.illness_description || patient.illness_description || 'Patient requested treatment',
                source: 'patient'
            });
        } else {
            await careRequestService.requestClosure(user_id);
        }

        return this.getProfile(user_id);
    }

    async createCareRequest(user_id: string, data: {
        reason: string;
        urgency?: 'low' | 'normal' | 'high';
        preferred_specialty?: string;
        preferred_doctor_gender?: 'male' | 'female' | 'any';
        availability?: string;
        patient_notes?: string;
    }) {
        return careRequestService.createForPatient(user_id, {
            ...data,
            source: 'patient'
        });
    }

    async getCareRequests(user_id: string) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        return careRequestService.listRequests({
            page: 1,
            limit: 100,
            patient_id: patient._id.toString()
        });
    }

    async requestCareClosure(user_id: string) {
        return careRequestService.requestClosure(user_id);
    }

    async assignAvatar(user_id: string, gender: string) {
        const assignment = await avatarService.assignAvatarForPatient(user_id, gender, 1);
        if (!assignment) {
            throw new NotFoundError('Patient profile not found');
        }

        return {
            message: 'Avatar assigned successfully',
            ...assignment
        };
    }

    /**
     * Get home dashboard data (composite query)
     */
    async getHomeData(user_id: string) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        const patient_id = patient._id;

        // Get upcoming activities (next 7 days)
        const today = new Date();
        const next_week = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const upcoming_activities = await ActivityCalendar.find({
            patient_id,
            scheduled_at: { $gte: today, $lte: next_week },
            completed_at: null
        })
        .sort({ scheduled_at: 1 })
        .limit(5)
        .select('activity_type title scheduled_at duration');

        // Get next session
        const next_session = await SessionBooking.findOne({
            patient_id,
            scheduled_at: { $gte: today },
            status: { $in: ['pending', 'confirmed'] }
        })
        .sort({ scheduled_at: 1 })
        .populate('doctor_id', 'user_id specialty');

        // Get recent chat sessions
        const recent_chats = await ChatSession.find({ patient_id })
            .sort({ started_at: -1 })
            .limit(3)
            .select('started_at message_count tokens_used');

        // Get token usage from Redis
        const tokens_used_today = await redisService.getChatTokensUsedToday(patient_id.toString());
        const content_views_today = await redisService.getContentViewsToday(patient_id.toString());

        // Token limits based on tier
        const user = await User.findById(user_id);
        const token_limit = user?.tier === 'free' ? 50 : user?.tier === 'basic' ? 200 : 999999;
        const content_limit = user?.tier === 'free' ? 5 : user?.tier === 'basic' ? 20 : 999999;

        // Calculate streak status
        const streak_status = this.calculateStreakStatus(patient);

        return {
            patient_id: patient._id.toString(),
            avatar_state: patient.avatar_state,
            has_avatar: Boolean(patient.avatar_state?.gender && patient.avatar_state?.storage_key),
            activity_score: patient.activity_score,
            current_streak: patient.current_streak,
            streak_status,
            upcoming_activities: upcoming_activities.map(a => ({
                activity_id: a._id.toString(),
                activity_type: a.activity_type,
                title: a.title,
                scheduled_at: a.scheduled_at,
                duration: a.duration
            })),
            next_session: next_session ? {
                session_id: next_session._id.toString(),
                scheduled_at: next_session.scheduled_at,
                duration_mins: next_session.duration_mins,
                status: next_session.status,
                video_link: next_session.video_link
            } : null,
            recent_chats: recent_chats.map(c => ({
                session_id: c._id.toString(),
                started_at: c.started_at,
                message_count: c.message_count,
                tokens_used: c.tokens_used
            })),
            usage_stats: {
                tokens_used_today,
                token_limit,
                tokens_remaining: Math.max(0, token_limit - tokens_used_today),
                content_views_today,
                content_limit,
                content_views_remaining: Math.max(0, content_limit - content_views_today)
            }
        };
    }

    /**
     * Get token usage for today
     */
    async getTokenUsage(user_id: string) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        const user = await User.findById(user_id);
        const tokens_used_today = await redisService.getChatTokensUsedToday(patient._id.toString());
        
        // Token limits based on tier
        const token_limit = user?.tier === 'free' ? 50 : user?.tier === 'basic' ? 200 : 999999;
        
        // Calculate reset time (midnight UTC)
        const now = new Date();
        const reset_time = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        return {
            tokens_used_today,
            token_limit,
            tokens_remaining: Math.max(0, token_limit - tokens_used_today),
            reset_time,
            tier: user?.tier
        };
    }

    /**
     * Get subscription details
     */
    async getSubscription(user_id: string) {
        const user = await User.findById(user_id);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        const subscription = await Subscription.findOne({ user_id });

        if (!subscription) {
            return {
                tier: user.tier,
                status: 'none',
                message: 'No active subscription'
            };
        }

        return {
            tier: subscription.tier,
            status: subscription.status,
            stripe_subscription_id: subscription.stripe_subscription_id,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end,
            grace_period_end: subscription.grace_period_end
        };
    }

    /**
     * Submit Doctor request (for free users)
     */
    async submitDoctorRequest(user_id: string, data: {
        reason: string;
        preferred_specialty?: string;
        availability?: string;
        additional_notes?: string;
    }) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        if (patient.doctor_id) {
            throw new BadRequestError('You already have a Doctor assigned');
        }

        // TODO: Store Doctor request in a separate collection
        // For now, just log it
        logger.info(`Doctor request from patient ${patient._id}:`, data);

        return {
            message: 'Doctor request submitted successfully. We will contact you soon.',
            request_data: data
        };
    }

    async getInvites(user_id: string) {
        const user = await User.findById(user_id);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        const invites = await InviteToken.find({ email: user.email.toLowerCase() })
            .populate({
                path: 'doctor_id',
                select: 'user_id specialty',
                populate: {
                    path: 'user_id',
                    select: 'email'
                }
            })
            .sort({ created_at: -1 })
            .limit(100)
            .lean();

        return {
            invites: invites.map(invite => this.formatInvite(invite)),
            pending_count: invites.filter(invite => this.getInviteStatus(invite) === 'pending').length,
            total: invites.length
        };
    }

    async acceptInvite(user_id: string, invite_id: string) {
        const user = await User.findById(user_id);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        const invite = await InviteToken.findById(invite_id);
        if (!invite) {
            throw new NotFoundError('Invite not found');
        }

        this.assertInviteBelongsToPatient(invite, user.email);
        this.assertInvitePending(invite);

        if (patient.doctor_id && patient.doctor_id.toString() !== invite.doctor_id?.toString()) {
            throw new ConflictError('You already have an assigned Doctor');
        }

        patient.doctor_id = invite.doctor_id;
        patient.doctor_assigned_at = new Date();
        patient.doctor_assignment_source = 'invite';
        patient.care_status = 'assigned';
        patient.care_status_updated_at = new Date();
        patient.onboarding_source = 'invite';
        await patient.save();

        user.tier = Tier.PREMIUM;
        await user.save();

        invite.patient_id = patient._id;
        invite.status = 'accepted';
        invite.used_at = new Date();
        await invite.save();

        return {
            message: 'Doctor invite accepted successfully',
            invite: this.formatInvite(invite),
            doctor_id: invite.doctor_id?.toString()
        };
    }

    async declineInvite(user_id: string, invite_id: string) {
        const user = await User.findById(user_id);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        const invite = await InviteToken.findById(invite_id);
        if (!invite) {
            throw new NotFoundError('Invite not found');
        }

        this.assertInviteBelongsToPatient(invite, user.email);
        this.assertInvitePending(invite);

        invite.status = 'declined';
        invite.declined_at = new Date();
        await invite.save();

        return {
            message: 'Doctor invite declined',
            invite: this.formatInvite(invite)
        };
    }

    /**
     * Calculate streak status
     */
    private calculateStreakStatus(patient: IPatient) {
        if (!patient.streak_last_date) {
            return {
                status: 'inactive',
                message: 'Start your wellness journey today!'
            };
        }

        const now = new Date();
        const last_date = new Date(patient.streak_last_date);
        const diff_days = Math.floor((now.getTime() - last_date.getTime()) / (1000 * 60 * 60 * 24));

        if (diff_days === 0) {
            return {
                status: 'active_today',
                message: `Great! You're on a ${patient.current_streak} day streak!`
            };
        } else if (diff_days === 1) {
            return {
                status: 'at_risk',
                message: `Don't break your ${patient.current_streak} day streak! Complete an activity today.`
            };
        } else {
            return {
                status: 'broken',
                message: 'Your streak was broken. Start a new one today!'
            };
        }
    }

    private assertInviteBelongsToPatient(invite: any, email: string) {
        if (invite.email.toLowerCase() !== email.toLowerCase()) {
            throw new ForbiddenError('This invite does not belong to your account');
        }
    }

    private assertInvitePending(invite: any) {
        if (invite.status !== 'pending' || invite.used_at || invite.declined_at) {
            throw new BadRequestError('Invite is no longer pending');
        }

        if (invite.expires_at <= new Date()) {
            throw new BadRequestError('Invite has expired');
        }
    }

    private getInviteStatus(invite: any) {
        if (invite.status && invite.status !== 'pending') {
            return invite.status;
        }

        if (invite.used_at) {
            return 'accepted';
        }

        if (invite.declined_at) {
            return 'declined';
        }

        if (invite.expires_at <= new Date()) {
            return 'expired';
        }

        return 'pending';
    }

    private formatInvite(invite: any) {
        const Doctor = invite.doctor_id as any;
        const DoctorUser = Doctor?.user_id as any;

        return {
            invite_id: invite._id.toString(),
            email: invite.email,
            status: this.getInviteStatus(invite),
            Doctor: Doctor ? {
                doctor_id: Doctor._id?.toString(),
                email: DoctorUser?.email,
                specialty: Doctor.specialty
            } : null,
            expires_at: invite.expires_at,
            used_at: invite.used_at,
            declined_at: invite.declined_at,
            created_at: invite.created_at,
            is_expired: this.getInviteStatus(invite) === 'expired'
        };
    }

    private toPlainObject(value: any) {
        if (!value) {
            return {};
        }

        if (typeof value.toObject === 'function') {
            return value.toObject();
        }

        return value;
    }

    private getPatientPreferences(preferences: any) {
        return {
            notifications_enabled: true,
            email_notifications: true,
            push_notifications: true,
            theme: 'system',
            ...this.toPlainObject(preferences)
        };
    }
}

export const patientService = new PatientService();
