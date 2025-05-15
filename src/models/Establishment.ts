// src/models/Establishment.ts
import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin, HasManyGetAssociationsMixin, HasManyAddAssociationMixin, HasManyCountAssociationsMixin } from 'sequelize';
import User, { UserAttributes } from './User';
import Service from './Service'; // Importations à ajouter dans index.ts
import AvailabilityRule from './AvailabilityRule'; // Importations à ajouter dans index.ts
import AvailabilityOverride from './AvailabilityOverride'; // Importations à ajouter dans index.ts
import Booking from './Booking'; // Importations à ajouter dans index.ts

interface EstablishmentAttributes {
    id: number;
    name: string;
    description?: string | null;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    postal_code: string;
    region?: string | null;
    country_name: string; // Nom complet (ex: "France", "United Kingdom")
    country_code: string;       // Code ISO 3166-1 alpha-2 (ex: "FR", "GB")
    latitude?: number | null;
    longitude?: number | null;
    phone_number?: string | null;
    email?: string | null; // Contact public
    profile_picture_url?: string | null;
    siret: string; // Unique
    siren: string;
    is_validated: boolean; // Pour la visibilité publique (post validation SIRET)
    owner_id: number; // FK vers User
    timezone: string;
    createdAt?: Date;
    updatedAt?: Date;
}

// Attributs optionnels lors de la création (id, timestamps, champs nullable/default)
interface EstablishmentCreationAttributes extends Optional<EstablishmentAttributes, 'id' | 'description' |
    'address_line2' | 'region' | 'latitude' | 'longitude' | 'phone_number' | 'email' | 'profile_picture_url' |
    'is_validated' | 'createdAt' | 'updatedAt'> {}

class Establishment extends Model<EstablishmentAttributes, EstablishmentCreationAttributes> implements EstablishmentAttributes {
    public id!: number;
    public name!: string;
    public description?: string | null;
    public address_line1!: string;
    public address_line2?: string | null;
    public city!: string;
    public postal_code!: string;
    public region?: string | null;
    public country_name!: string; // Nom complet (ex: "France", "United Kingdom")
    public country_code!: string;       // Code ISO 3166-1 alpha-2 (ex: "FR", "GB")
    public latitude?: number | null;
    public longitude?: number | null;
    public phone_number?: string | null;
    public email?: string | null;
    public profile_picture_url?: string | null;
    public siret!: string;
    public siren!: string;
    public is_validated!: boolean;
    public owner_id!: number; // FK vers User
    public timezone!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins d'Association (générés par Sequelize) ---
    public getOwner!: BelongsToGetAssociationMixin<User>;
    public setOwner!: BelongsToGetAssociationMixin<User>;
    public createOwner!: BelongsToGetAssociationMixin<User>;

    public getServices!: HasManyGetAssociationsMixin<Service>;
    public addService!: HasManyAddAssociationMixin<Service, number>;
    public countServices!: HasManyCountAssociationsMixin;

    public getAvailabilityRules!: HasManyGetAssociationsMixin<AvailabilityRule>;
    public addAvailabilityRule!: HasManyAddAssociationMixin<AvailabilityRule, number>;
    public countAvailabilityRules!: HasManyCountAssociationsMixin;

    public getAvailabilityOverrides!: HasManyGetAssociationsMixin<AvailabilityOverride>;
    public addAvailabilityOverride!: HasManyAddAssociationMixin<AvailabilityOverride, number>;
    public countAvailabilityOverrides!: HasManyCountAssociationsMixin;

    public getBookings!: HasManyGetAssociationsMixin<Booking>;
    public countBookings!: HasManyCountAssociationsMixin;

    // --- Associations (définies dans index.ts) ---
    public readonly owner?: User;
    public readonly services?: Service[];
    public readonly availabilityRules?: AvailabilityRule[];
    public readonly availabilityOverrides?: AvailabilityOverride[];
    public readonly bookings?: Booking[];
}

export const initEstablishment = (sequelize: Sequelize) => {
    Establishment.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            name: { type: DataTypes.STRING(150), allowNull: false },
            description: { type: DataTypes.TEXT, allowNull: true },
            address_line1: { type: DataTypes.STRING(255), allowNull: false },
            address_line2: { type: DataTypes.STRING(255), allowNull: true },
            city: { type: DataTypes.STRING(100), allowNull: false },
            postal_code: { type: DataTypes.STRING(20), allowNull: false },
            region: { type: DataTypes.STRING(100), allowNull: true },
            country_name: { type: DataTypes.STRING(100), allowNull: false },
            country_code: { type: DataTypes.STRING(2), allowNull: false },
            latitude: { type: DataTypes.FLOAT, allowNull: true },
            longitude: { type: DataTypes.FLOAT, allowNull: true },
            phone_number: { type: DataTypes.STRING(30), allowNull: true },
            email: { type: DataTypes.STRING(100), allowNull: true, validate: { isEmail: true } },
            profile_picture_url: { type: DataTypes.STRING(255), allowNull: true },
            siret: { type: DataTypes.STRING(14), allowNull: false, unique: true },
            siren: { type: DataTypes.STRING(9), allowNull: false },
            is_validated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            owner_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT'
            },
            timezone: {
                type: DataTypes.STRING(100), // Ex: 'Europe/Paris', 'America/New_York'
                allowNull: false,
                defaultValue: 'UTC', // Valeur par défaut sûre
                comment: 'Timezone identifier (e.g., Europe/Paris) for the establishment.',
            },
        },
        {
            sequelize,
            tableName: 'establishments',
            modelName: 'Establishment',
            timestamps: true,
            underscored: true,
            indexes: [
                { unique: true, fields: ['siret'] },
                { fields: ['siren'] },
                { fields: ['owner_id'] },
                { fields: ['country_name', 'city'] },
                // { using: 'BTREE', fields: ['latitude', 'longitude'] } // Index spatial potentiel (nécessite extension BDD)
            ]
        }
    );
    return Establishment;
};

export type { EstablishmentAttributes, EstablishmentCreationAttributes };
export default Establishment;