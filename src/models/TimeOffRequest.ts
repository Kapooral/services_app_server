import {
    Model,
    DataTypes,
    Optional,
    Sequelize,
    BelongsToGetAssociationMixin,
    BelongsToSetAssociationMixin,
    BelongsToCreateAssociationMixin
} from 'sequelize';
import Membership from './Membership';
import Establishment from './Establishment';

// Types ENUM pour correspondre à la migration
export enum TimeOffRequestType {
    PAID_LEAVE = 'PAID_LEAVE',
    UNPAID_LEAVE = 'UNPAID_LEAVE',
    SICK_LEAVE = 'SICK_LEAVE',
    OTHER = 'OTHER'
}

export enum TimeOffRequestStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    CANCELLED_BY_MEMBER = 'CANCELLED_BY_MEMBER',
    CANCELLED_BY_ADMIN = 'CANCELLED_BY_ADMIN'
}

interface TimeOffRequestAttributes {
    id: number;
    membershipId: number; // Foreign key for the requesting member
    establishmentId: number; // Foreign key for the establishment
    type: TimeOffRequestType;
    startDate: string; // DATEONLY in 'YYYY-MM-DD' format
    endDate: string;   // DATEONLY in 'YYYY-MM-DD' format
    reason: string | null;
    status: TimeOffRequestStatus;
    adminNotes: string | null;
    processedByMembershipId: number | null; // Foreign key for the admin who processed
    cancelledByMembershipId: number | null; // Foreign key for the actor who cancelled
    cancellationReason: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

// Certains champs sont optionnels à la création (ID, timestamps, et champs nullables par défaut)
interface TimeOffRequestCreationAttributes extends Optional<TimeOffRequestAttributes,
    'id' | 'reason' | 'adminNotes' | 'processedByMembershipId' | 'cancelledByMembershipId' | 'cancellationReason' | 'createdAt' | 'updatedAt'> {}

class TimeOffRequest extends Model<TimeOffRequestAttributes, TimeOffRequestCreationAttributes> implements TimeOffRequestAttributes {
    public id!: number;
    public membershipId!: number;
    public establishmentId!: number;
    public type!: TimeOffRequestType;
    public startDate!: string;
    public endDate!: string;
    public reason!: string | null;
    public status!: TimeOffRequestStatus;
    public adminNotes!: string | null;
    public processedByMembershipId!: number | null;
    public cancelledByMembershipId!: number | null;
    public cancellationReason!: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins d'Association (pour TypeScript) ---
    public getRequestingMember!: BelongsToGetAssociationMixin<Membership>;
    public setRequestingMember!: BelongsToSetAssociationMixin<Membership, number>;
    public createRequestingMember!: BelongsToCreateAssociationMixin<Membership>; // Moins probable d'être utilisé

    public getEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public setEstablishment!: BelongsToSetAssociationMixin<Establishment, number>;
    public createEstablishment!: BelongsToCreateAssociationMixin<Establishment>; // Moins probable

    public getProcessingAdmin!: BelongsToGetAssociationMixin<Membership>;
    public setProcessingAdmin!: BelongsToSetAssociationMixin<Membership, number | null>; // Peut être null
    public createProcessingAdmin!: BelongsToCreateAssociationMixin<Membership>; // Moins probable

    public getCancellingActor!: BelongsToGetAssociationMixin<Membership>;
    public setCancellingActor!: BelongsToSetAssociationMixin<Membership, number | null>; // Peut être null
    public createCancellingActor!: BelongsToCreateAssociationMixin<Membership>; // Moins probable

    // --- Associations (définies dans index.ts) ---
    public readonly requestingMember?: Membership;
    public readonly establishment?: Establishment;
    public readonly processingAdmin?: Membership | null;
    public readonly cancellingActor?: Membership | null;
}

export const initTimeOffRequest = (sequelize: Sequelize) => {
    TimeOffRequest.init(
        {
            id: {
                type: DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },
            membershipId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'memberships', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE', // Si le membership est supprimé, ses demandes de congé le sont aussi
                field: 'membership_id', // Explicite pour underscored
            },
            establishmentId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'establishments', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
                field: 'establishment_id', // Explicite pour underscored
            },
            type: {
                type: DataTypes.ENUM(...Object.values(TimeOffRequestType)),
                allowNull: false,
            },
            startDate: {
                type: DataTypes.DATEONLY, // Stocke 'YYYY-MM-DD'
                allowNull: false,
                field: 'start_date',
            },
            endDate: {
                type: DataTypes.DATEONLY, // Stocke 'YYYY-MM-DD'
                allowNull: false,
                field: 'end_date',
            },
            reason: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            status: {
                type: DataTypes.ENUM(...Object.values(TimeOffRequestStatus)),
                allowNull: false,
                defaultValue: TimeOffRequestStatus.PENDING,
            },
            adminNotes: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'admin_notes',
            },
            processedByMembershipId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: { model: 'memberships', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL', // Garde la trace même si l'admin est supprimé
                field: 'processed_by_membership_id',
            },
            cancelledByMembershipId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: { model: 'memberships', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL', // Garde la trace même si l'acteur est supprimé
                field: 'cancelled_by_membership_id',
            },
            cancellationReason: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'cancellation_reason',
            },
        },
        {
            sequelize,
            tableName: 'time_off_requests',
            modelName: 'TimeOffRequest',
            timestamps: true,
            underscored: true, // Important pour que les FK et les champs soient en snake_case dans la DB
            indexes: [
                { fields: ['membership_id'] },
                { fields: ['establishment_id'] },
                { fields: ['status'] },
                { fields: ['start_date', 'end_date'] },
            ],
        }
    );
    return TimeOffRequest;
};

export default TimeOffRequest;
export type { TimeOffRequestAttributes, TimeOffRequestCreationAttributes };