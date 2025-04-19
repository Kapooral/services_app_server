// src/middlewares/error.middleware.ts (Exemple Structure)
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app.errors'; // Votre classe de base

const errorMiddleware = (error: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("💥 ERROR:", error.name, error.message, error.stack); // Log détaillé

    let statusCode = 500;
    let message = 'Internal Server Error';
    let errors: any | undefined = undefined;
    let errorName: string | undefined = undefined; // << AJOUTER

    if (error instanceof AppError) {
        statusCode = error.statusCode;
        message = error.message;
        errorName = error.name; // << CAPTURER LE NOM
        // errors = error.errors; // Si votre AppError a une propriété 'errors'
    } else if (error instanceof ZodError) {
        statusCode = 400;
        message = 'Validation failed';
        errorName = 'ZodValidationError'; // Nom générique pour Zod
        errors = error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
            code: e.code, // Inclure le code Zod peut aider
        }));
    }
    // Ajouter d'autres instanceof pour erreurs spécifiques (SequelizeUniqueConstraintError, etc.) si nécessaire

    res.status(statusCode).json({
        status: 'error',
        name: errorName, // << INCLURE LE NOM DANS LA REPONSE
        message,
        errors, // Inclure le tableau d'erreurs Zod ou autres détails
        // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, // Optionnel pour dev
    });
};

export default errorMiddleware;