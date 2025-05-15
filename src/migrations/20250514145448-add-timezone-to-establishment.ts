import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface: QueryInterface, sequelize: Sequelize) {
		await queryInterface.addColumn('establishments', 'timezone', {
			type: DataTypes.STRING(100),
			allowNull: false,
			defaultValue: 'UTC',
			comment: 'Timezone identifier (e.g., Europe/Paris) for the establishment.',
		});

		await queryInterface.sequelize.query("UPDATE establishments SET timezone = 'Europe/Paris' WHERE country_code = 'FR';");
	},

	async down(queryInterface: QueryInterface, sequelize: Sequelize) {
		await queryInterface.removeColumn('establishments', 'timezone');
	}
};