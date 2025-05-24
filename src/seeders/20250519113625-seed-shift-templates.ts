import {QueryInterface, Sequelize} from 'sequelize';

// Remplacez ces IDs par des valeurs existantes et valides dans votre BDD après migration
// Assurez-vous que ces enregistrements existent réellement dans vos tables 'establishments' et 'memberships'
// et que le membership est bien un ADMIN de l'establishment.
const EXAMPLE_ESTABLISHMENT_ID = 1; // ID d'un établissement existant
const EXAMPLE_ADMIN_MEMBERSHIP_ID = 26; // ID d'un Membership ADMIN pour l'établissement ci-dessus

module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            const shiftTemplatesData = [
                {
                    establishment_id: EXAMPLE_ESTABLISHMENT_ID,
                    name: 'Shift Matin Semaine (9h-17h)',
                    description: 'Shift standard de jour pour les jours de semaine (lun-ven).',
                    created_by_membership_id: EXAMPLE_ADMIN_MEMBERSHIP_ID,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
                {
                    establishment_id: EXAMPLE_ESTABLISHMENT_ID,
                    name: 'Shift Soir Week-end (18h-23h)',
                    description: 'Shift pour les soirées du samedi et dimanche.',
                    created_by_membership_id: EXAMPLE_ADMIN_MEMBERSHIP_ID,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            ];

            // Insérer les templates un par un pour récupérer leurs IDs
            const insertedTemplateIds: number[] = [];

            for (const templateData of shiftTemplatesData) {
                // queryInterface.insert retourne un Promise<[number, number]> pour MySQL où [0] est l'insertId
                const result = await queryInterface.insert(
                    null, // Modèle (non utilisé ici, la table est spécifiée directement)
                    'shift_templates',
                    templateData,
                    {transaction} // L'objet options
                ) as [number, number]; // Type assertion pour MySQL
                insertedTemplateIds.push(result[0]);
            }

            if (insertedTemplateIds.length < 2) {
                throw new Error('Failed to insert shift templates or retrieve their IDs correctly.');
            }

            const templateMatinId = insertedTemplateIds[0];
            const templateSoirId = insertedTemplateIds[1];

            const shiftTemplateRulesData = [
                // Règles pour "Shift Matin Semaine (9h-17h)"
                {
                    shift_template_id: templateMatinId,
                    rrule_string: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=T090000', // Heure de début 9h locale
                    duration_minutes: 8 * 60, // 8 heures
                    is_working: true,
                    rule_description: 'Bloc de travail 9h-17h en semaine',
                    created_at: new Date(),
                    updated_at: new Date(),
                },
                // Règles pour "Shift Soir Week-end (18h-23h)"
                {
                    shift_template_id: templateSoirId,
                    rrule_string: 'FREQ=WEEKLY;BYDAY=SA,SU;DTSTART=T180000', // Heure de début 18h locale
                    duration_minutes: 5 * 60, // 5 heures
                    is_working: true,
                    rule_description: 'Bloc de travail 18h-23h le week-end',
                    created_at: new Date(),
                    updated_at: new Date(),
                },
                // Exemple avec une pause
                {
                    shift_template_id: templateMatinId, // Ajouté au template "Matin Semaine"
                    rrule_string: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=T120000', // Pause de 12h
                    duration_minutes: 60, // 1 heure
                    is_working: false, // Ceci est une période d'indisponibilité
                    rule_description: 'Pause déjeuner 12h-13h',
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            ];
            await queryInterface.bulkInsert('shift_template_rules', shiftTemplateRulesData, {transaction});

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error("Error seeding shift templates and rules:", error);
            throw error;
        }
    },

    async down(queryInterface: QueryInterface, sequelize: Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            await queryInterface.bulkDelete('shift_template_rules', {}, {transaction});
            await queryInterface.bulkDelete('shift_templates', {}, {transaction});
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error("Error reverting seed for shift templates and rules:", error);
            throw error;
        }
    },
};