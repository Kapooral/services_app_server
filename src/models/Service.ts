// src/models/Service.ts
import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin, HasManyGetAssociationsMixin, HasManyCountAssociationsMixin } from 'sequelize';
import Establishment from './Establishment';
import Booking from './Booking';

interface ServiceAttributes {
    id: number;
    establishment_id: number; // FK vers Establishment
    name: string;
    description?: string | null;
    duration_minutes: number; // Durée en minutes
    price: number; // Utiliser DECIMAL pour la précision monétaire
    currency: string; // Ex: 'EUR' (ISO 4217)
    capacity: number; // Nb de personnes/postes réservables en même temps
    is_active: boolean;
    is_promoted: boolean;
    discount_price?: number | null;
    discount_start_date?: Date | null;
    discount_end_date?: Date | null;
    cancellation_deadline_minutes?: number | null;
    auto_confirm_bookings: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

interface ServiceCreationAttributes extends Optional<ServiceAttributes, 'id' | 'description' | 'capacity' | 'is_active' | 'is_promoted' | 'discount_price' | 'discount_start_date' | 'discount_end_date' | 'cancellation_deadline_minutes' | 'auto_confirm_bookings' | 'createdAt' | 'updatedAt'> {}

class Service extends Model<ServiceAttributes, ServiceCreationAttributes> implements ServiceAttributes {
    public id!: number;
    public establishment_id!: number;
    public name!: string;
    public description?: string | null;
    public duration_minutes!: number;
    public price!: number;
    public currency!: string;
    public capacity!: number;
    public is_active!: boolean;
    public is_promoted!: boolean;
    public discount_price?: number | null;
    public discount_start_date?: Date | null;
    public discount_end_date?: Date | null;
    public cancellation_deadline_minutes?: number | null;
    public auto_confirm_bookings!: boolean;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins ---
    public getEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public setEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public createEstablishment!: BelongsToGetAssociationMixin<Establishment>;

    public getBookings!: HasManyGetAssociationsMixin<Booking>;
    public countBookings!: HasManyCountAssociationsMixin;

    // --- Associations ---
    public readonly establishment?: Establishment;
    public readonly bookings?: Booking[];
}

export const initService = (sequelize: Sequelize) => {
    Service.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            establishment_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'establishments', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            name: { type: DataTypes.STRING(150), allowNull: false },
            description: { type: DataTypes.TEXT, allowNull: true },
            duration_minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
            price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            currency: { type: DataTypes.STRING(3), allowNull: false },
            capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
            is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            is_promoted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            discount_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
            discount_start_date: { type: DataTypes.DATE, allowNull: true },
            discount_end_date: { type: DataTypes.DATE, allowNull: true },
            cancellation_deadline_minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
            auto_confirm_bookings: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        },
        {
            sequelize,
            tableName: 'services',
            modelName: 'Service',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['establishment_id'] },
                { fields: ['is_active'] }
            ]
        }
    );
    return Service;
};

export type { ServiceAttributes, ServiceCreationAttributes };
export default Service;