// YYYYMMDDHHMMSS-create-rpm-member-assignments.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.createTable('rpm_member_assignments', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER.UNSIGNED,
            },
            membership_id: { // snake_case
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'memberships', // Nom de la table des membres
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            recurring_planning_model_id: { // snake_case
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'recurring_planning_models', // Nom de la table des RPMs
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            assignment_start_date: { // snake_case
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            assignment_end_date: { // snake_case
                type: DataTypes.DATEONLY,
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
                defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });

        await queryInterface.addIndex('rpm_member_assignments', ['membership_id'], {
            name: 'idx_rpmma_membership_id',
        });
        await queryInterface.addIndex('rpm_member_assignments', ['recurring_planning_model_id'], {
            name: 'idx_rpmma_rpm_id',
        });
        // Index pour aider à la vérification de chevauchement et aux recherches par date
        await queryInterface.addIndex('rpm_member_assignments', ['membership_id', 'assignment_start_date', 'assignment_end_date'], {
            name: 'idx_rpmma_member_dates_v2', // _v2 pour éviter conflit si l'ancien existait avec le même nom
        });
    },

    async down(queryInterface: QueryInterface) {
        await queryInterface.dropTable('rpm_member_assignments');
    },
};