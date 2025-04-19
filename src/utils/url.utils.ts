// src/utils/url.utils.ts
import { UserAttributes } from '../models/User';
import { EstablishmentAttributes } from '../models/Establishment';

interface EntityWithPicture {
    profile_picture?: string | null | undefined;
    profile_picture_url?: string | null | undefined;
}

/**
 * Construit l'URL absolue pour une image de profil si nécessaire.
 * @param entity L'objet utilisateur ou établissement contenant profile_picture(_url).
 * @returns L'URL absolue, l'URL relative si APP_BASE_URL n'est pas défini, ou null/undefined.
 */
export const getAbsoluteProfilePictureURL = (entity: EntityWithPicture): string | null | undefined => {
    const baseUrl = process.env.APP_BASE_URL;
    const relativePath = entity.profile_picture_url ?? entity.profile_picture;

    if (!relativePath) { return relativePath; }

    if (relativePath.startsWith('http') || relativePath.startsWith('data:')) { return relativePath; }

    if (baseUrl) {
        const separator = relativePath.startsWith('/') ? '' : '/';
        try {
            const url = new URL(relativePath, baseUrl);
            return url.href;
        } catch (e) {
            console.error(`Error constructing absolute URL with base: ${baseUrl} and path: ${relativePath}`, e);
            return relativePath;
        }
    } else {
        console.warn("APP_BASE_URL environment variable is not set. Returning relative profile picture URL:", relativePath);
        return relativePath;
    }
};