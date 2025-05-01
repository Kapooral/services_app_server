import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { PreTwoFactorPayload } from '../dtos/auth.validation';

const generalWindowMs = 15 * 60 * 1000;
const loginWindowMs = 5 * 60 * 1000;
const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECRET_KEY';
const PRE_2FA_TOKEN_HEADER = 'X-Pre-2FA-Token';
const enableRateLimit = process.env.NODE_ENV !== 'test';

export const apiLimiter = rateLimit({
    windowMs: generalWindowMs,
    max: 10000, // enableRateLimit ? 1000 : Infinity,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes' },
});

export const loginInitiateLimiter = rateLimit({
    windowMs: generalWindowMs,
    max: enableRateLimit ? 10 : Infinity,
    message: { message: 'Too many login attempts, please try again later.' },
    keyGenerator: (req: Request, res: Response): string => {
        const identifier = req.body?.usernameOrEmail || 'unknown_identifier';
        const ip = req.ip || 'unknown_ip';
        return `${ip}-${identifier}`;
    },
});

export const sendCodeLimiter = rateLimit({
    windowMs: loginWindowMs,
    max: enableRateLimit ? 5 : Infinity,
    message: { message: 'Too many 2FA code requests, please try again later.' },
    keyGenerator: (req: Request, res: Response): string => {
        const token = req.headers[PRE_2FA_TOKEN_HEADER.toLowerCase()] as string;
        const ip = req.ip || 'unknown_ip';
        if (!token) return ip;
        try {
            const payload = jwt.verify(token, JWT_SECRET) as PreTwoFactorPayload;
            if (payload && typeof payload === 'object' && payload.userId) {
                return `send-code-${payload.userId}`;
            }
            console.warn("Invalid payload structure in pre-2fa token for send-code rate limit key.");
            return ip;
        } catch (err) {
            console.warn("Invalid pre-2fa token during rate limit key generation for send-code");
            return ip;
        }
    },
});

export const verifyCodeLimiter = rateLimit({
    windowMs: loginWindowMs,
    max: enableRateLimit ? 10 : Infinity,
    message: { message: 'Too many 2FA code verification attempts, please try again later.' },
    keyGenerator: (req: Request, res: Response): string => {
        const token = req.headers[PRE_2FA_TOKEN_HEADER.toLowerCase()] as string;
        const ip = req.ip || 'unknown_ip';
        if (!token) return ip;
        try {
            const payload = jwt.verify(token, JWT_SECRET) as PreTwoFactorPayload;
            if (payload && typeof payload === 'object' && payload.userId) {
                return `verify-code-${payload.userId}`;
            }
            console.warn("Invalid payload structure in pre-2fa token for verify-code rate limit key.");
            return ip;
        } catch (err) {
            console.warn("Invalid pre-2fa token during rate limit key generation for verify-code");
            return ip;
        }
    },
});