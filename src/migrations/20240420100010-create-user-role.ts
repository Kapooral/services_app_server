'use strict';

import { QueryInterface, DataTypes, Sequelize, Transaction } from 'sequelize';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface: QueryInterface, Sequelize: Sequelize) {
        await queryInterface.createTable('user_roles', {
            user_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                primaryKey: true, // Partie de la clé primaire composite
                references: {
                    model: 'users', // Nom de la table des utilisateurs
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE' // Si un utilisateur est supprimé, ses rôles sont supprimés
            },
            role_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                primaryKey: true, // Partie de la clé primaire composite
                references: {
                    model: 'roles', // Nom de la table des rôles
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE' // Si un rôle est supprimé, les liaisons sont supprimées
            }
            // Pas de createdAt/updatedAt pour cette table de jonction simple
        }, {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci'
        });

        // Optionnel: Ajouter des index sur les clés étrangères si de nombreuses recherches
        // sont effectuées par userId ou roleId séparément. La clé primaire composite
        // couvre déjà la recherche par (userId, roleId).
        // await queryInterface.addIndex('user_roles', ['user_id']);
        // await queryInterface.addIndex('user_roles', ['role_id']);
    },
    async down(queryInterface: QueryInterface, Sequelize: Sequelize) {
        await queryInterface.dropTable('user_roles');
    }
};