// src/dtos/timeOffRequest.dtos.ts
import { z } from 'zod';
import { TimeOffRequestStatus, TimeOffRequestType } from '../models/TimeOffRequest'; // Assurez-vous que le chemin est correct

// DTO pour l'utilisateur (informations minimales)
export const ShortUserOutputDtoSchema = z.object({
    id: z.number().int().positive(),
    username: z.string(),
    profile_picture: z.string().url().nullable().optional(),
});
export type ShortUserOutputDto = z.infer<typeof ShortUserOutputDtoSchema>;

// DTO pour le membership (informations minimales)
export const ShortMembershipOutputDtoSchema = z.object({
    id: z.number().int().positive(),
    user: ShortUserOutputDtoSchema.nullable(), // User peut être null si le membership est PENDING (ne s'applique pas ici)
});
export type ShortMembershipOutputDto = z.infer<typeof ShortMembershipOutputDtoSchema>;


// === DTOs pour la création d'une demande de congé ===
export const CreateTimeOffRequestDtoSchema = z.object({
    type: z.nativeEnum(TimeOffRequestType, {
        errorMap: () => ({ message: "Invalid time off request type." }),
    }),
    startDate: z.string({ required_error: "Start date is required." })
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format."),
    endDate: z.string({ required_error: "End date is required." })
        .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format."),
    reason: z.string().max(1000, "Reason must be 1000 characters or less.").optional().nullable(),
}).refine(data => new Date(data.startDate) >= new Date(new Date().toISOString().split('T')[0]), {
    message: "Start date cannot be in the past.",
    path: ["startDate"]
})
export type CreateTimeOffRequestDto = z.infer<typeof CreateTimeOffRequestDtoSchema>;


// === DTO pour la réponse (affichage d'une demande de congé) ===
export const TimeOffRequestOutputDtoSchema = z.object({
    id: z.number().int().positive(),
    membershipId: z.number().int().positive(),
    requestingMember: ShortMembershipOutputDtoSchema.nullable(), // Peut être null si le membre a été supprimé
    establishmentId: z.number().int().positive(),
    type: z.nativeEnum(TimeOffRequestType),
    startDate: z.string(), // YYYY-MM-DD
    endDate: z.string(),   // YYYY-MM-DD
    reason: z.string().nullable(),
    status: z.nativeEnum(TimeOffRequestStatus),
    adminNotes: z.string().nullable(),
    processedByMembershipId: z.number().int().positive().nullable(),
    processingAdmin: ShortMembershipOutputDtoSchema.nullable(),
    cancelledByMembershipId: z.number().int().positive().nullable(),
    cancellingActor: ShortMembershipOutputDtoSchema.nullable(),
    cancellationReason: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
});
export type TimeOffRequestOutputDto = z.infer<typeof TimeOffRequestOutputDtoSchema>;


// === DTO pour le traitement (approbation/rejet) par un admin ===
export const ProcessTimeOffRequestDtoSchema = z.object({
    status: z.enum([TimeOffRequestStatus.APPROVED, TimeOffRequestStatus.REJECTED], {
        errorMap: () => ({ message: "Invalid status for processing. Must be APPROVED or REJECTED." }),
    }),
    adminNotes: z.string().max(1000, "Admin notes must be 1000 characters or less.").optional().nullable(),
});
export type ProcessTimeOffRequestDto = z.infer<typeof ProcessTimeOffRequestDtoSchema>;


// === DTO pour l'annulation d'une demande ===
export const CancelTimeOffRequestDtoSchema = z.object({
    cancellationReason: z.string().max(1000, "Cancellation reason must be 1000 characters or less.").optional().nullable(),
});
export type CancelTimeOffRequestDto = z.infer<typeof CancelTimeOffRequestDtoSchema>;


// === DTO pour les paramètres de requête de listage ===
export const ListTimeOffRequestsQueryDtoSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    status: z.nativeEnum(TimeOffRequestStatus).optional(),
    sortBy: z.enum(['createdAt', 'startDate', 'status']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    // Si vous ajoutez le filtrage par membre pour un admin voyant toutes les demandes:
    // filterByMembershipId: z.coerce.number().int().positive().optional(),
});
export type ListTimeOffRequestsQueryDto = z.infer<typeof ListTimeOffRequestsQueryDtoSchema>;

// === DTO pour les paramètres de requête de listage de toutes les demandes d'un établissement ===
export const ListAllTimeOffRequestsForEstablishmentQueryDtoSchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    status: z.nativeEnum(TimeOffRequestStatus).optional(),
    type: z.nativeEnum(TimeOffRequestType).optional(),
    membershipId: z.coerce.number().int().positive().optional(), // Pour filtrer par un membre spécifique
    dateRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateRangeStart must be in YYYY-MM-DD format.").optional(), // YYYY-MM-DD
    dateRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateRangeEnd must be in YYYY-MM-DD format.").optional(),   // YYYY-MM-DD
    sortBy: z.enum([
        'createdAt',
        'updatedAt',
        'startDate',
        'endDate',
        'status',
        'type'
    ]).optional().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
}).refine(data => {
    if (data.dateRangeStart && !data.dateRangeEnd) {
        return false;
    }
    if (!data.dateRangeStart && data.dateRangeEnd) {
        return false;
    }
    if (data.dateRangeStart && data.dateRangeEnd && new Date(data.dateRangeEnd) < new Date(data.dateRangeStart)) {
        return false;
    }
    return true;
}, {
    message: "If one of dateRangeStart or dateRangeEnd is provided, the other must also be provided, and dateRangeEnd must not be before dateRangeStart.",
    path: ["dateRangeStart", "dateRangeEnd"],
});

export type ListAllTimeOffRequestsForEstablishmentQueryDto = z.infer<typeof ListAllTimeOffRequestsForEstablishmentQueryDtoSchema>;