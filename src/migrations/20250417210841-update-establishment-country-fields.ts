// migrations/YYYYMMDDHHMMSS-update-establishment-country-fields.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
        // Utiliser une transaction pour assurer l'atomicité des opérations
        const transaction = await queryInterface.sequelize.transaction();
        try {
            await queryInterface.addColumn('establishments', 'country_name', {
                type: DataTypes.STRING(100),
                allowNull: false
            }, {transaction});

            await queryInterface.renameColumn('establishments', 'country', 'country_code', {transaction});
            await queryInterface.changeColumn('establishments', 'country_code', {
                type: DataTypes.STRING(2),
                allowNull: false,
            }, {transaction});

            try {
                await queryInterface.removeIndex('establishments', 'establishments_country_city', {transaction});
                console.log("Removed old index 'establishments_country_city'");
            } catch (e) {
                console.log("Index 'establishments_country_city' not found or could not be removed (may be ok).");
            }
            await queryInterface.addIndex('establishments', ['country_code', 'city'], {transaction});

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error("Error during establishment country fields migration:", error);
            throw error;
        }
    },

    async down(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            await queryInterface.removeIndex('establishments', ['country_code', 'city'], {transaction});
            await queryInterface.removeColumn('establishments', 'country_name', {transaction});

            await queryInterface.changeColumn('establishments', 'country_code', {
                type: DataTypes.STRING(2),
                allowNull: false,
            }, {transaction});

            await queryInterface.renameColumn('establishments', 'country_code', 'country', {transaction});
             await queryInterface.addIndex('establishments', ['country', 'city'], { transaction, name: 'establishments_country_city' });

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error("Error reverting establishment country fields migration:", error);
            throw error;
        }
    }
};