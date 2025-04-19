import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin } from 'sequelize';
import User from './User';

export interface RefreshTokenAttributes {
    id: number;
    user_id: number;
    token_hash: string;
    user_agent?: string | null;
    ip_address?: string | null;
    is_revoked: boolean;
    expires_at: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

interface RefreshTokenCreationAttributes extends Optional<RefreshTokenAttributes, 'id' | 'user_agent' | 'ip_address' | 'is_revoked' | 'createdAt' | 'updatedAt'> {}

class RefreshToken extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes> implements RefreshTokenAttributes {
    public id!: number;
    public user_id!: number;
    public token_hash!: string;
    public user_agent?: string | null;
    public ip_address?: string | null;
    public is_revoked!: boolean;
    public expires_at!: Date;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public getUser!: BelongsToGetAssociationMixin<User>;
    public readonly user?: User;
}

export const initRefreshToken = (sequelize: Sequelize) => {
    RefreshToken.init({
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: {
            type: DataTypes.INTEGER.UNSIGNED, allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE', onDelete: 'CASCADE',
        },
        token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        user_agent: { type: DataTypes.TEXT, allowNull: true },
        ip_address: { type: DataTypes.STRING(45), allowNull: true },
        is_revoked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        expires_at: { type: DataTypes.DATE, allowNull: false },
    }, {
        sequelize, tableName: 'refresh_tokens', modelName: 'RefreshToken',
        timestamps: true, underscored: true,
        indexes: [ { fields: ['user_id'] }, { unique: true, fields: ['token_hash'] } ]
    });
    return RefreshToken;
};

export default RefreshToken;