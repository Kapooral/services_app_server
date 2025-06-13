// src/models/RecurringPlanningModelMemberAssignment.ts
import { Model, DataTypes, Optional, Sequelize } from 'sequelize';
import Membership from './Membership'; // Supposons que ce modèle existe et représente un membre
import RecurringPlanningModel from './RecurringPlanningModel';

interface RpmMemberAssignmentAttributes {
    id: number; // Ou string si UUID
    membershipId: number; // Adapter au type de l'ID de Membership
    recurringPlanningModelId: number; // Adapter au type de l'ID de RPM
    assignmentStartDate: string; // "YYYY-MM-DD"
    assignmentEndDate: string | null; // "YYYY-MM-DD"
    createdAt?: Date;
    updatedAt?: Date;
}

interface RpmMemberAssignmentCreationAttributes extends Optional<RpmMemberAssignmentAttributes, 'id' | 'assignmentEndDate' | 'createdAt' | 'updatedAt'> {}

class RecurringPlanningModelMemberAssignment extends Model<RpmMemberAssignmentAttributes, RpmMemberAssignmentCreationAttributes> implements RpmMemberAssignmentAttributes {
    public id!: number;
    public membershipId!: number;
    public recurringPlanningModelId!: number;
    public assignmentStartDate!: string;
    public assignmentEndDate!: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // Associations
    public readonly member?: Membership;
    public readonly recurringPlanningModel?: RecurringPlanningModel;
}

export const initRpmMemberAssignment = (sequelize: Sequelize) => {
    RecurringPlanningModelMemberAssignment.init(
        {
            id: {
                type: DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },
            membershipId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'memberships', // Nom de la table des membres
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            recurringPlanningModelId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'recurring_planning_models',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE', // Si le RPM est supprimé, ses affectations aussi.
            },
            assignmentStartDate: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            assignmentEndDate: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
        },
        {
            sequelize,
            tableName: 'rpm_member_assignments', // Nom court et clair
            modelName: 'RecurringPlanningModelMemberAssignment',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['membership_id'], name: 'idx_rpmma_membership_id' },
                { fields: ['recurring_planning_model_id'], name: 'idx_rpmma_rpm_id' },
                // Index pour aider à la vérification de chevauchement des affectations pour un membre
                { fields: ['membership_id', 'assignment_start_date', 'assignment_end_date'], name: 'idx_rpmma_member_dates' },
            ],
        }
    );
    return RecurringPlanningModelMemberAssignment;
};

export default RecurringPlanningModelMemberAssignment;
export type { RpmMemberAssignmentAttributes, RpmMemberAssignmentCreationAttributes };