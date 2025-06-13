// src/seeders/YYYYMMDDHHMMSS-update-countries-with-timezoneid.ts
import {QueryInterface, Transaction} from 'sequelize';
import moment from 'moment-timezone';
import fs from 'fs';
import path from 'path';
import db from '../models';
import Timezone from "../models/Timezone"; // Pour accéder aux modèles Country et Timezone

// Interface pour la structure attendue des objets pays dans le JSON
interface CountryJsonEntry {
    code: string; // ISO 3166-1 alpha-2 code
    name: string;
    // Ajoutez d'autres champs si votre JSON en contient
}

module.exports = {
    async up(queryInterface: QueryInterface): Promise<void> {
        const transaction: Transaction = await queryInterface.sequelize.transaction();
        try {
            console.log('Starting to update countries with timezone IDs...');

            // 1. Charger les données des pays depuis le fichier JSON
            const countriesJsonPath = path.join(__dirname, 'data', 'countries.json');
            if (!fs.existsSync(countriesJsonPath)) {
                console.error(`Country data file not found at: ${countriesJsonPath}. Skipping update.`);
                await transaction.commit();
                return;
            }
            const countriesData: CountryJsonEntry[] = JSON.parse(fs.readFileSync(countriesJsonPath, 'utf-8'));
            console.log(`Loaded ${countriesData.length} countries from JSON.`);

            // 2. Récupérer tous les timezones de la BDD pour un mapping rapide nom -> id
            const allTimezonesDb = await db.Timezone.findAll({attributes: ['id', 'name'], transaction});
            const timezoneMap = new Map<string, number>();
            allTimezonesDb.forEach((tz: Timezone) => {
                timezoneMap.set(tz.name, tz.id);
            });
            console.log(`Loaded ${timezoneMap.size} timezones from database for mapping.`);

            if (timezoneMap.size === 0) {
                console.warn('No timezones found in the database. Ensure timezones are seeded first. Skipping update.');
                await transaction.commit();
                return;
            }

            // 3. Logique de Mapping Pays vers Timezone et mise à jour
            let updatedCountriesCount = 0;
            let notFoundTimezoneForCountryCount = 0;
            const defaultUtcTimezoneId = timezoneMap.get('UTC');

            for (const countryJson of countriesData) {
                const countryCode = countryJson.code; // Utiliser le code ISO alpha-2 du JSON

                if (!countryCode || countryCode.length !== 2) {
                    console.warn(`Skipping country "${countryJson.name}" due to missing or invalid ISO code.`);
                    continue;
                }

                const countryTimezones = moment.tz.zonesForCountry(countryCode);
                let targetTimezoneName: string | undefined = undefined;
                let targetTimezoneId: number | null = null;

                if (countryTimezones && countryTimezones.length > 0) {
                    targetTimezoneName = countryTimezones[0]; // Prendre le premier fuseau horaire listé pour ce pays
                    if (timezoneMap.has(targetTimezoneName)) {
                        targetTimezoneId = timezoneMap.get(targetTimezoneName) as number;
                    } else {
                        console.warn(`Timezone "${targetTimezoneName}" (for country ${countryCode}) not found in database map. Assigning default (UTC or null).`);
                        targetTimezoneId = defaultUtcTimezoneId || null; // Utiliser UTC si disponible, sinon null
                        if (!defaultUtcTimezoneId) notFoundTimezoneForCountryCount++;
                    }
                } else {
                    console.warn(`No timezones found by moment-timezone for country code ${countryCode} ("${countryJson.name}"). Assigning default (UTC or null).`);
                    targetTimezoneId = defaultUtcTimezoneId || null;
                    if (!defaultUtcTimezoneId) notFoundTimezoneForCountryCount++;
                }

                // Mettre à jour l'enregistrement Country dans la BDD
                // La condition de mise à jour peut se baser sur le `code` (PK) ou le `name` si le code n'est pas PK
                // Dans notre modèle Country, `code` est la PK.
                const [affectedRows] = await db.Country.update(
                    {timezoneId: targetTimezoneId},
                    {
                        where: {code: countryCode},
                        transaction,
                    }
                );

                if (affectedRows > 0) {
                    updatedCountriesCount++;
                    // console.log(`Updated country ${countryCode} ("${countryJson.name}") with timezoneId: ${targetTimezoneId} (maps to ${targetTimezoneName || 'N/A or Default'})`);
                } else {
                    console.warn(`Country with code ${countryCode} ("${countryJson.name}") not found in database for update.`);
                }
            }

            console.log(`Finished updating countries. ${updatedCountriesCount} countries updated.`);
            if (notFoundTimezoneForCountryCount > 0) {
                console.warn(`${notFoundTimezoneForCountryCount} countries were assigned default/null timezone due to missing specific timezone mappings.`);
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error updating countries with timezone IDs:', error);
            throw error;
        }
    },

    async down(queryInterface: QueryInterface): Promise<void> {
        const transaction: Transaction = await queryInterface.sequelize.transaction();
        try {
            console.log('Reverting timezoneId for all countries to NULL...');
            // Mettre à jour tous les timezoneId à NULL
            //bulkUpdate utilise les noms de colonnes (snake_case)
            await queryInterface.bulkUpdate('countries',
                {timezone_id: null},
                {}, // Condition vide pour affecter toutes les lignes
                {transaction}
            );
            console.log('timezoneId reverted to NULL for all countries.');
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error('Error reverting timezoneId in countries:', error);
            throw error;
        }
    }
};