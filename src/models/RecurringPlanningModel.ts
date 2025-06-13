// src/models/RecurringPlanningModel.ts
import { Model, DataTypes, Optional, Sequelize } from 'sequelize';
import Establishment from './Establishment'; // Supposons que ce modèle existe
import { DefaultBlockType, BreakType } from '../types/planning.enums'; // Chemin à ajuster

// Interface pour la structure d'une pause dans le JSONB
export interface RPMBreak {
    id: string; // UUID pour identifier la pause, utile pour le frontend
    startTime: string; // "HH:MM:SS"
    endTime: string; // "HH:MM:SS"
    description?: string | null;
    breakType: BreakType;
}

interface RecurringPlanningModelAttributes {
    id: number; // Ou string si UUID
    name: string;
    description: string | null;
    referenceDate: string; // "YYYY-MM-DD"
    globalStartTime: string; // "HH:MM:SS"
    globalEndTime: string; // "HH:MM:SS"
    rruleString: string;
    defaultBlockType: DefaultBlockType;
    breaks: RPMBreak[] | null; // Stocké en JSONB
    establishmentId: number; // Ou type de l'ID d'Establishment
    createdAt?: Date;
    updatedAt?: Date;
}

interface RecurringPlanningModelCreationAttributes extends Optional<RecurringPlanningModelAttributes, 'id' | 'description' | 'breaks' | 'createdAt' | 'updatedAt'> {}

class RecurringPlanningModel extends Model<RecurringPlanningModelAttributes, RecurringPlanningModelCreationAttributes> implements RecurringPlanningModelAttributes {
    public id!: number;
    public name!: string;
    public description!: string | null;
    public referenceDate!: string;
    public globalStartTime!: string;
    public globalEndTime!: string;
    public rruleString!: string;
    public defaultBlockType!: DefaultBlockType;
    public breaks!: RPMBreak[] | null;
    public establishmentId!: number;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // Associations (seront définies dans init)
    public readonly establishment?: Establishment;
    // public readonly memberAssignments?: RecurringPlanningModelMemberAssignment[]; // Déclaré dans RecurringPlanningModelMemberAssignment
}

export const initRecurringPlanningModel = (sequelize: Sequelize) => {
    RecurringPlanningModel.init(
        {
            id: {
                type: DataTypes.INTEGER.UNSIGNED, // Ou DataTypes.UUIDV4 si UUID
                autoIncrement: true, // Retirer si UUID
                primaryKey: true,
                // defaultValue: DataTypes.UUIDV4, // Si UUID
            },
            name: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            referenceDate: { // Base pour DTSTART de rruleString, la date est importante.
                type: DataTypes.DATEONLY, // "YYYY-MM-DD"
                allowNull: false,
                comment: 'Reference date for the rruleString DTSTART component (date part only).',
            },
            globalStartTime: {
                type: DataTypes.TIME, // "HH:MM:SS"
                allowNull: false,
                comment: 'Defines the start of the daily work envelope.',
            },
            globalEndTime: {
                type: DataTypes.TIME, // "HH:MM:SS"
                allowNull: false,
                comment: 'Defines the end of the daily work envelope.',
            },
            rruleString: {
                type: DataTypes.TEXT,
                allowNull: false,
                comment: 'RFC 5545 RRule string for the recurrence of the global envelope.',
            },
            defaultBlockType: {
                type: DataTypes.ENUM(...Object.values(DefaultBlockType)),
                allowNull: false,
                defaultValue: DefaultBlockType.WORK,
            },
            breaks: {
                type: DataTypes.JSONB, // Utiliser JSONB pour PostgreSQL, JSON pour MySQL
                allowNull: true,
                comment: 'Array of break objects [{id, startTime, endTime, description?, breakType}]. Times are HH:MM:SS.',
            },
            establishmentId: {
                type: DataTypes.INTEGER.UNSIGNED, // Adapter au type de l'ID d'Establishment
                allowNull: false,
                references: {
                    model: 'establishments', // Nom de la table
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE', // Si l'établissement est supprimé, ses modèles de planning aussi.
            },
        },
        {
            sequelize,
            tableName: 'recurring_planning_models',
            modelName: 'RecurringPlanningModel',
            timestamps: true,
            underscored: true,
            indexes: [
                {
                    unique: true, // Un nom de modèle doit être unique par établissement
                    fields: ['establishment_id', 'name'],
                    name: 'idx_rpm_establishment_name_unique',
                },
                { fields: ['establishment_id'], name: 'idx_rpm_establishment_id' },
            ],
        }
    );
    return RecurringPlanningModel;
};

export default RecurringPlanningModel;
// Exporter les types pour usage externe si nécessaire
export type { RecurringPlanningModelAttributes, RecurringPlanningModelCreationAttributes };