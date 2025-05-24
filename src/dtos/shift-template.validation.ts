import { z } from 'zod';
import moment from 'moment-timezone';

// Réutilisation ou redéfinition de ShortMembershipOutputDto si nécessaire.
// Supposons qu'il est importé ou défini comme suit pour l'exemple :
// (Si déjà défini dans timeoff-request.validation.ts, vous pouvez l'importer)
const ShortUserOutputForShiftSchema = z.object({
    id: z.number().int().positive(),
    username: z.string(),
    // profile_picture: z.string().url().nullable().optional(), // Optionnel ici
});

const ShortMembershipOutputDtoSchema = z.object({
    id: z.number().int().positive(),
    user: ShortUserOutputForShiftSchema.nullable(),
});

const CreatorOutputSchema = z.object({
    username: z.string(),
}).optional();


// --- DTOs pour les règles d'un ShiftTemplate ---
export const ShiftTemplateRuleInputDtoSchema = z.object({
    rruleString: z.string().min(10, "RRule string must be a valid iCalendar RRule.").refine(
        (val) => val.includes('FREQ='), // Validation très basique, une vraie validation de rrule est complexe
        { message: "RRule string must contain FREQ component." }
    ),
    durationMinutes: z.number().int().positive("Duration must be a positive integer of minutes."),
    isWorking: z.boolean({ required_error: "isWorking field is required." }),
    ruleDescription: z.string().max(255, "Rule description cannot exceed 255 characters.").optional().nullable(),
});
export type ShiftTemplateRuleInputDto = z.infer<typeof ShiftTemplateRuleInputDtoSchema>;

export const ShiftTemplateRuleOutputDtoSchema = z.object({ // InputDtoSchema a été étendu
    id: z.number().int().positive(),
    shiftTemplateId: z.number().int().positive(),
    rruleString: z.string(), // Hérité de InputDtoSchema
    durationMinutes: z.number().int().positive(), // Hérité
    isWorking: z.boolean(), // Hérité
    ruleDescription: z.string().max(255).nullable(), // Explicitement nullable, pas optional() si on veut toujours le champ
    createdAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
});
export type ShiftTemplateRuleOutputDto = z.infer<typeof ShiftTemplateRuleOutputDtoSchema>;


// --- DTOs pour ShiftTemplate (Création, Mise à Jour, Sortie) ---
export const CreateShiftTemplateDtoSchema = z.object({
    name: z.string()
        .min(3, "Template name must be at least 3 characters long.")
        .max(100, "Template name cannot exceed 100 characters."),
    description: z.string()
        .max(1000, "Description cannot exceed 1000 characters.")
        .optional()
        .nullable(),
    rules: z.array(ShiftTemplateRuleInputDtoSchema)
        .min(1, "A shift template must have at least one rule."),
});
export type CreateShiftTemplateDto = z.infer<typeof CreateShiftTemplateDtoSchema>;

export const UpdateShiftTemplateDtoSchema = z.object({
    name: z.string()
        .min(3, "Template name must be at least 3 characters long.")
        .max(100, "Template name cannot exceed 100 characters.")
        .optional(),
    description: z.string()
        .max(1000, "Description cannot exceed 1000 characters.")
        .optional()
        .nullable(),
    rules: z.array(ShiftTemplateRuleInputDtoSchema)
        .min(1, "If rules are provided, at least one rule is required.")
        .optional(), // Les règles sont optionnelles à la mise à jour (si on ne veut mettre à jour que nom/description)
}).refine(data => data.name !== undefined || data.description !== undefined || data.rules !== undefined, {
    message: "At least one field (name, description, or rules) must be provided for update.",
});
export type UpdateShiftTemplateDto = z.infer<typeof UpdateShiftTemplateDtoSchema>;

export const ShiftTemplateOutputDtoSchema = z.object({
    id: z.number().int().positive(),
    establishmentId: z.number().int().positive(),
    name: z.string(),
    description: z.string().nullable(),
    createdByMembershipId: z.number().int().positive(),
    creator: CreatorOutputSchema, // Pour afficher le nom de l'admin créateur
    rules: z.array(ShiftTemplateRuleOutputDtoSchema),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});
export type ShiftTemplateOutputDto = z.infer<typeof ShiftTemplateOutputDtoSchema>;


// --- DTO pour l'application d'un ShiftTemplate ---
export enum OverwriteMode {
    REPLACE_ALL_IN_PERIOD = 'REPLACE_ALL_IN_PERIOD', // Supprime toutes les StaffAvailability existantes du membre dans la période d'application.
    REPLACE_TEMPLATE_GENERATED_IN_PERIOD = 'REPLACE_TEMPLATE_GENERATED_IN_PERIOD', // Supprime uniquement celles précédemment générées par un template dans la période.
    // ADD_ONLY_IF_NO_CONFLICT = 'ADD_ONLY_IF_NO_CONFLICT', // N'ajoute des slots que s'ils ne sont pas déjà couverts. (Plus complexe, pour V2)
}

export const ApplyShiftTemplateDtoSchema = z.object({
    targetMembershipIds: z.array(z.number().int().positive())
        .min(1, "At least one target membership ID is required."),
    applicationStartDate: z.string({ required_error: "Application start date is required." })
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Application start date must be in YYYY-MM-DD format."),
    applicationEndDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Application end date must be in YYYY-MM-DD format.")
        .nullable()
        .optional(),
    overwriteMode: z.nativeEnum(OverwriteMode)
        .optional()
        .default(OverwriteMode.REPLACE_ALL_IN_PERIOD),
}).refine(data => {
    if (data.applicationEndDate && moment(data.applicationEndDate).isBefore(moment(data.applicationStartDate))) {
        return false;
    }
    return true;
}, {
    message: "Application end date cannot be before application start date.",
    path: ["applicationEndDate"],
});
export type ApplyShiftTemplateDto = z.infer<typeof ApplyShiftTemplateDtoSchema>;

// Interface pour les erreurs lors de l'application (utilisée dans le service)
export interface ApplyTemplateErrorDetail {
    membershipId: number;
    ruleId?: number; // Si l'erreur est spécifique à une règle
    error: string;
}

// --- DTO pour les paramètres de requête de listage des ShiftTemplates ---
export const ListShiftTemplatesQueryDtoSchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt'])
        .optional()
        .default('name'),
    sortOrder: z.enum(['asc', 'desc'] as const) // Utiliser 'as const' pour une inférence de type plus stricte
        .optional()
        .default('asc'),
    search: z.string()
        .trim()
        .min(1, "Search term, if provided, cannot be empty.")
        .optional(), // Recherche sur le champ 'name' du template
});
export type ListShiftTemplatesQueryDto = z.infer<typeof ListShiftTemplatesQueryDtoSchema>;