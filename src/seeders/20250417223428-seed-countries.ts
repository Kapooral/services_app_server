// seeders/YYYYMMDDHHMMSS-seed-countries.ts
import {QueryInterface} from 'sequelize';
import * as fs from 'fs';
import * as path from 'path';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface: QueryInterface): Promise<void> {
        const countriesFilePath = path.join(__dirname, 'data', 'countries.json');
        let countriesData = {};

        try {
            const fileContent = fs.readFileSync(countriesFilePath, 'utf-8');
            countriesData = JSON.parse(fileContent);
        } catch (error) {
            console.error(`Error reading or parsing countries data file: ${countriesFilePath}`, error);
            throw new Error('Could not load countries data for seeding.');
        }

        const countriesArray = Object.entries(countriesData).map(([code, name]) => ({
            code: code,
            name: name,
        }));

        if (countriesArray.length > 0) {
            try {
                // Vider la table avant d'insérer (optionnel mais évite les doublons si le seed est relancé)
                // Attention : ne pas utiliser truncate si des clés étrangères pointent vers cette table (peu probable ici)
                await queryInterface.bulkDelete('countries', {}, {}); // Vide la table

                // Insérer les nouvelles données
                await queryInterface.bulkInsert('countries', countriesArray, {});
                console.log(`Successfully seeded ${countriesArray.length} countries.`);
            } catch (error) {
                console.error(`Error during bulk insert/delete for countries:`, error);
                throw error;
            }
        } else {
            console.warn("No countries found in data file to seed.");
        }
    },

    async down(queryInterface: QueryInterface): Promise<void> {
        // Supprimer toutes les données insérées par ce seed
        await queryInterface.bulkDelete('countries', {}, {});
        console.log("Countries table data deleted.");
    }
};