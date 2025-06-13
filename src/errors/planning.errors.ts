// src/errors/planning.errors.ts
import { AppError } from './app.errors';

// --- Classe de Base pour les Erreurs du Module Planning ---
export class PlanningModuleError extends AppError {
    constructor(
        name: string, // Nom spécifique de l'erreur (ex: RpmCreationError)
        statusCode: number,
        message: string,
        errorCode?: string, // Code machine-lisible
        details?: Record<string, any> // Données contextuelles additionnelles
    ) {
        super(name, statusCode, message, true, errorCode, details);
    }
}

export class TimezoneConfigurationError extends PlanningModuleError {
    constructor(message: string, errorCode: string = 'TIMEZONE_CONFIGURATION_ERROR') {
        super('TimezoneConfigurationError', 400, message, errorCode)
    }
}

// Erreurs pour RecurringPlanningModel (RPM)
export class RpmCreationError extends PlanningModuleError {
    constructor(message: string, errorCode: string = 'RPM_CREATION_FAILED', details?: Record<string, any>) {
        super('RpmCreationError', 400, message, errorCode, details);
    }
}

export class RpmNameConflictError extends PlanningModuleError {
    constructor(name: string, establishmentId: number) {
        super(
            'RpmNameConflictError',
            409,
            `A Recurring Planning Model with the name "${name}" already exists for establishment ID ${establishmentId}.`,
            'RPM_NAME_CONFLICT',
            { name, establishmentId }
        );
    }
}

export class RpmNotFoundError extends PlanningModuleError {
    constructor(rpmId?: number | string, details?: Record<string, any>) {
        const message = rpmId ? `Recurring Planning Model with ID ${rpmId} not found.` : 'Recurring Planning Model not found.';
        super('RpmNotFoundError', 404, message, 'RPM_NOT_FOUND', details ?? (rpmId ? { rpmId } : undefined));
    }
}

export class RpmUpdateError extends PlanningModuleError {
    constructor(message: string, errorCode: string = 'RPM_UPDATE_FAILED', details?: Record<string, any>) {
        super('RpmUpdateError', 400, message, errorCode, details);
    }
}

export class RpmDeletionError extends PlanningModuleError {
    constructor(message: string, errorCode: string = 'RPM_DELETION_FAILED', details?: Record<string, any>) {
        // Souvent 400 ou 409 si des dépendances existent
        super('RpmDeletionError', 400, message, errorCode, details);
    }
}

// Erreurs pour RpmMemberAssignment (RPMMA)
export class RpmAssignmentError extends PlanningModuleError {
    constructor(message: string, errorCode: string = 'RPM_ASSIGNMENT_INVALID', details?: Record<string, any>) {
        // 409 pour conflits de chevauchement, 400 pour autres validations
        const statusCode = errorCode === 'ASSIGNMENT_PERIOD_OVERLAP' ? 409 : 400;
        super('RpmAssignmentError', statusCode, message, errorCode, details);
    }
}

export class RpmAssignmentNotFoundError extends PlanningModuleError {
    constructor(assignmentId?: number, details?: Record<string, any>) {
        const message = assignmentId ? `RPM Assignment with ID ${assignmentId} not found.` : 'RPM Assignment not found.';
        super('RpmAssignmentNotFoundError', 404, message, 'RPM_ASSIGNMENT_NOT_FOUND', details ?? (assignmentId ? { assignmentId } : undefined));
    }
}

// Erreurs pour DailyAdjustmentSlot (DAS)
export class DasCreationError extends PlanningModuleError {
    constructor(message: string, errorCode: string = 'DAS_CREATION_FAILED', details?: Record<string, any>) {
        super('DasCreationError', 400, message, errorCode, details);
    }
}

export class DasConflictError extends PlanningModuleError {
    constructor(message: string, details?: { conflictingSlotId?: number, conflictingSlotIds?: number[], membershipId: number, slotDate: string, attemptedStartTime: string, attemptedEndTime: string }) {
        super(
            'DasConflictError',
            409,
            message,
            'DAS_SLOT_OVERLAP',
            details
        );
    }
}

export class DasNotFoundError extends PlanningModuleError {
    constructor(dasId?: number, details?: Record<string, any>) {
        const message = dasId ? `Daily Adjustment Slot with ID ${dasId} not found.` : 'Daily Adjustment Slot not found.';
        super('DasNotFoundError', 404, message, 'DAS_NOT_FOUND', details ?? (dasId ? { dasId } : undefined));
    }
}

export class DasUpdateError extends PlanningModuleError {
    constructor(message: string, errorCode: string = 'DAS_UPDATE_FAILED', details?: Record<string, any>) {
        super('DasUpdateError', 400, message, errorCode, details);
    }
}

