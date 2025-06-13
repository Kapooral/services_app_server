// src/models/DailyAdjustmentSlot.ts
import { Model, DataTypes, Optional, Sequelize } from 'sequelize';
import Membership from './Membership';
import RecurringPlanningModel from './RecurringPlanningModel';
import Establishment from './Establishment';
import { SlotType } from '../types/planning.enums';

// Interface pour la structure d'une tâche dans le JSONB
export interface DASTask {
    id: string; // UUID pour identifier la tâche
    taskId?: string | null; // ID externe de la tâche si applicable
    taskName: string;
    taskStartTime: string; // "HH:MM:SS", relatif au début du slot ou absolu dans la journée ? À préciser. Pour l'instant, absolu dans la journée.
    taskEndTime: string; // "HH:MM:SS"
    // ... autres champs de tâche pertinents
}

interface DailyAdjustmentSlotAttributes {
    id: number; // Ou string si UUID
    membershipId: number;
    slotDate: string; // "YYYY-MM-DD"
    startTime: string; // "HH:MM:SS"
    endTime: string; // "HH:MM:SS"
    slotType: SlotType;
    description: string | null;
    sourceRecurringPlanningModelId: number | null; // FK vers RPM
    isManualOverride: boolean;
    tasks: DASTask[] | null; // Stocké en JSONB, pertinent si slotType = EFFECTIVE_WORK
    establishmentId: number;
    createdAt?: Date;
    updatedAt?: Date;
}

interface DailyAdjustmentSlotCreationAttributes extends Optional<DailyAdjustmentSlotAttributes, 'id' | 'description' | 'sourceRecurringPlanningModelId' | 'tasks' | 'createdAt' | 'updatedAt'> {}

class DailyAdjustmentSlot extends Model<DailyAdjustmentSlotAttributes, DailyAdjustmentSlotCreationAttributes> implements DailyAdjustmentSlotAttributes {
    public id!: number;
    public membershipId!: number;
    public slotDate!: string;
    public startTime!: string;
    public endTime!: string;
    public slotType!: SlotType;
    public description!: string | null;
    public sourceRecurringPlanningModelId!: number | null;
    public isManualOverride!: boolean;
    public tasks!: DASTask[] | null;
    public establishmentId!: number;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // Associations
    public readonly member?: Membership;
    public readonly sourceRecurringPlanningModel?: RecurringPlanningModel;
    public readonly establishment?: Establishment;
}

export const initDailyAdjustmentSlot = (sequelize: Sequelize) => {
    DailyAdjustmentSlot.init(
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
                onDelete: 'CASCADE',
            },
            slotDate: { // Jour concerné par le slot
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            startTime: { // Heure de début du slot ce jour-là
                type: DataTypes.TIME,
                allowNull: false,
            },
            endTime: { // Heure de fin du slot ce jour-là
                type: DataTypes.TIME,
                allowNull: false,
            },
            slotType: {
                type: DataTypes.ENUM(...Object.values(SlotType)),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            sourceRecurringPlanningModelId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true, // Null si ce n'est pas directement issu d'un RPM (ex: absence manuelle)
                references: { model: 'recurring_planning_models', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL', // Si le RPM source est supprimé, on garde l'ajustement mais on perd la trace.
                field: 'source_rpm_id', // Nom de champ plus court
            },
            isManualOverride: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false, // Par défaut, un slot n'est pas un override manuel (ex: si généré par le système)
            },
            tasks: {
                type: DataTypes.JSONB, // JSON pour MySQL
                allowNull: true,
                comment: 'Array of task objects if slotType is EFFECTIVE_WORK.',
            },
            establishmentId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'establishments', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
        },
        {
            sequelize,
            tableName: 'daily_adjustment_slots',
            modelName: 'DailyAdjustmentSlot',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['membership_id', 'slot_date'], name: 'idx_das_member_date' },
                { fields: ['establishment_id', 'slot_date'], name: 'idx_das_establishment_date' },
                { fields: ['slot_type'], name: 'idx_das_slot_type' },
                // Contrainte pour éviter les slots qui se chevauchent pour un même membre à la même date
                // Ceci est difficile à faire avec un index standard pour TIME et nécessitera une validation applicative.
                // Un index sur (membership_id, slot_date, startTime, endTime) peut aider à récupérer les slots pertinents.
                { fields: ['membership_id', 'slot_date', 'start_time', 'end_time'], name: 'idx_das_member_date_times' }
            ],
        }
    );
    return DailyAdjustmentSlot;
};

export default DailyAdjustmentSlot;
export type { DailyAdjustmentSlotAttributes, DailyAdjustmentSlotCreationAttributes };