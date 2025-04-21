// Nouvelle migration YYYYMMDDHHMMSS-change-booking-status-to-varchar.ts
import {QueryInterface, DataTypes, Transaction} from 'sequelize';
import {BookingStatus} from '../models/Booking'; // Importer l'enum pour down

export default {
    async up(queryInterface: QueryInterface, Sequelize: typeof DataTypes) {
        await queryInterface.changeColumn('bookings', 'status', {
            type: Sequelize.STRING(50), // Nouvelle taille
            allowNull: false,
        });
    },
    async down(queryInterface: QueryInterface, Sequelize: typeof DataTypes) {
        // Revenir à ENUM peut être complexe si des données invalides existent
        // Il est souvent préférable de ne pas revenir en arrière ou de nettoyer les données d'abord.
        // Ici, on tente de remettre l'ENUM original.
        await queryInterface.changeColumn('bookings', 'status', {
            type: Sequelize.ENUM(...Object.values(BookingStatus)),
            allowNull: false,
        });
    }
};