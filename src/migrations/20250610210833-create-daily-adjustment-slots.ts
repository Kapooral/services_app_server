// YYYYMMDDHHMMSS-create-daily-adjustment-slots.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';
import {SlotType} from '../types/planning.enums'; // Ajuster le chemin

module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.createTable('daily_adjustment_slots', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER.UNSIGNED,
            },
            membership_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {model: 'memberships', key: 'id'},
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            slot_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            start_time: {
                type: DataTypes.TIME,
                allowNull: false,
            },
            end_time: {
                type: DataTypes.TIME,
                allowNull: false,
            },
            slot_type: {
                type: DataTypes.ENUM(...Object.values(SlotType)),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            source_rpm_id: { // snake_case pour field 'source_rpm_id' défini dans le modèle
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: {model: 'recurring_planning_models', key: 'id'},
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL', // Important: si le RPM est supprimé, on ne supprime pas l'ajustement
            },
            is_manual_override: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true, // Un slot créé est souvent un override manuel par défaut
            },
            tasks: {
                type: DataTypes.JSON, // Pour PostgreSQL. Pour MySQL, utiliser DataTypes.JSON
                allowNull: true,
                comment: 'Array of task objects if slotType is EFFECTIVE_WORK.',
            },
            establishment_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {model: 'establishments', key: 'id'},
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
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

        await queryInterface.addIndex('daily_adjustment_slots', ['membership_id', 'slot_date'], {
            name: 'idx_das_member_date',
        });
        await queryInterface.addIndex('daily_adjustment_slots', ['establishment_id', 'slot_date'], {
            name: 'idx_das_establishment_date',
        });
        await queryInterface.addIndex('daily_adjustment_slots', ['slot_type'], {
            name: 'idx_das_slot_type',
        });
        // Index pour aider à la récupération des slots pour la validation de non-chevauchement
        await queryInterface.addIndex('daily_adjustment_slots', ['membership_id', 'slot_date', 'start_time', 'end_time'], {
            name: 'idx_das_member_date_times_v2',
        });
    },

    async down(queryInterface: QueryInterface) {
        await queryInterface.dropTable('daily_adjustment_slots');
    },
};