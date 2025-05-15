import { QueryInterface, Sequelize, Op, Transaction } from 'sequelize';
import db from '../models'; // Assurez-vous que db est correctement exporté et initialisé
import { TimeOffRequestType, TimeOffRequestStatus } from '../models/TimeOffRequest';
import { MembershipRole, MembershipStatus } from '../models/Membership';

module.exports = {
  async up(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
    const transaction: Transaction = await queryInterface.sequelize.transaction();
    try {
      // Récupérer des memberships STAFF actifs pour créer des demandes
      //findAll utilise les attributs du modèle (camelCase)
      const staffMemberships = await db.Membership.findAll({
        where: {
          role: MembershipRole.STAFF,
          status: MembershipStatus.ACTIVE,
        },
        limit: 12,
        include: [{ model: db.User, as: 'user', attributes: ['username'] }], // Pour logging
        transaction,
      });

      if (staffMemberships.length < 1) {
        console.log('No active STAFF memberships found to seed time off requests. Skipping.');
        await transaction.commit();
        return;
      }

      // Récupérer un membership ADMIN pour simuler le traitement/annulation
      const adminMembership = await db.Membership.findOne({
        where: {
          role: MembershipRole.ADMIN,
          status: MembershipStatus.ACTIVE,
          establishmentId: staffMemberships[0].establishmentId, // Admin du même établissement que le premier staff
        },
        transaction,
      });


      const timeOffRequestsToCreate = [];

      // Demande 1: En attente, par le premier staff member
      timeOffRequestsToCreate.push({
        membership_id: staffMemberships[0].id,
        establishment_id: staffMemberships[0].establishmentId,
        type: TimeOffRequestType.PAID_LEAVE,
        start_date: '2024-09-02',
        end_date: '2024-09-06',
        reason: 'Vacances annuelles prévues.',
        status: TimeOffRequestStatus.PENDING,
        admin_notes: null,
        processed_by_membership_id: null,
        cancelled_by_membership_id: null,
        cancellation_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      console.log(`Prepared time off request for staff ${staffMemberships[0].user?.username || staffMemberships[0].id}`);


      // Demande 2: Approuvée, par le deuxième staff member (si existe), traitée par l'admin
      if (staffMemberships.length > 1 && adminMembership) {
        timeOffRequestsToCreate.push({
          membership_id: staffMemberships[1].id,
          establishment_id: staffMemberships[1].establishmentId,
          type: TimeOffRequestType.SICK_LEAVE,
          start_date: '2024-08-19',
          end_date: '2024-08-20',
          reason: 'Malade, ne pourra pas venir.',
          status: TimeOffRequestStatus.APPROVED,
          admin_notes: 'Approuvé. Bon rétablissement.',
          processed_by_membership_id: adminMembership.id,
          cancelled_by_membership_id: null,
          cancellation_reason: null,
          created_at: new Date(),
          updated_at: new Date(),
        });
        console.log(`Prepared time off request for staff ${staffMemberships[1].user?.username || staffMemberships[1].id}, processed by admin ${adminMembership.id}`);
      }


      // Demande 3: Rejetée, par le premier staff member, traitée par l'admin
      if (adminMembership) {
        timeOffRequestsToCreate.push({
          membership_id: staffMemberships[0].id,
          establishment_id: staffMemberships[0].establishmentId,
          type: TimeOffRequestType.OTHER,
          start_date: '2024-10-10',
          end_date: '2024-10-11',
          reason: 'Conférence personnelle.',
          status: TimeOffRequestStatus.REJECTED,
          admin_notes: 'Période trop chargée pour l\'établissement.',
          processed_by_membership_id: adminMembership.id,
          cancelled_by_membership_id: null,
          cancellation_reason: null,
          created_at: new Date(),
          updated_at: new Date(),
        });
        console.log(`Prepared another time off request for staff ${staffMemberships[0].user?.username || staffMemberships[0].id}, processed by admin ${adminMembership.id}`);
      }

      if (timeOffRequestsToCreate.length > 0) {
        // bulkInsert utilise les noms de colonnes (snake_case)
        await queryInterface.bulkInsert('time_off_requests', timeOffRequestsToCreate, { transaction });
        console.log(`Successfully seeded ${timeOffRequestsToCreate.length} time off requests.`);
      } else {
        console.log('No time off requests were prepared for seeding.');
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Error seeding time off requests:', error);
      throw error;
    }
  },

  async down(queryInterface: QueryInterface, Sequelize: Sequelize): Promise<void> {
    const transaction: Transaction = await queryInterface.sequelize.transaction();
    try {
      // Supprimer toutes les demandes créées (simple pour un seed)
      // Ou cibler spécifiquement si on a les IDs ou des conditions précises
      // Ici, on supprime celles avec des raisons spécifiques pour éviter de tout effacer
      // bulkDelete utilise les noms de colonnes (snake_case)
      await queryInterface.bulkDelete('time_off_requests', {
        [Op.or]: [
          { reason: 'Vacances annuelles prévues.' },
          { reason: 'Malade, ne pourra pas venir.' },
          { reason: 'Conférence personnelle.' }
        ]
      }, { transaction });
      console.log('Time off requests seeded data reverted.');
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Error reverting seeded time off requests:', error);
      throw error;
    }
  }
};