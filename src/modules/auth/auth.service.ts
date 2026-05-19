import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { User } from '../../models/User.model';
import { Patient } from '../../models/Patient.model';
import { Doctor as DoctorModel } from '../../models/Doctor.model';
import { Assistant as AssistantModel } from '../../models/Assistant.model';
import { RefreshToken } from '../../models/RefreshToken.model';
import { EmailVerification } from '../../models/EmailVerification.model';
import { PasswordReset } from '../../models/PasswordReset.model';
import { InviteToken } from '../../models/InviteToken.model';
import { Role, Tier, UserStatus } from '../../models/enums';
import { generateTokenPair, verifyRefreshToken } from '../../utils/jwt';
import { encrypt, decrypt } from '../../utils/encryption';
import { redisService } from '../../services/redis.service';
import { emailService } from '../../services/email.service';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

// Configuration
const SKIP_EMAIL_VERIFICATION = process.env.SKIP_EMAIL_VERIFICATION === 'true';
const AUTO_VERIFY_IN_DEV = process.env.NODE_ENV === 'development' && process.env.AUTO_VERIFY_EMAIL === 'true';

export class AuthService {
    private readonly emailOtpTtlMs = 15 * 60 * 1000;
    private readonly emailOtpWindowMs = 15 * 60 * 1000;
    private readonly emailOtpCooldownMs = 60 * 1000;
    private readonly emailOtpMaxRequestsPerWindow = 5;
    private readonly passwordResetOtpTtlMs = 10 * 60 * 1000;
    private readonly passwordResetOtpWindowMs = 15 * 60 * 1000;
    private readonly passwordResetOtpCooldownMs = 60 * 1000;
    private readonly passwordResetOtpMaxRequestsPerWindow = 5;

    /**
     * Register new user
     */
    async register(data: {
        email: string;
        password: string;
        role: Role;
        invite_token?: string;
        illness_description?: string;
    }) {
        if (data.role !== Role.PATIENT) {
            throw new BadRequestError('Only patients can self-register. Staff accounts must be created by the Super Admin.');
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email: data.email.toLowerCase() });
        if (existingUser) {
            throw new BadRequestError('Email already registered');
        }

        // Validate invite token if provided
        let inviteData = null;
        if (data.invite_token) {
            inviteData = await InviteToken.findOne({
                token: data.invite_token,
                status: 'pending',
                used_at: null,
                expires_at: { $gt: new Date() }
            });

            if (!inviteData) {
                throw new BadRequestError('Invalid or expired invite token');
            }

            if (inviteData.email.toLowerCase() !== data.email.toLowerCase()) {
                throw new BadRequestError('Email does not match invite');
            }
        }

        // Hash password
        const password_hash = await bcrypt.hash(data.password, 12);

        // Create user
        const user = await User.create({
            email: data.email.toLowerCase(),
            password_hash,
            role: data.role,
            tier: data.role === Role.PATIENT && inviteData ? Tier.PREMIUM : Tier.FREE,
            mfa_enabled: false,
            email_verified: false,
            status: UserStatus.ACTIVE
        });

        // Create role-specific profile
        if (data.role === Role.PATIENT) {
            await Patient.create({
                user_id: user._id,
                doctor_id: inviteData?.doctor_id,
                doctor_assigned_at: inviteData?.doctor_id ? new Date() : undefined,
                doctor_assignment_source: inviteData?.doctor_id ? 'invite' : undefined,
                care_status: inviteData?.doctor_id ? 'assigned' : 'needs_care',
                illness_description: data.illness_description,
                care_status_updated_at: new Date(),
                onboarding_source: inviteData ? 'invite' : 'self_register',
                avatar_state: {
                    posture: 'slouched',
                    mood_expression: 'calm',
                    outfit: 'default',
                    glow_effect: false,
                    accessories: []
                },
                activity_score: 0,
                current_streak: 0,
                chat_tokens_used_today: 0,
                content_views_today: 0
            });
        } else if (data.role === Role.DOCTOR) {
            await DoctorModel.create({
                user_id: user._id,
                license_number: encrypt('PENDING'),
                max_patients: 20,
                availability: []
            });
        } else if (data.role === Role.ASSISTANT) {
            await AssistantModel.create({
                user_id: user._id,
                assigned_doctor_ids: [],
                permissions: {
                    can_view_assigned_patients: true,
                    can_assign_patients: false,
                    can_manage_bookings: true,
                    can_send_communications: true
                }
            });
        }

        // Mark invite as used
        if (inviteData) {
            inviteData.status = 'accepted';
            inviteData.used_at = new Date();
            await inviteData.save();
        }

        // Auto-verify in development if configured
        const shouldAutoVerify = AUTO_VERIFY_IN_DEV || SKIP_EMAIL_VERIFICATION;
        
