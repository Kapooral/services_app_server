// src/dtos/rpm-member-assignment.validation.ts
import { z } from 'zod';

// DTO pour la Création d'une Affectation (ou d'un lot d'affectations)
// Pour affecter un modèle à UN membre
export const CreateRpmMemberAssignmentSchema = z.object({
    membershipId: z.number().int().positive("Membership ID must be a positive integer."),
    // recurringPlanningModelId est souvent un paramètre d'URL ou implicite du contexte
    assignmentStartDate: z.string().date("Assignment start date must be in YYYY-MM-DD format."),
    assignmentEndDate: z.string().date("Assignment end date must be in YYYY-MM-DD format.").optional().nullable(),
}).refine(data => {
    if (data.assignmentEndDate) {
        return data.assignmentStartDate <= data.assignmentEndDate;
    }
    return true;
}, {
    message: "Assignment endDate must be on or after startDate.",
    path: ["assignmentEndDate"],
});
export type CreateRpmMemberAssignmentDto = z.infer<typeof CreateRpmMemberAssignmentSchema>;

// Si on veut affecter UN modèle à PLUSIEURS membres en une fois, ou UN membre à PLUSIEURS modèles (moins probable pour V1 avec la contrainte de non-chevauchement)
export const BulkCreateRpmMemberAssignmentsSchema = z.object({
    recurringPlanningModelId: z.number().int().positive().optional(), // Optionnel si passé en param URL
    assignments: z.array(CreateRpmMemberAssignmentSchema).min(1, "At least one assignment is required."),
    // Ou:
    // membershipIds: z.array(z.number().int().positive()).min(1),
    // assignmentStartDate: z.string().date(),
    // assignmentEndDate: z.string().date().optional().nullable(),
});
// Choisir une structure pour le bulk create selon le besoin API. Je privilégie la première pour plus de flexibilité par affectation.

// DTO pour la Mise à Jour d'une Affectation
// Typiquement, on met à jour les dates d'une affectation existante.
export const UpdateRpmMemberAssignmentSchema = z.object({
    assignmentStartDate: z.string().date("Assignment start date must be in YYYY-MM-DD format.").optional(),
    assignmentEndDate: z.string().date("Assignment end date must be in YYYY-MM-DD format.").optional().nullable(),
}).partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one field (assignmentStartDate or assignmentEndDate) must be provided for update." }
).refine(data => { // Si les deux sont fournis pour la mise à jour
    if (data.assignmentStartDate && data.assignmentEndDate) {
        return data.assignmentStartDate <= data.assignmentEndDate;
    }
    return true;
}, {
    message: "Assignment endDate must be on or after startDate if both are updated.",
    path: ["assignmentEndDate"],
});
export type UpdateRpmMemberAssignmentDto = z.infer<typeof UpdateRpmMemberAssignmentSchema>;

// DTO de Sortie pour une Affectation
export const RpmMemberAssignmentOutputSchema = z.object({
    id: z.number().int().positive(), // Ou z.string().uuid()
    membershipId: z.number().int().positive(),
    recurringPlanningModelId: z.number().int().positive(),
    assignmentStartDate: z.string().date(),
    assignmentEndDate: z.string().date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    // On pourrait inclure des détails du membre ou du RPM ici si nécessaire pour certaines vues.
    // member: MembershipOutputSchema.optional(), // Si MembershipOutputSchema est défini
    // recurringPlanningModel: RecurringPlanningModelOutputSchema.optional(), // Si RecurringPlanningModelOutputSchema est défini
});
export type RpmMemberAssignmentOutputDto = z.infer<typeof RpmMemberAssignmentOutputSchema>;

// DTO pour les Query Parameters de la Liste des Affectations (ex: pour un RPM ou pour un membre)
export const ListRpmMemberAssignmentsQuerySchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    membershipId: z.coerce.number().int().positive().optional(),
    recurringPlanningModelId: z.coerce.number().int().positive().optional(),
    effectiveOnDate: z.string().date("Effective date filter must be YYYY-MM-DD").optional(), // Pour trouver les affectations actives à une date donnée
    sortBy: z.enum(['assignmentStartDate', 'createdAt'] as const).optional().default('assignmentStartDate'),
    sortOrder: z.enum(['asc', 'desc'] as const).optional().default('asc'),
});
export type ListRpmMemberAssignmentsQueryDto = z.infer<typeof ListRpmMemberAssignmentsQuerySchema>;

// --- DTOs pour Opérations en Masse ---

export const BulkAssignMembersToRpmSchema = z.object({
    membershipIds: z.array(z.number().int().positive()).min(1, "At least one membership ID is required."),
    assignmentStartDate: z.string().date("Assignment start date must be in YYYY-MM-DD format."),
    assignmentEndDate: z.string().date("Assignment end date must be in YYYY-MM-DD format.").optional().nullable(),
}).refine(data => {
    if (data.assignmentEndDate) {
        return data.assignmentStartDate <= data.assignmentEndDate;
    }
    return true;
}, {
    message: "Assignment endDate must be on or after startDate.",
    path: ["assignmentEndDate"],
});
export type BulkAssignMembersToRpmDto = z.infer<typeof BulkAssignMembersToRpmSchema>;

export const BulkUnassignMembersFromRpmSchema = z.object({
    membershipIds: z.array(z.number().int().positive()).min(1, "At least one membership ID is required to unassign."),
});
export type BulkUnassignMembersFromRpmDto = z.infer<typeof BulkUnassignMembersFromRpmSchema>;

// Structure de retour pour les erreurs partielles des opérations en masse d'affectation
export interface RpmBulkAssignmentErrorDetail {
    membershipId: number;
    error: string;
    errorCode?: string;
}