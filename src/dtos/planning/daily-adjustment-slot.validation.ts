// src/dtos/daily-adjustment-slot.validation.ts
import { z } from 'zod';
import { SlotType } from '../../types/planning.enums';

// --- Sous-Schémas ---

// Schéma pour une tâche au sein d'un DailyAdjustmentSlot
export const DASTaskSchema = z.object({
    id: z.string().uuid("Task ID must be a valid UUID."), // UUID pour identifier la tâche
    taskId: z.string().max(100).optional().nullable(), // ID externe optionnel
    taskName: z.string().min(1, "Task name cannot be empty.").max(255),
    taskStartTime: z.string().time({ precision: 0, message: "Task startTime must be in HH:MM:SS format." }),
    taskEndTime: z.string().time({ precision: 0, message: "Task endTime must be in HH:MM:SS format." }),
    // ... autres champs
}).refine(data => data.taskStartTime < data.taskEndTime, {
    message: "Task endTime must be after taskStartTime.",
    path: ["taskEndTime"],
});
export type DASTaskDto = z.infer<typeof DASTaskSchema>;

const BaseDailyAdjustmentSlotSchema = z.object({
    membershipId: z.number().int().positive("Membership ID must be a positive integer."),
    slotDate: z.string().date("Slot date must be in YYYY-MM-DD format."),
    startTime: z.string().time({ precision: 0, message: "Slot startTime must be in HH:MM:SS format." }),
    endTime: z.string().time({ precision: 0, message: "Slot endTime must be in HH:MM:SS format." }),
    slotType: z.nativeEnum(SlotType, { errorMap: () => ({ message: "Invalid slot type." }) }),
    description: z.string().max(2000, "Description cannot exceed 2000 characters.").optional().nullable(),
    sourceRecurringPlanningModelId: z.number().int().positive().optional().nullable(),
    isManualOverride: z.boolean().optional().default(true), // Par défaut, un slot créé manuellement est un override.
    tasks: z.array(DASTaskSchema).max(50, "A maximum of 50 tasks can be defined per slot.").optional().nullable(),
    establishmentId: z.number().int().positive("Establishment ID is required."), // Ou déduit du membershipId dans le service
});

// --- DTOs Principaux ---

// DTO pour la Création d'un DailyAdjustmentSlot
export const CreateDailyAdjustmentSlotSchema = BaseDailyAdjustmentSlotSchema
    .refine(data => data.startTime < data.endTime, {
        message: "Slot endTime must be after startTime.",
        path: ["endTime"],
    })
    .refine(data => { // Les tâches doivent être comprises dans le slot principal
        if (data.slotType === SlotType.EFFECTIVE_WORK && data.tasks) {
            for (const task of data.tasks) {
                if (task.taskStartTime < data.startTime || task.taskEndTime > data.endTime) {
                    return false;
                }
            }
        }
        return true;
    }, {
        message: "All tasks must be within the slot's startTime and endTime.",
        path: ["tasks"],
    })
    .refine(data => { // Les tâches ne doivent pas se chevaucher entre elles
        if (data.slotType === SlotType.EFFECTIVE_WORK && data.tasks && data.tasks.length > 1) {
            const sortedTasks = [...data.tasks].sort((a, b) => a.taskStartTime.localeCompare(b.taskStartTime));
            for (let i = 0; i < sortedTasks.length - 1; i++) {
                if (sortedTasks[i].taskEndTime > sortedTasks[i+1].taskStartTime) {
                    return false; // Chevauchement de tâches détecté
                }
            }
        }
        return true;
    }, {
        message: "Tasks within a slot cannot overlap.",
        path: ["tasks"],
    });
export type CreateDailyAdjustmentSlotDto = z.infer<typeof CreateDailyAdjustmentSlotSchema>;


// DTO pour la Mise à Jour d'un DailyAdjustmentSlot
export const UpdateDailyAdjustmentSlotSchema = BaseDailyAdjustmentSlotSchema
    .omit({
        membershipId: true,
        slotDate: true,
        establishmentId: true,
        isManualOverride: true,
        sourceRecurringPlanningModelId: true,
    })
    .partial()
    .refine(
        (data) => Object.keys(data).length > 0,
        { message: "At least one field must be provided for update." }
    );
export type UpdateDailyAdjustmentSlotDto = z.infer<typeof UpdateDailyAdjustmentSlotSchema>;


