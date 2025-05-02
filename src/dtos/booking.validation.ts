// src/dtos/booking.validation.ts
import { z } from 'zod';
import { isValid, parseISO, startOfDay, endOfDay, addDays } from 'date-fns';
import Booking, { BookingStatus, PaymentStatus } from '../models/Booking';

import { getAbsoluteProfilePictureURL } from '../utils/url.utils';

// --- DTOs pour la création/mise à jour (inchangés) ---
export const CreateBookingSchema = z.object({
    serviceId: z.number().int().positive('Valid Service ID is required'),
    startDatetime: z.string().datetime({ offset: true, message: "Invalid start date/time format (ISO 8601 UTC required)" })
        .refine(val => val.endsWith('Z'), { message: "Start date/time must be in UTC (end with Z)"}),
    userNotes: z.string().max(1000).optional().nullable(),
});
export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;

export const UpdateBookingStatusSchema = z.object({
    status: z.nativeEnum(BookingStatus, {
        errorMap: (issue, ctx) => ({ message: 'Invalid booking status provided.' })
    }).optional(),
    establishmentNotes: z.string().max(1000).optional().nullable(),
})
    .refine(data => data.status !== undefined || data.establishmentNotes !== undefined, {
        message: "At least status or establishmentNotes must be provided for update.",
    });

export type UpdateBookingStatusDto = z.infer<typeof UpdateBookingStatusSchema>;


const AdminBookingClientInfoSchema = z.object({
    id: z.number(),
    username: z.string(),
    email: z.string().email().optional().nullable(), // Garder optionnel/nullable
    profile_picture: z.string().url().optional().nullable(),
});
type AdminBookingClientInfoDto = z.infer<typeof AdminBookingClientInfoSchema>;

// --- NOUVEAU: Schéma pour les infos Service dans AdminBookingDto ---
const AdminBookingServiceInfoSchema = z.object({
    id: z.number(),
    name: z.string(),
    duration_minutes: z.number().optional(), // Garder optionnel au cas où
});
type AdminBookingServiceInfoDto = z.infer<typeof AdminBookingServiceInfoSchema>;


// --- NOUVEAU: DTO pour la sortie admin ---
// Inclut toutes les infos pertinentes pour un admin gérant les réservations
export const AdminBookingOutputSchema = z.object({
    id: z.number(),
    start_datetime: z.coerce.date(),
    end_datetime: z.coerce.date(),
    status: z.nativeEnum(BookingStatus),
    price_at_booking: z.number(), // Converti en nombre
    currency_at_booking: z.string(),
    payment_status: z.nativeEnum(PaymentStatus),
    user_notes: z.string().nullable().optional(), // Notes du client visibles par l'admin
    establishment_notes: z.string().nullable().optional(), // Notes de l'admin
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    // Informations imbriquées détaillées
    client: AdminBookingClientInfoSchema.nullable(), // Infos du client
    service: AdminBookingServiceInfoSchema.nullable(), // Infos du service
    establishment_id: z.number(), // Inclure l'ID de l'établissement
});
export type AdminBookingOutputDto = z.infer<typeof AdminBookingOutputSchema>;


export function mapToAdminBookingDto(booking: Booking): AdminBookingOutputDto {
    // Assurer que les associations sont chargées (le service devrait le faire)
    if (!booking.client && booking.user_id) { console.warn(`Booking ${booking.id} is missing client data despite having user_id.`); }
    if (!booking.service && booking.service_id) { console.warn(`Booking ${booking.id} is missing service data despite having service_id.`); }

    const clientData = booking.client
        ? {
            id: booking.client.id,
            username: booking.client.username,
            email: booking.client.email,
            profile_picture: getAbsoluteProfilePictureURL(booking.client) // Utiliser l'helper pour URL absolue
        }
        : null;

    const serviceData = booking.service
        ? {
            id: booking.service.id,
            name: booking.service.name,
            duration_minutes: booking.service.duration_minutes
        }
        : null;

    const dataToParse = {
        id: booking.id,
        start_datetime: booking.start_datetime,
        end_datetime: booking.end_datetime,
        status: booking.status,
        price_at_booking: typeof booking.price_at_booking === 'string'
            ? parseFloat(booking.price_at_booking)
            : booking.price_at_booking, // Conversion en nombre
        currency_at_booking: booking.currency_at_booking,
        payment_status: booking.payment_status,
        user_notes: booking.user_notes,
        establishment_notes: booking.establishment_notes,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        client: clientData,
        service: serviceData,
        establishment_id: booking.establishment_id, // Ajouter l'ID établissement
    };

    const result = AdminBookingOutputSchema.safeParse(dataToParse);

    if (!result.success) {
        console.error("Error mapping Booking to AdminBookingOutputDto:", result.error.format());
        // Lancer une erreur ou retourner un objet partiel selon la politique de gestion d'erreur
        throw new Error(`Internal data mapping error for booking ID ${booking.id}.`);
    }
    return result.data;
}

const allowedSortByFields = ['start_datetime', 'created_at', 'service_name', 'client_name', 'status'] as const; // Champs autorisés pour le tri

export const GetEstablishmentBookingsQuerySchema = z.object({
    page: z.coerce.number().int().positive("Page must be a positive integer.").optional().default(1),
    limit: z.coerce.number().int().min(1, "Limit must be at least 1.").max(100, "Limit cannot exceed 100.").optional().default(10),
    search: z.string().optional(),
    status: z.string().optional().transform((val, ctx) => {
        if (!val) return undefined;
        const statuses = val.split(',');
        const validStatuses: BookingStatus[] = [];
        for (const s of statuses) {
            if (s.trim() in BookingStatus) {
                validStatuses.push(s.trim() as BookingStatus);
            } else {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Invalid status value provided: ${s.trim()}`,
                });
                return z.NEVER;
            }
        }
        return validStatuses.length > 0 ? validStatuses : undefined;
    }),
    serviceId: z.coerce.number().int().positive("Service ID must be a positive integer.").optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid startDate format (YYYY-MM-DD required)").optional()
        .refine((val) => !val || isValid(parseISO(val)), { message: "Invalid startDate value" }),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid endDate format (YYYY-MM-DD required)").optional()
        .refine((val) => !val || isValid(parseISO(val)), { message: "Invalid endDate value" }),
    sortBy: z.enum(allowedSortByFields).optional().default('start_datetime'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})
    .refine(data => {
        if (data.endDate && !data.startDate) {
            return false;
        }
        if (data.startDate && data.endDate) {
            return startOfDay(parseISO(data.startDate)) <= startOfDay(parseISO(data.endDate));
        }
        return true;
    }, {
        message: "endDate must be after or the same as startDate",
        path: ["endDate"],
    });

export type GetEstablishmentBookingsQueryDto = z.infer<typeof GetEstablishmentBookingsQuerySchema>;