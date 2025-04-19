// src/errors/country.errors.ts
import { AppError } from './app.errors';

export class CountryNotFoundError extends AppError {
    constructor(countryName?: string) {
        const message = countryName
            ? `Country '${ countryName }' not found or not supported.`
            : 'Country not found or not supported.';
        super('CountryNotFoundError', 400, message);
    }
}