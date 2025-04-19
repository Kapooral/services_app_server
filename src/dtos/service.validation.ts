// src/dtos/service.validation.ts
import { z } from 'zod';
import { ServiceAttributes } from '../models/Service';

// --- Schéma de base pour les attributs du service ---
const ServiceBaseSchema = z.object({
    name: z.string().min(2, 'Service name must be at least 2 characters').max(150),
    description: z.string().max(5000).optional().nullable(),
    duration_minutes: z.number().int().positive('Duration must be a positive integer number of minutes'),
    price: z.number().positive('Price must be a positive number').max(999999.99, 'Price seems too high'),
    currency: z.string().length(3, 'Currency code must be 3 characters (ISO 4217)'),
    capacity: z.number().int().min(1, 'Capacity must be at least 1').optional().default(1),
    is_active: z.boolean().optional().default(true),
    is_promoted: z.boolean().optional().default(false),
    discount_price: z.number().positive().optional().nullable(),
    discount_start_date: z.coerce.date().optional().nullable(),
    discount_end_date: z.coerce.date().optional().nullable(),
});

// --- Schéma pour la Création (avec le refine pour les dates de discount) ---
export const CreateServiceSchema = ServiceBaseSchema.refine(data => {
    if (data.discount_price != null && data.discount_start_date && data.discount_end_date) {
        return data.discount_start_date < data.discount_end_date;
    }
    return true;
}, {
    message: "Discount end date must be after start date",
    path: ["discount_end_date"],
});

export type CreateServiceDto = z.infer<typeof CreateServiceSchema>;

// --- Schéma pour la Mise à Jour (partial sur le schéma de BASE, puis refine sur le résultat) ---
export const UpdateServiceSchema = ServiceBaseSchema
    .partial() // Appliquer partial() sur l'objet de base
    .refine(data => Object.keys(data).length > 0, {
        message: "Update data cannot be empty",
    });

export type UpdateServiceDto = z.infer<typeof UpdateServiceSchema>;

// Fonction de mapping pour la sortie publique (exclure des champs si nécessaire)
export function mapToPublicServiceDto(service: ServiceAttributes) {
    const now = new Date();
    const isDiscountActive = service.discount_price != null &&
        (!service.discount_start_date || service.discount_start_date <= now) &&
        (!service.discount_end_date || service.discount_end_date >= now);

    const { discount_start_date, discount_end_date, ...publicData } = service;

    if (!isDiscountActive) {
        delete publicData.discount_price;
    }

    return publicData;
}

export function mapToAdminServiceDto(service: ServiceAttributes) {
    return service;
}