// src/controllers/auth.controller.ts
import { z } from 'zod'
import { Request, Response, NextFunction, CookieOptions } from 'express';
import { AuthService } from '../services/auth.service';
import { LoginInitiateSchema, SendTwoFactorCodeSchema, VerifyTwoFactorCodeSchema } from '../dtos/auth.validation';
import {
    InvalidCredentialsError, InvalidPre2FATokenError, TwoFactorMethodUnavailableError, InvalidTwoFactorCodeError
} from '../errors/auth.errors';
import { ZodError } from 'zod';
import { AppError } from '../errors/app.errors';
import { UserNotFoundError } from '../errors/user.errors';
import { UserService } from '../services/user.service';
import { setCsrfCookies, clearCsrfCookies } from '../middlewares/csrf.middleware';

const PRE_2FA_TOKEN_HEADER = 'X-Pre-2FA-Token';

const EnableTotpSchema = z.object({
    password: z.string(),
    secret: z.string(),
    token: z.string().length(6, "TOTP token must be 6 digits"),
});
type EnableTotpDto = z.infer<typeof EnableTotpSchema>;

const DisableTotpSchema = z.object({
    password: z.string(),
});
type DisableTotpDto = z.infer<typeof DisableTotpSchema>;

const refreshTokenCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: parseInt(process.env.JWT_REFRESH_EXPIRATION_SECONDS || '604800', 10) * 1000
};


export class AuthController {
    private authService: AuthService;
    private userService: UserService;

    constructor(authService: AuthService, userService: UserService) {
        this.authService = authService;
        this.userService = userService;
        this.initiateLogin = this.initiateLogin.bind(this);
        this.sendCode = this.sendCode.bind(this);
        this.verifyCode = this.verifyCode.bind(this);
        this.refreshToken = this.refreshToken.bind(this);
        this.logout = this.logout.bind(this);
        this.requestTotpSetup = this.requestTotpSetup.bind(this);
        this.enableTotp = this.enableTotp.bind(this);
        this.disableTotp = this.disableTotp.bind(this);
    }

    async initiateLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const loginDto = LoginInitiateSchema.parse(req.body);
            const result = await this.authService.initiateLogin(loginDto, req);

