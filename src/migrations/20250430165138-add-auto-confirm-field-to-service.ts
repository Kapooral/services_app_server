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
            await queryInterface.addColumn('services', 'auto_confirm_bookings', {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            }, {transaction});

            await transaction.commit();
            console.log("Migration 'add-auto-confirm-field-to-service' UP successful.");

        } catch (error) {
            await transaction.rollback();
            console.error("Migration 'add-auto-confirm-field-to-service' UP failed:", error);
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
            await queryInterface.removeColumn('services', 'auto_confirm_bookings', {transaction});
            await transaction.commit();
            console.log("Migration 'add-auto-confirm-field-to-service' DOWN successful.");

        } catch (error) {
            await transaction.rollback();
            console.error("Migration 'add-auto-confirm-field-to-service' DOWN failed:", error);
            throw error;
        }
    }
};