import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../../models/User.model';
import { EmailVerification } from '../../models/EmailVerification.model';
import { PasswordReset } from '../../models/PasswordReset.model';
import { RefreshToken } from '../../models/RefreshToken.model';
import { Doctor as DoctorModel } from '../../models/Doctor.model';
import { Assistant as AssistantModel } from '../../models/Assistant.model';
import { Patient } from '../../models/Patient.model';
import { Role, Tier, UserStatus } from '../../models/enums';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { generateTokenPair } from '../../utils/jwt';
import { emailService } from '../../services/email.service';
import { decrypt, encrypt } from '../../utils/encryption';

export class AdminService {
    private readonly otpTtlMs = 10 * 60 * 1000;
    private readonly otpWindowMs = 15 * 60 * 1000;
    private readonly otpCooldownMs = 60 * 1000;
    private readonly otpMaxRequestsPerWindow = 5;
    private readonly AssistantSetupTtlMs = 7 * 24 * 60 * 60 * 1000;

    async signup(data: {
        email: string;
        password: string;
        otp_required?: boolean;
    }) {
        const email = data.email.toLowerCase();

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            throw new ConflictError('Email already registered');
        }

        const existingSuperAdmin = await User.findOne({ role: Role.SUPER_ADMIN });
        if (existingSuperAdmin) {
            throw new BadRequestError('Super admin account already exists');
        }

        const password_hash = await bcrypt.hash(data.password, 12);

        const user = await User.create({
            email,
            password_hash,
            role: Role.SUPER_ADMIN,
            tier: Tier.PREMIUM,
            mfa_enabled: false,
            otp_required: data.otp_required || false,
            email_verified: false,
            status: UserStatus.ACTIVE
        });

        const otp = await this.createEmailOtp(user._id, user.email);
        await emailService.sendAdminSignupOTP(user.email, otp);

