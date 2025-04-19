// src/models/AvailabilityRule.ts
import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin } from 'sequelize';
import Establishment from './Establishment';

interface AvailabilityRuleAttributes {
    id: number;
    establishment_id: number; // FK vers Establishment
    day_of_week: number; // 0 (Dim) à 6 (Sam)
    start_time: string; // Format 'HH:MM:SS'
    end_time: string; // Format 'HH:MM:SS'
    createdAt?: Date;
    updatedAt?: Date;
}

interface AvailabilityRuleCreationAttributes extends Optional<AvailabilityRuleAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class AvailabilityRule extends Model<AvailabilityRuleAttributes, AvailabilityRuleCreationAttributes> implements AvailabilityRuleAttributes {
    public id!: number;
    public establishment_id!: number;
    public day_of_week!: number;
    public start_time!: string;
    public end_time!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins ---
    public getEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public setEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public createEstablishment!: BelongsToGetAssociationMixin<Establishment>;

    // --- Associations ---
    public readonly establishment?: Establishment;
}

export const initAvailabilityRule = (sequelize: Sequelize) => {
    AvailabilityRule.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            establishment_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'establishments', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            day_of_week: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, validate: { min: 0, max: 6 } },
            start_time: { type: DataTypes.TIME, allowNull: false },
            end_time: { type: DataTypes.TIME, allowNull: false },
        },
        {
            sequelize,
            tableName: 'availability_rules',
            modelName: 'AvailabilityRule',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['establishment_id'] },
                { unique: true, fields: ['establishment_id', 'day_of_week'], name: 'unique_establishment_day' }
            ]
        }
    );
    return AvailabilityRule;
};

export type { AvailabilityRuleAttributes, AvailabilityRuleCreationAttributes };
export default AvailabilityRule;