// src/models/Country.ts
import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

interface CountryAttributes {
    code: string;
    name: string;
}

interface CountryCreationAttributes extends CountryAttributes {}

class Country extends Model<CountryAttributes, CountryCreationAttributes> implements CountryAttributes {
    public code!: string;
    public name!: string;
}

export const initCountry = (sequelize: Sequelize) => {
    Country.init(
        {
            code: {
                type: DataTypes.STRING(2),
                allowNull: false,
                primaryKey: true,
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true,
            }
        },
        {
            sequelize,
            tableName: 'countries',
            modelName: 'Country',
            timestamps: false,
            underscored: true,
            indexes: [
                { unique: true, fields: ['name'] }
            ]
        }
    );
    return Country;
};

export type { CountryAttributes, CountryCreationAttributes };
export default Country;