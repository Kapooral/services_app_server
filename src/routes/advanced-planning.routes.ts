// src/routes/advanced-planning.routes.ts
import { Router } from 'express';
import { Sequelize } from 'sequelize';
import db from '../models';

// Services
import { MemoryCacheService } from '../services/cache/memory-cache.service';
import { RecurringPlanningModelService } from '../services/recurring-planning-model.service';
import { RpmMemberAssignmentService } from '../services/rpm-member-assignment.service';
import { DailyAdjustmentSlotService } from '../services/daily-adjustment-slot.service';
import { DailyScheduleService } from '../services/daily-schedule.service';

// Contrôleurs
import { RecurringPlanningModelController } from '../controllers/recurring-planning-model.controller';
import { RpmMemberAssignmentController } from '../controllers/rpm-member-assignment.controller';
import { DailyAdjustmentSlotController } from '../controllers/daily-adjustment-slot.controller';
import { DailyScheduleController } from '../controllers/daily-schedule.controller';

// Middlewares
import { ensureMembership, ensureAdminOrSelfForMembership } from '../middlewares/auth.middleware';
import { MembershipRole } from '../models';

export default function createAdvancedPlanningRouter(sequelizeInstance?: Sequelize): Router {
    // --- Initialisation du routeur principal ---
    const mainPlanningRouter = Router({ mergeParams: true });

    // --- Initialisation et Injection des Dépendances ---
    const sequelize = sequelizeInstance || db.sequelize;
    const cacheService = new MemoryCacheService();

    const rpmService = new RecurringPlanningModelService(db.RecurringPlanningModel, db.RecurringPlanningModelMemberAssignment, sequelize, cacheService);
    const assignmentService = new RpmMemberAssignmentService(db.RecurringPlanningModelMemberAssignment, db.Membership, db.RecurringPlanningModel, sequelize, cacheService);
    const dasService = new DailyAdjustmentSlotService(db.DailyAdjustmentSlot, db.Membership, db.RecurringPlanningModel, sequelize, cacheService);
    const scheduleService = new DailyScheduleService(db.RecurringPlanningModelMemberAssignment, db.DailyAdjustmentSlot, db.Membership, cacheService);

    const rpmController = new RecurringPlanningModelController(rpmService);
    const assignmentController = new RpmMemberAssignmentController(assignmentService);
    const dasController = new DailyAdjustmentSlotController(dasService);
    const scheduleController = new DailyScheduleController(scheduleService);


    // --- CORRECTION MAJEURE : SÉPARATION DES ROUTES PAR NIVEAU DE SÉCURITÉ ---

    // --- 1. Routeur pour les actions réservées aux ADMINS ---
    const adminOnlyRouter = Router({ mergeParams: true });
    adminOnlyRouter.use(ensureMembership([MembershipRole.ADMIN])); // Mur de sécurité pour toutes ces routes

    // Routes de gestion des RPMs (écriture)
    adminOnlyRouter.post('/recurring-planning-models', rpmController.create);
    adminOnlyRouter.put('/recurring-planning-models/:rpmId', rpmController.update);
    adminOnlyRouter.delete('/recurring-planning-models/:rpmId', rpmController.delete);
    // Note: GET (lecture) peut aussi être réservé aux admins ici, c'est un choix de design.
    adminOnlyRouter.get('/recurring-planning-models', rpmController.listForEstablishment);
    adminOnlyRouter.get('/recurring-planning-models/:rpmId', rpmController.getById);

    // Routes de gestion des affectations (écriture)
    adminOnlyRouter.post('/recurring-planning-models/:rpmId/member-assignments', assignmentController.createAssignment);
    adminOnlyRouter.put('/recurring-planning-models/:rpmId/member-assignments/:assignmentId', assignmentController.updateAssignment);
    adminOnlyRouter.delete('/recurring-planning-models/:rpmId/member-assignments/:assignmentId', assignmentController.deleteAssignment);
    adminOnlyRouter.post('/recurring-planning-models/:rpmId/member-assignments/bulk-assign', assignmentController.bulkAssign);
    adminOnlyRouter.post('/recurring-planning-models/:rpmId/member-assignments/bulk-unassign', assignmentController.bulkUnassign);
    adminOnlyRouter.get('/recurring-planning-models/:rpmId/member-assignments', assignmentController.listAssignmentsForRpm);

    // Routes de gestion des DAS (écriture)
    adminOnlyRouter.post('/daily-adjustment-slots', dasController.create);
    adminOnlyRouter.patch('/daily-adjustment-slots/:dasId', dasController.update);
    adminOnlyRouter.delete('/daily-adjustment-slots/:dasId', dasController.delete);
    adminOnlyRouter.patch('/daily-adjustment-slots/bulk-update', dasController.bulkUpdate);
    adminOnlyRouter.post('/daily-adjustment-slots/bulk-delete', dasController.bulkDelete);
    adminOnlyRouter.get('/daily-adjustment-slots', dasController.listForEstablishment);
    adminOnlyRouter.get('/daily-adjustment-slots/:dasId', dasController.getById);


    // --- 2. Routeur pour les actions avec des permissions partagées (ADMIN ou STAFF) ---
    const sharedAccessRouter = Router({ mergeParams: true });

    // Cette route spécifique nécessite une logique plus fine : "ADMIN" OU "STAFF pour son propre planning"
    sharedAccessRouter.get(
        '/memberships/:membershipId/daily-schedule',
        // Le middleware 'ensureAdminOrSelfForMembership' doit encapsuler la logique :
        // 1. Appeler ensureMembership([MembershipRole.ADMIN, MembershipRole.STAFF]) pour charger req.membership
        // 2. Vérifier si req.membership.role === 'ADMIN' OU si req.membership.id == req.params.membershipId
        ensureAdminOrSelfForMembership, // On suppose que ce middleware existe et implémente la logique décrite.
        scheduleController.getMemberSchedule
    );


    // --- 3. Montage final des routeurs sur le routeur principal ---
    mainPlanningRouter.use(sharedAccessRouter); // Monter d'abord les routes à permissions spécifiques
    mainPlanningRouter.use(adminOnlyRouter);   // Monter ensuite les routes protégées par le mur "ADMIN"

    return mainPlanningRouter;
}