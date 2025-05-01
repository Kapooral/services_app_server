// src/dtos/availability.validation.ts
import { z } from 'zod';
import { isAfter, addYears } from 'date-fns'; // Use date-fns for reliable date comparisons

// --- Constantes ---
export const TimeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
export const MAX_OVERRIDE_DURATION_YEARS = 1; // Limite de durée en années

// --- Règles de Disponibilité Récurrentes ---
const AvailabilityRuleBaseSchema = z.object({
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().regex(TimeFormatRegex, 'Invalid start time format (HH:MM:SS)'),
    end_time: z.string().regex(TimeFormatRegex, 'Invalid end time format (HH:MM:SS)'),
});

export const CreateAvailabilityRuleSchema = AvailabilityRuleBaseSchema
    .refine(data => data.start_time < data.end_time, {
        message: "Start time must be strictly before end time",
        path: ["end_time"],
    });
export type CreateAvailabilityRuleDto = z.infer<typeof CreateAvailabilityRuleSchema>;

export const UpdateAvailabilityRuleSchema = AvailabilityRuleBaseSchema
    .partial()
    .refine(data => Object.keys(data).length > 0, {
        message: "Update data cannot be empty",
    })
    .refine(data => !(data.start_time && data.end_time && data.start_time >= data.end_time), {
        message: "Start time must be strictly before end time when both are provided",
        path: ["end_time"],
    });
export type UpdateAvailabilityRuleDto = z.infer<typeof UpdateAvailabilityRuleSchema>;


// --- Exceptions de Disponibilité (Overrides) ---

// Schema pour la Création (validations complètes ici)
export const CreateAvailabilityOverrideSchema = z.object({
    start_datetime: z.coerce.date({ required_error: "Start date/time is required", invalid_type_error: "Invalid start date/time format" }),
    end_datetime: z.coerce.date({ required_error: "End date/time is required", invalid_type_error: "Invalid end date/time format" }),
    is_available: z.boolean({ required_error: "Availability status (is_available) is required" }),
    reason: z.string().max(255).optional().nullable(),
})
    .refine(data => isAfter(data.end_datetime, data.start_datetime), {
        message: "End date/time must be after start date/time",
        path: ["end_datetime"],
    })
    .refine(data => isAfter(data.start_datetime, new Date()), { // Le refine passe si la date est bien APRES maintenant
        message: "Start date/time cannot be in the past",
        path: ["start_datetime"],
    })
    .refine(data => !isAfter(data.end_datetime, addYears(data.start_datetime, MAX_OVERRIDE_DURATION_YEARS)), {
        message: `Availability override duration cannot exceed ${MAX_OVERRIDE_DURATION_YEARS} year(s)`,
        path: ["end_datetime"],
    });
export type CreateAvailabilityOverrideDto = z.infer<typeof CreateAvailabilityOverrideSchema>;

// Schema pour la Mise à Jour (Validations minimales - la logique métier est dans le service)
export const UpdateAvailabilityOverrideSchema = z.object({
    start_datetime: z.coerce.date({ invalid_type_error: "Invalid start date/time format" }).optional(),
    end_datetime: z.coerce.date({ invalid_type_error: "Invalid end date/time format" }).optional(),
    is_available: z.boolean().optional(),
    reason: z.string().max(255).optional().nullable(),
})
    .partial()
    .refine(data => Object.keys(data).length > 0, {
        message: "Update data cannot be empty",
    });
export type UpdateAvailabilityOverrideDto = z.infer<typeof UpdateAvailabilityOverrideSchema>;


// --- Query GET /availability ---
export const GetAvailabilityQuerySchema = z.object({
    date: z.string({ required_error: "Date query parameter is required" })
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD required)"),
});
export type GetAvailabilityQueryDto = z.infer<typeof GetAvailabilityQuerySchema>;