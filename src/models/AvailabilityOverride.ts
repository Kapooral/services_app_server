// src/models/AvailabilityOverride.ts
import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin } from 'sequelize';
import Establishment from './Establishment';

interface AvailabilityOverrideAttributes {
    id: number;
    establishment_id: number; // FK vers Establishment
    start_datetime: Date; // Timestamp précis du début de l'exception
    end_datetime: Date; // Timestamp précis de la fin de l'exception
    is_available: boolean; // false = fermé, true = ouvert exceptionnellement
    reason?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface AvailabilityOverrideCreationAttributes extends Optional<AvailabilityOverrideAttributes, 'id' | 'reason' | 'createdAt' | 'updatedAt'> {}

class AvailabilityOverride extends Model<AvailabilityOverrideAttributes, AvailabilityOverrideCreationAttributes> implements AvailabilityOverrideAttributes {
    public id!: number;
    public establishment_id!: number;
    public start_datetime!: Date;
    public end_datetime!: Date;
    public is_available!: boolean;
    public reason?: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins ---
    public getEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public setEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public createEstablishment!: BelongsToGetAssociationMixin<Establishment>;

    // --- Associations ---
    public readonly establishment?: Establishment;
}

export const initAvailabilityOverride = (sequelize: Sequelize) => {
    AvailabilityOverride.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            establishment_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'establishments', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            start_datetime: { type: DataTypes.DATE, allowNull: false }, // Utiliser DATE pour timestamp
            end_datetime: { type: DataTypes.DATE, allowNull: false }, // Utiliser DATE pour timestamp
            is_available: { type: DataTypes.BOOLEAN, allowNull: false },
            reason: { type: DataTypes.STRING(255), allowNull: true },
        },
        {
            sequelize,
            tableName: 'availability_overrides',
            modelName: 'AvailabilityOverride',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['establishment_id'] },
                { fields: ['start_datetime', 'end_datetime'] } // Utile pour requêtes de période
            ]
        }
    );
    return AvailabilityOverride;
};

export type { AvailabilityOverrideAttributes, AvailabilityOverrideCreationAttributes };
export default AvailabilityOverride;