            if (result.type === 'tokens') {
                res.status(200).json({ type: 'tokens', tokens: result.tokens });
            } else {
                res.setHeader(PRE_2FA_TOKEN_HEADER, result.pre2faToken);
                res.status(200).json({
                    type: '2fa_challenge',
                    challenge: result.challenge,
                    pre2faToken: result.pre2faToken
                });
            }
        } catch (error) {
            if (error instanceof InvalidCredentialsError) {
                res.status(401).json({ statusCode: 401, error: 'Unauthorized', message: error.message });
            } else if (error instanceof TwoFactorMethodUnavailableError) {
                res.status(400).json({ statusCode: 400, error: 'Bad Request', message: error.message });
            } else if (error instanceof z.ZodError) {
                res.status(400).json({ statusCode: 400, error: 'Validation Error', message: error.errors });
            }
            else {
                next(error);
            }
        }
    }

    async sendCode(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const pre2faToken = req.headers[PRE_2FA_TOKEN_HEADER.toLowerCase()] as string;
            if (!pre2faToken) { throw new InvalidPre2FATokenError(`Header '${PRE_2FA_TOKEN_HEADER}' is missing.`); }

            const sendCodeDto = SendTwoFactorCodeSchema.parse(req.body);
            await this.authService.sendTwoFactorCode(pre2faToken, sendCodeDto.method);

            res.status(200).json({ message: `2FA code sent via ${sendCodeDto.method}.` });
        } catch (error) {
            if (error instanceof InvalidPre2FATokenError) { res.status(401).json({ message: error.message }); }
            else if (error instanceof TwoFactorMethodUnavailableError) { res.status(400).json({ message: error.message }); }
            else if (error instanceof ZodError) { res.status(400).json({ message: "Validation failed", errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))}); }
            else { next(error); }
        }
    }

    async verifyCode(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const pre2faToken = req.headers[PRE_2FA_TOKEN_HEADER.toLowerCase()] as string;
            if (!pre2faToken) { throw new InvalidPre2FATokenError(`Header '${PRE_2FA_TOKEN_HEADER}' is missing.`); }
            const verifyDto = VerifyTwoFactorCodeSchema.parse(req.body);
            const tokens = await this.authService.verifyTwoFactorCode(pre2faToken, verifyDto.code, req);
            res.cookie('refreshToken', tokens.refreshToken, refreshTokenCookieOptions);
            setCsrfCookies(res);
            res.status(200).json({ accessToken: tokens.accessToken });
        } catch (error) {
            if (error instanceof InvalidPre2FATokenError) { res.status(401).json({ message: error.message }); }
            else if (error instanceof InvalidTwoFactorCodeError) { res.status(400).json({ message: error.message }); }
            else if (error instanceof ZodError) { res.status(400).json({ message: "Validation failed", errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))}); }
            else { next(error); }
        }
    }

    async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
        const currentRefreshToken = req.cookies?.refreshToken;
        console.log('[BE Refresh] Received refreshToken cookie:', currentRefreshToken);
        try {
            if (!currentRefreshToken) {
                console.error('[BE Refresh] No refreshToken cookie received.');
                throw new AppError('MissingRefreshTokenCookie', 401, 'Refresh token not found.');
            }
            console.log('[BE Refresh] Calling authService.refreshAccessToken...');
            const newTokens = await this.authService.refreshAccessToken(currentRefreshToken, req);
            console.log('[BE Refresh] authService.refreshAccessToken successful.');
            res.cookie('refreshToken', newTokens.refreshToken, refreshTokenCookieOptions); // Utilise les options standard
            setCsrfCookies(res);
            res.status(200).json({ accessToken: newTokens.accessToken });
        } catch (error) {
            console.error('[BE Refresh] Error caught in controller:', error);
            // Si le refresh échoue (token invalide/expiré), on doit aussi supprimer le cookie invalide
            // ET les cookies CSRF associés à cette session potentielle
            if (error instanceof AppError && error.statusCode === 401) {
                console.log('[BE Refresh] Clearing potentially invalid refreshToken cookie due to 401.');
                res.clearCookie('refreshToken', refreshTokenCookieOptions); // <-- Utilise les options standard
                clearCsrfCookies(res); // <-- Effacer aussi les cookies CSRF
            }
            // Toujours passer l'erreur au middleware d'erreur global après traitement local
            next(error);
        }
    }

    async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const token = req.cookies?.refreshToken;
            if (token) {
                await this.authService.revokeRefreshToken(token);
            }
            console.log('[BE Logout] Clearing session cookies.');
            res.clearCookie('refreshToken', refreshTokenCookieOptions); // <-- Utilise les options standard
            clearCsrfCookies(res); // <-- Effacer aussi les cookies CSRF
            res.status(200).json({ message: "Logged out successfully" });
        } catch (error) {
            console.error('[BE Logout] Error during logout:', error);
            next(error);
        }
    }

    async requestTotpSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
        const userId = (req as any).user?.id;
        const userEmail = (req as any).user?.email;
        if (!userId || !userEmail) { return next(new AppError('AuthenticationRequired', 401, 'User must be authenticated.')); }
        try {
            const secret = this.authService.generateTotpSecret();
            const qrCodeDataUri = await this.authService.generateTotpQrCodeUri(secret, userEmail);
            res.status(200).json({ secret: secret, qrCodeUri: qrCodeDataUri });
        } catch (error) { next(error); }
    }

    async enableTotp(req: Request, res: Response, next: NextFunction): Promise<void> {
        const userId = (req as any).user?.id;
        if (!userId) { return next(new AppError('AuthenticationRequired', 401, 'User must be authenticated.')); }
        try {
            const { password, secret, token } = EnableTotpSchema.parse(req.body);
            if (!(await this.userService.validatePassword(password, userId))) { // Utiliser userService injecté
                throw new InvalidCredentialsError();
            }
            const enabled = await this.authService.enableTotpForUser(userId, secret, token);
            if (enabled) {
                const recoveryCodes = await this.authService.generateAndStoreRecoveryCodes(userId);
                res.status(200).json({ message: 'TOTP enabled successfully. Please save your recovery codes.', recoveryCodes: recoveryCodes });
            } else {
                throw new AppError('InvalidTotpToken', 400, 'The provided TOTP token was invalid.');
            }
        } catch (error) {
            if (error instanceof ZodError) { res.status(400).json({ message: "Validation failed", errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))}); }
            else if (error instanceof InvalidCredentialsError) { res.status(401).json({ message: error.message }); }
            else { next(error); }
        }
    }

    async disableTotp(req: Request, res: Response, next: NextFunction): Promise<void> {
        const userId = (req as any).user?.id;
        if (!userId) { return next(new AppError('AuthenticationRequired', 401, 'User must be authenticated.')); }
        try {
            const { password } = DisableTotpSchema.parse(req.body);
            if (!(await this.userService.validatePassword(password, userId))) { // Utiliser userService injecté
                throw new InvalidCredentialsError();
            }
            const disabled = await this.authService.disableTotpForUser(userId);
            if (disabled) {
                res.status(200).json({ message: 'TOTP disabled successfully.' });
            } else {
                throw new UserNotFoundError(); // Si l'utilisateur n'a pas été trouvé dans le service
            }
        } catch (error) {
            if (error instanceof ZodError) { res.status(400).json({ message: "Validation failed", errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))}); }
            else if (error instanceof InvalidCredentialsError) { res.status(401).json({ message: error.message }); }
            else { next(error); }
        }
    }
}