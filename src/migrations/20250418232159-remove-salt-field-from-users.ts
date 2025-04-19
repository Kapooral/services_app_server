// src/migrations/YYYYMMDDHHMMSS-remove-salt-from-users.ts
import { QueryInterface, DataTypes, Transaction } from 'sequelize';

export default {
    /**
     * Fonction UP: Applique la migration en supprimant la colonne 'salt'.
     * @param {QueryInterface} queryInterface L'interface de requête Sequelize.
     * @param {DataTypes} Sequelize L'objet DataTypes de Sequelize.
     */
    async up(queryInterface: QueryInterface, Sequelize: typeof DataTypes): Promise<void> {
        // Utiliser une transaction pour assurer l'atomicité
        await queryInterface.sequelize.transaction(async (t: Transaction) => {
            console.log("Removing 'salt' column from 'users' table...");
            await queryInterface.removeColumn(
                'users', // Nom de la table
                'salt',  // Nom de la colonne à supprimer
                { transaction: t } // Option de transaction
            );
            console.log("'salt' column removed successfully.");
        });
    },

    /**
     * Fonction DOWN: Annule la migration en rajoutant la colonne 'salt'.
     * @param {QueryInterface} queryInterface L'interface de requête Sequelize.
     * @param {DataTypes} Sequelize L'objet DataTypes de Sequelize.
     */
    async down(queryInterface: QueryInterface, Sequelize: typeof DataTypes): Promise<void> {
        // Utiliser une transaction pour assurer l'atomicité
        await queryInterface.sequelize.transaction(async (t: Transaction) => {
            console.log("Adding 'salt' column back to 'users' table...");
            await queryInterface.addColumn(
                'users', // Nom de la table
                'salt',  // Nom de la colonne à ajouter
                {        // Définition originale de la colonne
                    type: Sequelize.STRING,
                    allowNull: false, // Important de remettre les contraintes originales
                },
                { transaction: t } // Option de transaction
            );
            console.log("'salt' column added back successfully.");
        });
    }
};