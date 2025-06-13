// migrations/YYYYMMDDHHMMSS-create-countries-table.ts
import {QueryInterface, DataTypes} from 'sequelize';

/**
 * Fonction d'application de la migration (création de la table countries)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
    const transaction = await queryInterface.sequelize.transaction();
    try {
        await queryInterface.createTable('countries', {
            code: {
                type: DataTypes.STRING(2),
                allowNull: false,
                primaryKey: true,
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            timezone_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: {
                    model: 'timezones',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
            },
            phone_code: {
                type: DataTypes.STRING(10),
                allowNull: true
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

        await queryInterface.addIndex('countries', ['name'], {unique: true, name: 'idx_countries_name', transaction});
        await queryInterface.addIndex('countries', ['timezone_id'], {name: 'idx_countries_timezone_id', transaction});

        await transaction.commit();
        console.log('Create countries UP succeed.');
    } catch (e) {
        console.log('Create countries UP failed.');
        await transaction.rollback();
        console.log(e);
    }
}

/**
 * Fonction d'annulation de la migration (suppression de la table countries)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 */
export async function down(queryInterface: QueryInterface): Promise<void> {
    const transaction = await queryInterface.sequelize.transaction()
    try {
        // await queryInterface.removeIndex('countries', 'idx_countries_name', {transaction});
        // await queryInterface.removeIndex('countries', 'idx_countries_timezone_id', {transaction})

        await queryInterface.dropTable('countries', {transaction});

        await transaction.commit()
        console.log('Create countries DOWN succeed.')
    }  catch(e) {
        console.log('Create countries DOWN failed.')
        await transaction.rollback();
        console.log(e);
    }
}