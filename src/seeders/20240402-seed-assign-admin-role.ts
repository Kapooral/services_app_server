// YYYYMMDDHHMMSS-assign-admin-role.ts
'use strict';

// Importer les types nécessaires depuis sequelize
import { QueryInterface, Sequelize as SequelizeStatic, QueryTypes } from 'sequelize';

// --- CONFIGURATION ---
const ADMIN_USER_EMAIL = process.env.ADMIN_SEED_EMAIL || 'admin@example.com';
const ADMIN_ROLE_NAME = 'admin';
// --- FIN CONFIGURATION ---

// Interface pour typer le résultat des requêtes SELECT id
interface IdResult {
    id: number;
}

// Interface pour typer le résultat de la vérification d'association
interface ExistingAssociationResult {
    user_id: number; // Ou tout autre colonne sélectionnée
}


/** @type {import('sequelize-cli').Migration} */
module.exports = {
    // Ajouter les types aux paramètres
    async up (queryInterface: QueryInterface, Sequelize: SequelizeStatic) {
        console.log(`Attempting to assign role '${ADMIN_ROLE_NAME}' to user '${ADMIN_USER_EMAIL}'...`);

        // 1. Trouver l'ID de l'utilisateur
        // Utiliser le type générique pour spécifier le retour attendu
        const userResult = await queryInterface.sequelize.query<IdResult>(
            `SELECT id FROM users WHERE email = :email LIMIT 1`,
            {
                replacements: { email: ADMIN_USER_EMAIL },
                type: QueryTypes.SELECT,
                plain: true, // Retourne un seul objet ou null
            }
        );

        // userResult est maintenant de type IdResult | null
        if (!userResult) {
            console.warn(`WARNING: User with email '${ADMIN_USER_EMAIL}' not found. Skipping admin role assignment.`);
            return;
        }
        const userId = userResult.id; // Accès sécurisé car userResult n'est pas null ici
        console.log(`User '${ADMIN_USER_EMAIL}' found with ID: ${userId}`);

        // 2. Trouver l'ID du rôle Admin
        const roleResult = await queryInterface.sequelize.query<IdResult>(
            `SELECT id FROM roles WHERE name = :name LIMIT 1`,
            {
                replacements: { name: ADMIN_ROLE_NAME },
                type: QueryTypes.SELECT,
                plain: true,
            }
        );

        // roleResult est maintenant de type IdResult | null
        if (!roleResult) {
            console.error(`ERROR: Role '${ADMIN_ROLE_NAME}' not found. Make sure the basic roles seed has been run.`);
            throw new Error(`Role '${ADMIN_ROLE_NAME}' not found.`);
        }
        const roleId = roleResult.id; // Accès sécurisé
        console.log(`Role '${ADMIN_ROLE_NAME}' found with ID: ${roleId}`);

        // 3. Vérifier si l'association existe déjà
        const existingAssociation = await queryInterface.sequelize.query<ExistingAssociationResult>(
            `SELECT user_id FROM user_roles WHERE user_id = :userId AND role_id = :roleId LIMIT 1`,
            {
                replacements: { userId: userId, roleId: roleId },
                type: QueryTypes.SELECT,
                plain: true,
            }
        );

        // existingAssociation est de type ExistingAssociationResult | null
        if (existingAssociation) {
            console.log(`User ${userId} already has role ${roleId}. Skipping insertion.`);
            return;
        }

        // 4. Insérer l'association dans user_roles
        console.log(`Assigning role ${roleId} to user ${userId}...`);
        try {
            // bulkInsert ne retourne pas de lignes affectées directement, mais peut lancer une erreur
            await queryInterface.bulkInsert('user_roles', [{
                user_id: userId, // Utiliser les noms de colonnes snake_case de la DB
                role_id: roleId
            }], {});
            console.log(`Successfully assigned role '${ADMIN_ROLE_NAME}' to user '${ADMIN_USER_EMAIL}'.`);
        } catch (error) {
            console.error(`Failed to assign role '${ADMIN_ROLE_NAME}' to user '${ADMIN_USER_EMAIL}':`, error);
            throw error;
        }
    },

    // Ajouter les types aux paramètres
    async down (queryInterface: QueryInterface, Sequelize: SequelizeStatic) {
        console.log(`Attempting to remove role '${ADMIN_ROLE_NAME}' from user '${ADMIN_USER_EMAIL}'...`);

        const userResult = await queryInterface.sequelize.query<IdResult>(
            `SELECT id FROM users WHERE email = :email LIMIT 1`,
            {
                replacements: { email: ADMIN_USER_EMAIL },
                type: QueryTypes.SELECT,
                plain: true,
            }
        );

        const roleResult = await queryInterface.sequelize.query<IdResult>(
            `SELECT id FROM roles WHERE name = :name LIMIT 1`,
            {
                replacements: { name: ADMIN_ROLE_NAME },
                type: QueryTypes.SELECT,
                plain: true,
            }
        );

        if (!userResult || !roleResult) {
            console.warn(`WARNING: User '${ADMIN_USER_EMAIL}' or Role '${ADMIN_ROLE_NAME}' not found during down migration. Cannot remove association.`);
            return;
        }

        const userId = userResult.id;
        const roleId = roleResult.id;
        console.log(`Found User ID: ${userId}, Role ID: ${roleId}. Attempting deletion...`);

        try {
            const affectedRows = await queryInterface.bulkDelete('user_roles', {
                user_id: userId,
                role_id: roleId
            }, {}) as unknown as number;

            if (affectedRows > 0) {
                console.log(`Successfully removed role '${ADMIN_ROLE_NAME}' from user '${ADMIN_USER_EMAIL}'. Rows affected: ${affectedRows}`);
            } else {
                console.log(`No association found for user '${ADMIN_USER_EMAIL}' and role '${ADMIN_ROLE_NAME}'. Nothing to remove.`);
            }
        } catch (error) {
            console.error(`Failed to remove role '${ADMIN_ROLE_NAME}' from user '${ADMIN_USER_EMAIL}':`, error);
            throw error;
        }
    }
};