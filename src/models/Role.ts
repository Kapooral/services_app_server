import { Model, DataTypes, Optional, Sequelize, BelongsToManyAddAssociationMixin, BelongsToManyGetAssociationsMixin } from 'sequelize';
import User from './User';

export enum ROLES {
    CLIENT = 'CLIENT',
    ESTABLISHMENT_ADMIN = 'ESTABLISHMENT_ADMIN',
    SUPER_ADMIN = 'SUPER_ADMIN'
}

interface RoleAttributes {
    id: number;
    name: string;
    description?: string;
}

interface RoleCreationAttributes extends Optional<RoleAttributes, 'id' | 'description'> {}

class Role extends Model<RoleAttributes, RoleCreationAttributes> implements RoleAttributes {
    public id!: number;
    public name!: string;
    public description?: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public getUsers!: BelongsToManyGetAssociationsMixin<User>;
    public addUser!: BelongsToManyAddAssociationMixin<User, number>;

    public readonly users?: User[];
}

export const initRole = (sequelize: Sequelize) => {
    Role.init(
        {
            id: {
                type: DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },
            name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                unique: true,
                validate: {
                    isIn: [Object.values(ROLES)],
                }
            },
            description: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
        },
        {
            sequelize,
            tableName: 'roles',
            modelName: 'Role',
            timestamps: true,
            underscored: true,
        }
    );
    return Role;
};

export default Role;