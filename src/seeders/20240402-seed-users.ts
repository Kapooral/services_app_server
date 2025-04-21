// src/seeders/YYYYMMDDHHMMSS-seed-users.ts
import { QueryInterface, Sequelize, Transaction, Op } from 'sequelize'; // Importer Op
import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import db from '../models';
import { ROLES } from '../models/Role';

const SALT_ROUNDS = 10;
const NUMBER_OF_USERS_TO_SEED = 20;
const STARTING_USER_ID = 12;

module.exports = {
    async up(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
        const transaction: Transaction = await queryInterface.sequelize.transaction();
        try {
            const usersToCreate = [];
            const clientRole = await db.Role.findOne({ where: { name: ROLES.CLIENT }, transaction });

            if (!clientRole) {
                throw new Error(`Role ${ROLES.CLIENT} not found. Make sure roles are seeded first.`);
            }

            console.log(`Seeding ${NUMBER_OF_USERS_TO_SEED} users starting from ID ${STARTING_USER_ID}...`);

            for (let i = 0; i < NUMBER_OF_USERS_TO_SEED; i++) {
                const userId = STARTING_USER_ID + i;
                const firstName = faker.person.firstName();
                const lastName = faker.person.lastName();
                const email = faker.internet.email({ firstName, lastName }).toLowerCase();
                const username = faker.internet.username({ firstName, lastName }).toLowerCase().replace(/[^a-z0-9_.]/g, '_').substring(0, 40);
                const password = 'password123';
                const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

                usersToCreate.push({
                    id: userId,
                    username: `${username}_${userId}`.substring(0, 50),
                    email: email,
                    email_masked: `${email.substring(0, 1)}***${email.substring(email.indexOf('@') - 1)}`,
                    password: hashedPassword,
                    is_active: true,
                    is_email_active: true,
                    is_phone_active: false,
                    is_recovering: false,
                    is_two_factor_enabled: false,
                    created_at: new Date(),
                    updated_at: new Date(),
                });
            }

            await queryInterface.bulkInsert('users', usersToCreate, { transaction });
            console.log(`${NUMBER_OF_USERS_TO_SEED} users seeded.`);

            // Assigner le rôle CLIENT
            const userRolesToCreate = usersToCreate.map(user => ({
                user_id: user.id,
                role_id: clientRole.id,
            }));
            await queryInterface.bulkInsert('user_roles', userRolesToCreate, { transaction }); // Insertion dans la table de jointure
            console.log(`Assigned ${ROLES.CLIENT} role to seeded users.`);

            const maxId = STARTING_USER_ID + NUMBER_OF_USERS_TO_SEED;
            try {
               if (queryInterface.sequelize.getDialect() === 'postgres') {
                   await queryInterface.sequelize.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), ${maxId}, true);`, { transaction });
               } else if (queryInterface.sequelize.getDialect() === 'mysql') {
                   await queryInterface.sequelize.query(`ALTER TABLE users AUTO_INCREMENT = ${maxId + 1};`, { transaction });
               }
               console.log(`User ID sequence reset.`);
            } catch(seqError) {
               console.warn("Could not reset user ID sequence:", seqError);
            }


            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error seeding users:', error);
            throw error;
        }
    },

    async down(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
        const transaction: Transaction = await queryInterface.sequelize.transaction();
        try {
            const userIdsToDelete = Array.from({ length: NUMBER_OF_USERS_TO_SEED }, (_, i) => STARTING_USER_ID + i);

            console.log(`Deleting seeded user roles for users ${userIdsToDelete.join(', ')}...`);
            await queryInterface.bulkDelete('user_roles', {
                user_id: { [Op.in]: userIdsToDelete }
            }, { transaction });

            console.log(`Deleting seeded users ${userIdsToDelete.join(', ')}...`);
            await queryInterface.bulkDelete('users', {
                id: { [Op.in]: userIdsToDelete }
            }, { transaction });

            console.log(`Seeded users and roles deleted.`);
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error reverting seeded users:', error);
            throw error;
        }
    }
};