import { AppError } from './app.errors';

export class InvalidCredentialsError extends AppError {
    constructor(message: string = 'Invalid username/email or password.') { super('InvalidCredentialsError', 401, message); }
}
export class TwoFactorRequiredError extends AppError {
    constructor(methods: Array<'email' | 'sms' | 'totp'>, message: string = 'Two-factor authentication required.') { super('TwoFactorRequiredError', 403, message); }
}
export class InvalidPre2FATokenError extends AppError {
    constructor(message: string = 'Invalid or expired pre-2FA token.') { super('InvalidPre2FATokenError', 401, message); }
}
export class TwoFactorMethodUnavailableError extends AppError {
    constructor(message: string = 'The selected two-factor authentication method is not available or not verified for your account.') { super('TwoFactorMethodUnavailableError', 400, message); }
}
export class InvalidTwoFactorCodeError extends AppError {
    constructor(message: string = 'Invalid or expired two-factor code or recovery code.') { super('InvalidTwoFactorCodeError', 400, message); }
}
export class TwoFactorNotEnabledError extends AppError {
    constructor(message: string = 'Two-factor authentication is not enabled for this account.') { super('TwoFactorNotEnabledError', 400, message); }
}
export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required. Please log in.') { super('AuthenticationError', 401, message); }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Forbidden: Insufficient permissions.') { super('AuthorizationError', 403, message); }
}

export { InvalidCredentialsError as AuthInvalidCredentialsError };