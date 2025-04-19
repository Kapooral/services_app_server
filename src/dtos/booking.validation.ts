// src/dtos/booking.validation.ts
import { z } from 'zod';
import { BookingStatus } from '../models/Booking'; // Importer l'enum

// DTO pour la création d'une réservation par un client
export const CreateBookingSchema = z.object({
    serviceId: z.number().int().positive('Valid Service ID is required'),
    // Attendre un format ISO 8601 UTC string pour la date/heure de début
    startDatetime: z.string().datetime({ offset: true, message: "Invalid start date/time format (ISO 8601 UTC required)" })
        .refine(val => val.endsWith('Z'), { message: "Start date/time must be in UTC (end with Z)"}),
    userNotes: z.string().max(1000).optional().nullable(),
});

export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;


// DTO pour la mise à jour du statut par un admin
export const UpdateBookingStatusSchema = z.object({
    status: z.nativeEnum(BookingStatus, { // Valide contre les valeurs de l'enum BookingStatus
        errorMap: (issue, ctx) => ({ message: 'Invalid booking status provided.' })
    }),
    // Ajouter potentiellement establishmentNotes ici si l'admin peut les ajouter/modifier en même temps
    establishmentNotes: z.string().max(1000).optional().nullable(),
});

export type UpdateBookingStatusDto = z.infer<typeof UpdateBookingStatusSchema>;

// Fonctions de mapping si nécessaire (pour exclure des champs, formater)
// export function mapToPublicBookingDto(...) { ... }
// export function mapToAdminBookingDto(...) { ... }