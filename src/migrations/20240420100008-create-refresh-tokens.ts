'use strict';

import { QueryInterface, DataTypes, Sequelize, Transaction } from 'sequelize';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up (queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
            await queryInterface.createTable('refresh_tokens', {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: DataTypes.INTEGER.UNSIGNED
                },
                user_id: {
                    type: DataTypes.INTEGER.UNSIGNED,
                    allowNull: false,
                    references: {
                        model: 'users',
                        key: 'id',
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE',
                },
                token_hash: {
                    type: DataTypes.STRING(64),
                    allowNull: false,
                    unique: true
                },
                user_agent: {
                    type: DataTypes.TEXT,
                    allowNull: true
                },
                ip_address: {
                    type: DataTypes.STRING(45),
                    allowNull: true
                },
                is_revoked: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                expires_at: {
                    allowNull: false,
                    type: DataTypes.DATE
                },
                created_at: {
                    allowNull: false,
                    type: DataTypes.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    allowNull: false,
                    type: DataTypes.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
                }
            }, { transaction });

            await queryInterface.addIndex('refresh_tokens', ['user_id'], { transaction });
        });
    },

    async down (queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.removeIndex('refresh_tokens', ['user_id'], { transaction });
            await queryInterface.dropTable('refresh_tokens', { transaction });
        });
    }
};