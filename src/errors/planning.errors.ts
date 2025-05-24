// src/errors/planning.errors.ts
import { AppError } from './app.errors';

export class ShiftTemplateNotFoundError extends AppError {
    constructor(message: string = 'Shift template not found.') {
        super('ShiftTemplateNotFoundError', 404, message);
    }
}

export class ShiftTemplateCreationError extends AppError {
    constructor(message: string) {
        super('ShiftTemplateCreationError', 400, message); // Ou 409 si c'est un conflit de nom
    }
}

export class ApplyTemplateError extends AppError { // Pour les erreurs générales d'application
    constructor(message: string) {
        super('ApplyTemplateError', 500, message);
    }
}

export class StaffAvailabilityNotFoundError extends AppError {
    constructor(message: string = 'Staff availability rule not found.') {
        super('StaffAvailabilityNotFoundError', 404, message);
    }
}

export class StaffAvailabilityCreationError extends AppError {
    constructor(message: string) {
        super('StaffAvailabilityCreationError', 400, message);
    }
}
export class StaffAvailabilityUpdateError extends AppError {
    constructor(message: string) {
        super('StaffAvailabilityUpdateError', 500, message);
    }
}

export class StaffAvailabilityConflictError extends AppError {
    constructor(message: string = 'The proposed availability conflicts with an existing schedule.') {
        super('StaffAvailabilityConflictError', 409, message); // 409 Conflict
    }
}