import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin } from 'sequelize';
import Membership from './Membership';

interface StaffAvailabilityAttributes {
    id: number;
    membershipId: number;
    rruleString: string;
    durationMinutes: number;
    effectiveStartDate: Date;
    effectiveEndDate: Date | null;
    isWorking: boolean;
    description: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface StaffAvailabilityCreationAttributes extends Optional<StaffAvailabilityAttributes, 'id' | 'effectiveEndDate' | 'description' | 'createdAt' | 'updatedAt'> {}

class StaffAvailability extends Model<StaffAvailabilityAttributes, StaffAvailabilityCreationAttributes> implements StaffAvailabilityAttributes {
    public id!: number;
    public membershipId!: number;
    public rruleString!: string;
    public durationMinutes!: number;
    public effectiveStartDate!: Date; // Représente une DATE sans heure/timezone
    public effectiveEndDate!: Date | null; // Représente une DATE sans heure/timezone
    public isWorking!: boolean;
    public description!: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins ---
    public getMembership!: BelongsToGetAssociationMixin<Membership>;
    public setMembership!: BelongsToGetAssociationMixin<Membership>;
    public createMembership!: BelongsToGetAssociationMixin<Membership>;

    // --- Associations ---
    public readonly membership?: Membership;
}

export const initStaffAvailability = (sequelize: Sequelize) => {
    StaffAvailability.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            membershipId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'memberships', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE' // Si le membership est supprimé, ses disponibilités aussi
            },
            rruleString: { type: DataTypes.TEXT, allowNull: false },
            durationMinutes: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                validate: {
                    isPositive(value: number) { // <-- Reçoit la valeur du champ
                        if (value <= 0) {
                            throw new Error('Duration (durationMinutes) must be strictly positive.');
                        }
                    }
                }
            },
            effectiveStartDate: { type: DataTypes.DATEONLY, allowNull: false }, // Utiliser DATEONLY pour les dates sans heure
            effectiveEndDate: { type: DataTypes.DATEONLY, allowNull: true }, // Utiliser DATEONLY
            isWorking: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            description: { type: DataTypes.STRING(255), allowNull: true },
        },
        {
            sequelize,
            tableName: 'staff_availabilities',
            modelName: 'StaffAvailability',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['membership_id'] },
                { fields: ['effective_start_date', 'effective_end_date'] } // Pour requêtes par intervalle
            ]
        }
    );
    return StaffAvailability;
};

export default StaffAvailability;
export type { StaffAvailabilityAttributes, StaffAvailabilityCreationAttributes };