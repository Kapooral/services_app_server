// src/types/express-rate-limit/index.d.ts
declare module 'express-rate-limit' {
    import {Request, Response, NextFunction, RequestHandler} from 'express';

    export interface RateLimitOptions {
        windowMs?: number;
        max?: number;
        message?: string | object;
        statusCode?: number;
        headers?: boolean;
        skipFailedRequests?: boolean;
        skipSuccessfulRequests?: boolean;
        keyGenerator?(req: Request, res: Response): string;
        handler?(req: Request, res: Response, next: NextFunction, options: RateLimitOptions): void;
    }

    function rateLimit(options?: RateLimitOptions): RequestHandler;
    export default rateLimit;
}
