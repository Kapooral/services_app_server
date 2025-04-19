// src/errors/availability.errors.ts
import { AppError } from './app.errors'; // Ajustez le chemin

export class AvailabilityRuleNotFoundError extends AppError {
    constructor(message: string = 'Availability rule not found.') {
        super('AvailabilityRuleNotFoundError', 404, message);
    }
}

export class AvailabilityOverrideNotFoundError extends AppError {
    constructor(message: string = 'Availability override not found.') {
        super('AvailabilityOverrideNotFoundError', 404, message);
    }
}

export class AvailabilityRuleConflictError extends AppError {
    constructor(message: string = 'An availability rule for this day already exists for the establishment.') {
        super('AvailabilityRuleConflictError', 409, message); // 409 Conflict
    }
}

export class AvailabilityTimeLogicError extends AppError {
    constructor(message: string = 'Start time must be before end time.') {
        super('AvailabilityTimeLogicError', 400, message); // 400 Bad Request
    }
}

export class AvailabilityDateLogicError extends AppError {
    constructor(message: string = 'Start date/time must be before end date/time.') {
        super('AvailabilityDateLogicError', 400, message); // 400 Bad Request
    }
}

// Erreur si on essaie de gérer une règle/override d'un autre établissement
export class AvailabilityOwnershipError extends AppError {
    constructor(message: string = 'You do not have permission to manage this availability setting.') {
        super('AvailabilityOwnershipError', 403, message); // 403 Forbidden
    }
}