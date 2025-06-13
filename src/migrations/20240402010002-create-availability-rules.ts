// migrations/YYYYMMDDHHMMSS-create-availability-rules.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/**
 * Fonction d'application de la migration (création de la table availability_rules)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function up(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
    await queryInterface.createTable('availability_rules', {
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
            onDelete: 'CASCADE', // Si l'établissement est supprimé, ses règles aussi
        },
        day_of_week: {
            type: DataTypes.INTEGER.UNSIGNED, // Stocke 0 (Dimanche) à 6 (Samedi)
            allowNull: false,
            comment: 'Day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)',
            // La validation { min: 0, max: 6 } est une validation de modèle,
            // pas une contrainte BDD directe standard. Elle sera appliquée par Sequelize.
        },
        start_time: {
            type: DataTypes.TIME, // Stocke l'heure (ex: '09:00:00')
            allowNull: false,
        },
        end_time: {
            type: DataTypes.TIME, // Stocke l'heure (ex: '17:30:00')
            allowNull: false,
            // On pourrait ajouter une contrainte CHECK (end_time > start_time) ici
            // si la base de données le supporte facilement.
            // Exemple PostgreSQL: CONSTRAINT end_after_start CHECK (end_time > start_time)
            // Mais pour rester portable, on laisse la validation au niveau applicatif/modèle.
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
    await queryInterface.addIndex('availability_rules', ['establishment_id']);

    // Ajout de l'index unique composite
    await queryInterface.addIndex(
        'availability_rules',
        ['establishment_id', 'day_of_week'],
        {
            unique: true,
            name: 'unique_establishment_day', // Nom de l'index spécifié dans le modèle
        }
    );
}

/**
 * Fonction d'annulation de la migration (suppression de la table availability_rules)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function down(queryInterface: QueryInterface): Promise<void> {
    // Il n'est généralement pas nécessaire de supprimer les index explicitement avant dropTable,
    // mais si vous préférez être explicite :
    // await queryInterface.removeIndex('availability_rules', 'unique_establishment_day');
    // await queryInterface.removeIndex('availability_rules', ['establishment_id']); // Sequelize peut générer un nom par défaut
    await queryInterface.dropTable('availability_rules');
}