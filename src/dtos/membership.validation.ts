// src/dtos/membership.validation.ts
import { z } from 'zod';
import Membership, { MembershipAttributes, MembershipRole, MembershipStatus } from '../models/Membership';
import { getAbsoluteProfilePictureURL } from '../utils/url.utils';

export const MembershipUserSchema = z.object({
    id: z.number(),
    username: z.string(),
    email: z.string().email(),
    profile_picture: z.string().url().nullable(),
}).nullable();

export const MembershipDtoSchema = z.object({
    id: z.number(),
    establishmentId: z.number(),
    role: z.nativeEnum(MembershipRole),
    status: z.nativeEnum(MembershipStatus),
    joinedAt: z.coerce.date().nullable(), // Utiliser coerce.date() pour assurer type Date
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    user: MembershipUserSchema,
    invitationTokenExpiresAt: z.coerce.date().nullable(),
    invitedEmail: z.string().email().nullable().optional()
});
export type MembershipDto = z.infer<typeof MembershipDtoSchema>;

// Modifier la signature pour accepter une instance du modèle Membership
export function mapToMembershipDto(membership: Membership): MembershipDto {
    const userData = membership.user
        ? {
            id: membership.user.id,
            username: membership.user.username,
            email: membership.user.email,
            profile_picture: membership.user.profile_picture ? getAbsoluteProfilePictureURL(membership.user) : null
        } : null;

    // Utiliser les attributs directs de l'instance
    const dataToParse = {
        id: membership.id,
        establishmentId: membership.establishmentId,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
        user: userData,
        invitationTokenExpiresAt: membership.invitationTokenExpiresAt,
        invitedEmail: membership.invitedEmail
    };

    const result = MembershipDtoSchema.safeParse(dataToParse);
    if (!result.success) {
        console.error("Error mapping Membership instance to MembershipDto:", result.error.format(), "Data:", dataToParse);
        throw new Error(`Internal data mapping error for membership ID ${membership.id}.`);
    }
    return result.data;
}

// DTO pour inviter un membre
export const InviteMemberSchema = z.object({
    email: z.string().email({ message: "Invalid email address provided." }),
    role: z.literal(MembershipRole.STAFF, { // Pour l'instant, on n'invite que des STAFF
        errorMap: () => ({ message: "Invalid role specified for invitation. Only 'STAFF' is allowed." })
    }),
});
export type InviteMemberDto = z.infer<typeof InviteMemberSchema>;

// Schéma pour valider le paramètre token dans l'URL
export const InvitationTokenParamSchema = z.object({
    token: z.string().length(64, { message: "Invalid invitation token format." }), // 32 bytes hex = 64 chars
});

// DTO pour la réponse de GET /invitation-details/:token
export const InvitationDetailsResponseSchema = z.object({
    invitedEmail: z.string().email(),
});
export type InvitationDetailsDto = z.infer<typeof InvitationDetailsResponseSchema>;

// DTO pour l'inscription via invitation
export const RegisterViaInvitationSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters long.").max(50, "Username cannot exceed 50 characters."),
    // Ajouter ici les mêmes règles de mot de passe que pour l'inscription normale si nécessaire
    password: z.string().min(8, "Password must be at least 8 characters long."),
    token: z.string().length(64, { message: "Invalid invitation token format." }),
});
export type RegisterViaInvitationDto = z.infer<typeof RegisterViaInvitationSchema>;

// DTO pour l'activation après connexion
export const ActivateMembershipSchema = z.object({
    token: z.string().length(64, { message: "Invalid invitation token format." }),
});
export type ActivateMembershipDto = z.infer<typeof ActivateMembershipSchema>;

export const UpdateMembershipSchema = z.object({
    status: z.nativeEnum(MembershipStatus, {
        errorMap: () => ({ message: 'Invalid status value provided.' })
    }).optional(),
    role: z.nativeEnum(MembershipRole, {
        errorMap: () => ({ message: 'Invalid role value provided.' })
    }).optional(),
})
    .refine(data => data.status !== undefined || data.role !== undefined, {
        message: "At least status or role must be provided for update.",
        // path: [], // Appliquer l'erreur à l'objet entier
    });

export type UpdateMembershipDto = z.infer<typeof UpdateMembershipSchema>;

const validSortByFields = z.enum([
    'createdAt',
    'joinedAt',
    'username', // Mappé à User.username
    'email',    // Mappé à User.email
    'role',
    'status'
]);

export const GetMembershipsQuerySchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    status: z.nativeEnum(MembershipStatus).optional(),
    role: z.nativeEnum(MembershipRole).optional(),
    search: z.string().trim().min(1, "Search term cannot be empty if provided.").optional(),
    sortBy: validSortByFields.optional().default('createdAt'),
    sortOrder: z.enum(['ASC', 'DESC']).optional(), // Le défaut spécifique sera géré dans le service
});
export type GetMembershipsQueryDto = z.infer<typeof GetMembershipsQuerySchema>;