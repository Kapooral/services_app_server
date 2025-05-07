// src/seeders/YYYYMMDDHHMMSS-seed-memberships-and-related.ts
import {QueryInterface, Sequelize, Transaction, Op} from 'sequelize';
import {faker} from '@faker-js/faker';
import db from '../models';
import {MembershipRole, MembershipStatus} from '../models/Membership';

// --- Configuration (Identique) ---
const NUMBER_OF_STAFF_PER_ESTABLISHMENT = 15;
const ESTABLISHMENT_ID_TO_SEED = 1;
const FIRST_USER_ID_FOR_STAFF = 2;
const SERVICE_IDS_TO_ASSIGN = [1, 2];
// --- Fin Configuration ---

module.exports = {
    async up(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
        const transaction: Transaction = await queryInterface.sequelize.transaction();
        try {
            const membershipsToCreate = [];
            const userIdsUsedInInsert = [];
            const assignmentsToCreate = [];
            const staffAvailabilitiesToCreate = [];
            let seededMembershipIds: number[] = [];

            // 1. Préparer les données Memberships Staff
            console.log(`Preparing ${NUMBER_OF_STAFF_PER_ESTABLISHMENT} STAFF memberships for establishment ID ${ESTABLISHMENT_ID_TO_SEED}...`);
            for (let i = 0; i < NUMBER_OF_STAFF_PER_ESTABLISHMENT; i++) {
                const userId = FIRST_USER_ID_FOR_STAFF + i;
                const userExists = await db.User.findByPk(userId, {transaction, attributes: ['id']});
                if (!userExists) {
                    console.warn(`User with ID ${userId} not found, skipping membership creation for this user.`);
                    continue;
                }
                userIdsUsedInInsert.push(userId);
                membershipsToCreate.push({
                    // Utiliser snake_case ici car c'est pour bulkInsert qui cible les colonnes DB
                    user_id: userId,
                    establishment_id: ESTABLISHMENT_ID_TO_SEED,
                    role: MembershipRole.STAFF,
                    status: MembershipStatus.ACTIVE,
                    invited_email: null,
                    invitation_token_hash: null,
                    invitation_token_expires_at: null,
                    joined_at: new Date(),
                    created_at: new Date(),
                    updated_at: new Date(),
                });
            }

            if (membershipsToCreate.length > 0) {
                console.log(`Inserting ${membershipsToCreate.length} memberships...`);
                // bulkInsert utilise les noms de colonnes (snake_case ici à cause de underscored: true)
                await queryInterface.bulkInsert('memberships', membershipsToCreate, {transaction});
                console.log(`Memberships inserted. Fetching their IDs...`);

                // === CORRECTION : Récupérer les IDs après l'insertion ===
                // findAll utilise les attributs du modèle (camelCase)
                const insertedMemberships = await db.Membership.findAll({
                    where: {
                        establishmentId: ESTABLISHMENT_ID_TO_SEED, // <-- Utiliser camelCase
                        userId: {                             // <-- Utiliser camelCase
                            [Op.in]: userIdsUsedInInsert
                        }
                    },
                    attributes: ['id'],
                    transaction
                });

                seededMembershipIds = insertedMemberships.map(m => m.id);
                // =======================================================

                if (seededMembershipIds.length !== membershipsToCreate.length) {
                    console.warn(`Warning: Expected ${membershipsToCreate.length} membership IDs, but retrieved ${seededMembershipIds.length}. There might be duplicates or other issues.`);
                }
                console.log(`${seededMembershipIds.length} STAFF memberships confirmed with IDs: ${seededMembershipIds.join(', ')}`);

            } else {
                console.log('No valid users found to create memberships.');
            }


            // 2. Créer les Assignations Service-Membre
            if (seededMembershipIds.length > 0 && SERVICE_IDS_TO_ASSIGN.length > 0) {
                console.log(`Seeding service assignments for services ${SERVICE_IDS_TO_ASSIGN.join(', ')} and memberships ${seededMembershipIds.join(', ')}...`);
                for (const membershipId of seededMembershipIds) {
                    for (const serviceId of SERVICE_IDS_TO_ASSIGN) {
                        // findOne utilise les attributs du modèle (camelCase)
                        const serviceExists = await db.Service.findOne({
                            where: { id: serviceId, establishment_id: ESTABLISHMENT_ID_TO_SEED },
                            transaction,
                            attributes: ['id']
                        });
                        if (!serviceExists) {
                            console.warn(`Service with ID ${serviceId} not found for establishment ${ESTABLISHMENT_ID_TO_SEED}, skipping assignment.`);
                            continue;
                        }
                        assignmentsToCreate.push({
                            service_id: serviceId,
                            membership_id: membershipId,
                            created_at: new Date(),
                            updated_at: new Date(),
                        });
                    }
                }
                if (assignmentsToCreate.length > 0) {
                    await queryInterface.bulkInsert('service_member_assignments', assignmentsToCreate, {transaction});
                    console.log(`${assignmentsToCreate.length} service assignments created.`);
                } else {
                    console.log('No valid service assignments to create.');
                }
            }

            // 3. Créer les Disponibilités Staff (rrule)
            if (seededMembershipIds.length > 0) {
                console.log(`Seeding staff availabilities for memberships ${seededMembershipIds.join(', ')}...`);
                for (const membershipId of seededMembershipIds) {
                    staffAvailabilitiesToCreate.push({
                        membership_id: membershipId,
                        rrule_string: 'FREQ=WEEKLY;BYDAY=MO;DTSTART=20240101T090000Z;INTERVAL=1',
                        duration_minutes: 180,
                        effective_start_date: '2024-01-01',
                        effective_end_date: null,
                        is_working: true,
                        description: 'Lundi Matin',
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                    staffAvailabilitiesToCreate.push({
                        membership_id: membershipId,
                        rrule_string: 'FREQ=WEEKLY;BYDAY=MO;DTSTART=20240101T140000Z;INTERVAL=1',
                        duration_minutes: 180,
                        effective_start_date: '2024-01-01',
                        effective_end_date: null,
                        is_working: true,
                        description: 'Lundi Après-midi',
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                    staffAvailabilitiesToCreate.push({
                        membership_id: membershipId,
                        rrule_string: 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=1;DTSTART=20240105T000000Z',
                        duration_minutes: 1440,
                        effective_start_date: '2024-01-01',
                        effective_end_date: null,
                        is_working: false,
                        description: 'Absent le 1er vendredi du mois',
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                }
                if (staffAvailabilitiesToCreate.length > 0) {
                    // bulkInsert utilise les noms de colonnes (snake_case)
                    await queryInterface.bulkInsert('staff_availabilities', staffAvailabilitiesToCreate, {transaction});
                    console.log(`${staffAvailabilitiesToCreate.length} staff availability rules created.`);
                } else {
                    console.log('No staff availabilities to create.');
                }
            }

            // 4. Mettre à jour quelques réservations existantes
            if (seededMembershipIds.length > 0) {
                console.log(`Assigning some existing bookings to new staff members...`);
                // findAll utilise les attributs du modèle (camelCase)
                const bookingsToUpdate = await db.Booking.findAll({
                    where: {
                        establishment_id: ESTABLISHMENT_ID_TO_SEED,
                        assignedMembershipId: null,                // <-- Utiliser camelCase
                        start_datetime: {[Op.gt]: new Date()}     // <-- Utiliser camelCase
                    },
                    limit: seededMembershipIds.length,
                    order: [['start_dateTime', 'ASC']],              // <-- Utiliser camelCase
                    transaction
                });
                let updatedCount = 0;
                for (let i = 0; i < bookingsToUpdate.length; i++) {
                    const booking = bookingsToUpdate[i];
                    const memberIndex = i % seededMembershipIds.length;
                    // update utilise les attributs du modèle (camelCase)
                    await booking.update({
                        assignedMembershipId: seededMembershipIds[memberIndex] // <-- Utiliser camelCase
                    }, {transaction});
                    updatedCount++;
                }
                console.log(`${updatedCount} existing bookings assigned.`);
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error seeding memberships and related data:', error);
            throw error;
        }
    },

    async down(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
        const transaction: Transaction = await queryInterface.sequelize.transaction();
        try {
            const userIdsToDelete = Array.from({length: NUMBER_OF_STAFF_PER_ESTABLISHMENT}, (_, i) => FIRST_USER_ID_FOR_STAFF + i);
            console.log(`Deleting memberships, assignments, availabilities for users ${userIdsToDelete.join(', ')} in establishment ${ESTABLISHMENT_ID_TO_SEED}...`);
            // findAll utilise les attributs du modèle (camelCase)
            const membershipsToDelete = await db.Membership.findAll({
                where: {
                    userId: {[Op.in]: userIdsToDelete},         // <-- Utiliser camelCase
                    establishmentId: ESTABLISHMENT_ID_TO_SEED     // <-- Utiliser camelCase
                },
                attributes: ['id'],
                transaction
            });
            const membershipIdsToDelete = membershipsToDelete.map(m => m.id);

            if (membershipIdsToDelete.length > 0) {
                console.log('Unassigning bookings...');
                // bulkUpdate utilise les noms de colonnes (snake_case)
                await queryInterface.bulkUpdate('bookings',
                    {assigned_membership_id: null}, // Colonne cible
                    {assigned_membership_id: {[Op.in]: membershipIdsToDelete}}, // Condition WHERE sur colonne
                    {transaction}
                );

                console.log('Deleting assignments...');
                // bulkDelete utilise les noms de colonnes (snake_case)
                await queryInterface.bulkDelete('service_member_assignments', {
                    membership_id: {[Op.in]: membershipIdsToDelete} // Condition WHERE sur colonne
                }, {transaction});

                console.log('Deleting availabilities...');
                // bulkDelete utilise les noms de colonnes (snake_case)
                await queryInterface.bulkDelete('staff_availabilities', {
                    membership_id: {[Op.in]: membershipIdsToDelete} // Condition WHERE sur colonne
                }, {transaction});

                console.log('Deleting memberships...');
                // bulkDelete utilise les noms de colonnes (snake_case)
                await queryInterface.bulkDelete('memberships', {
                    id: {[Op.in]: membershipIdsToDelete} // Condition WHERE sur colonne
                }, {transaction});

                console.log(`Deleted ${membershipIdsToDelete.length} memberships and related data.`);
            } else {
                console.log('No memberships found to delete for the specified users/establishment.');
            }
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error reverting seeded memberships and related data:', error);
            throw error;
        }
    }
};