        return {
            requires_otp: true,
            email: user.email,
            message: 'Admin signup created. OTP sent to admin email for verification.',
            otp_expires_in: '10 minutes'
        };
    }

    async resendSignupOtp(data: {
        email: string;
    }) {
        const user = await User.findOne({
            email: data.email.toLowerCase(),
            role: Role.SUPER_ADMIN
        });

        if (!user) {
            return {
                message: 'If an unverified admin account exists, a new OTP has been sent'
            };
        }

        if (user.email_verified) {
            throw new BadRequestError('Admin email is already verified');
        }

        const otp = await this.createEmailOtp(user._id, user.email);
        await emailService.sendAdminSignupOTP(user.email, otp);

        return {
            message: 'If an unverified admin account exists, a new OTP has been sent',
            otp_expires_in: '10 minutes'
        };
    }

    async verifySignupOtp(data: {
        email: string;
        otp: string;
    }) {
        const user = await User.findOne({
            email: data.email.toLowerCase(),
            role: Role.SUPER_ADMIN
        });

        if (!user) {
            throw new UnauthorizedError('Invalid OTP');
        }

        if (user.email_verified) {
            throw new BadRequestError('Admin email is already verified');
        }

        await this.verifyEmailOtp(user._id, user.email, data.otp);

        user.email_verified = true;
        await user.save();

        const tokens = await this.createAdminSession(user);

        return {
            ...tokens,
            user: this.formatAdminUser(user)
        };
    }

    async signin(data: {
        email: string;
        password: string;
    }) {
        const user = await this.validateAdminCredentials(data);

        if (user.otp_required) {
            const otp = await this.createEmailOtp(user._id, user.email);
            await emailService.sendAdminLoginOTP(user.email, otp);

            return {
                requires_otp: true,
                email: user.email,
                message: 'OTP sent to admin email',
                otp_expires_in: '10 minutes'
            };
        }

        const tokens = await this.createAdminSession(user);

        return {
            requires_otp: false,
            ...tokens,
            user: this.formatAdminUser(user)
        };
    }

    async checkSigninOtpRequirement(data: {
        email: string;
        password: string;
    }) {
        const user = await this.validateAdminCredentials(data);

        if (!user.otp_required) {
            return {
                requires_otp: false,
                email: user.email,
                message: 'OTP is not required for this admin'
            };
        }

        const otp = await this.createEmailOtp(user._id, user.email);
        await emailService.sendAdminLoginOTP(user.email, otp);

        return {
            requires_otp: true,
            email: user.email,
            message: 'OTP sent to admin email',
            otp_expires_in: '10 minutes'
        };
    }

    async resendSigninOtp(data: {
        email: string;
        password: string;
    }) {
        const user = await User.findOne({
            email: data.email.toLowerCase(),
            role: Role.SUPER_ADMIN
        });

        if (!user) {
            throw new UnauthorizedError('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(data.password, user.password_hash);
        if (!isPasswordValid) {
            throw new UnauthorizedError('Invalid credentials');
        }

        if (!user.email_verified) {
            throw new UnauthorizedError('Please verify admin signup OTP before login');
        }

        if (!user.otp_required) {
            throw new BadRequestError('OTP is not required for this admin');
        }

        const otp = await this.createEmailOtp(user._id, user.email);
        await emailService.sendAdminLoginOTP(user.email, otp);

        return {
            requires_otp: true,
            email: user.email,
            message: 'New OTP sent to admin email',
            otp_expires_in: '10 minutes'
        };
    }

    async verifySigninOtp(data: {
        email: string;
        otp: string;
    }) {
        const user = await User.findOne({
            email: data.email.toLowerCase(),
            role: Role.SUPER_ADMIN
        });

        if (!user) {
            throw new UnauthorizedError('Invalid OTP');
        }

        if (!user.otp_required) {
            throw new BadRequestError('OTP is not required for this admin');
        }

        await this.verifyEmailOtp(user._id, user.email, data.otp);

        const tokens = await this.createAdminSession(user);

        return {
            ...tokens,
            user: this.formatAdminUser(user)
        };
    }

    async forgotPassword(data: {
        email: string;
    }) {
        const user = await User.findOne({
            email: data.email.toLowerCase(),
            role: Role.SUPER_ADMIN
        });

        if (!user) {
            return {
                message: 'If an admin account exists, a password reset OTP has been sent'
            };
        }

        const otp = await this.createPasswordResetOtp(user._id);

        await emailService.sendAdminPasswordResetOTP(user.email, otp);

        return {
            message: 'If an admin account exists, a password reset OTP has been sent',
            otp_expires_in: '10 minutes'
        };
    }

    async resetPassword(data: {
        email: string;
        otp: string;
        password: string;
    }) {
        const user = await User.findOne({
            email: data.email.toLowerCase(),
            role: Role.SUPER_ADMIN
        });

        if (!user) {
            throw new UnauthorizedError('Invalid or expired OTP');
        }

        const reset = await PasswordReset.findOne({
            user_id: user._id,
            token: data.otp,
            used_at: null,
            expires_at: { $gt: new Date() }
        }).sort({ created_at: -1 });

        if (!reset) {
            throw new UnauthorizedError('Invalid or expired OTP');
        }

        user.password_hash = await bcrypt.hash(data.password, 12);
        await user.save();

        reset.used_at = new Date();
        await reset.save();

        await RefreshToken.deleteMany({ user_id: user._id });

        return {
            message: 'Admin password reset successfully'
        };
    }

    async getDashboardSummary() {
        const [
            totalPatients,
            totalAssistants,
            totalStaff,
            recentPatients
        ] = await Promise.all([
            User.countDocuments({ role: Role.PATIENT, status: UserStatus.ACTIVE }),
            User.countDocuments({ role: Role.DOCTOR, status: UserStatus.ACTIVE }),
            User.countDocuments({ role: Role.ASSISTANT, status: UserStatus.ACTIVE }),
            Patient.find()
                .sort({ created_at: -1 })
                .limit(5)
                .populate('user_id', 'email role status created_at')
                .select('_id user_id onboarding_source created_at')
        ]);
        // TODO: Add Sessions Today summery when that part is implemented
        // TODO: Add total Revenue
        //TODO: add top three Assistants based on performance and points
        // all of above for admin main dashboard view 
        return {
            totals: {
                patients: totalPatients,
                Assistants: totalAssistants,
                staff: totalStaff
            },
            recent_patients: recentPatients.map((patient: any) => {
                const user = patient.user_id;
                const email = user?.email || 'unknown@example.com';

                return {
                    patient_id: patient._id.toString(),
                    user_id: user?._id?.toString(),
                    name: this.formatNameFromEmail(email),
                    email,
                    status: user?.status || 'unknown',
                    joined: patient.created_at,
                    onboarding_source: patient.onboarding_source
                };
            })
        };
    }

    async createDoctorAccount(data: {
        email: string;
        password?: string;
        license_number?: string;
        specialty?: string;
        max_patients?: number;
        can_onboard_assistants?: boolean;
        max_assistants?: number;
        credential_status?: 'pending' | 'verified';
        credential_notes?: string;
        otp_required?: boolean;
    }, adminUserId: string) {
        const email = data.email.toLowerCase();

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            throw new ConflictError('Email already registered');
        }

        const password_hash = await bcrypt.hash(this.generateTemporaryPassword(), 12);

        let user;

        try {
            user = await User.create({
                email,
                password_hash,
                role: Role.DOCTOR,
                tier: Tier.FREE,
                mfa_enabled: false,
                otp_required: data.otp_required || false,
                must_change_password: true,
                email_verified: false,
                status: UserStatus.PENDING
            });

            const Doctor = await DoctorModel.create({
                user_id: user._id,
                license_number: encrypt(data.license_number || 'PENDING'),
                specialty: data.specialty,
                max_patients: data.max_patients || 20,
                availability: [],
                portal_settings: {
                    can_onboard_assistants: data.can_onboard_assistants ?? false,
                    max_assistants: data.max_assistants ?? 5
                },
                credential_status: data.credential_status || 'pending',
                credential_notes: data.credential_notes,
                invited_by: adminUserId
            });

            const setupToken = await this.createAssistantSetupToken(user._id);
            const otp = await this.createEmailOtp(user._id, user.email);
            const setupUrl = this.buildAssistantSetupUrl(setupToken);
            await emailService.sendDoctorSetupInvite(user.email, setupUrl, otp, user.role);

            return {
                message: 'Doctor account created. Setup link and OTP sent to Doctor email.',
                user: {
                    user_id: user._id.toString(),
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    email_verified: user.email_verified,
                    otp_required: user.otp_required,
                    must_change_password: user.must_change_password
                },
                Doctor: {
                    doctor_id: Doctor._id.toString(),
                    specialty: Doctor.specialty,
                    max_patients: Doctor.max_patients,
                    can_onboard_assistants: Doctor.portal_settings.can_onboard_assistants,
                    max_assistants: Doctor.portal_settings.max_assistants,
                    credential_status: Doctor.credential_status
                },
                setup_required: true,
                setup_link_sent: true
            };
        } catch (error) {
            if (user) {
                await User.deleteOne({ _id: user._id });
            }
            throw error;
        }
    }

    async getActiveDoctors(query: {
        page: number;
        limit: number;
        search?: string;
        credential_status?: 'pending' | 'verified' | 'rejected';
    }) {
        const page = query.page;
        const limit = query.limit;
        const skip = (page - 1) * limit;
        const DoctorMatch: Record<string, any> = {};

        if (query.credential_status) {
            DoctorMatch.credential_status = query.credential_status;
        }

        const userMatch: Record<string, any> = {
            'user.role': Role.DOCTOR,
            'user.status': { $in: [UserStatus.PENDING, UserStatus.ACTIVE, UserStatus.BLOCKED, UserStatus.SUSPENDED, UserStatus.DEACTIVATED] }
        };

        if (query.search) {
            const regex = new RegExp(this.escapeRegex(query.search), 'i');
            userMatch.$or = [
                { 'user.email': regex },
                { specialty: regex }
            ];
        }

        const [result] = await DoctorModel.aggregate([
            { $match: DoctorMatch },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            { $match: userMatch },
            { $sort: { created_at: -1 } },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                _id: 1,
                                specialty: 1,
                                max_patients: 1,
                                portal_settings: 1,
                                credential_status: 1,
                                credential_notes: 1,
                                created_at: 1,
                                updated_at: 1,
                                user: {
                                    _id: '$user._id',
                                    email: '$user.email',
                                    status: '$user.status',
                                    email_verified: '$user.email_verified',
                                    otp_required: '$user.otp_required',
                                    must_change_password: '$user.must_change_password'
                                }
                            }
                        }
                    ],
                    total: [{ $count: 'count' }]
                }
            }
        ]);

        const total = result?.total?.[0]?.count || 0;
        const Doctors = (result?.data || []).map((Doctor: any) => ({
            doctor_id: Doctor._id.toString(),
            email: Doctor.user.email,
            user_id: Doctor.user._id.toString(),
            status: Doctor.user.status,
            email_verified: Doctor.user.email_verified,
            otp_required: Doctor.user.otp_required,
            must_change_password: Doctor.user.must_change_password,
            specialty: Doctor.specialty,
            max_patients: Doctor.max_patients,
            can_onboard_assistants: Doctor.portal_settings?.can_onboard_assistants ?? false,
            max_assistants: Doctor.portal_settings?.max_assistants ?? 5,
            credential_status: Doctor.credential_status,
            credential_notes: Doctor.credential_notes,
            created_at: Doctor.created_at,
            updated_at: Doctor.updated_at
        }));

        return {
            Doctors,
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

    async getDoctorDetails(doctorId: string) {
        const Doctor = await DoctorModel.findById(doctorId)
            .populate('user_id', 'email role status email_verified otp_required must_change_password created_at updated_at')
            .populate('invited_by', 'email role');

        if (!Doctor) {
            throw new NotFoundError('Doctor not found');
        }

        const user = Doctor.user_id as any;
        if (!user || user.role !== Role.DOCTOR) {
            throw new NotFoundError('Doctor user account not found');
        }

        return this.formatDoctorDetails(Doctor, user, Doctor.invited_by as any);
    }

    async updateDoctorCredentials(doctorId: string, data: {
        license_number?: string;
        specialty?: string;
        max_patients?: number;
        can_onboard_assistants?: boolean;
        max_assistants?: number;
        credential_status?: 'pending' | 'verified' | 'rejected';
        credential_notes?: string;
    }) {
        const Doctor = await DoctorModel.findById(doctorId).populate('user_id', 'email role status email_verified otp_required must_change_password created_at updated_at');

        if (!Doctor) {
            throw new NotFoundError('Doctor not found');
        }

        const user = Doctor.user_id as any;
        if (!user || user.role !== Role.DOCTOR) {
            throw new NotFoundError('Doctor user account not found');
        }

        if (data.license_number !== undefined) {
            Doctor.license_number = encrypt(data.license_number);
        }
        if (data.specialty !== undefined) {
            Doctor.specialty = data.specialty;
        }
        if (data.max_patients !== undefined) {
            Doctor.max_patients = data.max_patients;
        }
        if (data.can_onboard_assistants !== undefined || data.max_assistants !== undefined) {
            const portalSettings = Doctor.portal_settings as any;
            const existingSettings = typeof portalSettings?.toObject === 'function'
                ? portalSettings.toObject()
                : Doctor.portal_settings || {};

            Doctor.portal_settings = {
                email_notifications: existingSettings.email_notifications ?? true,
                push_notifications: existingSettings.push_notifications ?? true,
                booking_notifications: existingSettings.booking_notifications ?? true,
                ai_content_notifications: existingSettings.ai_content_notifications ?? true,
                default_session_duration_mins: existingSettings.default_session_duration_mins ?? 50,
                can_onboard_assistants: data.can_onboard_assistants ?? existingSettings.can_onboard_assistants ?? false,
                max_assistants: data.max_assistants ?? existingSettings.max_assistants ?? 5
            };
        }
        if (data.credential_status !== undefined) {
            Doctor.credential_status = data.credential_status;
        }
        if (data.credential_notes !== undefined) {
            Doctor.credential_notes = data.credential_notes;
        }

        await Doctor.save();

        if (data.credential_status !== undefined) {
            await emailService.sendDoctorCredentialReviewStatus(
                user.email,
                data.credential_status,
                Doctor.credential_notes
            );
        }

        return {
            message: 'Doctor credentials updated successfully',
            Doctor: this.formatDoctorDetails(Doctor, user)
        };
    }

    async updateDoctorAccount(doctorId: string, data: {
        status?: 'pending' | 'active' | 'blocked';
        otp_required?: boolean;
    }) {
        const Doctor = await DoctorModel.findById(doctorId).populate('user_id', 'email role status email_verified otp_required must_change_password created_at updated_at');

        if (!Doctor) {
            throw new NotFoundError('Doctor not found');
        }

        const user = Doctor.user_id as any;
        if (!user || user.role !== Role.DOCTOR) {
            throw new NotFoundError('Doctor user account not found');
        }

        if (data.status !== undefined) {
            user.status = data.status;
        }
        if (data.otp_required !== undefined) {
            user.otp_required = data.otp_required;
        }

        await user.save();

        return {
            message: 'Assistant account updated successfully',
            Doctor: this.formatDoctorDetails(Doctor, user)
        };
    }

    async resendDoctorSetupInvite(doctorId: string) {
        const Doctor = await DoctorModel.findById(doctorId).populate('user_id', 'email role status email_verified must_change_password');

        if (!Doctor) {
            throw new NotFoundError('Doctor not found');
        }

        const user = Doctor.user_id as any;
        if (!user || user.role !== Role.DOCTOR) {
            throw new NotFoundError('Doctor user account not found');
        }

        if (user.status === UserStatus.BLOCKED || user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
            throw new BadRequestError('Cannot resend setup invite to a blocked or inactive Doctor');
        }

        if (!user.must_change_password && user.email_verified && user.status === UserStatus.ACTIVE) {
            throw new BadRequestError('This Doctor has already completed setup');
        }

        const setupToken = await this.createAssistantSetupToken(user._id);
        const otp = await this.createEmailOtp(user._id, user.email);
        const setupUrl = this.buildAssistantSetupUrl(setupToken);

        await emailService.sendDoctorSetupInvite(user.email, setupUrl, otp, user.role);

        return {
            message: 'Setup link and OTP sent to Doctor email',
            email: user.email,
            otp_expires_in: '10 minutes'
        };
    }

    async createAssistantAccount(data: {
        email: string;
        password?: string;
        assigned_doctor_ids?: string[];
        permissions?: {
            can_view_assigned_patients?: boolean;
            can_assign_patients?: boolean;
            can_manage_bookings?: boolean;
            can_send_communications?: boolean;
        };
        otp_required?: boolean;
    }) {
        const email = data.email.toLowerCase();
        const assigneddoctorIds = data.assigned_doctor_ids || [];

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            throw new ConflictError('Email already registered');
        }

        await this.assertDoctorsExistAndActive(assigneddoctorIds);

        const password_hash = await bcrypt.hash(this.generateTemporaryPassword(), 12);

        let user;

        try {
            user = await User.create({
                email,
                password_hash,
                role: Role.ASSISTANT,
                tier: Tier.FREE,
                mfa_enabled: false,
                otp_required: data.otp_required || false,
                must_change_password: true,
                email_verified: false,
                status: UserStatus.PENDING
            });

            const Assistant = await AssistantModel.create({
                user_id: user._id,
                assigned_doctor_ids: assigneddoctorIds,
                permissions: {
                    can_view_assigned_patients: data.permissions?.can_view_assigned_patients ?? true,
                    can_assign_patients: data.permissions?.can_assign_patients ?? false,
                    can_manage_bookings: data.permissions?.can_manage_bookings ?? true,
                    can_send_communications: data.permissions?.can_send_communications ?? true
                }
            });

            const setupToken = await this.createAssistantSetupToken(user._id);
            const otp = await this.createEmailOtp(user._id, user.email);
            const setupUrl = this.buildAssistantSetupUrl(setupToken);
            await emailService.sendDoctorSetupInvite(user.email, setupUrl, otp, user.role);

            return {
                message: 'Assistant account created. Setup link and OTP sent to Assistant email.',
                Assistant: await this.formatAssistantDetails(Assistant._id.toString()),
                setup_required: true,
                setup_link_sent: true
            };
        } catch (error) {
            if (user) {
                await User.deleteOne({ _id: user._id });
            }
            throw error;
        }
    }

    async getActiveAssistants(query: {
        page: number;
        limit: number;
        search?: string;
        doctor_id?: string;
    }) {
        const page = query.page;
        const limit = query.limit;
        const skip = (page - 1) * limit;
        const AssistantMatch: Record<string, any> = {};

        if (query.doctor_id) {
            AssistantMatch.assigned_doctor_ids = query.doctor_id;
        }

        const userMatch: Record<string, any> = {
            'user.role': Role.ASSISTANT,
            'user.status': UserStatus.ACTIVE
        };

        if (query.search) {
            userMatch['user.email'] = new RegExp(this.escapeRegex(query.search), 'i');
        }

        const [result] = await AssistantModel.aggregate([
            { $match: AssistantMatch },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            { $match: userMatch },
            { $sort: { created_at: -1 } },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                _id: 1,
                                assigned_doctor_ids: 1,
                                permissions: 1,
                                created_at: 1,
                                updated_at: 1,
                                user: {
                                    _id: '$user._id',
                                    email: '$user.email',
                                    status: '$user.status',
                                    email_verified: '$user.email_verified',
                                    otp_required: '$user.otp_required',
                                    must_change_password: '$user.must_change_password'
                                }
                            }
                        }
                    ],
                    total: [{ $count: 'count' }]
                }
            }
        ]);

        const total = result?.total?.[0]?.count || 0;

        return {
            Assistants: (result?.data || []).map((Assistant: any) => ({
                assistant_id: Assistant._id.toString(),
                user_id: Assistant.user._id.toString(),
                email: Assistant.user.email,
                status: Assistant.user.status,
                email_verified: Assistant.user.email_verified,
                otp_required: Assistant.user.otp_required,
                must_change_password: Assistant.user.must_change_password,
                assigned_doctor_count: Assistant.assigned_doctor_ids?.length || 0,
                assigned_doctor_ids: (Assistant.assigned_doctor_ids || []).map((id: any) => id.toString()),
                permissions: Assistant.permissions,
                created_at: Assistant.created_at,
                updated_at: Assistant.updated_at
            })),
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

    async getAssistantDetails(assistantId: string) {
        return await this.formatAssistantDetails(assistantId);
    }

    async updateAssistant(assistantId: string, data: {
        permissions?: {
            can_view_assigned_patients?: boolean;
            can_assign_patients?: boolean;
            can_manage_bookings?: boolean;
            can_send_communications?: boolean;
        };
        status?: 'pending' | 'active' | 'blocked' | 'suspended' | 'deactivated';
        otp_required?: boolean;
        must_change_password?: boolean;
    }) {
        const Assistant = await AssistantModel.findById(assistantId).populate('user_id', 'email role status email_verified otp_required must_change_password created_at updated_at');
        if (!Assistant) {
            throw new NotFoundError('Assistant not found');
        }

        const user = Assistant.user_id as any;
        if (!user || user.role !== Role.ASSISTANT) {
            throw new NotFoundError('Assistant user account not found');
        }

        if (data.permissions) {
            Assistant.permissions = {
                can_view_assigned_patients: data.permissions.can_view_assigned_patients ?? Assistant.permissions.can_view_assigned_patients,
                can_assign_patients: data.permissions.can_assign_patients ?? Assistant.permissions.can_assign_patients,
                can_manage_bookings: data.permissions.can_manage_bookings ?? Assistant.permissions.can_manage_bookings,
                can_send_communications: data.permissions.can_send_communications ?? Assistant.permissions.can_send_communications
            };
            await Assistant.save();
        }

        if (data.status !== undefined) {
            user.status = data.status;
        }
        if (data.otp_required !== undefined) {
            user.otp_required = data.otp_required;
        }
        if (data.must_change_password !== undefined) {
            user.must_change_password = data.must_change_password;
        }
        if (data.status !== undefined || data.otp_required !== undefined || data.must_change_password !== undefined) {
            await user.save();
        }

        return {
            message: 'Assistant updated successfully',
            Assistant: await this.formatAssistantDetails(assistantId)
        };
    }

    async setAssistantDoctors(assistantId: string, doctorIds: string[]) {
        const Assistant = await AssistantModel.findById(assistantId);
        if (!Assistant) {
            throw new NotFoundError('Assistant not found');
        }

        await this.assertDoctorsExistAndActive(doctorIds);

        Assistant.assigned_doctor_ids = [...new Set(doctorIds)] as any;
        await Assistant.save();

        return {
            message: 'Assistant Doctor assignments updated successfully',
            Assistant: await this.formatAssistantDetails(assistantId)
        };
    }

    async assignAssistantToDoctor(assistantId: string, doctorId: string) {
        const Assistant = await AssistantModel.findById(assistantId);
        if (!Assistant) {
            throw new NotFoundError('Assistant not found');
        }

        await this.assertDoctorsExistAndActive([doctorId]);

        const assignedIds = Assistant.assigned_doctor_ids.map(id => id.toString());
        if (!assignedIds.includes(doctorId)) {
            Assistant.assigned_doctor_ids.push(doctorId as any);
            await Assistant.save();
        }

        return {
            message: 'Assistant assigned to Doctor successfully',
            Assistant: await this.formatAssistantDetails(assistantId)
        };
    }

    async unassignAssistantFromDoctor(assistantId: string, doctorId: string) {
        const Assistant = await AssistantModel.findById(assistantId);
        if (!Assistant) {
            throw new NotFoundError('Assistant not found');
        }

        Assistant.assigned_doctor_ids = Assistant.assigned_doctor_ids.filter(id => id.toString() !== doctorId);
        await Assistant.save();

        return {
            message: 'Assistant unassigned from Doctor successfully',
            Assistant: await this.formatAssistantDetails(assistantId)
        };
    }

    async validateAssistantSetupToken(token: string) {
        const setup = await this.getValidAssistantSetup(token);
        const user = setup.user_id as any;

        return {
            email: user.email,
            role: user.role,
            status: user.status,
            message: 'Valid setup link'
        };
    }

    async resendAssistantSetupOtp(token: string) {
        const setup = await this.getValidAssistantSetup(token);
        const user = setup.user_id as any;
        const otp = await this.createEmailOtp(user._id, user.email);

        await emailService.sendDoctorSetupInvite(user.email, this.buildAssistantSetupUrl(token), otp, user.role);

        return {
            message: `Setup OTP sent to ${user.role === Role.DOCTOR ? 'Doctor' : 'Assistant'} email`,
            otp_expires_in: '10 minutes'
        };
    }

    async completeAssistantSetup(data: {
        token: string;
        otp: string;
        password: string;
    }) {
        const setup = await this.getValidAssistantSetup(data.token);
        const user = setup.user_id as any;

        await this.verifyEmailOtp(user._id, user.email, data.otp);

        user.password_hash = await bcrypt.hash(data.password, 12);
        user.email_verified = true;
        user.must_change_password = false;
        user.status = UserStatus.ACTIVE;
        await user.save();

        setup.used_at = new Date();
        await setup.save();

        return {
            message: `${user.role === Role.DOCTOR ? 'Doctor' : 'Assistant'} password set successfully. You can now sign in.`,
            email: user.email,
            status: user.status
        };
    }

    public async createEmailOtp(user_id: any, email: string) {
        await this.assertEmailOtpCanBeSent(user_id, email);

        const otp = crypto.randomInt(100000, 999999).toString();
        const expires_at = new Date(Date.now() + this.otpTtlMs);

        await EmailVerification.create({
            user_id,
            email,
            otp,
            expires_at
        });

        return otp;
    }

    private async validateAdminCredentials(data: {
        email: string;
        password: string;
    }) {
        const user = await User.findOne({
            email: data.email.toLowerCase(),
            role: Role.SUPER_ADMIN
        });

        if (!user) {
            throw new UnauthorizedError('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(data.password, user.password_hash);
        if (!isPasswordValid) {
            throw new UnauthorizedError('Invalid credentials');
        }

        if (user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedError('Admin account is suspended or deactivated');
        }

        if (!user.email_verified) {
            throw new UnauthorizedError('Please verify admin signup OTP before login');
        }

        return user;
    }

    private generateTemporaryPassword() {
        const random = crypto.randomBytes(12).toString('base64url');
        return `Tw1!${random}`;
    }

    public async createAssistantSetupToken(user_id: any) {
        await PasswordReset.updateMany(
            { user_id, used_at: null },
            { $set: { used_at: new Date() } }
        );

        const token = crypto.randomBytes(32).toString('hex');
        const expires_at = new Date(Date.now() + this.AssistantSetupTtlMs);

        await PasswordReset.create({
            user_id,
            token,
            expires_at
        });

        return token;
    }

    public buildAssistantSetupUrl(token: string) {
        const baseUrl = process.env.DOCTOR_PORTAL_URL || process.env.CLIENT_URL || 'https://apothecary-frontend.vercel.app';
        return `${baseUrl.replace(/\/+$/, '')}/auth/assistant-setup?token=${encodeURIComponent(token)}`;
    }

    private async getValidAssistantSetup(token: string) {
        const setup = await PasswordReset.findOne({
            token,
            used_at: null,
            expires_at: { $gt: new Date() }
        }).populate('user_id', 'email role status email_verified must_change_password');

        if (!setup) {
            throw new BadRequestError('Invalid or expired setup link');
        }

        const user = setup.user_id as any;
        if (!user || (user.role !== Role.ASSISTANT && user.role !== Role.DOCTOR)) {
            throw new BadRequestError('Invalid setup link');
        }

        if (user.status === UserStatus.BLOCKED || user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
            throw new UnauthorizedError('This account is not allowed to complete setup');
        }

        if (!user.must_change_password && user.email_verified && user.status === UserStatus.ACTIVE) {
            throw new BadRequestError('This account has already been set up');
        }

        return setup;
    }

    private formatDoctorDetails(Doctor: any, user: any, invitedBy?: any) {
        const licenseNumber = decrypt(Doctor.license_number);

        return {
            doctor_id: Doctor._id.toString(),
            user: {
                user_id: user._id.toString(),
                email: user.email,
                role: user.role,
                status: user.status,
                email_verified: user.email_verified,
                otp_required: user.otp_required,
                must_change_password: user.must_change_password,
                created_at: user.created_at,
                updated_at: user.updated_at
            },
            credentials: {
                license_number: licenseNumber === 'PENDING' ? '' : licenseNumber,
                specialty: Doctor.specialty,
                max_patients: Doctor.max_patients,
                can_onboard_assistants: Doctor.portal_settings?.can_onboard_assistants ?? false,
                max_assistants: Doctor.portal_settings?.max_assistants ?? 5,
                credential_status: Doctor.credential_status,
                credential_notes: Doctor.credential_notes
            },
            personal_info: Doctor.personal_info || null,
            professional_info: Doctor.professional_info || null,
            availability: Doctor.availability,
            invited_by: invitedBy ? {
                user_id: invitedBy._id.toString(),
                email: invitedBy.email,
                role: invitedBy.role
            } : null,
            created_at: Doctor.created_at,
            updated_at: Doctor.updated_at
        };
    }

    private async formatAssistantDetails(assistantId: string) {
        const Assistant = await AssistantModel.findById(assistantId)
            .populate('user_id', 'email role status email_verified otp_required must_change_password created_at updated_at')
            .populate({
                path: 'assigned_doctor_ids',
                select: 'user_id specialty max_patients credential_status',
                populate: {
                    path: 'user_id',
                    select: 'email status'
                }
            });

        if (!Assistant) {
            throw new NotFoundError('Assistant not found');
        }

        const user = Assistant.user_id as any;
        if (!user || user.role !== Role.ASSISTANT) {
            throw new NotFoundError('Assistant user account not found');
        }

        return {
            assistant_id: Assistant._id.toString(),
            user: {
                user_id: user._id.toString(),
                email: user.email,
                role: user.role,
                status: user.status,
                email_verified: user.email_verified,
                otp_required: user.otp_required,
                must_change_password: user.must_change_password,
                created_at: user.created_at,
                updated_at: user.updated_at
            },
            permissions: Assistant.permissions,
            assigned_doctors: (Assistant.assigned_doctor_ids as any[]).map(Doctor => ({
                doctor_id: Doctor._id.toString(),
                email: Doctor.user_id?.email,
                status: Doctor.user_id?.status,
                specialty: Doctor.specialty,
                max_patients: Doctor.max_patients,
                credential_status: Doctor.credential_status
            })),
            created_at: Assistant.created_at,
            updated_at: Assistant.updated_at
        };
    }

    private async assertDoctorsExistAndActive(doctorIds: string[]) {
        const uniqueIds = [...new Set(doctorIds)];
        if (uniqueIds.length === 0) {
            return;
        }

        const Doctors = await DoctorModel.find({ _id: { $in: uniqueIds } })
            .populate('user_id', 'role status')
            .select('_id user_id');

        if (Doctors.length !== uniqueIds.length) {
            throw new BadRequestError('One or more Doctors were not found');
        }

        const inactiveDoctor = Doctors.find((Doctor: any) => {
            const user = Doctor.user_id;
            return !user || user.role !== Role.DOCTOR || user.status !== UserStatus.ACTIVE;
        });

        if (inactiveDoctor) {
            throw new BadRequestError('One or more Doctors are not active');
        }
    }

    private escapeRegex(value: string) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private formatNameFromEmail(email: string) {
        const localPart = email.split('@')[0] || 'Patient';
        return localPart
            .replace(/[._-]+/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ') || 'Patient';
    }

    private async createPasswordResetOtp(user_id: any) {
        await this.assertPasswordResetOtpCanBeSent(user_id);

        const otp = crypto.randomInt(100000, 999999).toString();
        const expires_at = new Date(Date.now() + this.otpTtlMs);

        await PasswordReset.create({
            user_id,
            token: otp,
            expires_at
        });

        return otp;
    }

    private async verifyEmailOtp(user_id: any, email: string, otp: string) {
        const verification = await EmailVerification.findOne({
            user_id,
            email,
            otp,
            verified_at: null,
            expires_at: { $gt: new Date() }
        }).sort({ created_at: -1 });

        if (!verification) {
            throw new UnauthorizedError('Invalid or expired OTP');
        }

        verification.verified_at = new Date();
        await verification.save();
    }

    private async assertEmailOtpCanBeSent(user_id: any, email: string) {
        const now = Date.now();
        const windowStart = new Date(now - this.otpWindowMs);
        const cooldownStart = new Date(now - this.otpCooldownMs);

        const recentOtp = await EmailVerification.findOne({
            user_id,
            email,
            created_at: { $gte: cooldownStart }
        }).sort({ created_at: -1 });

        if (recentOtp) {
            throw new BadRequestError('Please wait 60 seconds before requesting another OTP');
        }

        const requestsInWindow = await EmailVerification.countDocuments({
            user_id,
            email,
            created_at: { $gte: windowStart }
        });

        if (requestsInWindow >= this.otpMaxRequestsPerWindow) {
            throw new BadRequestError('Too many OTP requests. Please try again after 15 minutes');
        }
    }

    private async assertPasswordResetOtpCanBeSent(user_id: any) {
        const now = Date.now();
        const windowStart = new Date(now - this.otpWindowMs);
        const cooldownStart = new Date(now - this.otpCooldownMs);

        const recentOtp = await PasswordReset.findOne({
            user_id,
            created_at: { $gte: cooldownStart }
        }).sort({ created_at: -1 });

        if (recentOtp) {
            throw new BadRequestError('Please wait 60 seconds before requesting another OTP');
        }

        const requestsInWindow = await PasswordReset.countDocuments({
            user_id,
            created_at: { $gte: windowStart }
        });

        if (requestsInWindow >= this.otpMaxRequestsPerWindow) {
            throw new BadRequestError('Too many OTP requests. Please try again after 15 minutes');
        }
    }

    private async createAdminSession(user: any) {
        const tokens = generateTokenPair({
            user_id: user._id.toString(),
            email: user.email,
            role: user.role,
            tier: user.tier
        });

        const refresh_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await RefreshToken.create({
            user_id: user._id,
            token: tokens.refresh_token,
            expires_at: refresh_expires_at
        });

        return tokens;
    }

    private formatAdminUser(user: any) {
        return {
            user_id: user._id.toString(),
            email: user.email,
            role: user.role,
            tier: user.tier,
            email_verified: user.email_verified,
            mfa_enabled: user.mfa_enabled,
            otp_required: user.otp_required,
            status: user.status
        };
    }
}

export const adminService = new AdminService();
