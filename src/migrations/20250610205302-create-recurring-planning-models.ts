// YYYYMMDDHHMMSS-create-recurring-planning-models.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';
// Importer les Enums pour les utiliser dans la migration si nécessaire pour les valeurs par défaut ou les types ENUM
import {DefaultBlockType} from '../types/planning.enums'; // Ajuster le chemin si nécessaire

module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.createTable('recurring_planning_models', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER.UNSIGNED,
            },
            name: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            reference_date: { // snake_case pour la BDD
                type: DataTypes.DATEONLY,
                allowNull: false,
                comment: 'Reference date for the rruleString DTSTART component (date part only).',
            },
            global_start_time: { // snake_case
                type: DataTypes.TIME,
                allowNull: false,
                comment: 'Defines the start of the daily work envelope.',
            },
            global_end_time: { // snake_case
                type: DataTypes.TIME,
                allowNull: false,
                comment: 'Defines the end of the daily work envelope.',
            },
            rrule_string: { // snake_case
                type: DataTypes.TEXT,
                allowNull: false,
                comment: 'RFC 5545 RRule string for the recurrence of the global envelope.',
            },
            default_block_type: { // snake_case
                type: DataTypes.ENUM(...Object.values(DefaultBlockType)),
                allowNull: false,
                defaultValue: DefaultBlockType.WORK,
            },
            breaks: {
                type: DataTypes.JSON, // Pour PostgreSQL. Pour MySQL, utiliser DataTypes.JSON
                allowNull: true,
                comment: 'Array of break objects [{id, startTime, endTime, description?, breakType}]. Times are HH:MM:SS.',
            },
            establishment_id: { // snake_case
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'establishments', // Nom de la table référencée
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            created_at: { // snake_case
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: { // snake_case
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });

        // Ajout des Index (bonne pratique de les ajouter séparément)
        await queryInterface.addIndex('recurring_planning_models', ['establishment_id', 'name'], {
            name: 'idx_rpm_establishment_name_unique',
            unique: true,
        });
        await queryInterface.addIndex('recurring_planning_models', ['establishment_id'], {
            name: 'idx_rpm_establishment_id',
        });
    },

    async down(queryInterface: QueryInterface) {
        await queryInterface.dropTable('recurring_planning_models');
    },
};