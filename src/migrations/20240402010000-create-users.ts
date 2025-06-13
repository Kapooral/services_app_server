// src/migrations/YYYYMMDDHHMMSS-create-users.ts
import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Fonction d'application de la migration (création de la table users)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 */
export async function up(queryInterface: QueryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
        await queryInterface.createTable('users', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER.UNSIGNED
            },
            username: {
                type: DataTypes.STRING(50),
                allowNull: false
            },
            email: {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            email_masked: {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            email_code: {
                type: DataTypes.STRING(10),
                allowNull: true
            },
            email_code_requested_at: {
                type: DataTypes.DATE,
                allowNull: true
            },
            is_email_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            phone: {
                type: DataTypes.STRING(20),
                allowNull: true
            },
            phone_masked: {
                type: DataTypes.STRING(20),
                allowNull: true
            },
            phone_code: {
                type: DataTypes.STRING(10),
                allowNull: true
            },
            phone_code_requested_at: {
                type: DataTypes.DATE,
                allowNull: true
            },
            is_phone_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            password: {
                type: DataTypes.STRING,
                allowNull: false
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            is_recovering: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            profile_picture: {
                type: DataTypes.STRING,
                allowNull: true
            },
            is_two_factor_enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false // Mettre à false par défaut est souvent plus sûr
            },
            two_factor_method: {
                // Utiliser ENUM nécessite que le type existe dans la DB si utilisé directement
                // Alternative plus portable: STRING avec validation dans le modèle
                type: DataTypes.ENUM('email', 'sms', 'totp'),
                allowNull: true
            },
            two_factor_code_hash: {
                type: DataTypes.STRING,
                allowNull: true
            },
            two_factor_code_expires_at: {
                type: DataTypes.DATE,
                allowNull: true
            },
            recovery_codes_hashes: {
                // Utiliser JSON ou TEXT selon le support de votre SGBD
                type: DataTypes.JSON, // Ou Sequelize.TEXT si JSON non supporté nativement
                allowNull: true,
                defaultValue: null // Explicitement null
            },
            two_factor_secret: {
                type: DataTypes.TEXT, // TEXT pour potentiellement longs secrets chiffrés
                allowNull: true
            },
            password_reset_token: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: null,
            },
            password_reset_expires_at: {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: null,
            },
            email_activation_token: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: null,
            },
            email_activation_token_expires_at: {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: null,
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false
            }
        }, {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            transaction
        });

        // Ajouter les index séparément (unique:true crée implicitement un index)
        await queryInterface.addIndex('users', ['email'], { unique: true, name: 'idx_users_email', transaction });
        await queryInterface.addIndex('users', ['phone'], { unique: true, name: 'idx_users_phone', transaction });
        await queryInterface.addIndex('users', ['username'], { unique: true, name: 'idx_users_username', transaction });
        await queryInterface.addIndex('users', ['password_reset_token'], { unique: true, name: 'idx_users_password_reset_token', transaction });
        await queryInterface.addIndex('users', ['email_activation_token'], { unique: true, name: 'idx_users_email_activation_token', transaction });

        await transaction.commit();
        console.log('Create users UP succeed.')
    } catch(e) {
        console.log('Create users UP failed.')
        await transaction.rollback();
        console.log(e);
    }
}

/**
 * Fonction d'annulation de la migration (suppression de la table users)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 */
export async function down(queryInterface: QueryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
        // Supprimer les index avant de supprimer la table
        await queryInterface.removeIndex('users', 'idx_users_email', {transaction});
        await queryInterface.removeIndex('users', 'idx_users_phone', {transaction});
        await queryInterface.removeIndex('users', 'idx_users_username', {transaction});
        await queryInterface.removeIndex('users', 'idx_users_password_reset_token', {transaction});
        await queryInterface.removeIndex('users', 'idx_users_email_activation_token', {transaction});

        await queryInterface.dropTable('users', {transaction});

        if (queryInterface.sequelize.getDialect() === 'postgres') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_two_factor_method";', { transaction });
        }

        await transaction.commit();
        console.log('Create users DOWN succeed.')
    } catch(e) {
        console.log('Create users DOWN failed.')
        await transaction.rollback();
        console.log(e);
    }
}