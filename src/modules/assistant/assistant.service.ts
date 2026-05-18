import { Assistant as AssistantModel } from '../../models/Assistant.model';
import { Patient } from '../../models/Patient.model';
import { SessionBooking } from '../../models/SessionBooking.model';
import { User } from '../../models/User.model';
import { Role, UserStatus } from '../../models/enums';
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors';

export class AssistantService {
    async getMe(userId: string) {
        const { user, Assistant } = await this.getActiveAssistantContext(userId);
        return {
            user: this.formatUser(user),
            Assistant: this.formatAssistant(Assistant)
        };
    }

    async getDoctors(userId: string) {
        const { Assistant } = await this.getActiveAssistantContext(userId);
        const populated = await Assistant.populate({
            path: 'assigned_doctor_ids',
            select: 'user_id specialty max_patients credential_status personal_info professional_info',
            populate: {
                path: 'user_id',
                select: 'email status'
            }
        });

        return {
            Doctors: (populated.assigned_doctor_ids as any[]).map(Doctor => ({
                doctor_id: Doctor._id.toString(),
                email: Doctor.user_id?.email,
                status: Doctor.user_id?.status,
                specialty: Doctor.specialty,
                name: Doctor.personal_info?.full_name || this.formatNameFromEmail(Doctor.user_id?.email || ''),
                credential_status: Doctor.credential_status
            }))
        };
    }

    async getPatients(userId: string) {
        const { Assistant } = await this.getActiveAssistantContext(userId);
        this.assertPermission(Assistant, 'can_view_assigned_patients');

        const doctorIds = Assistant.assigned_doctor_ids;
        const patients = await Patient.find({ doctor_id: { $in: doctorIds } })
            .populate('user_id', 'email role status tier created_at')
            .populate('doctor_id', 'user_id specialty personal_info')
            .sort({ updated_at: -1 })
            .limit(200);

        return {
            patients: patients.map(patient => this.formatPatient(patient)),
            total: patients.length
        };
    }

    async getPatient(userId: string, patientId: string) {
        const { Assistant } = await this.getActiveAssistantContext(userId);
        this.assertPermission(Assistant, 'can_view_assigned_patients');

        const patient = await Patient.findOne({
            _id: patientId,
            doctor_id: { $in: Assistant.assigned_doctor_ids }
        })
            .populate('user_id', 'email role status tier created_at')
            .populate('doctor_id', 'user_id specialty personal_info');

        if (!patient) {
            throw new NotFoundError('Patient not found in Assistant scope');
        }

        const [upcomingBookings, pastBookings] = await Promise.all([
            SessionBooking.find({
                patient_id: patient._id,
                doctor_id: { $in: Assistant.assigned_doctor_ids },
                scheduled_at: { $gte: new Date() }
            }).sort({ scheduled_at: 1 }).limit(5),
            SessionBooking.find({
                patient_id: patient._id,
                doctor_id: { $in: Assistant.assigned_doctor_ids },
                scheduled_at: { $lt: new Date() }
            }).sort({ scheduled_at: -1 }).limit(5)
        ]);

        return {
            patient: this.formatPatient(patient),
            upcoming_bookings: upcomingBookings.map(booking => this.formatBooking(booking)),
            past_bookings: pastBookings.map(booking => this.formatBooking(booking))
        };
    }

    async getBookings(_userId: string) {
        // TODO: Replace this placeholder once the booking workflow has creation/ownership APIs.
        throw new AppError('Booking management is not implemented yet', 501);
    }

    async updateBookingStatus(_userId: string, _bookingId: string) {
        // TODO: Implement after the booking workflow exists.
        throw new AppError('Booking status updates are not implemented yet', 501);
    }

    async sendPatientMessage(userId: string, patientId: string, message: string) {
        const { Assistant } = await this.getActiveAssistantContext(userId);
        this.assertPermission(Assistant, 'can_send_communications');

        const patient = await Patient.findOne({
            _id: patientId,
            doctor_id: { $in: Assistant.assigned_doctor_ids }
        });

        if (!patient) {
            throw new NotFoundError('Patient not found in Assistant scope');
        }

        // TODO: Wire this to the real notification/messaging module when patient communications are implemented.
        return {
            message: 'Communication endpoint accepted but messaging delivery is not implemented yet',
            status: 'todo',
            patient_id: patient._id.toString(),
            preview: message.slice(0, 120)
        };
    }

    private async getActiveAssistantContext(userId: string) {
        const user = await User.findById(userId).select('email role status email_verified mfa_enabled otp_required must_change_password created_at updated_at');
        if (!user || user.role !== Role.ASSISTANT) {
            throw new UnauthorizedError('Assistant account not found');
        }

        if (user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedError('Your Assistant account has been deactivated. Please contact your Doctor or admin.');
        }

        const Assistant = await AssistantModel.findOne({ user_id: user._id });
        if (!Assistant) {
            throw new NotFoundError('Assistant profile not found');
        }

        return { user, Assistant };
    }

    private assertPermission(Assistant: any, permission: 'can_view_assigned_patients' | 'can_manage_bookings' | 'can_send_communications') {
        if (!Assistant.permissions?.[permission]) {
            throw new ForbiddenError('This Assistant account does not have permission for this action');
        }
    }

    private formatUser(user: any) {
        return {
            user_id: user._id.toString(),
            email: user.email,
            role: user.role,
            status: user.status,
            email_verified: user.email_verified,
            mfa_enabled: user.mfa_enabled,
            otp_required: user.otp_required,
            must_change_password: user.must_change_password,
            created_at: user.created_at,
            updated_at: user.updated_at
        };
    }

    private formatAssistant(Assistant: any) {
        return {
            assistant_id: Assistant._id.toString(),
            assigned_doctor_ids: Assistant.assigned_doctor_ids.map((id: any) => id.toString()),
            permissions: Assistant.permissions,
            created_at: Assistant.created_at,
            updated_at: Assistant.updated_at
        };
    }

    private formatPatient(patient: any) {
        const user = patient.user_id;
        const Doctor = patient.doctor_id;
        return {
            patient_id: patient._id.toString(),
            user_id: user?._id?.toString(),
            email: user?.email,
            name: patient.full_name || this.formatNameFromEmail(user?.email || ''),
            status: user?.status,
            tier: user?.tier,
            doctor_id: Doctor?._id?.toString() || patient.doctor_id?.toString(),
            Doctor_name: Doctor?.personal_info?.full_name || this.formatNameFromEmail(Doctor?.user_id?.email || ''),
            onboarding_source: patient.onboarding_source,
            activity_score: patient.activity_score,
            current_streak: patient.current_streak,
            last_active: patient.last_active,
            created_at: patient.created_at,
            updated_at: patient.updated_at
        };
    }

    private formatBooking(booking: any) {
        return {
            booking_id: booking._id.toString(),
            patient_id: booking.patient_id?.toString(),
            doctor_id: booking.doctor_id?.toString(),
            scheduled_at: booking.scheduled_at,
            duration_mins: booking.duration_mins,
            status: booking.status,
            video_link: booking.video_link
        };
    }

    private formatNameFromEmail(email: string) {
        const localPart = email.split('@')[0] || 'User';
        return localPart
            .replace(/[._-]+/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ') || 'User';
    }
}

export const assistantService = new AssistantService();
