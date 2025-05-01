// migrations/YYYYMMDDHHMMSS-create-services.ts
import { QueryInterface, DataTypes, Sequelize } from 'sequelize';

/**
 * Fonction d'application de la migration (création de la table services)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function up(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
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
            allowNull: false,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), // Syntaxe MySQL/MariaDB
        },
    });

    // Ajout des index définis dans le modèle
    await queryInterface.addIndex('services', ['establishment_id']);
    await queryInterface.addIndex('services', ['is_active']);
}

/**
 * Fonction d'annulation de la migration (suppression de la table services)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function down(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
    await queryInterface.dropTable('services');
}