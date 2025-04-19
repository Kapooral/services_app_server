// src/errors/booking.errors.ts
import { AppError } from './app.errors';

export class BookingNotFoundError extends AppError {
    constructor(message: string = 'Booking not found.') {
        super('BookingNotFoundError', 404, message);
    }
}

export class BookingConflictError extends AppError {
    constructor(message: string = 'The selected time slot is no longer available.') {
        super('BookingConflictError', 409, message);
    }
}

export class InvalidBookingOperationError extends AppError {
    constructor(message: string = 'This operation cannot be performed on this booking.') {
        super('InvalidBookingOperationError', 400, message);
    }
}

export class CancellationNotAllowedError extends AppError {
    constructor(message: string = 'Cancellation is not allowed for this booking.') {
        super('CancellationNotAllowedError', 403, message);
    }
}

export class InvalidStatusTransitionError extends AppError {
    constructor(fromStatus: string, toStatus: string) {
        super('InvalidStatusTransitionError', 400, `Cannot transition booking status from ${fromStatus} to ${toStatus}.`);
    }
}

export class BookingOwnershipError extends AppError {
    constructor(message: string = 'You do not have permission to access or modify this booking.') {
        super('BookingOwnershipError', 403, message);
    }
}