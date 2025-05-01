// migrations/YYYYMMDDHHMMSS-create-bookings.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';
// **Important**: Assurez-vous que le chemin d'importation est correct
// par rapport à l'emplacement de vos fichiers de migration.
import {BookingStatus, PaymentStatus} from '../models/Booking';

/**
 * Fonction d'application de la migration (création de la table bookings)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function up(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
    await queryInterface.createTable('bookings', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false,
        },
        user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true, // Permet de garder la réservation si l'utilisateur est supprimé
            references: {
                model: 'users', // Nom de la table User
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL', // Comme défini dans le modèle
        },
        establishment_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: 'establishments', // Nom de la table Establishment
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE', // Comme défini dans le modèle
        },
        service_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true, // Permet de garder la réservation si le service est supprimé
            references: {
                model: 'services', // Nom de la table Service
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL', // Comme défini dans le modèle
        },
        start_datetime: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        end_datetime: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        status: {
            // Utilise les valeurs de l'enum importée
            type: DataTypes.ENUM(...Object.values(BookingStatus)),
            allowNull: false,
        },
        price_at_booking: {
            // Utiliser DECIMAL pour la précision monétaire
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        currency_at_booking: {
            type: DataTypes.STRING(3),
            allowNull: false,
        },
        payment_status: {
            // Utilise les valeurs de l'enum importée
            type: DataTypes.ENUM(...Object.values(PaymentStatus)),
            allowNull: false,
            defaultValue: PaymentStatus.NOT_PAID, // Définit la valeur par défaut
        },
        user_notes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        establishment_notes: {
            type: DataTypes.TEXT,
            allowNull: true,
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
    await queryInterface.addIndex('bookings', ['user_id']);
    await queryInterface.addIndex('bookings', ['establishment_id']);
    await queryInterface.addIndex('bookings', ['service_id']);
    await queryInterface.addIndex('bookings', ['status']);
    await queryInterface.addIndex('bookings', ['start_datetime', 'end_datetime']); // Index composite
}

/**
 * Fonction d'annulation de la migration (suppression de la table bookings)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function down(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
    await queryInterface.dropTable('bookings');
    // Optionnel : Si vous utilisez PostgreSQL et avez créé les types ENUM séparément,
    // vous devriez les supprimer ici avec queryInterface.dropEnum(...)
    // Mais avec `DataTypes.ENUM(...)`, Sequelize gère souvent cela implicitement.
}