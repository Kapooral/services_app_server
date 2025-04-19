// src/errors/userErrors.ts
import { AppError } from './app.errors';

// --- Erreurs spécifiques liées aux utilisateurs ---

/**
 * Erreur lancée lorsqu'un utilisateur spécifique n'est pas trouvé.
 * Code HTTP: 404 Not Found
 */
export class UserNotFoundError extends AppError {
    constructor(message: string = 'User not found.') {
        super('UserNotFoundError', 404, message);
    }
}

/**
 * Erreur lancée lors d'une tentative de création/mise à jour avec un email déjà existant.
 * Code HTTP: 409 Conflict
 */
export class DuplicateEmailError extends AppError {
    constructor(message: string = 'An account with this email address already exists.') {
        super('DuplicateEmailError', 409, message);
    }
}

/**
 * Erreur lancée lors d'une tentative de création/mise à jour avec un nom d'utilisateur déjà existant.
 * Code HTTP: 409 Conflict
 */
export class DuplicateUsernameError extends AppError {
    constructor(message: string = 'This username is already taken.') {
        super('DuplicateUsernameError', 409, message);
    }
}

/**
 * Erreur lancée lorsque les informations d'identification fournies (ex: mot de passe) sont incorrectes.
 * Code HTTP: 401 Unauthorized
 */
export class InvalidCredentialsError extends AppError {
    constructor(message: string = 'Invalid credentials provided.') {
        // Note: Souvent, pour le login, on retourne un message générique
        // même si l'email n'existe pas, pour éviter l'énumération.
        // Le message ici est plus pour le log ou des contextes spécifiques.
        super('InvalidCredentialsError', 401, message);
    }
}

/**
 * Erreur lancée lorsqu'un code de vérification (email, téléphone, récupération) est invalide, expiré ou incorrect.
 * Code HTTP: 400 Bad Request
 */
export class VerificationCodeError extends AppError {
    constructor(message: string = 'Invalid or expired verification code.') {
        super('VerificationCodeError', 400, message);
    }
}

/**
 * Erreur lancée lorsqu'un token de validation d'email est invalide, expiré ou incorrect.
 * Code HTTP: 400 Bad Request
 */
export class VerificationActivationTokenError extends AppError {
    constructor(message: string = 'Invalid or expired verification token.') {
        super('VerificationActivationTokenError', 400, message);
    }
}
export class MissingActivationTokenError extends AppError {
    constructor(message: string = 'Activation token is required.') {
        super('MissingActivationTokenError', 400, message);
    }
}

/**
 * Erreur générique pour une mauvaise requête client non couverte par la validation Zod
 * ou d'autres erreurs spécifiques.
 * Code HTTP: 400 Bad Request
 */
export class BadRequestError extends AppError {
    constructor(message: string = 'Bad request.') {
        super('BadRequestError', 400, message);
    }
}

/**
 * Erreur lancée lorsque l'utilisateur est authentifié mais n'a pas les permissions nécessaires
 * pour effectuer une action sur une ressource.
 * Code HTTP: 403 Forbidden
 */
export class ForbiddenError extends AppError {
    constructor(message: string = 'You do not have permission to perform this action.') {
        super('ForbiddenError', 403, message);
    }
}

/**
 * Erreur lancée lorsque l'authentification est requise mais manquante ou invalide.
 * Code HTTP: 401 Unauthorized
 */
export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required. Please log in.') {
        super('AuthenticationError', 401, message);
    }
}

export class ProfilePictureNotFoundError extends AppError {
    constructor(message: string = 'Your profile picture was not found.') {
        super('ProfilePictureNotFoundError', 400, message);
    }
}

// --- Vous pouvez ajouter d'autres classes d'erreurs spécifiques ici ---
// Exemple:
// export class AccountInactiveError extends AppError { ... }
// export class RateLimitExceededError extends AppError { constructor() { super('RateLimitExceededError', 429, 'Too many requests.'); } }