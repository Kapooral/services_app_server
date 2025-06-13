// migrations/YYYYMMDDHHMMSS-create-availability-overrides.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/**
 * Fonction d'application de la migration (création de la table availability_overrides)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function up(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
    await queryInterface.createTable('availability_overrides', {
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
            onDelete: 'CASCADE', // Si l'établissement est supprimé, ses overrides aussi
        },
        start_datetime: {
            type: DataTypes.DATE, // Utilise DATETIME ou TIMESTAMP en BDD
            allowNull: false,
        },
        end_datetime: {
            type: DataTypes.DATE, // Utilise DATETIME ou TIMESTAMP en BDD
            allowNull: false,
            // On pourrait ajouter une contrainte CHECK (end_datetime > start_datetime) ici
            // si la base de données le supporte.
        },
        is_available: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            comment: 'Indicates if the establishment is available (true) or unavailable (false) during this period',
        },
        reason: {
            type: DataTypes.STRING(255),
            allowNull: true,
            comment: 'Optional reason for the override (e.g., Holiday, Maintenance)',
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
    await queryInterface.addIndex('availability_overrides', ['establishment_id']);
    await queryInterface.addIndex('availability_overrides', ['start_datetime', 'end_datetime']);
}

/**
 * Fonction d'annulation de la migration (suppression de la table availability_overrides)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable('availability_overrides');
}