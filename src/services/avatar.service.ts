import { AvatarLibrary } from '../models/AvatarLibrary.model';
import { Patient, IAvatarState } from '../models/Patient.model';
import { r2StorageService } from './r2Storage.service';
import { logger } from '../utils/logger';

interface AvatarChange {
    field: keyof IAvatarState;
    old_value: any;
    new_value: any;
}

export type AssignedAvatarGender = 'girl' | 'boy';

const MAX_AVATAR_VERSION = 6;

export class AvatarService {
    normalizeAssignedGender(value: string): AssignedAvatarGender {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'female' || normalized === 'girl') {
            return 'girl';
        }

        return 'boy';
    }

    buildAssignedAvatar(gender: AssignedAvatarGender, version: number) {
        const safeVersion = Math.min(MAX_AVATAR_VERSION, Math.max(1, Math.trunc(version)));
        const prefix = (process.env.ASSIGNED_AVATARS_R2_PREFIX || 'apothecary/avatars').replace(/^\/+|\/+$/g, '');
        const folder = gender === 'girl'
            ? (process.env.ASSIGNED_AVATARS_GIRL_FOLDER || 'girls')
            : (process.env.ASSIGNED_AVATARS_BOY_FOLDER || 'Boys');
        const fileName = `${gender}V${safeVersion}.glb`;
        const storageKey = `${prefix}/${folder}/${fileName}`;

        return {
            gender,
            version: safeVersion,
            avatarId: `${gender}V${safeVersion}`,
            storageKey,
            glbUrl: r2StorageService.getPublicUrl(storageKey),
            avatarGender: gender === 'girl' ? 'female' : 'male'
        };
    }

    async assignAvatarForPatient(userId: string, genderValue: string, version = 1) {
        const patient = await Patient.findOne({ user_id: userId });
        if (!patient) {
            return null;
        }

        const assigned = this.buildAssignedAvatar(this.normalizeAssignedGender(genderValue), version);

        await AvatarLibrary.updateMany({ user_id: userId, is_active: true }, { $set: { is_active: false } });

        const avatar = await AvatarLibrary.findOneAndUpdate(
            { user_id: userId, streamoji_avatar_id: assigned.avatarId },
            {
                $set: {
                    user_id: patient.user_id,
                    patient_id: patient._id,
                    streamoji_avatar_id: assigned.avatarId,
                    avatar_glb_url: assigned.glbUrl,
                    thumbnail_url: '',
                    avatar_gender: assigned.avatarGender,
                    storage_key: assigned.storageKey,
                    streamoji_avatar_url: '',
                    downloaded_at: new Date(),
                    is_active: true
                }
            },
            { new: true, upsert: true }
        );

        patient.avatar_state = {
            ...patient.avatar_state,
            gender: assigned.gender,
            version: assigned.version,
            storage_key: assigned.storageKey,
            glb_url: assigned.glbUrl,
            assigned_at: new Date(),
            posture: patient.avatar_state?.posture || 'slouched',
            mood_expression: patient.avatar_state?.mood_expression || 'calm',
            outfit: patient.avatar_state?.outfit || 'default',
            glow_effect: patient.avatar_state?.glow_effect || false,
            accessories: patient.avatar_state?.accessories || []
        };
        await patient.save();

        return {
            avatarRecordId: avatar._id.toString(),
            avatar_state: patient.avatar_state,
            avatar: assigned
        };
    }

    /**
     * Check and apply avatar evolution based on streak and activity score
     */
    async checkAndApplyEvolution(patient_id: string): Promise<AvatarChange[]> {
        const patient = await Patient.findById(patient_id);
        if (!patient) {
            return [];
        }

        const changes: AvatarChange[] = [];
        const avatar = patient.avatar_state;

        // Streak-based evolution
        const streak = patient.current_streak;

        // 3 days streak: mood becomes content
        if (streak >= 3 && avatar.mood_expression === 'calm') {
            changes.push({
                field: 'mood_expression',
                old_value: avatar.mood_expression,
                new_value: 'content'
            });
            avatar.mood_expression = 'content';
        }

        // 7 days streak: posture improves
        if (streak >= 7) {
            const posture_order: Array<'slouched' | 'relaxed' | 'upright'> = ['slouched', 'relaxed', 'upright'];
            const current_index = posture_order.indexOf(avatar.posture);
            if (current_index < 2) {
                const new_posture = posture_order[current_index + 1];
                changes.push({
                    field: 'posture',
                    old_value: avatar.posture,
                    new_value: new_posture
                });
                avatar.posture = new_posture;
            }
        }

        // 10 days streak: mood becomes joyful
        if (streak >= 10 && avatar.mood_expression === 'content') {
            changes.push({
                field: 'mood_expression',
                old_value: avatar.mood_expression,
                new_value: 'joyful'
            });
            avatar.mood_expression = 'joyful';
        }

        // 14 days streak: unlock energetic outfit
        if (streak >= 14 && avatar.outfit === 'default') {
            changes.push({
                field: 'outfit',
                old_value: avatar.outfit,
                new_value: 'energetic'
            });
            avatar.outfit = 'energetic';
        }

        // 30 days streak: enable glow effect
        if (streak >= 30 && !avatar.glow_effect) {
            changes.push({
                field: 'glow_effect',
                old_value: false,
                new_value: true
            });
            avatar.glow_effect = true;
        }

        // Activity score-based evolution
        const score = patient.activity_score;
        const nextVersion = this.getVersionForProgress(streak, score);

        if (avatar.gender && (avatar.version || 1) < nextVersion) {
            const oldVersion = avatar.version || 1;
            const assigned = await this.assignAvatarForPatient(patient.user_id.toString(), avatar.gender, nextVersion);
            if (assigned) {
                changes.push({
                    field: 'version',
                    old_value: oldVersion,
                    new_value: nextVersion
                });
                Object.assign(avatar, assigned.avatar_state);
            }
        }

        // 100 points: add first accessory
        if (score >= 100 && avatar.accessories.length === 0) {
            changes.push({
                field: 'accessories',
                old_value: [],
                new_value: ['star_badge']
            });
            avatar.accessories.push('star_badge');
        }

        // 250 points: add second accessory
        if (score >= 250 && avatar.accessories.length === 1) {
            changes.push({
                field: 'accessories',
                old_value: avatar.accessories,
                new_value: [...avatar.accessories, 'wellness_crown']
            });
            avatar.accessories.push('wellness_crown');
        }

        // 500 points: add third accessory
        if (score >= 500 && avatar.accessories.length === 2) {
            changes.push({
                field: 'accessories',
                old_value: avatar.accessories,
                new_value: [...avatar.accessories, 'zen_aura']
            });
            avatar.accessories.push('zen_aura');
        }

        // Save changes if any
        if (changes.length > 0) {
            patient.avatar_state = avatar;
            await patient.save();
            
            logger.info(`Avatar evolved for patient ${patient_id}:`, changes);
        }

        return changes;
    }

    /**
     * Soften avatar when streak breaks
     */
    async softenAvatar(patient_id: string): Promise<void> {
        const patient = await Patient.findById(patient_id);
        if (!patient) {
            return;
        }

        const avatar = patient.avatar_state;
        let changed = false;

        // Reduce posture by one level
        if (avatar.posture === 'upright') {
            avatar.posture = 'relaxed';
            changed = true;
        } else if (avatar.posture === 'relaxed') {
            avatar.posture = 'slouched';
            changed = true;
        }

        // Reduce mood by one level
        if (avatar.mood_expression === 'joyful') {
            avatar.mood_expression = 'content';
            changed = true;
        } else if (avatar.mood_expression === 'content') {
            avatar.mood_expression = 'calm';
            changed = true;
        }

        // Remove glow effect
        if (avatar.glow_effect) {
            avatar.glow_effect = false;
            changed = true;
        }

        if (changed) {
            patient.avatar_state = avatar;
            await patient.save();
            
            logger.info(`Avatar softened for patient ${patient_id} due to streak break`);
        }
    }

    /**
     * Get avatar evolution milestones
     */
    getEvolutionMilestones(current_streak: number, activity_score: number) {
        const milestones = [
            {
                type: 'streak',
                target: 3,
                achieved: current_streak >= 3,
                reward: 'Mood becomes Content',
                progress: Math.min(100, (current_streak / 3) * 100)
            },
            {
                type: 'streak',
                target: 7,
                achieved: current_streak >= 7,
                reward: 'Posture improves to Relaxed',
                progress: Math.min(100, (current_streak / 7) * 100)
            },
            {
                type: 'streak',
                target: 10,
                achieved: current_streak >= 10,
                reward: 'Mood becomes Joyful',
                progress: Math.min(100, (current_streak / 10) * 100)
            },
            {
                type: 'streak',
                target: 14,
                achieved: current_streak >= 14,
                reward: 'Unlock Energetic Outfit',
                progress: Math.min(100, (current_streak / 14) * 100)
            },
            {
                type: 'streak',
                target: 30,
                achieved: current_streak >= 30,
                reward: 'Enable Glow Effect',
                progress: Math.min(100, (current_streak / 30) * 100)
            },
            {
                type: 'score',
                target: 100,
                achieved: activity_score >= 100,
                reward: 'Unlock Star Badge',
                progress: Math.min(100, (activity_score / 100) * 100)
            },
            {
                type: 'score',
                target: 250,
                achieved: activity_score >= 250,
                reward: 'Unlock Wellness Crown',
                progress: Math.min(100, (activity_score / 250) * 100)
            },
            {
                type: 'score',
                target: 500,
                achieved: activity_score >= 500,
                reward: 'Unlock Zen Aura',
                progress: Math.min(100, (activity_score / 500) * 100)
            }
        ];

        return {
            milestones,
            next_milestone: milestones.find(m => !m.achieved),
            avatar_version: this.getVersionForProgress(current_streak, activity_score)
        };
    }

    private getVersionForProgress(current_streak: number, activity_score: number) {
        const progressVersion = [
            current_streak >= 30 || activity_score >= 500,
            current_streak >= 21 || activity_score >= 350,
            current_streak >= 14 || activity_score >= 250,
            current_streak >= 7 || activity_score >= 100,
            current_streak >= 3 || activity_score >= 50
        ].filter(Boolean).length + 1;

        return Math.min(MAX_AVATAR_VERSION, progressVersion);
    }
}

export const avatarService = new AvatarService();
