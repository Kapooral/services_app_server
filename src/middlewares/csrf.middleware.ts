// src/middlewares/csrf.middleware.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppError } from '../errors/app.errors';

// --- Constantes (adaptez les noms si nécessaire) ---
const CSRF_SECRET_COOKIE = process.env.CSRF_SECRET_COOKIE_NAME || 'csrfSecret';
const CSRF_TOKEN_COOKIE = process.env.CSRF_TOKEN_COOKIE_NAME || 'XSRF-TOKEN';
const CSRF_HEADER = process.env.CSRF_HEADER_NAME || 'x-csrf-token';

// --- Fonction pour définir les cookies ---
export const setCsrfCookies = (res: Response) => {
    const secret = crypto.randomBytes(16).toString('hex');
    const cookieOptions = {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const, // Type 'lax' | 'strict' | 'none' | boolean
        path: '/',
    };

    // Cookie secret signé HttpOnly
    res.cookie(CSRF_SECRET_COOKIE, secret, {
        ...cookieOptions,
        httpOnly: true,
        signed: true,
    });

    // Cookie public lisible par JS
    res.cookie(CSRF_TOKEN_COOKIE, secret, {
        ...cookieOptions,
        httpOnly: false,
        signed: false,
    });

    console.log(`[CSRF Middleware] Set cookies: ${CSRF_SECRET_COOKIE} (signed), ${CSRF_TOKEN_COOKIE}`);
};

// --- Fonction pour effacer les cookies ---
export const clearCsrfCookies = (res: Response) => {
    const cookieOptions = {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
    };
    res.clearCookie(CSRF_SECRET_COOKIE, { ...cookieOptions, httpOnly: true, signed: true });
    res.clearCookie(CSRF_TOKEN_COOKIE, { ...cookieOptions, httpOnly: false, signed: false });
    console.log(`[CSRF Middleware] Cleared cookies: ${CSRF_SECRET_COOKIE}, ${CSRF_TOKEN_COOKIE}`);
};


// --- Le VRAI middleware de vérification ---
const _internalVerifyCsrfToken = (req: Request, res: Response, next: NextFunction) => {
    const tokenFromHeader = req.headers[CSRF_HEADER.toLowerCase()] as string;
    const secretFromCookie = req.signedCookies?.[CSRF_SECRET_COOKIE];

    if (!tokenFromHeader || !secretFromCookie || tokenFromHeader !== secretFromCookie) {
        console.warn(`CSRF token mismatch or missing. Header: ${tokenFromHeader}, Cookie Secret: ${secretFromCookie}`);

        if(!req.signedCookies) {
            console.error("req.signedCookies is undefined. Is cookieParser with a secret configured correctly before CSRF middleware?");
        } else if (!secretFromCookie) {
            console.warn(`Signed cookie '${CSRF_SECRET_COOKIE}' could not be read or was invalid.`);
        }
        return next(new AppError('InvalidCsrfToken', 403, 'Invalid or missing CSRF token.'));
    }

    next();
};

// --- Le middleware "Wrapper" à utiliser dans les routes ---
export const verifyCsrfToken = (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') {
        console.log('[CSRF Middleware] Skipping CSRF verification in test environment.');
        return next();
    }

    _internalVerifyCsrfToken(req, res, next);
};