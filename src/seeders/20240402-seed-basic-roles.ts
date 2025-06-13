// YYYYMMDDHHMMSS-basic-roles.ts
'use strict';

import { QueryInterface, QueryTypes, Op } from 'sequelize';

const rolesToCreate = [
    { name: 'CLIENT', description: 'Standard user with basic permissions.', created_at: new Date(), updated_at: new Date() },
    { name: 'ESTABLISHMENT_ADMIN', description: 'Administrator with full access on establishment management.', created_at: new Date(), updated_at: new Date() },
    { name: 'SUPER_ADMIN', description: 'Administrator with full access.', created_at: new Date(), updated_at: new Date() }
];

interface RoleNameResult {
    name: string;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up (queryInterface: QueryInterface) {
        console.log('Seeding basic roles...');

        const roleNames = rolesToCreate.map(role => role.name);

        const existingRoles = await queryInterface.sequelize.query<RoleNameResult[]>(
            `SELECT name FROM roles WHERE name IN (:roleNames)`,
            {
                replacements: { roleNames: roleNames },
                type: QueryTypes.SELECT,
            }
        );

        const existingRoleNames: string[] = [];
        for (const role of existingRoles) {
            existingRoleNames.push((role as unknown as RoleNameResult).name);
        }

        console.log('Existing roles found:', existingRoleNames);

        const rolesToInsert = rolesToCreate.filter(role => !existingRoleNames.includes(role.name));
        if (rolesToInsert.length > 0) {
            console.log('Inserting new roles:', rolesToInsert.map(r => r.name));
            try {
                await queryInterface.bulkInsert('roles', rolesToInsert, {});
                console.log(`Successfully inserted ${rolesToInsert.length} basic roles.`);
            } catch (error) {
                console.error("Error inserting basic roles:", error);
                throw error;
            }
        } else {
            console.log('All basic roles already exist. Nothing to insert.');
        }
    },

    async down (queryInterface: QueryInterface) {
        console.log('Removing basic roles...');
        const roleNamesToRemove = rolesToCreate.map(role => role.name);

        try {
            const affectedRows = await queryInterface.bulkDelete('roles', {
                name: {
                    [Op.in]: roleNamesToRemove
                }
            }, {}) as unknown as number;
            console.log(`Successfully removed ${affectedRows} basic roles (${roleNamesToRemove.join(', ')}).`);
        } catch (error) {
            console.error("Error removing basic roles:", error);
        }
    }
};