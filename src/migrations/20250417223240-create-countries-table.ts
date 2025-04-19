// migrations/YYYYMMDDHHMMSS-create-countries-table.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
        await queryInterface.createTable('countries', {
            code: {
                type: DataTypes.STRING(2),
                allowNull: false,
                primaryKey: true,
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true,
            },
        });
        await queryInterface.addIndex('countries', ['name'], {unique: true});
    },

    async down(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
        await queryInterface.removeIndex('countries', ['name'], {unique: true});
        await queryInterface.dropTable('countries');
    }
};