import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin } from 'sequelize';
import Timezone from './Timezone';

export interface CountryAttributes {
    code: string;
    name: string;
    phone_code: string | null;
    timezoneId: number | null;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface CountryCreationAttributes extends Optional<CountryAttributes, 'phone_code' | 'timezoneId' | 'createdAt' | 'updatedAt'> {}

class Country extends Model<CountryAttributes, CountryCreationAttributes> implements CountryAttributes {
    public code!: string;
    public name!: string;
    public phone_code!: string | null;
    public timezoneId!: number | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public readonly defaultTimezone?: Timezone | null;
    public getDefaultTimezone!: BelongsToGetAssociationMixin<Timezone>;
}

export const initCountry = (sequelize: Sequelize) => {
    Country.init(
        {
            code: {
                type: DataTypes.STRING(2),
                primaryKey: true,
                allowNull: false,
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true,
            },
            phone_code: {
                type: DataTypes.STRING(10),
                allowNull: true,
            },
            timezoneId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: {
                    model: 'timezones',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
                field: 'timezone_id',
            },
        },
        {
            sequelize,
            tableName: 'countries',
            modelName: 'Country',
            timestamps: true,
            underscored: true,
        }
    );
    return Country;
};

export default Country;