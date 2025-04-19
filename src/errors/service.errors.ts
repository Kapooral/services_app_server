// src/errors/service.errors.ts
import { AppError } from './app.errors';

export class ServiceNotFoundError extends AppError {
    constructor(message: string = 'Service not found.') {
        super('ServiceNotFoundError', 404, message);
    }
}

// Erreur si on essaie d'opérer sur un service qui n'appartient pas
// à l'établissement de l'admin connecté (sera vérifié dans le service/middleware)
export class ServiceOwnershipError extends AppError {
    constructor(message: string = 'You do not have permission to manage this service.') {
        super('ServiceOwnershipError', 403, message);
    }
}