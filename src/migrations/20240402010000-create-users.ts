'use strict';

import { QueryInterface, DataTypes, Sequelize, Transaction } from 'sequelize';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface: QueryInterface, Sequelize: Sequelize) {
        await queryInterface.createTable('users', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER.UNSIGNED
            },
            username: {
                type: DataTypes.STRING(50),
                allowNull: false,
                unique: true
            },
            email: {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true
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
                allowNull: true,
                unique: true
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
            salt: {
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
            created_at: {
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        }, {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci'
        });

        // Ajouter les index séparément (unique:true crée implicitement un index)
        // Mais c'est une bonne pratique d'être explicite pour les autres/futurs index
        await queryInterface.addIndex('users', ['email'], { unique: true, name: 'users_email_unique' });
        await queryInterface.addIndex('users', ['username'], { unique: true, name: 'users_username_unique' });
        // L'index unique sur 'phone' est créé implicitement par unique: true ci-dessus,
        // mais peut être ajouté explicitement si désiré :
        // await queryInterface.addIndex('users', ['phone'], { unique: true, name: 'users_phone_unique' });
    },
    async down(queryInterface: QueryInterface, Sequelize: Sequelize) {
        // Supprimer les index avant de supprimer la table
        await queryInterface.removeIndex('users', 'users_email_unique');
        await queryInterface.removeIndex('users', 'users_username_unique');
        // await queryInterface.removeIndex('users', 'users_phone_unique'); // Si ajouté explicitement plus haut

        await queryInterface.dropTable('users');
    }
};