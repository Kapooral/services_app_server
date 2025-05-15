import {QueryInterface, DataTypes, Sequelize, NOW} from 'sequelize';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.addColumn('countries', 'timezone_id', {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true, // Permettre null pour les pays sans timezone principal défini
            references: {
                model: 'timezones', // Nom de la table Timezones
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
        });
        await queryInterface.addColumn('countries', 'phone_code', {
            type: DataTypes.STRING(10),
            allowNull: true
        });
        await queryInterface.addColumn('countries', 'updated_at', {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        });
        await queryInterface.addColumn('countries', 'created_at', {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        });

        // Ajouter un index pour la clé étrangère
        await queryInterface.addIndex('countries', ['timezone_id']);
    },

    async down(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.removeColumn('countries', 'phone_code');
        await queryInterface.removeColumn('countries', 'timezone_id');
        await queryInterface.removeColumn('countries', 'updatedAt');
        await queryInterface.removeColumn('countries', 'createdAt');
    }
};