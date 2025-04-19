'use strict';

import { QueryInterface, DataTypes, Sequelize, Transaction } from 'sequelize';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface: QueryInterface, Sequelize: Sequelize) {
        await queryInterface.createTable('roles', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER.UNSIGNED
            },
            name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                unique: true
            },
            description: {
                type: DataTypes.STRING(255),
                allowNull: true
            },
            created_at: {
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') // Optionnel: Défaut DB
            },
            updated_at: {
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') // Optionnel: Défaut DB
            }
        }, {
            charset: 'utf8mb4', // Bonne pratique pour supporter tous les caractères
            collate: 'utf8mb4_unicode_ci' // Bonne pratique
        });

        // Optionnel: Ajouter un index explicite si nécessaire (unique est déjà un index)
        // await queryInterface.addIndex('roles', ['name'], { unique: true, name: 'roles_name_unique' });
    },
    async down(queryInterface: QueryInterface, Sequelize: Sequelize) {
        await queryInterface.dropTable('roles');
    }
};