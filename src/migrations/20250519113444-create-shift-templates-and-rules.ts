import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.createTable('shift_templates', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER.UNSIGNED,
            },
            establishment_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'establishments',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            created_by_membership_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'memberships',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT',
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
        // Index pour establishment_id (pour lister les templates d'un établissement)
        await queryInterface.addIndex('shift_templates', ['establishment_id']);
        // Index unique pour le nom du template par établissement
        await queryInterface.addIndex('shift_templates', ['establishment_id', 'name'], {
            unique: true,
            name: 'unique_establishment_template_name'
        });


        await queryInterface.createTable('shift_template_rules', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER.UNSIGNED,
            },
            shift_template_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'shift_templates',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            rrule_string: {
                type: DataTypes.TEXT,
                allowNull: false,
                comment: 'RRule string, DTSTART time should be local to establishment (e.g., T090000)'
            },
            duration_minutes: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
            },
            is_working: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            rule_description: {
                type: DataTypes.STRING(255),
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
        // Index pour shift_template_id (pour lister les règles d'un template)
        await queryInterface.addIndex('shift_template_rules', ['shift_template_id']);
    },

    async down(queryInterface: QueryInterface, sequelize: Sequelize) {
        // Supprimer les tables dans l'ordre inverse de création à cause des clés étrangères
        await queryInterface.dropTable('shift_template_rules');
        await queryInterface.dropTable('shift_templates');
    },
};