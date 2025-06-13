import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            await queryInterface.createTable('timezones', {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: DataTypes.INTEGER.UNSIGNED,
                },
                name: {
                    type: DataTypes.STRING(100),
                    allowNull: false
                },
                description: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                created_at: {
                    allowNull: false,
                    type: DataTypes.DATE
                },
                updated_at: {
                    allowNull: false,
                    type: DataTypes.DATE
                },
            }, {
                charset: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                transaction
            });

            await queryInterface.addIndex('timezones', ['name'], {unique: true, name: 'idx_unique_timezone_name', transaction});

            await transaction.commit();
            console.log('Create timezones UP succeed.')
        } catch(e) {
            console.log('Create timezones UP failed.')
            await transaction.rollback();
            console.log(e);
        }
    },

    async down(queryInterface: QueryInterface) {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            await queryInterface.removeIndex('timezones', 'idx_unique_timezone_name', {transaction});
            await queryInterface.dropTable('timezones', {transaction});
            await transaction.commit();
            console.log('Create timezones DOWN succeed.')
        } catch(e) {
            console.log('Create timezones DOWN failed.')
            await transaction.rollback();
            console.log(e);
        }
    }
};