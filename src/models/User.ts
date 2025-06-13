import { Model, DataTypes, Optional, Sequelize, HasManyGetAssociationsMixin, BelongsToManyGetAssociationsMixin, HasManyCountAssociationsMixin, BelongsToManyAddAssociationMixin } from 'sequelize';

import RefreshToken from './RefreshToken';
import Role from './Role';
import Establishment from './Establishment';

interface UserAttributes {
    id: number;
    username: string;
    email: string;
    email_masked: string;
    email_code?: string;
    email_code_requested_at?: Date;
    is_email_active: boolean;
    phone?: string;
    phone_masked?: string;
    phone_code?: string;
    phone_code_requested_at?: Date;
    is_phone_active: boolean;
    password: string;
    is_active: boolean;
    is_recovering: boolean;
    profile_picture?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    is_two_factor_enabled: boolean;
    two_factor_method?: 'email' | 'sms' | 'totp' | null;
    two_factor_code_hash?: string | null;
    two_factor_code_expires_at?: Date | null;
    recovery_codes_hashes?: string[] | null;
    two_factor_secret?: string | null;
    password_reset_token?: string | null;
    password_reset_expires_at?: Date | null;
    email_activation_token?: string | null;
    email_activation_token_expires_at?: Date | null;
    roles?: Role[];
    ownedEstablishments?: Establishment[];
    refreshTokens?: RefreshToken[];
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'email_code' | 'email_code_requested_at' | 'is_email_active' | 'phone' | 'phone_masked' | 'phone_code' | 'phone_code_requested_at' | 'is_phone_active' | 'is_active' | 'is_recovering' | 'profile_picture' | 'createdAt' | 'updatedAt' | 'is_two_factor_enabled' | 'two_factor_method' | 'two_factor_code_hash' | 'two_factor_code_expires_at' | 'recovery_codes_hashes' | 'two_factor_secret' | 'password_reset_token' | 'password_reset_expires_at' | 'email_activation_token' | 'email_activation_token_expires_at'> {}
class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
    public id!: number;
    public username!: string;
    public email!: string;
    public email_masked!: string;
    public email_code?: string;
    public email_code_requested_at?: Date;
    public is_email_active!: boolean;
    public phone?: string;
    public phone_masked?: string;
    public phone_code?: string;
    public phone_code_requested_at?: Date;
    public is_phone_active!: boolean;
    public password!: string;
    public is_active!: boolean;
    public is_recovering!: boolean;
    public profile_picture?: string | null;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
    public is_two_factor_enabled!: boolean;
    public two_factor_method?: 'email' | 'sms' | 'totp' | null;
    public two_factor_code_hash?: string | null;
    public two_factor_code_expires_at?: Date | null;
    public recovery_codes_hashes?: string[] | null;
    public two_factor_secret?: string | null;
    public password_reset_token?: string | null;
    public password_reset_expires_at?: Date | null;
    public email_activation_token?: string | null;
    public email_activation_token_expires_at?: Date | null;

    public getRefreshTokens!: HasManyGetAssociationsMixin<RefreshToken>;
    public getOwnedEstablishments!: HasManyGetAssociationsMixin<Establishment>;

    public getRoles!: BelongsToManyGetAssociationsMixin<Role>;
    public addRole!: BelongsToManyAddAssociationMixin<Role, number>;
    public hasRole!: BelongsToManyAddAssociationMixin<Role, number>;
    public countRoles!: HasManyCountAssociationsMixin;

    public readonly roles?: Role[];
    public readonly ownedEstablishments?: Establishment[];
    public readonly refreshTokens?: RefreshToken[];

    public async hasRoleName(roleName: string): Promise<boolean> {
        const roles = this.roles || await this.getRoles();
        return roles.some(role => role.name === roleName);
    }
}

export const initUser = (sequelize: Sequelize) => {
    User.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true, },
            username: { type: DataTypes.STRING(50), allowNull: false, unique: true, },
            email: { type: DataTypes.STRING(100), allowNull: false, unique: true, },
            email_masked: { type: DataTypes.STRING(100), allowNull: false, },
            email_code: { type: DataTypes.STRING(10), allowNull: true, },
            email_code_requested_at: { type: DataTypes.DATE, allowNull: true, },
            is_email_active: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
            phone: { type: DataTypes.STRING(20), allowNull: true, unique: true },
            phone_masked: { type: DataTypes.STRING(20), allowNull: true, },
            phone_code: { type: DataTypes.STRING(10), allowNull: true, },
            phone_code_requested_at: { type: DataTypes.DATE, allowNull: true, },
            is_phone_active: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
            password: { type: DataTypes.STRING, allowNull: false, },
            is_active: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
            is_recovering: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
            profile_picture: { type: DataTypes.STRING, allowNull: true, },
            is_two_factor_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, },
            two_factor_method: { type: DataTypes.ENUM('email', 'sms', 'totp'), allowNull: true, },
            two_factor_code_hash: { type: DataTypes.STRING, allowNull: true, },
            two_factor_code_expires_at: { type: DataTypes.DATE, allowNull: true, },
            recovery_codes_hashes: { type: DataTypes.JSON, allowNull: true, defaultValue: null, },
            two_factor_secret: { type: DataTypes.TEXT, allowNull: true, },
            password_reset_token: { type: DataTypes.STRING, allowNull: true, unique: true, },
            password_reset_expires_at: { type: DataTypes.DATE, allowNull: true },
            email_activation_token: {type: DataTypes.STRING, allowNull: true, unique: true  },
            email_activation_token_expires_at: { type: DataTypes.DATE, allowNull: true }
        },
        {
            sequelize,
            tableName: 'users',
            modelName: 'User',
            timestamps: true,
            underscored: true,
            indexes: [
                { unique: true, fields: ['email'] },
                { unique: true, fields: ['phone'] },
                { unique: true, fields: ['username'] },
                { unique: true, fields: ['password_reset_token'] },
                { unique: true, fields: [ 'email_activation_token' ] }
            ]
        }
    );
    return User;
};

export default User;
export type { UserAttributes, UserCreationAttributes };
