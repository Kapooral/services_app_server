// src/middlewares/error.handler.ts

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app.errors'; // Assurez-vous d'importer votre classe d'erreur de base

export function globalErrorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    console.error('Global Error Handler caught:', error); // Pour le débogage

    if (error instanceof ZodError) {
        res.status(400).json({
            name: 'ZodValidationError',
            message: 'Invalid input data provided.',
            details: error.errors.map(e => ({
                path: e.path,
                message: e.message,
            })),
        });
        return;
    }

    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            name: error.name,
            message: error.message,
            errorCode: error.errorCode,
            details: error.details,
        });
        return;
    }

    // Pour toutes les autres erreurs inattendues
    res.status(500).json({
        name: 'InternalServerError',
        message: 'An unexpected error occurred. Please try again later.',
    });
}