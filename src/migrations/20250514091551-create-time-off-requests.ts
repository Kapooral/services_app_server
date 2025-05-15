import { QueryInterface, DataTypes, Sequelize } from 'sequelize';
import { TimeOffRequestType, TimeOffRequestStatus } from '../models/TimeOffRequest'; // Assurez-vous que le chemin est correct

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.createTable('time_off_requests', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER.UNSIGNED,
            },
            membership_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'memberships', // Nom de la table référencée
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            establishment_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'establishments', // Nom de la table référencée
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            type: {
                type: DataTypes.ENUM(...Object.values(TimeOffRequestType)),
                allowNull: false,
            },
            start_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            end_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            reason: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            status: {
                type: DataTypes.ENUM(...Object.values(TimeOffRequestStatus)),
                allowNull: false,
                defaultValue: TimeOffRequestStatus.PENDING,
            },
            admin_notes: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            processed_by_membership_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: {
                    model: 'memberships',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
            },
            cancelled_by_membership_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: {
                    model: 'memberships',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
            },
            cancellation_reason: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            created_at: {
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            },
        });

        // Ajout des index séparément pour une meilleure lisibilité et gestion
        await queryInterface.addIndex('time_off_requests', ['membership_id']);
        await queryInterface.addIndex('time_off_requests', ['establishment_id']);
        await queryInterface.addIndex('time_off_requests', ['status']);
        await queryInterface.addIndex('time_off_requests', ['start_date', 'end_date']);
    },

    async down(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.dropTable('time_off_requests');
    }
};