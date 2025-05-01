// migrations/YYYYMMDDHHMMSS-create-establishments.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/**
 * Fonction d'application de la migration (création de la table)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} Sequelize - L'instance Sequelize (ou juste DataTypes).
 */
export async function up(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
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
            unique: true, // L'index unique est géré ici
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
                model: 'users', // Nom de la table référencée
                key: 'id',      // Clé primaire de la table référencée
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT', // Important : RESTRICT empêche la suppression d'un user s'il a des établissements
        },
        created_at: { // Géré par timestamps: true, mais doit être défini explicitement dans createTable
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP'), // Valeur par défaut BDD
        },
        updated_at: { // Géré par timestamps: true, mais doit être défini explicitement dans createTable
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), // Valeur par défaut BDD (Syntaxe MySQL)
        },
    });

    // Ajout des index supplémentaires définis dans le modèle
    // L'index unique sur 'siret' est déjà créé par la contrainte `unique: true` ci-dessus.
    await queryInterface.addIndex('establishments', ['siren']);
    await queryInterface.addIndex('establishments', ['owner_id']);
    await queryInterface.addIndex('establishments', ['country_name', 'city']);
    // L'index spatial nécessite potentiellement une syntaxe différente ou une extension BDD
    // await queryInterface.addIndex('establishments', ['latitude', 'longitude']); // Index simple pour commencer
}

/**
 * Fonction d'annulation de la migration (suppression de la table)
 * @param {QueryInterface} queryInterface - L'interface de requête Sequelize.
 * @param {Sequelize} Sequelize - L'instance Sequelize.
 */
export async function down(queryInterface: QueryInterface, sequelize: Sequelize): Promise<void> {
    // Il n'est généralement pas nécessaire de supprimer les index explicitement avant dropTable
    await queryInterface.dropTable('establishments');
}