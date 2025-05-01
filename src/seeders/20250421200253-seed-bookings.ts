// src/seeders/YYYYMMDDHHMMSS-seed-bookings.ts
import {QueryInterface, Sequelize, Transaction} from 'sequelize';
import {faker} from '@faker-js/faker';
import db from '../models';
import {BookingStatus, PaymentStatus} from '../models/Booking';

const NUMBER_OF_BOOKINGS_PER_USER = 3; // Nombre de réservations par utilisateur seedé
const STARTING_USER_ID = 2; // Doit correspondre au seeder user
const NUMBER_OF_USERS_SEEDED = 20; // Doit correspondre au seeder user
const TARGET_SERVICE_ID = 1; // ID du service cible
// Suppose que l'établissement ID 1 existe et est valide
const TARGET_ESTABLISHMENT_ID = 1;

module.exports = {
	async up(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
		const transaction: Transaction = await queryInterface.sequelize.transaction();
		try {
			const bookingsToCreate = [];
			const userIds = Array.from({length: NUMBER_OF_USERS_SEEDED}, (_, i) => STARTING_USER_ID + i);

			// Vérifier que le service et l'établissement cibles existent
			const service = await db.Service.findByPk(TARGET_SERVICE_ID, {transaction});
			const establishment = await db.Establishment.findByPk(TARGET_ESTABLISHMENT_ID, {transaction});

			if (!service || !establishment) {
				throw new Error(`Target service (ID: ${TARGET_SERVICE_ID}) or establishment (ID: ${TARGET_ESTABLISHMENT_ID}) not found. Seed them first.`);
			}
			if (service.establishment_id !== establishment.id) {
				throw new Error(`Service ${TARGET_SERVICE_ID} does not belong to establishment ${TARGET_ESTABLISHMENT_ID}`);
			}

			console.log(`Seeding ${NUMBER_OF_BOOKINGS_PER_USER * NUMBER_OF_USERS_SEEDED} bookings for service ID ${TARGET_SERVICE_ID}...`);

			for (const userId of userIds) {
				for (let i = 0; i < NUMBER_OF_BOOKINGS_PER_USER; i++) {
					// Générer une date de début dans le futur (ex: dans les 30 prochains jours)
					const startDateTime = faker.date.soon({days: 30});
					startDateTime.setMinutes(0, 0, 0); // Arrondir à l'heure
					// Assurer que l'heure est raisonnable (ex: entre 9h et 17h)
					if (startDateTime.getHours() < 9) startDateTime.setHours(9);
					if (startDateTime.getHours() >= 17) startDateTime.setHours(16);

					const endDateTime = new Date(startDateTime.getTime() + (service.duration_minutes || 60) * 60000); // Utiliser durée du service

					// Statut aléatoire (pondéré vers confirmé)
					const randomStatus = faker.helpers.weightedArrayElement([
						{weight: 7, value: BookingStatus.CONFIRMED},
						{weight: 1, value: BookingStatus.COMPLETED}, // Possible si date passée autorisée
						{weight: 1, value: BookingStatus.CANCELLED_BY_USER},
						{weight: 1, value: BookingStatus.CANCELLED_BY_ADMIN}
					]);

					bookingsToCreate.push({
						user_id: userId,
						establishment_id: TARGET_ESTABLISHMENT_ID,
						service_id: TARGET_SERVICE_ID,
						start_datetime: startDateTime,
						end_datetime: endDateTime,
						status: randomStatus,
						price_at_booking: service.price, // Utiliser le prix actuel du service
						currency_at_booking: service.currency,
						payment_status: PaymentStatus.NOT_PAID, // Statut de paiement initial
						user_notes: faker.lorem.sentence({min: 3, max: 10}),
						establishment_notes: null,
						created_at: new Date(),
						updated_at: new Date(),
					});
				}
			}

			await queryInterface.bulkInsert('bookings', bookingsToCreate, {transaction});
			console.log(`${bookingsToCreate.length} bookings seeded.`);

			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			console.error('Error seeding bookings:', error);
			throw error;
		}
	},

	async down(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
		const transaction: Transaction = await queryInterface.sequelize.transaction();
		try {
			const userIdsToDelete = Array.from({length: NUMBER_OF_USERS_SEEDED}, (_, i) => STARTING_USER_ID + i);
			console.log(`Deleting seeded bookings for users ${userIdsToDelete.join(', ')} and service ${TARGET_SERVICE_ID}...`);
			await queryInterface.bulkDelete('bookings', {
				user_id: {[Op.in]: userIdsToDelete},
				service_id: TARGET_SERVICE_ID
			}, {transaction});
			console.log(`Seeded bookings deleted.`);
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			console.error('Error reverting seeded bookings:', error);
			throw error;
		}
	}
};

// Nécessaire pour que `bulkDelete` fonctionne avec Op.in
const {Op} = require('sequelize');