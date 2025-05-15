import {
    Model,
    DataTypes,
    Optional,
    Sequelize,
    // HasManyGetAssociationsMixin // Si vous définissez l'association inverse ici
} from 'sequelize';
// import Country from './Country'; // Si vous définissez l'association inverse ici

export interface TimezoneAttributes {
    id: number;
    name: string; // e.g., 'Europe/Paris', 'America/New_York'
    description: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface TimezoneCreationAttributes extends Optional<TimezoneAttributes, 'id' | 'description' | 'createdAt' | 'updatedAt'> {}

class Timezone extends Model<TimezoneAttributes, TimezoneCreationAttributes> implements TimezoneAttributes {
    public id!: number;
    public name!: string;
    public description!: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export const initTimezone = (sequelize: Sequelize) => {
    Timezone.init(
        {
            id: {
                type: DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },
            name: {
                type: DataTypes.STRING(100), // Suffisant pour les noms de timezone IANA
                allowNull: false,
                unique: true,
                comment: 'IANA timezone name (e.g., Europe/Paris)',
            },
            description: {
                type: DataTypes.STRING(255),
                allowNull: true,
                comment: 'Optional description for the timezone',
            },
        },
        {
            sequelize,
            tableName: 'timezones',
            modelName: 'Timezone',
            timestamps: true,
            underscored: true,
        }
    );
    return Timezone;
};

export default Timezone;