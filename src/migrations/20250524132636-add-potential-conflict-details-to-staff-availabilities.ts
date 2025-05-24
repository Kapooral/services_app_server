// YYYYMMDDHHMMSS-add-potential-conflict-details-to-staff-availabilities.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/**
 * Migration pour ajouter la colonne `potential_conflict_details` à la table `staff_availabilities`.
 */
module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.addColumn('staff_availabilities', 'potential_conflict_details', {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: null,
            comment: 'Stores details if this availability has a non-blocking conflict (e.g., with a PENDING time off request).'
        });
    },

    async down(queryInterface: QueryInterface, sequelize: Sequelize) {
        await queryInterface.removeColumn('staff_availabilities', 'potential_conflict_details');
    }
};