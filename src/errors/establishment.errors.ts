// src/errors/establishment.errors.ts
import { AppError } from './app.errors';

export class EstablishmentNotFoundError extends AppError {
    constructor(message: string = 'Establishment not found.') {
        super('EstablishmentNotFoundError', 404, message);
    }
}

export class DuplicateSiretError extends AppError {
    constructor(message: string = 'An establishment with this SIRET number already exists.') {
        super('DuplicateSiretError', 409, message);
    }
}

export class InvalidSiretFormatError extends AppError {
    constructor(message: string = 'Invalid SIRET number format.') {
        super('InvalidSiretFormatError', 400, message);
    }
}
export class InvalidSirenFormatError extends AppError {
    constructor(message: string = 'Invalid SIREN number format.') {
        super('InvalidSirenFormatError', 400, message);
    }
}


export class AlreadyOwnerError extends AppError {
    constructor(message: string = 'You already own an establishment.') {
        // Ou ajuster le code/message si un user peut en avoir plusieurs mais via un autre process
        super('AlreadyOwnerError', 403, message);
    }
}

export class EstablishmentNotValidatedError extends AppError {
    constructor(message: string = 'Establishment is not validated yet.') {
        super('EstablishmentNotValidatedError', 403, message); // 403 car l'accès est interdit publiquement
    }
}

// Ajouter SiretValidationError et SireneApiError plus tard pour l'étape de validation
export class SiretValidationError extends AppError {
    constructor(message: string = 'SIRET validation failed.') {
        super('SiretValidationError', 400, message);
    }
}

export class SireneApiError extends AppError {
    constructor(message: string = 'Could not reach SIRENE validation service.') {
        super('SireneApiError', 503, message); // 503 Service Unavailable
    }
}

export class EstablishmentProfilePictureNotFoundError extends AppError {
    constructor(message: string = 'Establishment does not have a profile picture to delete.') {
        super('EstablishmentProfilePictureNotFoundError', 404, message);
    }
}