import { QueryInterface } from 'sequelize';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

export default {
    up: async (queryInterface: QueryInterface) => {
        const users = [];
        for (let i = 0; i < 10; i++) {
            const salt = bcrypt.genSaltSync(10);
            const password = bcrypt.hashSync('password', salt);
            users.push({
                username: faker.internet.userName(),
                email: faker.internet.email(),
                password: password,
                salt: salt,
                is_email_active: true,
                is_phone_active: false,
                is_active: true,
                is_recovering: false,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
        await queryInterface.bulkInsert('users', users);
    },
    down: async (queryInterface: QueryInterface) => {
        await queryInterface.bulkDelete('users', {});
    }
};
