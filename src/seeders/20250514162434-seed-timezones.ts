// src/seeders/YYYYMMDDHHMMSS-seed-timezones.ts
import {QueryInterface, Sequelize, Transaction} from 'sequelize';
import moment from 'moment-timezone';

module.exports = {
    async up(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
        const transaction: Transaction = await queryInterface.sequelize.transaction();
        try {
            const ianaTimezoneNames: string[] = moment.tz.names();
            console.log(`Found ${ianaTimezoneNames.length} IANA timezone names to seed.`);

            if (ianaTimezoneNames.length === 0) {
                console.warn('No IANA timezone names found from moment-timezone. Skipping seed.');
                await transaction.commit();
                return;
            }

            const timezonesToInsert = ianaTimezoneNames.map(name => ({
                name: name,
                description: null,
                created_at: new Date(),
                updated_at: new Date(),
            }));

            await queryInterface.bulkInsert('timezones', timezonesToInsert, {transaction});

            console.log(`Successfully seeded ${timezonesToInsert.length} timezones.`);
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error seeding timezones:', error);
            throw error;
        }
    },

    async down(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
        const transaction: Transaction = await queryInterface.sequelize.transaction();
        try {
            console.log('Deleting all timezones...');
            await queryInterface.bulkDelete('timezones', {}, {transaction});
            console.log('All timezones deleted.');
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error reverting seeded timezones:', error);
            throw error;
        }
    }
};