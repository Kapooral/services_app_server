// migrations/YYYYMMDDHHMMSS-create-services.ts
import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Fonction d'application de la migration (création de la table services)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
    const transaction = await queryInterface.sequelize.transaction();
    try {
        await queryInterface.createTable('services', {
            id: {
                type: DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            establishment_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'establishments', // Nom de la table référencée
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE', // Si l'établissement est supprimé, ses services aussi
            },
            name: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            duration_minutes: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
            },
            price: {
                type: DataTypes.DECIMAL(10, 2), // Précision pour les prix
                allowNull: false,
            },
            currency: {
                type: DataTypes.STRING(3),
                allowNull: false,
            },
            capacity: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 1,
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            is_promoted: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            auto_confirm_bookings: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            discount_price: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
            },
            discount_start_date: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            discount_end_date: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            cancellation_deadline_minutes: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                defaultValue: null, // Explicitement null par défaut
                comment: 'Minimum time in minutes before start time a client can cancel.', // Ajout d'un commentaire BDD
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

        // Ajout des index définis dans le modèle
        await queryInterface.addIndex('services', ['establishment_id'], {name: 'idx_service_establishment_id', transaction});
        await queryInterface.addIndex('services', ['is_active'], {name: 'idx_service_active', transaction});

        await transaction.commit();
        console.log('Create services UP succeed.')
    } catch(e) {
        console.log('Create services UP failed.')
        await transaction.rollback();
        console.log(e);
    }
}

/**
 * Fonction d'annulation de la migration (suppression de la table services)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 */
export async function down(queryInterface: QueryInterface): Promise<void> {
    const transaction = await queryInterface.sequelize.transaction();
    try {
        await queryInterface.removeIndex('services', 'idx_service_establishment_id', {transaction});
        await queryInterface.removeIndex('services', 'idx_service_active', {transaction});

        await queryInterface.dropTable('services');

        await transaction.commit();
        console.log('Create services DOWN succeed.')
    } catch(e) {
        console.log('Create services DOWN failed.')
        await transaction.rollback();
        console.log(e);
    }
}