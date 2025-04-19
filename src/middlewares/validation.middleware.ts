import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AnyZodObject, ZodError } from 'zod'; // Importer Zod

export const validateDto = (schema: AnyZodObject) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => { // <--- Annoter le retour ici
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            // Validation réussie, appeler next() et laisser la fonction retourner implicitement void
            next(); // Ne pas retourner next()
        } catch (error) {
            if (error instanceof ZodError) {
                // Envoyer la réponse, MAIS NE PAS LA RETOURNER
                res.status(400).json({ // <--- Supprimer 'return'
                    message: 'Validation failed',
                    errors: error.errors,
                });
                // Important: Arrêter l'exécution ici pour ne pas appeler next() par erreur
                return; // Sortir de la fonction après avoir envoyé la réponse d'erreur
            }

            console.error("Error during validation:", error);
            // Envoyer la réponse d'erreur serveur, MAIS NE PAS LA RETOURNER
            res.status(500).json({ message: 'Internal server error during validation' }); // <--- Supprimer 'return'
            // Pas besoin de 'return' explicite ici car c'est la fin de la fonction catch
        }
    };

export default function validate(req: Request, res: Response, next: NextFunction): void {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(422).json({ errors: errors.array() });
        return;
    }
    next();
}
