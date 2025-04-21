// src/dtos/booking.validation.ts
import { z } from 'zod';
import Booking, { BookingAttributes, BookingStatus, PaymentStatus } from '../models/Booking';
// Importer les validateurs/types des entités associées si nécessaire pour le DTO
import { UserAttributes } from '../models/User';
import { ServiceAttributes } from '../models/Service';
import { getAbsoluteProfilePictureURL } from '../utils/url.utils'; // Assumer l'existence de cet helper

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
    }),
    establishmentNotes: z.string().max(1000).optional().nullable(),
});
export type UpdateBookingStatusDto = z.infer<typeof UpdateBookingStatusSchema>;


// --- NOUVEAU: Schéma pour les infos Client dans AdminBookingDto ---
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


// --- NOUVEAU: Fonction de mapping pour la sortie admin ---
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