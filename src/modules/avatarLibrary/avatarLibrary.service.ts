import mongoose from 'mongoose';
import { AvatarLibrary, IAvatarLibrary } from '../../models/AvatarLibrary.model';
import { Patient } from '../../models/Patient.model';
import { User } from '../../models/User.model';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { Tier } from '../../models/enums';
import { r2StorageService } from '../../services/r2Storage.service';
import { avatarSettingsService } from '../../services/avatarSettings.service';
import { SaveStreamojiAvatarInput } from '../../validators/avatarLibrary.validator';
import { logger } from '../../utils/logger';
import {
    buildStreamojiAnimationManifest,
    normalizeAvatarGender,
    StreamojiAvatarGender,
    StreamojiAnimationCategory,
    StreamojiAnimationManifestEntry
} from './streamojiAnimationManifest';

type StreamojiAnimationEntry = StreamojiAnimationManifestEntry & {
    storageKey: string;
    url: string;
};

export class AvatarLibraryService {
    async saveStreamojiAvatar(userId: string, data: SaveStreamojiAvatarInput) {
        const { user, patient } = await this.getPatientContext(userId);
        const existingAvatar = await this.findExistingAvatar(userId, data);
        const isUpdate = Boolean(existingAvatar);

        if (!isUpdate) {
            const usage = await this.getUsage(userId, user.tier);
            if (usage.used >= usage.limit) {
                throw new ForbiddenError(`Avatar limit reached for ${user.tier} tier`);
            }
        }

        const previousStorageKey = existingAvatar?.storage_key;
        const glb = await this.downloadAvatarGlb(data.avatarId, data.streamojiAuthToken);
        const storageKey = `avatars/${this.safePart(userId)}/${this.safePart(data.avatarId)}.glb`;
        const upload = await r2StorageService.uploadBuffer(storageKey, glb, 'model/gltf-binary');

        try {
            const shouldBeActive = data.makeActive === true || (!isUpdate && (await AvatarLibrary.countDocuments({ user_id: userId })) === 0);

            if (shouldBeActive) {
                await AvatarLibrary.updateMany({ user_id: userId, is_active: true }, { $set: { is_active: false } });
            }

            const update = {
                user_id: new mongoose.Types.ObjectId(userId),
                patient_id: patient._id,
                streamoji_avatar_id: data.avatarId,
                avatar_glb_url: upload.url,
                thumbnail_url: data.thumbnailUrl || existingAvatar?.thumbnail_url || '',
                avatar_gender: data.avatarGender || existingAvatar?.avatar_gender || '',
                storage_key: upload.storageKey,
                streamoji_avatar_url: data.avatarUrl || existingAvatar?.streamoji_avatar_url || '',
                downloaded_at: new Date(),
                ...(shouldBeActive ? { is_active: true } : {})
            };

            const avatar = existingAvatar
                ? await AvatarLibrary.findByIdAndUpdate(existingAvatar._id, { $set: update }, { new: true })
                : await AvatarLibrary.create({ ...update, is_active: shouldBeActive });

            if (!avatar) {
                throw new BadRequestError('Could not save avatar');
            }

            await this.deleteUnreferencedStorageKey(previousStorageKey, avatar.storage_key);

            return {
                avatar: this.formatAvatar(avatar),
                usage: await this.getUsage(userId, user.tier)
            };
        } catch (error) {
            await this.deleteUnreferencedStorageKey(upload.storageKey, previousStorageKey);
            throw error;
        }
    }

    async listAvatars(userId: string) {
        const user = await User.findById(userId);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        const avatars = await AvatarLibrary.find({ user_id: userId }).sort({ created_at: -1 });
        return {
            avatars: avatars.map(avatar => this.formatAvatar(avatar)),
            usage: await this.getUsage(userId, user.tier)
        };
    }

    async getActiveAvatar(userId: string) {
        const avatar = await AvatarLibrary.findOne({ user_id: userId, is_active: true });
        if (!avatar) {
            throw new NotFoundError('Active avatar not found');
        }

        return {
            avatar: this.formatAvatar(avatar),
            animations: this.getAnimationManifest(avatar.avatar_gender)
        };
    }

    async getLatestAvatar(userId: string) {
        const avatar = await AvatarLibrary.findOne({ user_id: userId }).sort({ updated_at: -1, created_at: -1 });
        if (!avatar) {
            throw new NotFoundError('Saved avatar not found');
        }

        return {
            avatar: this.formatAvatar(avatar),
            creator: {
                avatarId: avatar.streamoji_avatar_id,
                queryParams: {
                    iframe: 'true',
                    bodyType: 'Full',
                    thumbnail: 'true',
                    avatarId: avatar.streamoji_avatar_id
                }
            }
        };
    }

    async setActiveAvatar(userId: string, avatarRecordId: string) {
        const avatar = await AvatarLibrary.findOne({ _id: avatarRecordId, user_id: userId });
        if (!avatar) {
            throw new NotFoundError('Avatar not found');
        }

        await AvatarLibrary.updateMany({ user_id: userId, is_active: true }, { $set: { is_active: false } });
        avatar.is_active = true;
        await avatar.save();

        return {
            avatar: this.formatAvatar(avatar)
        };
    }

    getAnimationManifest(
        avatarGender?: string | null,
        urlBuilder?: (animation: StreamojiAnimationEntry) => string
    ) {
        const baseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, '') || '';
        const prefix = (process.env.STREAMOJI_ANIMATIONS_R2_PREFIX || 'animations/streamoji').replace(/^\/+|\/+$/g, '');
        const normalizedGender = normalizeAvatarGender(avatarGender);

