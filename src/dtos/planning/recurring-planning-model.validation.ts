// src/dtos/recurring-planning-model.validation.ts
import { z } from 'zod';
import { DefaultBlockType, BreakType } from '../../types/planning.enums'; // Ajuster le chemin

// --- Sous-Schémas ---

// Schéma pour une pause au sein d'un RPM
export const RPMBreakSchema = z.object({
    id: z.string().uuid("Break ID must be a valid UUID."), // UUID pour identifier la pause
    startTime: z.string().time({ precision: 0, message: "Break startTime must be in HH:MM:SS format." }), // "HH:MM:SS"
    endTime: z.string().time({ precision: 0, message: "Break endTime must be in HH:MM:SS format." }),   // "HH:MM:SS"
    description: z.string().max(255, "Break description cannot exceed 255 characters.").optional().nullable(),
    breakType: z.nativeEnum(BreakType, { errorMap: () => ({ message: "Invalid break type." }) }),
})
export type RPMBreakDto = z.infer<typeof RPMBreakSchema>;


// --- DTOs Principaux ---

// DTO pour la Création d'un RecurringPlanningModel
export const CreateRecurringPlanningModelSchema = z.object({
    name: z.string().min(3, "Model name must be at least 3 characters.").max(150, "Model name cannot exceed 150 characters."),
    description: z.string().max(2000, "Description cannot exceed 2000 characters.").optional().nullable(),
    referenceDate: z.string().date("Reference date must be in YYYY-MM-DD format."), // YYYY-MM-DD
    globalStartTime: z.string().time({ precision: 0, message: "Global startTime must be in HH:MM:SS format." }), // HH:MM:SS
    globalEndTime: z.string().time({ precision: 0, message: "Global endTime must be in HH:MM:SS format." }),   // HH:MM:SS
    rruleString: z.string().min(5, "RRule string is too short.") // Validation plus poussée de la rruleString dans le service
        .refine(val => val.includes('FREQ='), { message: "RRule string must contain a FREQ component."}),
    defaultBlockType: z.nativeEnum(DefaultBlockType, { errorMap: () => ({ message: "Invalid default block type." }) }),
    breaks: z.array(RPMBreakSchema).max(20, "A maximum of 20 breaks can be defined.").optional().nullable(), // Max 20 pauses par modèle
}).refine(data => { // Valider que les pauses sont dans l'enveloppe globale
    if (data.breaks) {
        for (const breakItem of data.breaks) {
            if (breakItem.startTime < data.globalStartTime || breakItem.endTime > data.globalEndTime) {
                return false;
            }
        }
    }
    return true;
}, {
    message: "All breaks must be within the globalStartTime and globalEndTime of the model.",
    path: ["breaks"],
}).refine(data => { // Valider que les pauses ne se chevauchent pas entre elles
    if (data.breaks && data.breaks.length > 1) {
        const sortedBreaks = [...data.breaks].sort((a, b) => a.startTime.localeCompare(b.startTime));
        for (let i = 0; i < sortedBreaks.length - 1; i++) {
            if (sortedBreaks[i].endTime > sortedBreaks[i+1].startTime) {
                return false; // Chevauchement détecté
            }
        }
    }
    return true;
}, {
    message: "Breaks within the model cannot overlap.",
    path: ["breaks"],
});
export type CreateRecurringPlanningModelDto = z.infer<typeof CreateRecurringPlanningModelSchema>;


// DTO pour la Mise à Jour d'un RecurringPlanningModel
export const UpdateRecurringPlanningModelSchema = CreateRecurringPlanningModelSchema.refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one field must be provided for update." }
);
export type UpdateRecurringPlanningModelDto = z.infer<typeof UpdateRecurringPlanningModelSchema>;


// DTO de Sortie pour un RecurringPlanningModel
export const RecurringPlanningModelOutputSchema = z.object({
    id: z.number().int().positive(), // Ou z.string().uuid()
    name: z.string(),
    description: z.string().nullable(),
    referenceDate: z.string().date(),
    globalStartTime: z.string().time({ precision: 0 }),
    globalEndTime: z.string().time({ precision: 0 }),
    rruleString: z.string(),
    defaultBlockType: z.nativeEnum(DefaultBlockType),
    breaks: z.array(RPMBreakSchema).nullable(),
    establishmentId: z.number().int().positive(), // Ou type de l'ID
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});
export type RecurringPlanningModelOutputDto = z.infer<typeof RecurringPlanningModelOutputSchema>;


// DTO pour les Query Parameters de la Liste des RPMs
export const ListRecurringPlanningModelsQuerySchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'referenceDate'] as const).optional().default('name'),
    sortOrder: z.enum(['asc', 'desc'] as const).optional().default('asc'),
    searchByName: z.string().optional(),
    // Autres filtres pourraient être ajoutés (ex: defaultBlockType)
});
export type ListRecurringPlanningModelsQueryDto = z.infer<typeof ListRecurringPlanningModelsQuerySchema>;