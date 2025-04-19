import { Model, DataTypes, Sequelize, ForeignKey } from 'sequelize';
import User from './User';
import Role from './Role';

interface UserRoleAttributes {
    userId: number;
    roleId: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface UserRoleCreationAttributes extends UserRoleAttributes {}

class UserRole extends Model<UserRoleAttributes, UserRoleCreationAttributes> implements UserRoleAttributes {
    public userId!: ForeignKey<User['id']>;
    public roleId!: ForeignKey<Role['id']>;
}

export const initUserRole = (sequelize: Sequelize) => {
    UserRole.init(
        {
            userId: {
                type: DataTypes.INTEGER.UNSIGNED,
                references: {
                    model: 'users',
                    key: 'id',
                },
                primaryKey: true,
                allowNull: false,
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            roleId: {
                type: DataTypes.INTEGER.UNSIGNED,
                references: {
                    model: 'roles',
                    key: 'id',
                },
                primaryKey: true,
                allowNull: false,
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
        },
        {
            sequelize,
            tableName: 'user_roles',
            modelName: 'UserRole',
            timestamps: false,
            underscored: true,
        }
    );
    return UserRole;
};

export default UserRole;