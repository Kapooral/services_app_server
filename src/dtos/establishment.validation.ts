// src/dtos/establishment.validation.ts
import { z } from 'zod';
import { EstablishmentAttributes } from '../models/Establishment';
import { getAbsoluteProfilePictureURL } from '../utils/url.utils';

import { AppError } from '../errors/app.errors';

// Schéma pour la création d'un établissement
export const CreateEstablishmentSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long').max(150),
    description: z.string().max(5000).optional().nullable(),
    address_line1: z.string().min(5).max(255),
    address_line2: z.string().max(255).optional().nullable(),
    city: z.string().min(1).max(100),
    postal_code: z.string().min(1).max(20),
    region: z.string().max(100).optional().nullable(),
    country_name: z.string().min(1, "Country name is required").max(100),
    phone_number: z.string().max(30).optional().nullable(),
    email: z.string().email('Invalid email format').max(100).optional().nullable(),
    siret: z.string().length(14, 'SIRET must be 14 digits').regex(/^\d+$/, 'SIRET must contain only digits'),
});

export type CreateEstablishmentDto = z.infer<typeof CreateEstablishmentSchema>;

// Schéma pour la mise à jour d'un établissement (tous les champs sont optionnels)
export const UpdateEstablishmentSchema = z.object({
    name: z.string().min(2).max(150).optional(),
    description: z.string().max(5000).optional().nullable(),
    address_line1: z.string().min(5).max(255).optional(),
    address_line2: z.string().max(255).optional().nullable(),
    city: z.string().min(1).max(100).optional(),
    postal_code: z.string().min(1).max(20).optional(),
    region: z.string().max(100).optional().nullable(),
    country_name: z.string().max(100).optional(),
    country_code: z.string().length(2).regex(/^[A-Z]{2}$/).optional(),
    phone_number: z.string().max(30).optional().nullable(),
    email: z.string().email().max(100).optional().nullable(),
}).partial().refine(data => Object.keys(data).length > 0, {
    message: "Update data cannot be empty",
});


export type UpdateEstablishmentDto = z.infer<typeof UpdateEstablishmentSchema>;


export const PublicEstablishmentOutputSchema = z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
    address_line1: z.string(),
    address_line2: z.string().nullable().optional(),
    city: z.string(),
    postal_code: z.string(),
    region: z.string().nullable().optional(),
    country_name: z.string(),
    country_code: z.string(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    phone_number: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    profile_picture_url: z.string().url().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date().optional(),
});
export type PublicEstablishmentOutputDto = z.infer<typeof PublicEstablishmentOutputSchema>;

// Fonction de mapping pour la sortie publique (exclut owner_id, siret/siren peut-être?)
export function mapToPublicEstablishmentDto(establishment: EstablishmentAttributes): PublicEstablishmentOutputDto {
    // Sélectionner explicitement les champs ou utiliser l'exclusion
    const dataToParse = {
        id: establishment.id,
        name: establishment.name,
        description: establishment.description,
        address_line1: establishment.address_line1,
        address_line2: establishment.address_line2,
        city: establishment.city,
        postal_code: establishment.postal_code,
        region: establishment.region,
        country_name: establishment.country_name,
        country_code: establishment.country_code,
        latitude: establishment.latitude,
        longitude: establishment.longitude,
        phone_number: establishment.phone_number,
        email: establishment.email,
        profile_picture_url: establishment.profile_picture_url,
        createdAt: establishment.createdAt,
    };

    const result = PublicEstablishmentOutputSchema.safeParse(dataToParse);

    if (!result.success) {
        console.error("Failed to map Establishment model to PublicEstablishmentOutputDto:", result.error.issues);
        throw new AppError("MappingError", 500, "Internal data mapping error for public establishment.");
    }
    return result.data;
}

// Fonction de mapping pour la sortie admin (inclut tout, sauf peut-être des détails profonds)
export function mapToAdminEstablishmentDto(establishment: EstablishmentAttributes) {
    const absolutePictureUrl = getAbsoluteProfilePictureURL(establishment);
    return {
        ...establishment,
        profile_picture_url: absolutePictureUrl
    };
}