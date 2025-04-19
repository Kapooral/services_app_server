// src/routes/auth.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { loginInitiateLimiter, sendCodeLimiter, verifyCodeLimiter } from '../middlewares/rateLimiter.middleware';
import { UserService } from '../services/user.service';
import { requireAuth } from '../middlewares/auth.middleware'; // Importer le middleware

const PRE_2FA_TOKEN_HEADER_LOWER = 'x-pre-2fa-token';

export const createAuthRouter = (authService: AuthService, userService: UserService): Router => {
    const router = Router();
    const authController = new AuthController(authService, userService);

    // --- Routes Connexion (publiques) ---
    router.post('/login/initiate', authController.initiateLogin );
    router.post('/login/send-code', authController.sendCode );
    router.post('/login/verify-code', authController.verifyCode );
    router.post('/refresh', authController.refreshToken);
    router.post('/logout', authController.logout);

    // --- Routes Gestion MFA/TOTP (protégées) ---
    router.get('/mfa/totp/setup', requireAuth, authController.requestTotpSetup);
    router.post('/mfa/totp/enable', requireAuth, authController.enableTotp);
    router.delete('/mfa/totp/disable', requireAuth, authController.disableTotp);

    return router;
};