        return buildStreamojiAnimationManifest()
            .filter((animation) => animation.avatarGender === normalizedGender)
            .map((animation) => {
                const storageKey = `${prefix}/${animation.fileName}`;
                const entry = {
                    ...animation,
                    gender: animation.avatarGender,
                    storageKey,
                    url: baseUrl ? `${baseUrl}/${storageKey.split('/').map(encodeURIComponent).join('/')}` : ''
                };

                return {
                    ...entry,
                    url: urlBuilder ? urlBuilder(entry) : entry.url
                };
            });
    }

    getAnimationCategories(avatarGender?: string | null) {
        const categories = new Map<StreamojiAnimationCategory, ReturnType<AvatarLibraryService['getAnimationManifest']>>();

        for (const animation of this.getAnimationManifest(avatarGender)) {
            const items = categories.get(animation.category) || [];
            items.push(animation);
            categories.set(animation.category, items);
        }

        return Array.from(categories.entries()).map(([category, animations]) => ({ category, animations }));
    }

    getAnimationById(animationId: string, avatarGender?: string | null) {
        const normalizedGender: StreamojiAvatarGender = normalizeAvatarGender(avatarGender);

        return this.getAnimationManifest(normalizedGender).find((animation) => (
            animation.id === animationId || animation.aliases?.includes(animationId)
        ));
    }

    getAllAnimationManifest() {
        const baseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, '') || '';
        const prefix = (process.env.STREAMOJI_ANIMATIONS_R2_PREFIX || 'animations/streamoji').replace(/^\/+|\/+$/g, '');

        return buildStreamojiAnimationManifest().map((animation) => {
            const storageKey = `${prefix}/${animation.fileName}`;
            const entry = {
                ...animation,
                gender: animation.avatarGender,
                storageKey,
                url: baseUrl ? `${baseUrl}/${storageKey.split('/').map(encodeURIComponent).join('/')}` : ''
            };

            return entry;
        });
    }

    formatAvatar(avatar: IAvatarLibrary, glbProxyUrl?: string) {
        // Always build GLB URL from the public base URL + storage key.
        // This fixes existing DB records that still hold the old private R2 API endpoint.
        const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
        const avatarGlbUrl = glbProxyUrl
            ?? (publicBase && avatar.storage_key
                ? `${publicBase}/${avatar.storage_key}`
                : avatar.avatar_glb_url);

        return {
            avatarRecordId: avatar._id.toString(),
            userId: avatar.user_id.toString(),
            patientId: avatar.patient_id.toString(),
            avatarId: avatar.streamoji_avatar_id,
            avatarGlbUrl,
            thumbnailUrl: avatar.thumbnail_url || '',
            avatarGender: avatar.avatar_gender || '',
            storageKey: avatar.storage_key,
            isActive: avatar.is_active,
            createdAt: avatar.created_at,
            updatedAt: avatar.updated_at
        };
    }

    private async getUsage(userId: string, tier: Tier) {
        const settings = await avatarSettingsService.getSettings();
        const used = await AvatarLibrary.countDocuments({ user_id: userId });
        const limit = settings.avatarLimits[tier];

        return {
            tier,
            used,
            limit,
            remaining: Math.max(0, limit - used)
        };
    }

    private async getPatientContext(userId: string) {
        const [user, patient] = await Promise.all([
            User.findById(userId),
            Patient.findOne({ user_id: userId })
        ]);

        if (!user) {
            throw new NotFoundError('User not found');
        }

        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        return { user, patient };
    }

    private async findExistingAvatar(userId: string, data: SaveStreamojiAvatarInput) {
        if (data.avatarRecordId) {
            const avatar = await AvatarLibrary.findOne({ _id: data.avatarRecordId, user_id: userId });
            if (!avatar) {
                throw new NotFoundError('Avatar record not found');
            }

            const conflictingAvatar = await AvatarLibrary.findOne({
                _id: { $ne: avatar._id },
                user_id: userId,
                streamoji_avatar_id: data.avatarId
            });

            if (conflictingAvatar) {
                throw new ConflictError('Another saved avatar already uses this Streamoji avatar ID');
            }

            return avatar;
        }

        return AvatarLibrary.findOne({ user_id: userId, streamoji_avatar_id: data.avatarId });
    }

    private async downloadAvatarGlb(avatarId: string, token?: string) {
        const attempts: Array<() => Promise<Response>> = [];

        if (token) {
            attempts.push(() => fetch(
                `https://glb.streamoji.com/api/avatars/${encodeURIComponent(avatarId)}.glb?token=${encodeURIComponent(token)}`
            ));
        }

        attempts.push(() => fetch(
            `https://glb.streamoji.com/api/process?avatarId=${encodeURIComponent(avatarId)}`,
            { method: 'POST' }
        ));

        let lastError = 'No Streamoji download attempt was made';

        for (const attempt of attempts) {
            const response = await attempt();
            if (response.ok) {
                return Buffer.from(await response.arrayBuffer());
            }
            lastError = `${response.status} ${response.statusText} ${await response.text().catch(() => '')}`;
        }

        throw new BadRequestError(`Streamoji GLB download failed: ${lastError}`);
    }

    private safePart(value: string) {
        return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
    }

    private async deleteUnreferencedStorageKey(storageKey?: string, keepStorageKey?: string) {
        if (!storageKey || storageKey === keepStorageKey) {
            return;
        }

        try {
            const references = await AvatarLibrary.countDocuments({ storage_key: storageKey });
            if (references > 0) {
                return;
            }

            await r2StorageService.deleteObject(storageKey);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            logger.warn(`Could not delete unreferenced avatar model ${storageKey}: ${message}`);
        }
    }
}

export const avatarLibraryService = new AvatarLibraryService();
