// YYYYMMDDHHMMSS-add-computed-timing-fields-to-staff-availabilities.ts
import {QueryInterface, DataTypes, Sequelize} from 'sequelize';

/**
 * Migration pour ajouter les colonnes `computed_min_start_utc` et `computed_max_end_utc`
 * à la table `staff_availabilities`.
 */
module.exports = {
    async up(queryInterface: QueryInterface, sequelize: Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            await queryInterface.addColumn('staff_availabilities', 'computed_min_start_utc', {
                type: DataTypes.DATE, // Pour PostgreSQL: TIMESTAMP WITH TIME ZONE, Pour MySQL: DATETIME
                allowNull: true, // Temporairement nullable pour permettre le backfill
                comment: 'UTC datetime of the earliest possible start of this availability rule.'
            }, {transaction});

            await queryInterface.addColumn('staff_availabilities', 'computed_max_end_utc', {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'UTC datetime of the latest possible end of this availability rule.'
            }, {transaction});

            // Après l'ajout des colonnes, si elles doivent être non nullables (comme computed_min_start_utc),
            // il faudrait faire un backfill PUIS une autre migration pour changer allowNull: false.
            // Pour l'instant, on les laisse nullables pour faciliter la migration sur des tables existantes.
            // Si la table est nouvelle ou vide, on pourrait les mettre directement avec les contraintes finales.
            // Mise à jour: Pour `computed_min_start_utc` qui doit être `allowNull: false` à terme,
            // il est préférable de le créer `allowNull: true`, de faire un backfill, puis de le changer.
            // Ou, si la table peut être modifiée sans données existantes, le mettre `allowNull: false` directement.
            // Vu qu'on a dit `allowNull: false` pour le modèle, on va le mettre ici aussi,
            // en supposant que le backfill sera géré ou que la table est nouvelle.
            // Si ce n'est pas le cas, mettre allowNull: true ici et gérer le not null plus tard.

            // Pour être sûr sur une table existante, il vaut mieux faire :
            // 1. AddColumn avec allowNull: true
            // 2. Backfill des données (hors migration ou dans une migration de données dédiée)
            // 3. ChangeColumn pour mettre allowNull: false pour computed_min_start_utc

            // Pour cette V1, si on suppose une nouvelle table ou un backfill rapide :
            // On va re-modifier `computed_min_start_utc` après le backfill pour le rendre non-nullable.
            // Pour l'instant, laissons `allowNull: true` pour `computed_min_start_utc` dans la migration,
            // et le modèle le définira comme requis logiquement.
            // La contrainte de BDD `NOT NULL` sera ajoutée dans une étape de backfill/finalisation.
            // Si le champ doit être non-nullable dès le début et qu'il n'y a pas de données, on peut faire:
            // await queryInterface.changeColumn('staff_availabilities', 'computed_min_start_utc', {
            //   type: DataTypes.DATE,
            //   allowNull: false,
            // }, { transaction });
            // Mais cela échouera s'il y a des lignes existantes avec NULL.
            // Donc, on garde allowNull: true pour la migration initiale d'ajout de colonne.
            // Le modèle le définira comme requis (`public computed_min_start_utc!: Date;`)

            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    },

    async down(queryInterface: QueryInterface, sequelize: Sequelize) {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            await queryInterface.removeColumn('staff_availabilities', 'computed_max_end_utc', {transaction});
            await queryInterface.removeColumn('staff_availabilities', 'computed_min_start_utc', {transaction});
            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }
};