        if (shouldAutoVerify) {
            user.email_verified = true;
            await user.save();
            
            logger.info(`Auto-verified email for ${data.email} (development mode)`);
            
            return {
                user_id: user._id.toString(),
                email: data.email,
                role: user.role,
                email_verified: true,
                message: 'Registration successful. Email auto-verified (development mode).',
                requires_verification: false
            };
        }

        // Generate email verification OTP
        const otp = await this.createEmailOtp(user._id, data.email.toLowerCase());

        // Send verification email
        await emailService.sendVerificationOTP(data.email, otp, data.email.split('@')[0]);

        return {
            user_id: user._id.toString(),
            email: data.email,
            role: user.role,
            email_verified: false,
            message: 'Registration successful. Please check your email for verification code.',
            requires_verification: true,
            otp_expires_in: '15 minutes'
        };
    }

    /**
     * Verify email with OTP
     */
    async verifyEmail(user_id: string, otp: string) {
        const verification = await EmailVerification.findOne({
            user_id,
            otp,
            verified_at: null,
            expires_at: { $gt: new Date() }
        });

        if (!verification) {
            throw new BadRequestError('Invalid or expired OTP');
        }

        // Mark as verified
        verification.verified_at = new Date();
        await verification.save();

        // Update user
        const user = await User.findByIdAndUpdate(user_id, {
            email_verified: true
        }, { new: true });

        // Send welcome email
        if (user) {
            await emailService.sendWelcomeEmail(user.email, user.email.split('@')[0]);
        }

        return { 
            message: 'Email verified successfully',
            email_verified: true
        };
    }

    /**
     * Resend verification OTP
     */
    async resendOtp(email: string) {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            throw new NotFoundError('User not found');
        }

        if (user.email_verified) {
            throw new BadRequestError('Email already verified');
        }

        const otp = await this.createEmailOtp(user._id, email.toLowerCase());

        // Send verification email
        await emailService.sendVerificationOTP(email, otp, email.split('@')[0]);

        return { 
            message: 'Verification code sent',
            otp_expires_in: '15 minutes'
        };
    }

    private async createEmailOtp(user_id: any, email: string) {
        await this.assertEmailOtpCanBeSent(user_id, email);

        const otp = crypto.randomInt(100000, 999999).toString();
        const expires_at = new Date(Date.now() + this.emailOtpTtlMs);

        await EmailVerification.create({
            user_id,
            email,
            otp,
            expires_at
        });

        return otp;
    }

    private async assertEmailOtpCanBeSent(user_id: any, email: string) {
        const now = Date.now();
        const windowStart = new Date(now - this.emailOtpWindowMs);
        const cooldownStart = new Date(now - this.emailOtpCooldownMs);

        const recentOtp = await EmailVerification.findOne({
            user_id,
            email,
            created_at: { $gte: cooldownStart }
        }).sort({ created_at: -1 });

        if (recentOtp) {
            throw new BadRequestError('Please wait 60 seconds before requesting another verification OTP');
        }

        const requestsInWindow = await EmailVerification.countDocuments({
            user_id,
            email,
            created_at: { $gte: windowStart }
        });

        if (requestsInWindow >= this.emailOtpMaxRequestsPerWindow) {
            throw new BadRequestError('Too many verification OTP requests. Please try again after 15 minutes');
        }
    }

    /**
     * Login user
     */
    async login(email: string, password: string, mfa_code?: string) {
        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            throw new UnauthorizedError('Invalid credentials');
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            throw new UnauthorizedError('Invalid credentials');
        }

        // Check if email verified
        if (!user.email_verified) {
            throw new UnauthorizedError('Please verify your email first');
        }

        // Check if account is active
        if (user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedError('Account is suspended or deactivated');
        }

        // Check MFA if enabled
        if (user.mfa_enabled) {
            if (!mfa_code) {
                return {
                    requires_mfa: true,
                    user_id: user._id.toString(),
                    message: 'MFA code required'
                };
            }

            const isValidMfa = speakeasy.totp.verify({
                secret: decrypt(user.mfa_secret!),
                encoding: 'base32',
                token: mfa_code,
                window: 2
            });

            if (!isValidMfa) {
                throw new UnauthorizedError('Invalid MFA code');
            }
        }

        // Get patient/doctor ID
        let patient_id: string | undefined;
        let doctor_id: string | undefined;
        let assistant_id: string | undefined;

        if (user.role === Role.PATIENT) {
            const patient = await Patient.findOne({ user_id: user._id });
            patient_id = patient?._id.toString();
        } else if (user.role === Role.DOCTOR) {
            const Doctor = await DoctorModel.findOne({ user_id: user._id });
            doctor_id = Doctor?._id.toString();
        } else if (user.role === Role.ASSISTANT) {
            const Assistant = await AssistantModel.findOne({ user_id: user._id });
            assistant_id = Assistant?._id.toString();
        }

        // Generate tokens
        const tokens = generateTokenPair({
            user_id: user._id.toString(),
            email: user.email,
            role: user.role,
            tier: user.tier,
            patient_id,
            doctor_id,
            assistant_id
        });

        // Save refresh token
        const refresh_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await RefreshToken.create({
            user_id: user._id,
            token: tokens.refresh_token,
            expires_at: refresh_expires_at
        });

        return {
            ...tokens,
            user: {
                user_id: user._id.toString(),
                email: decrypt(user.email),
                role: user.role,
                tier: user.tier,
                email_verified: user.email_verified,
                mfa_enabled: user.mfa_enabled,
                must_change_password: user.must_change_password,
                patient_id,
                doctor_id,
                assistant_id
            }
        };
    }

    /**
     * Refresh access token
     */
    async refreshToken(refresh_token: string) {
        // Verify refresh token
        let decoded;
        try {
            decoded = verifyRefreshToken(refresh_token);
        } catch (error) {
            throw new UnauthorizedError('Invalid refresh token');
        }

        // Check if token exists in database
        const tokenDoc = await RefreshToken.findOne({
            token: refresh_token,
            user_id: decoded.user_id,
            expires_at: { $gt: new Date() }
        });

        if (!tokenDoc) {
            throw new UnauthorizedError('Refresh token not found or expired');
        }

        // Get user
        const user = await User.findById(decoded.user_id);
        if (!user || user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedError('User not found or inactive');
        }

        // Get patient/doctor ID
        let patient_id: string | undefined;
        let doctor_id: string | undefined;
        let assistant_id: string | undefined;

        if (user.role === Role.PATIENT) {
            const patient = await Patient.findOne({ user_id: user._id });
            patient_id = patient?._id.toString();
        } else if (user.role === Role.DOCTOR) {
            const Doctor = await DoctorModel.findOne({ user_id: user._id });
            doctor_id = Doctor?._id.toString();
        } else if (user.role === Role.ASSISTANT) {
            const Assistant = await AssistantModel.findOne({ user_id: user._id });
            assistant_id = Assistant?._id.toString();
        }

        // Generate new tokens
        const tokens = generateTokenPair({
            user_id: user._id.toString(),
            email: decrypt(user.email),
            role: user.role,
            tier: user.tier,
            patient_id,
            doctor_id,
            assistant_id
        });

        // Delete old refresh token
        await RefreshToken.deleteOne({ _id: tokenDoc._id });

        // Save new refresh token
        const refresh_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await RefreshToken.create({
            user_id: user._id,
            token: tokens.refresh_token,
            expires_at: refresh_expires_at
        });

        return tokens;
    }

    /**
     * Logout user (blacklist JWT)
     */
    async logout(jti: string, refresh_token?: string) {
        // Blacklist access token
        await redisService.blacklistToken(jti, 900); // 15 minutes

        // Delete refresh token if provided
        if (refresh_token) {
            await RefreshToken.deleteOne({ token: refresh_token });
        }

        return { message: 'Logged out successfully' };
    }

    /**
     * Setup MFA
     */
    async setupMfa(user_id: string, password: string) {
        const user = await User.findById(user_id);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            throw new UnauthorizedError('Invalid password');
        }

        if (user.mfa_enabled) {
            throw new BadRequestError('MFA already enabled');
        }

        // Generate secret
        const secret = speakeasy.generateSecret({
            name: `Apothecary (${decrypt(user.email)})`,
            issuer: 'Apothecary'
        });

        // Generate QR code
        const qr_code = await QRCode.toDataURL(secret.otpauth_url!);

        // Save encrypted secret (not enabled yet)
        user.mfa_secret = encrypt(secret.base32);
        await user.save();

        return {
            secret: secret.base32,
            qr_code,
            message: 'Scan QR code with authenticator app and verify to enable MFA'
        };
    }

    /**
     * Verify and enable MFA
     */
    async verifyMfa(user_id: string, code: string) {
        const user = await User.findById(user_id);
        if (!user || !user.mfa_secret) {
            throw new BadRequestError('MFA setup not initiated');
        }

        const isValid = speakeasy.totp.verify({
            secret: decrypt(user.mfa_secret),
            encoding: 'base32',
            token: code,
            window: 2
        });

        if (!isValid) {
            throw new BadRequestError('Invalid MFA code');
        }

        // Enable MFA
        user.mfa_enabled = true;
        await user.save();

        return { message: 'MFA enabled successfully' };
    }

    /**
     * Disable MFA
     */
    async disableMfa(user_id: string, password: string, code: string) {
        const user = await User.findById(user_id);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        if (!user.mfa_enabled) {
            throw new BadRequestError('MFA not enabled');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            throw new UnauthorizedError('Invalid password');
        }

        // Verify MFA code
        const isValid = speakeasy.totp.verify({
            secret: decrypt(user.mfa_secret!),
            encoding: 'base32',
            token: code,
            window: 2
        });

        if (!isValid) {
            throw new BadRequestError('Invalid MFA code');
        }

        // Disable MFA
        user.mfa_enabled = false;
        user.mfa_secret = undefined;
        await user.save();

        return { message: 'MFA disabled successfully' };
    }

    /**
     * Forgot password - send mobile reset OTP
     */
    async forgotPassword(email: string) {
        const normalizedEmail = email.toLowerCase();
        const user = await User.findOne({ email: normalizedEmail, role: Role.PATIENT });
        
        // Don't reveal if email exists
        if (!user) {
            return { message: 'If a patient account exists, a password reset OTP has been sent' };
        }

        if (user.status !== UserStatus.ACTIVE) {
            return { message: 'If a patient account exists, a password reset OTP has been sent' };
        }

        const otp = await this.createPasswordResetOtp(user._id);

        await emailService.sendPasswordResetOTP(normalizedEmail, otp, normalizedEmail.split('@')[0]);

        return {
            message: 'If a patient account exists, a password reset OTP has been sent',
            otp_expires_in: '10 minutes'
        };
    }

    /**
     * Reset password with mobile OTP
     */
    async resetPassword(email: string, otp: string, new_password: string) {
        const user = await User.findOne({ email: email.toLowerCase(), role: Role.PATIENT });

        if (!user || user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedError('Invalid or expired OTP');
        }

        const resetDoc = await PasswordReset.findOne({
            user_id: user._id,
            token: otp,
            used_at: null,
            expires_at: { $gt: new Date() }
        }).sort({ created_at: -1 });

        if (!resetDoc) {
            throw new UnauthorizedError('Invalid or expired OTP');
        }

        // Hash new password
        const password_hash = await bcrypt.hash(new_password, 12);

        // Update user password
        user.password_hash = password_hash;
        user.must_change_password = false;
        await user.save();

        // Mark OTP as used and invalidate existing sessions
        resetDoc.used_at = new Date();
        await resetDoc.save();
        await RefreshToken.deleteMany({ user_id: user._id });

        return { message: 'Password reset successfully' };
    }

    private async createPasswordResetOtp(user_id: any) {
        await this.assertPasswordResetOtpCanBeSent(user_id);

        await PasswordReset.updateMany(
            { user_id, used_at: null },
            { $set: { used_at: new Date() } }
        );

        const expires_at = new Date(Date.now() + this.passwordResetOtpTtlMs);

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const otp = crypto.randomInt(100000, 999999).toString();

            try {
                await PasswordReset.create({
                    user_id,
                    token: otp,
                    expires_at
                });

                return otp;
            } catch (error: any) {
                if (error?.code !== 11000) {
                    throw error;
                }
            }
        }

        throw new BadRequestError('Could not create password reset OTP. Please try again');
    }

    private async assertPasswordResetOtpCanBeSent(user_id: any) {
        const now = Date.now();
        const windowStart = new Date(now - this.passwordResetOtpWindowMs);
        const cooldownStart = new Date(now - this.passwordResetOtpCooldownMs);

        const recentOtp = await PasswordReset.findOne({
            user_id,
            created_at: { $gte: cooldownStart }
        }).sort({ created_at: -1 });

        if (recentOtp) {
            throw new BadRequestError('Please wait 60 seconds before requesting another password reset OTP');
        }

        const requestsInWindow = await PasswordReset.countDocuments({
            user_id,
            created_at: { $gte: windowStart }
        });

        if (requestsInWindow >= this.passwordResetOtpMaxRequestsPerWindow) {
            throw new BadRequestError('Too many password reset OTP requests. Please try again after 15 minutes');
        }
    }

    /**
     * Validate invite token
     */
    async validateInvite(token: string) {
        const invite = await InviteToken.findOne({
            token,
            status: 'pending',
            used_at: null,
            expires_at: { $gt: new Date() }
        }).populate('doctor_id', 'user_id');

        if (!invite) {
            throw new BadRequestError('Invalid or expired invite token');
        }

        return {
            email: invite.email,
            doctor_id: invite.doctor_id?.toString(),
            message: 'Valid invite token'
        };
    }

    /**
     * Complete invite registration
     */
    async completeInvite(token: string, password: string) {
        const invite = await this.validateInvite(token);

        // Register user with invite
        return await this.register({
            email: invite.email,
            password,
            role: Role.PATIENT,
            invite_token: token
        });
    }
}

export const authService = new AuthService();
