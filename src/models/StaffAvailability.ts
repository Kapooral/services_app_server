import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin } from 'sequelize';
import Membership from './Membership';

// Type pour les détails du conflit non bloquant
export interface PotentialConflictDetailItem {
    type: "PENDING_TIMEOFF_REQUEST_OVERLAP";
    timeOffRequestId: number;
    message?: string;
}

interface StaffAvailabilityAttributes {
    id: number;
    membershipId: number;
    rruleString: string;
    durationMinutes: number;
    effectiveStartDate: string;
    effectiveEndDate: string | null
    isWorking: boolean;
    description: string | null;
    appliedShiftTemplateRuleId?: number | null;
    createdByMembershipId?: number | null;
    potential_conflict_details?: PotentialConflictDetailItem[] | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface StaffAvailabilityCreationAttributes extends Optional<StaffAvailabilityAttributes,
    'id' |
    'effectiveEndDate' |
    'description' |
    'appliedShiftTemplateRuleId' |
    'createdByMembershipId' |
    'potential_conflict_details' |
    'createdAt' |
    'updatedAt'> {}

class StaffAvailability extends Model<StaffAvailabilityAttributes, StaffAvailabilityCreationAttributes> implements StaffAvailabilityAttributes {
    public id!: number;
    public membershipId!: number;
    public rruleString!: string;
    public durationMinutes!: number;
    public effectiveStartDate!: string; // Représente une DATE sans heure/timezone
    public effectiveEndDate!: string | null; // Représente une DATE sans heure/timezone
    public isWorking!: boolean;
    public description!: string | null;
    public appliedShiftTemplateRuleId!: number | null;
    public createdByMembershipId!: number | null;
    public potential_conflict_details!: PotentialConflictDetailItem[] | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins ---
    public getMembership!: BelongsToGetAssociationMixin<Membership>;
    public setMembership!: BelongsToGetAssociationMixin<Membership>;

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
            appliedShiftTemplateRuleId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: { model: 'shift_template_rules', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
                field: 'applied_shift_template_rule_id',
            },
            createdByMembershipId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: { model: 'memberships', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
                field: 'created_by_membership_id',
            },
            potential_conflict_details: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: null,
                field: 'potential_conflict_details',
                comment: 'Stores an array of details if this availability has non-blocking conflicts (e.g., with PENDING time off requests).',
            },
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