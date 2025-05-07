// src/models/Booking.ts
import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin } from 'sequelize';
import User from './User';
import Establishment from './Establishment';
import Service from './Service';
import Membership from './Membership';

export enum BookingStatus {
    PENDING_CONFIRMATION = 'PENDING_CONFIRMATION', // Si l'admin doit valider
    CONFIRMED = 'CONFIRMED', // Réservation acceptée
    CANCELLED_BY_USER = 'CANCELLED_BY_USER',
    CANCELLED_BY_ESTABLISHMENT = 'CANCELLED_BY_ESTABLISHMENT',
    COMPLETED = 'COMPLETED', // Prestation terminée
    NO_SHOW = 'NO_SHOW', // Client non présenté
    CANCELLED_BY_ADMIN = 'CANCELLED_BY_ADMIN'
}

export enum PaymentStatus {
    NOT_PAID = 'NOT_PAID',
    DOWN_PAYMENT_PAID = 'DOWN_PAYMENT_PAID', // Pour v2 avec Stripe
    FULLY_PAID = 'FULLY_PAID', // Pour v2 avec Stripe
    REFUNDED = 'REFUNDED' // Pour v2 avec Stripe
}

interface BookingAttributes {
    id: number;
    user_id: number; // FK vers User (client)
    establishment_id: number; // FK vers Establishment
    service_id: number; // FK vers Service
    assignedMembershipId: number | null; // FK vers Membership (Staff)
    start_datetime: Date; // Timestamp précis début
    end_datetime: Date; // Timestamp précis fin
    status: BookingStatus;
    price_at_booking: number; // DECIMAL
    currency_at_booking: string; // 'EUR'
    payment_status: PaymentStatus;
    user_notes?: string | null;
    establishment_notes?: string | null; // Notes internes admin
    createdAt?: Date;
    updatedAt?: Date;
}

interface BookingCreationAttributes extends Optional<BookingAttributes, 'id' | 'payment_status' | 'user_notes' | 'establishment_notes' | 'assignedMembershipId' | 'createdAt' | 'updatedAt'> {}

class Booking extends Model<BookingAttributes, BookingCreationAttributes> implements BookingAttributes {
    public id!: number;
    public user_id!: number;
    public establishment_id!: number;
    public service_id!: number;
    public assignedMembershipId!: number | null;
    public start_datetime!: Date;
    public end_datetime!: Date;
    public status!: BookingStatus;
    public price_at_booking!: number;
    public currency_at_booking!: string;
    public payment_status!: PaymentStatus;
    public user_notes?: string | null;
    public establishment_notes?: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins ---
    public getClient!: BelongsToGetAssociationMixin<User>;
    public setClient!: BelongsToGetAssociationMixin<User>;
    public createClient!: BelongsToGetAssociationMixin<User>;

    public getEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public setEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public createEstablishment!: BelongsToGetAssociationMixin<Establishment>;

    public getService!: BelongsToGetAssociationMixin<Service>;
    public setService!: BelongsToGetAssociationMixin<Service>;
    public createService!: BelongsToGetAssociationMixin<Service>;

    public getAssignedMember!: BelongsToGetAssociationMixin<Membership>;
    public setAssignedMember!: BelongsToGetAssociationMixin<Membership>;
    public createAssignedMember!: BelongsToGetAssociationMixin<Membership>;

    // --- Associations ---
    public readonly client?: User;
    public readonly establishment?: Establishment;
    public readonly service?: Service;
    public readonly assignedMember?: Membership | null;
}

export const initBooking = (sequelize: Sequelize) => {
    Booking.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            user_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: { model: 'users', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL' // Garde la résa si user supprimé, ou CASCADE ? À discuter. SET NULL préférable.
            },
            establishment_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'establishments', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE' // Si l'établissement disparait, ses résas aussi.
            },
            service_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: { model: 'services', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL' // Garde la résa si le service est supprimé mais en changeant le statut? Ou CASCADE? SET NULL + statut CANCELLED peut être mieux.
            },
            assignedMembershipId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true, // Une réservation n'est pas forcément assignée
                references: { model: 'memberships', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL' // Si le membre est retiré, garde la résa mais sans assignation
            },
            start_datetime: { type: DataTypes.DATE, allowNull: false },
            end_datetime: { type: DataTypes.DATE, allowNull: false },
            status: { type: DataTypes.ENUM(...Object.values(BookingStatus)), allowNull: false },
            price_at_booking: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            currency_at_booking: { type: DataTypes.STRING(3), allowNull: false },
            payment_status: { type: DataTypes.ENUM(...Object.values(PaymentStatus)), allowNull: false, defaultValue: PaymentStatus.NOT_PAID },
            user_notes: { type: DataTypes.TEXT, allowNull: true },
            establishment_notes: { type: DataTypes.TEXT, allowNull: true },
        },
        {
            sequelize,
            tableName: 'bookings',
            modelName: 'Booking',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['user_id'] },
                { fields: ['establishment_id'] },
                { fields: ['service_id'] },
                { fields: ['assigned_membership_id'] },
                { fields: ['status'] },
                { fields: ['start_datetime', 'end_datetime'] }
            ]
        }
    );
    return Booking;
};

export default Booking;
export type { BookingAttributes, BookingCreationAttributes };
