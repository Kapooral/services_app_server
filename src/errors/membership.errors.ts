// src/errors/membership.errors.ts
import { AppError } from './app.errors'; // Ajustez le chemin si nécessaire

export class MembershipNotFoundError extends AppError {
    constructor(message: string = 'Membership not found.') {
        super('MembershipNotFound', 404, message);
    }
}

export class InvitationTokenInvalidError extends AppError {
    constructor(message: string = 'Invalid or expired invitation token.') {
        // Utiliser 400 (Bad Request) car le token fourni est invalide,
        // ou 404 si on considère que la ressource (invitation) n'est pas trouvée.
        // 400 semble plus approprié car le client fournit une donnée incorrecte.
        super('InvalidInvitationToken', 400, message);
    }
}

export class UserAlreadyMemberError extends AppError {
    constructor(message: string = 'User is already associated with this establishment.') {
        // 409 Conflict est approprié ici
        super('UserAlreadyMember', 409, message);
    }
}

export class CannotUpdateLastAdminError extends AppError {
    constructor(message: string = 'You cannot update the last admin\'s User role') {
        // 409 Conflict est approprié ici
        super('CannotUpdateLastAdmin', 409, message);
    }
}

export class CannotDeleteLastAdminError extends AppError {
    constructor(message: string = 'You cannot delete the last admin User.') {
        // 409 Conflict est approprié ici
        super('CannotDeleteLastAdmin', 409, message);
    }
}