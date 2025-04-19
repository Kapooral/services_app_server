import {QueryInterface, DataTypes, Sequelize, Options} from 'sequelize';

/**
 * Migration pour ajouter les colonnes password_reset_token et
 * password_reset_expires_at à la table users, avec un index sur le token.
 */
module.exports = {
    /**
     * Fonction appelée lors de l'exécution de la migration (db:migrate).
     * @param {QueryInterface} queryInterface L'interface de requête Sequelize.
     * @param {Sequelize} _Sequelize L'instance Sequelize (non utilisée ici car DataTypes est importé).
     */
    async up(queryInterface: QueryInterface, _Sequelize: Sequelize): Promise<void> {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            await queryInterface.addColumn('users', 'email_activation_token', {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: null,
                unique: true,
            }, {transaction});

            await queryInterface.addColumn('users', 'email_activation_token_expires_at', {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: null,
            }, {transaction});

            await queryInterface.addIndex(
                'users',
                ['email_activation_token'],
                {transaction}
            );

            await transaction.commit();
            console.log("Migration 'add-activation-token-fields-to-users' UP successful.");

        } catch (error) {
            await transaction.rollback();
            console.error("Migration 'add-activation-token-fields-to-users' UP failed:", error);
            throw error;
        }
    },

    /**
     * Fonction appelée lors de l'annulation de la migration (db:migrate:undo).
     * @param {QueryInterface} queryInterface L'interface de requête Sequelize.
     * @param {Sequelize} _Sequelize L'instance Sequelize.
     */
    async down(queryInterface: QueryInterface, _Sequelize: Sequelize): Promise<void> {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            await queryInterface.removeIndex(
                'users',
                'users_password_reset_token'
                , {transaction});

            await queryInterface.removeColumn('users', 'password_reset_expires_at', {transaction});
            await queryInterface.removeColumn('users', 'password_reset_token', {transaction});

            await transaction.commit();
            console.log("Migration 'add-password-reset-fields-to-users' DOWN successful.");

        } catch (error) {
            await transaction.rollback();
            console.error("Migration 'add-password-reset-fields-to-users' DOWN failed:", error);
            throw error;
        }
    }
};