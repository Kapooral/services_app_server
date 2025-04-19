/**
 * Classe de base pour les erreurs opérationnelles de l'application.
 * Les erreurs opérationnelles sont des erreurs attendues (ex: entrée invalide, ressource non trouvée)
 * par opposition aux erreurs de programmation ou système.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    /**
     * @param name Nom de l'erreur (ex: 'UserNotFoundError')
     * @param statusCode Code de statut HTTP (ex: 404)
     * @param message Message d'erreur pour le développeur/logs (peut être exposé au client si nécessaire)
     * @param isOperational Indique si c'est une erreur attendue (true par défaut)
     */
    constructor(name: string, statusCode: number, message: string, isOperational: boolean = true) {
        super(message); // Passe le message au constructeur Error parent

        // Maintient une trace de pile correcte pour où notre erreur a été lancée (uniquement V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }

        this.name = name; // Nom personnalisé de l'erreur
        this.statusCode = statusCode; // Code HTTP associé
        this.isOperational = isOperational; // Type d'erreur

        // Nécessaire si on cible des versions antérieures à ES6 ou si on utilise certains transpilers
        Object.setPrototypeOf(this, new.target.prototype);
    }
}