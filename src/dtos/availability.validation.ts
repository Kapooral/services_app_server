// src/dtos/availability.validation.ts
import { z } from 'zod';


// --- Constantes ---
// Regex pour valider le format HH:MM:SS (permet 00:00:00 à 23:59:59)
const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
export const MAX_OVERRIDE_DURATION_YEARS = 1; // Limite de durée en années
export const MAX_OVERRIDE_DURATION_MS = MAX_OVERRIDE_DURATION_YEARS * 366 * 24 * 60 * 60 * 1000; // Approximation large (inclut année bissextile)

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
export const UpdateAvailabilityRuleSchema = CreateAvailabilityRuleSchema;
export type UpdateAvailabilityRuleDto = z.infer<typeof UpdateAvailabilityRuleSchema>;

// --- Exceptions de Disponibilité (Overrides) ---

const AvailabilityOverrideBaseSchema = z.object({
    start_datetime: z.coerce.date({ invalid_type_error: "Invalid start date/time format" }).optional(),
    end_datetime: z.coerce.date({ invalid_type_error: "Invalid end date/time format" }).optional(),
    is_available: z.boolean().optional(),
    reason: z.string().max(255).optional().nullable(),
});

export const CreateAvailabilityOverrideSchema = AvailabilityOverrideBaseSchema
    // Assurer que les champs requis pour la création sont présents
    .refine(data => data.start_datetime !== undefined, { message: "Start date/time is required", path: ["start_datetime"] })
    .refine(data => data.end_datetime !== undefined, { message: "End date/time is required", path: ["end_datetime"] })
    .refine(data => data.is_available !== undefined, { message: "Availability status (is_available) is required", path: ["is_available"] })
    // Raffinements pour la création
    .refine(data => data.start_datetime! < data.end_datetime!, { // '!' car validé par refines précédents
        message: "Start date/time must be before end date/time", path: ["end_datetime"],
    })
    .refine(data => data.start_datetime! >= new Date(Date.now() - 60000), { // Permettre une marge de 1 min pour éviter les erreurs de synchro
        message: "Start date/time cannot be in the past", path: ["start_datetime"],
    })
    .refine(data => (data.end_datetime!.getTime() - data.start_datetime!.getTime()) <= MAX_OVERRIDE_DURATION_MS, {
        message: `Availability override duration cannot exceed ${MAX_OVERRIDE_DURATION_YEARS} year(s)`, path: ["end_datetime"],
    });
export type CreateAvailabilityOverrideDto = z.infer<typeof CreateAvailabilityOverrideSchema>;

export const UpdateAvailabilityOverrideSchema = AvailabilityOverrideBaseSchema
    .partial() // Tous les champs sont optionnels pour la mise à jour
    .refine(data => Object.keys(data).length > 0, { message: "Update data cannot be empty" })
    // Valider start < end seulement si les deux sont fournis dans l'update
    .refine(data => !(data.start_datetime && data.end_datetime && data.start_datetime >= data.end_datetime), {
        message: "Start date/time must be before end date/time when both are updated", path: ["end_datetime"],
    })
    // Valider que start_datetime n'est pas dans le passé seulement s'il est fourni
    .refine(data => !(data.start_datetime && data.start_datetime < new Date(Date.now() - 60000)), {
        message: "Start date/time cannot be set in the past", path: ["start_datetime"],
    });
export type UpdateAvailabilityOverrideDto = z.infer<typeof UpdateAvailabilityOverrideSchema>;


// --- Query GET /availability ---
export const GetAvailabilityQuerySchema = z.object({
    date: z.string({ required_error: "Date query parameter is required" })
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD required)"),
});
export type GetAvailabilityQueryDto = z.infer<typeof GetAvailabilityQuerySchema>;