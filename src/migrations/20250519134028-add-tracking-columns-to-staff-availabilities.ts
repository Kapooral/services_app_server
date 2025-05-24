import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

const STAFF_AVAILABILITIES_TABLE = 'staff_availabilities';
const SHIFT_TEMPLATE_RULES_TABLE = 'shift_template_rules'; // Assurez-vous que c'est bien le nom de la table
const MEMBERSHIPS_TABLE = 'memberships';

module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            // Ajouter la colonne 'applied_shift_template_rule_id'
            await queryInterface.addColumn(
                STAFF_AVAILABILITIES_TABLE,
                'applied_shift_template_rule_id',
                {
                    type: DataTypes.INTEGER.UNSIGNED,
                    allowNull: true,
                    references: {
                        model: SHIFT_TEMPLATE_RULES_TABLE, // Nom de la table référencée
                        key: 'id',
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL', // Si la règle du template est supprimée, la liaison est rompue
                },
                {transaction}
            );

            // Ajouter un index pour cette nouvelle colonne (optionnel, mais bon pour les performances si on requête souvent dessus)
            await queryInterface.addIndex(
                STAFF_AVAILABILITIES_TABLE,
                ['applied_shift_template_rule_id'],
                {transaction, name: 'idx_staff_avail_applied_template_rule_id'}
            );

            // Ajouter la colonne 'created_by_membership_id'
            await queryInterface.addColumn(
                STAFF_AVAILABILITIES_TABLE,
                'created_by_membership_id',
                {
                    type: DataTypes.INTEGER.UNSIGNED,
                    allowNull: true, // Permet la flexibilité, mais pourrait être false si un créateur est toujours attendu
                    references: {
                        model: MEMBERSHIPS_TABLE, // Nom de la table référencée
                        key: 'id',
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL', // Si le membre créateur est supprimé, la liaison est rompue
                },
                {transaction}
            );

            // Ajouter un index pour cette nouvelle colonne
            await queryInterface.addIndex(
                STAFF_AVAILABILITIES_TABLE,
                ['created_by_membership_id'],
                {transaction, name: 'idx_staff_avail_created_by_membership_id'}
            );

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error in migration add-tracking-columns-to-staff-availabilities (up):', error);
            throw error;
        }
    },

    async down(queryInterface: QueryInterface, sequelize: Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            // Supprimer les index d'abord (si vous les avez nommés)
            await queryInterface.removeIndex(STAFF_AVAILABILITIES_TABLE, 'idx_staff_avail_created_by_membership_id', {transaction});
            await queryInterface.removeIndex(STAFF_AVAILABILITIES_TABLE, 'idx_staff_avail_applied_template_rule_id', {transaction});

            // Ensuite, supprimer les colonnes
            await queryInterface.removeColumn(STAFF_AVAILABILITIES_TABLE, 'created_by_membership_id', {transaction});
            await queryInterface.removeColumn(STAFF_AVAILABILITIES_TABLE, 'applied_shift_template_rule_id', {transaction});

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error in migration add-tracking-columns-to-staff-availabilities (down):', error);
            throw error;
        }
    },
};