// migrations/YYYYMMDDHHMMSS-create-establishments.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/**
 * Fonction d'application de la migration (création de la table)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} Sequelize - L'instance Sequelize (ou juste DataTypes).
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
    const transaction = await queryInterface.sequelize.transaction()
    try {
        await queryInterface.createTable('establishments', {
            id: {
                type: DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            name: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            address_line1: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            address_line2: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            city: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            postal_code: {
                type: DataTypes.STRING(20),
                allowNull: false,
            },
            region: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            country_name: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            country_code: {
                type: DataTypes.STRING(2),
                allowNull: false,
            },
            latitude: {
                type: DataTypes.FLOAT,
                allowNull: true,
            },
            longitude: {
                type: DataTypes.FLOAT,
                allowNull: true,
            },
            phone_number: {
                type: DataTypes.STRING(30),
                allowNull: true,
            },
            email: {
                type: DataTypes.STRING(100),
                allowNull: true,
                // La validation 'isEmail' est une validation de modèle, pas une contrainte de BDD directe
                // Elle sera appliquée au niveau de l'application par Sequelize.
            },
            profile_picture_url: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            siret: {
                type: DataTypes.STRING(14),
                allowNull: false,
            },
            siren: {
                type: DataTypes.STRING(9),
                allowNull: false,
            },
            is_validated: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            owner_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT', // Important : RESTRICT empêche la suppression d'un user s'il a des établissements
            },
            timezone: {
                type: DataTypes.STRING(100),
                allowNull: false,
                defaultValue: 'UTC',
                comment: 'Timezone identifier (e.g., Europe/Paris) for the establishment.',
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false
            }
        }, {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            transaction
        });

        await queryInterface.addIndex('establishments', ['siret'], {unique: true, name: 'idx_establishments_siret', transaction});
        await queryInterface.addIndex('establishments', ['siren'], {name: 'idx_establishments_siren', transaction});
        await queryInterface.addIndex('establishments', ['owner_id'], {name: 'idx_establishments_owner_id', transaction});
        await queryInterface.addIndex('establishments', ['country_name', 'city'], {name: 'idx_establishments_city', transaction});
        // await queryInterface.addIndex('establishments', ['latitude', 'longitude']); // Index simple pour commencer

        await transaction.commit()
        console.log('Create establishments UP succeed.')
    } catch(e) {
        console.log('Create establishments UP failed.')
        await transaction.rollback();
        console.log(e);
    }
}

/**
 * Fonction d'annulation de la migration (suppression de la table)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} Sequelize - L'instance Sequelize.
 */
export async function down(queryInterface: QueryInterface): Promise<void> {
    const transaction = await queryInterface.sequelize.transaction();
    try {

        await queryInterface.removeIndex('establishments', 'idx_establishments_siret', {transaction});
        await queryInterface.removeIndex('establishments', 'idx_establishments_siren', {transaction});
        await queryInterface.removeIndex('establishments', 'idx_establishments_owner_id', {transaction});
        await queryInterface.removeIndex('establishments', 'idx_establishments_city', {transaction});

        await queryInterface.dropTable('establishments');

        await transaction.commit();
        console.log('Create establishments DOWN succeed.');
    } catch(e) {
        console.log('Create establishments DOWN failed.');
        await transaction.rollback();
        console.log(e);
    }
}