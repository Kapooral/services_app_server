// src/routes/auth.routes.ts
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';

import { UserService } from '../services/user.service';
import { requireAuth } from '../middlewares/auth.middleware'; // Importer le middleware


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

    router.post('/register-via-invitation', authController.registerViaInvitation);

    return router;
};