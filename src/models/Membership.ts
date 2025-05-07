import {
    Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin,
    HasManyGetAssociationsMixin, HasManyAddAssociationMixin, HasManyCountAssociationsMixin,
    BelongsToManyGetAssociationsMixin, BelongsToManyAddAssociationMixin
} from 'sequelize';
import User from './User';
import Establishment from './Establishment';
import StaffAvailability from './StaffAvailability'; // Sera créé ensuite
import Service from './Service'; // Pour l'association N:M
import Booking from './Booking'; // Pour l'association 1:N

// Types ENUM pour correspondre à la migration
export enum MembershipRole {
    ADMIN = 'ADMIN',
    STAFF = 'STAFF'
}

export enum MembershipStatus {
    PENDING = 'PENDING',
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    REVOKED = 'REVOKED'
}

interface MembershipAttributes {
    id: number;
    userId: number | null; // Nullable pendant l'invitation
    establishmentId: number;
    role: MembershipRole;
    status: MembershipStatus;
    invitedEmail: string | null;
    invitationTokenHash: string | null;
    invitationTokenExpiresAt: Date | null;
    joinedAt: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}

// userId, invitedEmail, invitation*, joinedAt sont optionnels ou nullables à la création
interface MembershipCreationAttributes extends Optional<MembershipAttributes, 'id' | 'userId' | 'invitedEmail' | 'invitationTokenHash' | 'invitationTokenExpiresAt' | 'joinedAt' | 'createdAt' | 'updatedAt'> {}

class Membership extends Model<MembershipAttributes, MembershipCreationAttributes> implements MembershipAttributes {
    public id!: number;
    public userId!: number | null;
    public establishmentId!: number;
    public role!: MembershipRole;
    public status!: MembershipStatus;
    public invitedEmail!: string | null;
    public invitationTokenHash!: string | null;
    public invitationTokenExpiresAt!: Date | null;
    public joinedAt!: Date | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins d'Association ---
    public getUser!: BelongsToGetAssociationMixin<User>;
    public setUser!: BelongsToGetAssociationMixin<User>;
    public createUser!: BelongsToGetAssociationMixin<User>;

    public getEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public setEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public createEstablishment!: BelongsToGetAssociationMixin<Establishment>;

    public getStaffAvailabilities!: HasManyGetAssociationsMixin<StaffAvailability>;
    public addStaffAvailability!: HasManyAddAssociationMixin<StaffAvailability, number>;
    public countStaffAvailabilities!: HasManyCountAssociationsMixin;

    public getAssignedServices!: BelongsToManyGetAssociationsMixin<Service>;
    public addAssignedService!: BelongsToManyAddAssociationMixin<Service, number>;
    public countAssignedServices!: HasManyCountAssociationsMixin;

    public getAssignedBookings!: HasManyGetAssociationsMixin<Booking>;
    public countAssignedBookings!: HasManyCountAssociationsMixin;


    // --- Associations (définies dans index.ts) ---
    public readonly user?: User | null;
    public readonly establishment?: Establishment;
    public readonly staffAvailabilities?: StaffAvailability[];
    public readonly assignedServices?: Service[];
    public readonly assignedBookings?: Booking[];
}

export const initMembership = (sequelize: Sequelize) => {
    Membership.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            userId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true, // Important: Nullable initialement
                references: { model: 'users', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL' // Garde le membership (invitation) si l'user est supprimé avant acceptation
            },
            establishmentId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'establishments', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE' // Supprime le membership si l'établissement est supprimé
            },
            role: { type: DataTypes.ENUM(...Object.values(MembershipRole)), allowNull: false, defaultValue: MembershipRole.STAFF },
            status: { type: DataTypes.ENUM(...Object.values(MembershipStatus)), allowNull: false, defaultValue: MembershipStatus.PENDING },
            invitedEmail: { type: DataTypes.STRING(255), allowNull: true },
            invitationTokenHash: { type: DataTypes.STRING(255), allowNull: true, unique: true },
            invitationTokenExpiresAt: { type: DataTypes.DATE, allowNull: true }, // Utiliser DATE (TIMESTAMPTZ)
            joinedAt: { type: DataTypes.DATE, allowNull: true } // Utiliser DATE (TIMESTAMPTZ)
        },
        {
            sequelize,
            tableName: 'memberships', // Nom de table en snake_case pluriel
            modelName: 'Membership',
            timestamps: true,
            underscored: true,
            indexes: [
                // Index pour recherches fréquentes
                { fields: ['user_id'] },
                { fields: ['establishment_id'] },
                { unique: true, fields: ['invitation_token_hash'] }, // Index unique pour token
                { fields: ['status'] },
                // Contraintes uniques définies via 'constraints' dans la migration pour plus de clarté
            ]
        }
    );
    return Membership;
};

export default Membership;
export type { MembershipAttributes, MembershipCreationAttributes };