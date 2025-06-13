// migrations/YYYYMMDDHHMMSS-create-bookings.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';
import {PaymentStatus} from '../models/Booking';

/**
 * Fonction d'application de la migration (création de la table bookings)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function up(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
    const transaction = await queryInterface.sequelize.transaction();
    try {
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
                type: DataTypes.STRING(50),
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
                type: DataTypes.ENUM(...Object.values(PaymentStatus)),
                allowNull: false,
                defaultValue: PaymentStatus.NOT_PAID,
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
        await queryInterface.addIndex('bookings', ['user_id'], {name: 'idx_bookings_user_id', transaction});
        await queryInterface.addIndex('bookings', ['establishment_id'], {name: 'idx_bookings_establishment_id', transaction});
        await queryInterface.addIndex('bookings', ['service_id'], {name: 'idx_bookings_service_id', transaction});
        await queryInterface.addIndex('bookings', ['status'], {name: 'idx_bookings_status', transaction});
        await queryInterface.addIndex('bookings', ['start_datetime', 'end_datetime'], {name: 'idx_bookings_datetime', transaction}); // Index composite

        await transaction.commit();
        console.log('Create bookings UP succeed.')
    } catch(e) {
        console.log('Create bookings UP failed.')
        await transaction.rollback();
        console.log(e);
    }
}

/**
 * Fonction d'annulation de la migration (suppression de la table bookings)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} sequelize - L'instance Sequelize.
 */
export async function down(queryInterface: QueryInterface): Promise<void> {
    const transaction = await queryInterface.sequelize.transaction();
    try {
        await queryInterface.removeIndex('bookings', 'idx_bookings_user_id', {transaction});
        await queryInterface.removeIndex('bookings', 'idx_bookings_establishment_id', {transaction});
        await queryInterface.removeIndex('bookings', 'idx_bookings_service_id', {transaction});
        await queryInterface.removeIndex('bookings', 'idx_bookings_status', {transaction});
        await queryInterface.removeIndex('bookings', 'idx_bookings_datetime', {transaction}); // Index composite

        await queryInterface.dropTable('bookings', {transaction});

        if (queryInterface.sequelize.getDialect() === 'postgres') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_bookings_payment_status";', {transaction});
        }

        await transaction.commit();
        console.log('Create bookings DOWN succeed.')
    } catch(e) {
        console.log('Create bookings DOWN failed.')
        await transaction.rollback();
        console.log(e);
    }
}