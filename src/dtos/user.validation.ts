// src/dtos/user.validation.ts
import { z } from 'zod';
import User, { UserAttributes } from '../models/User';
import { getAbsoluteProfilePictureURL } from '../utils/url.utils'

export const CreateUserSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters long").max(50),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters long"),
    phone: z.string().optional().nullable(), // Ou validation plus stricte du format de téléphone si nécessaire
    profile_picture: z.string().url("Invalid URL format").optional().nullable(),
});
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

export const ActivateAccountSchema = z.object({ token: z.string().min(1) });
export type ActivateAccountDto = z.infer<typeof ActivateAccountSchema>;

export const UpdateUserSchema = z.object({
    username: z.string().min(3).max(50).optional(),
    profile_picture: z.string().url().nullable().optional(),
});
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

export const VerifyCodeSchema = z.object({
    code: z.string().length(6, "Verification code must be 6 digits"),
});
export type VerifyCodeDto = z.infer<typeof VerifyCodeSchema>;

export const RequestPasswordResetSchema = z.object({
    email: z.string().email(),
});
export type RequestPasswordResetDto = z.infer<typeof RequestPasswordResetSchema>;

export const ValidateResetTokenSchema = z.object({
    token: z.string().min(1)
});
export type ValidateResetTokenDto = z.infer<typeof ValidateResetTokenSchema>;

export const PerformPasswordResetSchema = z.object({
    token: z.string().min(1, "Reset token is required."),
    newPassword: z.string().min(8, "New password must be at least 8 characters long."),
});
export type PerformPasswordResetDto = z.infer<typeof PerformPasswordResetSchema>;

export const meOutputSchema = z.object({
    id: z.number().int().positive(),
    username: z.string().min(1),
    email: z.string().email(),
    is_email_active: z.boolean(),
    phone: z.string().optional().nullable(),
    is_phone_active: z.boolean(),
    is_active: z.boolean(),
    profile_picture: z.string().url().optional().nullable(),
    is_two_factor_enabled: z.boolean(),
    two_factor_method: z.enum(['email', 'sms', 'totp']).optional().nullable(),
    createdAt: z.preprocess((arg) => {
        if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
    }, z.date()),
    updatedAt: z.preprocess((arg) => {
        if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
    }, z.date()),
    roles: z.array(z.string()),
    ownedEstablishmentId: z.number().optional().nullable()
});
export type MeOutputDto = z.infer<typeof meOutputSchema>;

export const UpdatePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(8, "New password must be at least 8 characters long."),
});
export type UpdatePasswordDto = z.infer<typeof UpdatePasswordSchema>;

export const UpdateEmailSchema = z.object({
    newEmail: z.string().email({ message: "Invalid email format." }),
    currentPassword: z.string().min(1, "Current password is required."),
});
export type UpdateEmailDto = z.infer<typeof UpdateEmailSchema>;

export const UserOutputSchema = z.object({
    id: z.number(),
    username: z.string(),
    profile_picture: z.string().optional().nullable(),
    createdAt: z.date(),
});
export type UserOutputDto = z.infer<typeof UserOutputSchema>;

export function mapToMeOutputDto(user: User): MeOutputDto {
    const roleNames = user.roles ? user.roles.map(role => role.name) : [];
    const ownedEstablishmentId = user.ownedEstablishments && user.ownedEstablishments.length > 0
        ? user.ownedEstablishments[0].id
        : null;

    const result = meOutputSchema.safeParse({
        id: user.id,
        username: user.username,
        email: user.email,
        is_email_active: user.is_email_active,
        phone: user.phone,
        is_phone_active: user.is_phone_active,
        is_active: user.is_active,
        profile_picture: getAbsoluteProfilePictureURL(user),
        is_two_factor_enabled: user.is_two_factor_enabled,
        two_factor_method: user.two_factor_method,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        roles: roleNames,
        ownedEstablishmentId: ownedEstablishmentId,
    });

    if (!result.success) {
        console.error("Failed to map User model to UserOutputDto:", result.error);
        throw new Error("Internal data mapping error");
    }
    return result.data;
}

export function mapToUserOutputDto(user: Partial<UserAttributes> & { id: number; username: string; createdAt?: Date }): UserOutputDto {
    const result = UserOutputSchema.safeParse({
        id: user.id,
        username: user.username,
        profile_picture: getAbsoluteProfilePictureURL(user),
        createdAt: user.createdAt,
    });

    if (!result.success) {
        console.error("Failed to map User model to UserOutputDto:", result.error);
        return { id: user.id, username: 'Error', createdAt: new Date(), profile_picture: null };
    }
    return result.data;
}

export const DeleteAccountConfirmationSchema = z.object({
    password: z.string().min(1, "Password is required for account deletion."),
});
export type DeleteAccountConfirmationDto = z.infer<typeof DeleteAccountConfirmationSchema>;