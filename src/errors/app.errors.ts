/**
 * Classe de base pour les erreurs opérationnelles de l'application.
 * Les erreurs opérationnelles sont des erreurs attendues (ex: entrée invalide, ressource non trouvée)
 * par opposition aux erreurs de programmation ou système.
 */
export class AppError extends Error {
    public readonly name: string;
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly errorCode?: string;
    public readonly details?: Record<string, any>;

    /**
     * @param name Nom de l'erreur (ex: 'UserNotFoundError')
     * @param statusCode Code de statut HTTP (ex: 404)
     * @param message Message d'erreur pour le développeur/logs (peut être exposé au client si nécessaire)
     * @param isOperational Indique si c'est une erreur attendue (true par défaut)
     * @param errorCode
     * @param details
     */
    constructor(name: string, statusCode: number, message: string, isOperational: boolean = true, errorCode: string|undefined = undefined, details: Record<string, any>|undefined = undefined) {
        super(message); // Passe le message au constructeur Error parent

        // Maintient une trace de pile correcte pour où notre erreur a été lancée (uniquement V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }

        this.name = name; // Nom personnalisé de l'erreur
        this.statusCode = statusCode; // Code HTTP associé
        this.isOperational = isOperational; // Type d'erreur
        this.errorCode = errorCode;
        this.details = details;

        // Nécessaire si on cible des versions antérieures à ES6 ou si on utilise certains transpilers
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class InvalidInputError extends AppError {
    constructor(message: string, details?: Record<string, any>) {
        super('InvalidInputError', 400, message, true, 'INVALID_INPUT', details);
    }
}

export class AuthorizationError extends AppError { // Renommée pour éviter conflit avec ForbiddenError
    constructor(message: string = "Authorization denied.") {
        super("AuthorizationError", 403, message, true, "AUTHZ_DENIED");
    }
}
export class ForbiddenError extends AppError { // Plus spécifique pour les cas où l'utilisateur est authentifié mais n'a pas les droits
    constructor(message: string = "Access to this resource is forbidden.") {
        super("ForbiddenError", 403, message, true, "FORBIDDEN_ACCESS");
    }
}
export class NotFoundError extends AppError {
    constructor(resourceName: string = "Resource", resourceId?: string | number) {
        const message = resourceId ? `${resourceName} with ID ${resourceId} not found.` : `${resourceName} not found.`;
        super("NotFoundError", 404, message, true, "NOT_FOUND", { resourceName, resourceId });
    }
}