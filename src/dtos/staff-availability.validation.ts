import { z } from 'zod';
import moment from 'moment-timezone';

// Réutilisation ou redéfinition de ShortMembershipOutputDto si nécessaire.
// Supposons qu'il est importé ou défini comme suit pour l'exemple :
// (Si déjà défini dans timeoff-request.validation.ts, vous pouvez l'importer)
const ShortUserForStaffAvailSchema = z.object({
    id: z.number().int().positive(),
    username: z.string(),
});

const ShortMembershipOutputForStaffAvailSchema = z.object({
    id: z.number().int().positive(),
    user: ShortUserForStaffAvailSchema.nullable(),
});
// Fin de la définition/importation


// --- DTO pour la création d'une StaffAvailability ---
export const CreateStaffAvailabilityDtoSchema = z.object({
    rruleString: z.string().min(10, "RRule string must be a valid iCalendar RRule.")
        .refine(val => val.includes('FREQ='), { message: "RRule string must contain FREQ component." }), // Rendu obligatoire
    durationMinutes: z.number().int().positive("Duration must be a positive integer of minutes."), // Rendu obligatoire
    isWorking: z.boolean({ required_error: "isWorking field is required (true for available, false for unavailable)." }),
    effectiveStartDate: z.string({ required_error: "Effective start date is required." })
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Effective start date must be in YYYY-MM-DD format."),
    effectiveEndDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Effective end date must be in YYYY-MM-DD format.")
        .nullable()
        .optional(),
    description: z.string().max(255, "Description cannot exceed 255 characters.").optional().nullable(),
}).refine(data => {
    if (data.effectiveEndDate && data.effectiveStartDate) {
        return moment(data.effectiveEndDate).isSameOrAfter(moment(data.effectiveStartDate));
    }
    return true;
}, {
    message: "Effective end date cannot be before effective start date.",
    path: ["effectiveEndDate"],
});
export type CreateStaffAvailabilityDto = z.infer<typeof CreateStaffAvailabilityDtoSchema>;


// --- DTO pour la mise à jour d'une StaffAvailability ---
export const UpdateStaffAvailabilityDtoSchema = z.object({
    rruleString: z.string().min(10).refine(val => val.includes('FREQ='), { message: "RRule string must contain FREQ." })
        .nullish() // Accepte null ou undefined
        .transform(val => val ?? undefined) // Transforme null en undefined, garde string et undefined
        .optional(), // Rend le champ optionnel
    durationMinutes: z.number().int().positive().optional(),
    isWorking: z.boolean().optional(),
    effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date format YYYY-MM-DD").optional(),
    effectiveEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date format YYYY-MM-DD")
        .nullish()
        .transform(val => val ?? undefined)
        .optional(),
    description: z.string().max(255)
        .nullish()
        .transform(val => val ?? undefined)
        .optional(),
}).refine(data => Object.keys(data).filter(key => data[key as keyof typeof data] !== undefined).length > 0, { // S'assurer qu'au moins un champ non-undefined est fourni
    message: "At least one field must be provided for update.",
}).refine(data => {
    if (data.effectiveEndDate && data.effectiveStartDate) {
        return moment(data.effectiveEndDate).isSameOrAfter(moment(data.effectiveStartDate));
    }
    // Si une seule date est fournie, la logique de service devra la comparer avec la date existante dans l'enregistrement.
    return true;
}, {
    message: "Effective end date cannot be before effective start date if both are provided.",
    path: ["effectiveEndDate"],
});
export type UpdateStaffAvailabilityDto = z.infer<typeof UpdateStaffAvailabilityDtoSchema>;

// Définir le schéma Zod pour les détails du conflit potentiel
const PotentialConflictDetailItemSchema = z.object({ // Renommé pour clarté
    type: z.literal("PENDING_TIMEOFF_REQUEST_OVERLAP"),
    timeOffRequestId: z.number().int().positive(),
    message: z.string().optional(),
});
// Exporter le type TypeScript si nécessaire ailleurs
export type PotentialConflictDetailItemDto = z.infer<typeof PotentialConflictDetailItemSchema>;

// --- DTO de sortie pour une StaffAvailability ---
export const StaffAvailabilityOutputDtoSchema = z.object({
    id: z.number().int().positive(),
    membershipId: z.number().int().positive(),
    rruleString: z.string(),
    durationMinutes: z.number().int().positive(),
    isWorking: z.boolean(),
    effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    description: z.string().nullable(),
    appliedShiftTemplateRuleId: z.number().int().positive().nullable().optional(),
    createdByMembershipId: z.number().int().positive().nullable().optional(),
    potential_conflict_details: z.array(PotentialConflictDetailItemSchema).nullable().optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});
export type StaffAvailabilityOutputDto = z.infer<typeof StaffAvailabilityOutputDtoSchema>;


// --- DTO pour les paramètres de requête de listage des StaffAvailabilities ---
export const ListStaffAvailabilitiesQueryDtoSchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    sortBy: z.enum(['effectiveStartDate', 'createdAt'] as const)
        .optional()
        .default('effectiveStartDate'),
    sortOrder: z.enum(['asc', 'desc'] as const)
        .optional()
        .default('asc'),
    isWorking: z.preprocess(val => { // Convertit string 'true'/'false' en boolean
        if (val === 'true') return true;
        if (val === 'false') return false;
        return val; // Laisse Zod gérer les autres types
    }, z.boolean().optional()),
    // Filtres optionnels par plage de dates de la disponibilité effective:
    // Par exemple, pour trouver les disponibilités actives entre deux dates.
    filterRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Filter range start date must be in YYYY-MM-DD format.").optional(),
    filterRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Filter range end date must be in YYYY-MM-DD format.").optional(),
}).refine(data => {
    if (data.filterRangeStart && !data.filterRangeEnd) return false;
    if (!data.filterRangeStart && data.filterRangeEnd) return false;
    if (data.filterRangeStart && data.filterRangeEnd && moment(data.filterRangeEnd).isBefore(moment(data.filterRangeStart))) return false;
    return true;
}, {
    message: "If one of filterRangeStart or filterRangeEnd is provided, the other must also be, and end must not be before start.",
    path: ["filterRangeStart", "filterRangeEnd"],
});
export type ListStaffAvailabilitiesQueryDto = z.infer<typeof ListStaffAvailabilitiesQueryDtoSchema>;