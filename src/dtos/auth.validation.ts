import { z } from 'zod';

export const LoginInitiateSchema = z.object({
    usernameOrEmail: z.string().min(1, "Username or Email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginInitiateDto = z.infer<typeof LoginInitiateSchema>;

export const SendTwoFactorCodeSchema = z.object({
    method: z.enum(['email', 'sms'], { required_error: "2FA method ('email' or 'sms') is required" }),
});
export type SendTwoFactorCodeDto = z.infer<typeof SendTwoFactorCodeSchema>;

export const VerifyTwoFactorCodeSchema = z.object({
    code: z.string().min(6, "Code must be at least 6 characters long").max(32, "Code is too long"),
});
export type VerifyTwoFactorCodeDto = z.infer<typeof VerifyTwoFactorCodeSchema>;

export const EnableTotpSchema = z.object({
    password: z.string(),
    secret: z.string(),
    token: z.string().length(6, "TOTP token must be 6 digits"),
});
export type EnableTotpDto = z.infer<typeof EnableTotpSchema>;

export const DisableTotpSchema = z.object({
    password: z.string(),
});
export type DisableTotpDto = z.infer<typeof DisableTotpSchema>;

export interface PreTwoFactorPayload { userId: number; type: 'pre-2fa'; }
export interface AccessTokenPayload { userId: number; username: string; type: 'access'; }
export interface RefreshTokenPayload { userId: number; type: 'refresh'; }

export const AuthTokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string(), });
export type AuthTokensDto = z.infer<typeof AuthTokensSchema>;

export const TwoFactorChallengeSchema = z.object({
    methods: z.array(z.enum(['email', 'sms', 'totp'])), // Ajouter 'totp'
});
export type TwoFactorChallengeDto = z.infer<typeof TwoFactorChallengeSchema>;