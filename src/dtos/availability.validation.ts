// src/dtos/availability.validation.ts
import { z } from 'zod';

// Regex pour valider le format HH:MM:SS (permet 00:00:00 à 23:59:59)
const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

// --- Règles de Disponibilité Récurrentes ---

export const CreateAvailabilityRuleSchema = z.object({
    day_of_week: z.number().int().min(0, 'Day must be between 0 (Sunday) and 6 (Saturday)').max(6),
    start_time: z.string().regex(timeFormatRegex, 'Invalid start time format (HH:MM:SS)'),
    end_time: z.string().regex(timeFormatRegex, 'Invalid end time format (HH:MM:SS)'),
}).refine(data => data.start_time < data.end_time, { // Vérifier la logique horaire
    message: "Start time must be strictly before end time",
    path: ["end_time"],
});

export type CreateAvailabilityRuleDto = z.infer<typeof CreateAvailabilityRuleSchema>;

// Pour la mise à jour, on garde tous les champs requis car on remplace la règle du jour
export const UpdateAvailabilityRuleSchema = CreateAvailabilityRuleSchema; // Pas de partial ici
export type UpdateAvailabilityRuleDto = CreateAvailabilityRuleDto; // Alias pour la clarté

// --- Exceptions de Disponibilité (Overrides) ---

const AvailabilityOverrideBaseSchema = z.object({
    start_datetime: z.coerce.date({
        required_error: "Start date/time is required",
        invalid_type_error: "Invalid start date/time format",
    }),
    end_datetime: z.coerce.date({
        required_error: "End date/time is required",
        invalid_type_error: "Invalid end date/time format",
    }),
    is_available: z.boolean(),
    reason: z.string().max(255).optional().nullable(),
});

export const CreateAvailabilityOverrideSchema = AvailabilityOverrideBaseSchema
    .refine(data => data.start_datetime < data.end_datetime, {
        message: "Start date/time must be before end date/time",
        path: ["end_datetime"],
    });

export type CreateAvailabilityOverrideDto = z.infer<typeof CreateAvailabilityOverrideSchema>;

export const UpdateAvailabilityOverrideSchema = AvailabilityOverrideBaseSchema
    .partial() // Appliquer partial sur la base
    .refine( // Appliquer refine sur le résultat partiel
        data => Object.keys(data).length > 0, { message: "Update data cannot be empty" }
    );

export type UpdateAvailabilityOverrideDto = z.infer<typeof UpdateAvailabilityOverrideSchema>;


// --- Validation pour la requête GET /availability ---
export const GetAvailabilityQuerySchema = z.object({
    // Utiliser z.coerce.date pour essayer de parser la date YYYY-MM-DD
    // Ou utiliser z.string().regex() si on veut être strict sur le format YYYY-MM-DD
    date: z.string({ required_error: "Date query parameter is required" })
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD required)"),
    // staffId: z.string().uuid().optional() // Pour la V2 avec Staff
});

export type GetAvailabilityQueryDto = z.infer<typeof GetAvailabilityQuerySchema>;