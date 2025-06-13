// src/utils/parser.utils.ts
import { InvalidInputError } from '../errors/app.errors'; // S'assurer que InvalidInputError est défini

/**
 * Parses a string value from request parameters or query into a number.
 * Throws an InvalidInputError if parsing fails or the result is not a positive integer (optional).
 *
 * @param value - The string value to parse.
 * @param paramName - The name of the parameter, used for error messages.
 * @param options - Optional configuration for parsing.
 * @param options.required - If true, throws an error if the value is undefined or null. Defaults to true.
 * @param options.positive - If true, ensures the parsed number is a positive integer. Defaults to true.
 * @returns The parsed number.
 * @throws {InvalidInputError} If parsing fails or validation constraints are not met.
 */
export function parseNumberId(
    value: string | undefined | null,
    paramName: string,
    options: { required?: boolean; positive?: boolean } = {}
): number {
    const { required = true, positive = true } = options;

    if (value === undefined || value === null || value.trim() === '') {
        if (required) {
            throw new InvalidInputError(`Parameter '${paramName}' is required.`);
        }
        // Si non requis et vide/null/undefined, on pourrait retourner 0, null, ou undefined selon la sémantique désirée.
        // Pour un ID, retourner 0 est souvent problématique. Lever une erreur ou retourner un type qui indique l'absence est mieux.
        // Ici, si non requis et absent, on va quand même lever une erreur si on tente de l'utiliser comme un nombre valide plus tard.
        // Pour des cas optionnels, le contrôleur devrait vérifier avant de parser.
        // Simplifions : si la valeur n'est pas une chaîne valide pour un nombre, ça échoue.
        throw new InvalidInputError(`Parameter '${paramName}' has an invalid format for a number.`);
    }

    const numberValue = parseInt(value, 10);

    if (isNaN(numberValue)) {
        throw new InvalidInputError(`Parameter '${paramName}' must be a valid number. Received: "${value}".`);
    }

    if (positive && numberValue <= 0) {
        throw new InvalidInputError(`Parameter '${paramName}' must be a positive integer. Received: ${numberValue}.`);
    }
    // On pourrait ajouter une validation pour s'assurer que c'est un entier si besoin (ex: numberValue % 1 !== 0)

    return numberValue;
}

/**
 * Parses a string value from request query into a boolean.
 * Handles 'true', 'false', '1', '0'. Case-insensitive for 'true'/'false'.
 * Returns undefined if the value is not a recognizable boolean string.
 *
 * @param value - The string value to parse.
 * @param paramName - The name of the parameter, used for error messages (optional).
 * @returns The parsed boolean, or undefined if not a valid boolean string.
 * @throws {InvalidInputError} if value is provided but not a valid boolean representation and throwOnError is true.
 */
export function parseOptionalBoolean(
    value: string | undefined | null,
    paramName?: string, // paramName est optionnel ici
    options: { throwOnErrorIfPresent?: boolean } = {}
): boolean | undefined {
    const { throwOnErrorIfPresent = false } = options;

    if (value === undefined || value === null || value.trim() === '') {
        return undefined;
    }

    const lowerValue = value.toLowerCase();
    if (lowerValue === 'true' || lowerValue === '1') {
        return true;
    }
    if (lowerValue === 'false' || lowerValue === '0') {
        return false;
    }

    if (throwOnErrorIfPresent) {
        throw new InvalidInputError(
            `Query parameter '${paramName || 'boolean_param'}' has an invalid boolean value. ` +
            `Expected 'true', 'false', '1', or '0'. Received: "${value}".`
        );
    }
    return undefined; // Non reconnu comme booléen
}

// On pourrait ajouter d'autres parseurs ici (ex: parseDate, parseEnum, etc.)