// DTO de Sortie pour un DailyAdjustmentSlot
export const DailyAdjustmentSlotOutputSchema = z.object({
    id: z.number().int().positive(), // Ou z.string().uuid()
    membershipId: z.number().int().positive(),
    slotDate: z.string().date(),
    startTime: z.string().time({ precision: 0 }),
    endTime: z.string().time({ precision: 0 }),
    slotType: z.nativeEnum(SlotType),
    description: z.string().nullable(),
    sourceRecurringPlanningModelId: z.number().int().positive().nullable(),
    isManualOverride: z.boolean(),
    tasks: z.array(DASTaskSchema).nullable(),
    establishmentId: z.number().int().positive(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    // Pourrait inclure des détails du membre, etc.
});
export type DailyAdjustmentSlotOutputDto = z.infer<typeof DailyAdjustmentSlotOutputSchema>;


// DTO pour les Query Parameters de la Liste des DAS
export const ListDailyAdjustmentSlotsQuerySchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    membershipId: z.coerce.number().int().positive().optional(), // Souvent un paramètre d'URL requis
    establishmentId: z.coerce.number().int().positive().optional(), // Souvent un paramètre d'URL requis
    dateFrom: z.string().date("dateFrom must be YYYY-MM-DD").optional(),
    dateTo: z.string().date("dateTo must be YYYY-MM-DD").optional(),
    slotType: z.nativeEnum(SlotType).optional(), // Ou un array de SlotType
    sortBy: z.enum(['slotDate', 'startTime', 'slotType', 'createdAt'] as const).optional().default('slotDate'),
    sortOrder: z.enum(['asc', 'desc'] as const).optional().default('asc'),
}).refine(data => {
    if (data.dateFrom && data.dateTo) {
        return data.dateFrom <= data.dateTo;
    }
    return true;
}, {
    message: "dateTo must be on or after dateFrom.",
    path: ["dateTo"],
});
export type ListDailyAdjustmentSlotsQueryDto = z.infer<typeof ListDailyAdjustmentSlotsQuerySchema>;

// --- DTOs pour Opérations en Masse ---

export const BulkUpdateDasItemSchema = z.object({
    id: z.number().int().positive(),
    startTime: z.string().time({ precision: 0, message: "Slot startTime must be in HH:MM:SS format." }).optional(),
    endTime: z.string().time({ precision: 0, message: "Slot endTime must be in HH:MM:SS format." }).optional(),
    slotType: z.nativeEnum(SlotType, { errorMap: () => ({ message: "Invalid slot type." }) }).optional(),
    description: z.string().max(2000, "Description cannot exceed 2000 characters.").optional().nullable(),
    tasks: z.array(DASTaskSchema).max(50, "A maximum of 50 tasks can be defined per slot.").optional().nullable(),
}).refine(data => { // Valider que si startTime ou endTime est fourni, l'autre l'est aussi pour maintenir la cohérence ou la logique de la MàJ le gère
    if (data.startTime && data.endTime) {
        return data.startTime < data.endTime;
    }
    if (data.startTime && !data.endTime) return false; // Si start est là, end doit y être (pour ce DTO de MàJ partielle)
    if (!data.startTime && data.endTime) return false; // Vice-versa
    return true;
}, {
    message: "If updating times, both startTime and endTime must be provided and endTime must be after startTime.",
    path: ["endTime"],
});
// Note: La validation des tâches DANS le slot et leur non-chevauchement est mieux gérée dans le service
// lors de la mise à jour, car nous avons besoin des heures de début/fin finales du slot.

export const BulkUpdateDasDtoSchema = z.object({
    updates: z.array(BulkUpdateDasItemSchema).min(1, "At least one update operation is required."),
});
export type BulkUpdateDasDto = z.infer<typeof BulkUpdateDasDtoSchema>;

export const BulkDeleteDasDtoSchema = z.object({
    dasIds: z.array(z.number().int().positive()).min(1, "At least one DAS ID is required for deletion."),
});
export type BulkDeleteDasDto = z.infer<typeof BulkDeleteDasDtoSchema>;

// Structure de retour pour les erreurs partielles des opérations en masse de DAS
export interface DasBulkErrorDetail {
    dasId: number | null; // Null si l'erreur n'est pas liée à un ID spécifique (ex: erreur de payload général)
    error: string;
    errorCode?: string;
}