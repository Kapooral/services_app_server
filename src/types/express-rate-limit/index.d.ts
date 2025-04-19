// src/types/express-rate-limit/index.d.ts
declare module 'express-rate-limit' {
    import { RequestHandler } from 'express';

    export interface RateLimitOptions {
        windowMs?: number;
        max?: number;
        message?: string | object;
        statusCode?: number;
        headers?: boolean;
        skipFailedRequests?: boolean;
        skipSuccessfulRequests?: boolean;
        keyGenerator?(req: any, res: any): string;
        handler?(req: any, res: any, next: any, options: RateLimitOptions): void;
    }

    function rateLimit(options?: RateLimitOptions): RequestHandler;
    export default rateLimit;
}
