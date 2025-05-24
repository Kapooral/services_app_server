import { Router } from 'express';
import { StaffAvailabilityController } from '../../controllers/staff-availability.controller';

import { verifyCsrfToken } from '../../middlewares/csrf.middleware';
import { loadTargetMembershipForAdminAction } from '../../middlewares/planning.middleware';

const staffAvailabilityController = new StaffAvailabilityController();
const router = Router({ mergeParams: true }); // Récupère :establishmentId du parent

// --- Routes pour un admin gérant les disponibilités d'un membre spécifique ---
// Montées sous un chemin comme /establishments/:establishmentId/staff-availabilities-management/memberships/:membershipId

router.post('/memberships/:membershipId/availabilities', loadTargetMembershipForAdminAction('membershipId'), verifyCsrfToken, staffAvailabilityController.create);

router.get('/memberships/:membershipId/availabilities', loadTargetMembershipForAdminAction('membershipId'), staffAvailabilityController.listForMember);

// --- Routes pour un admin gérant des disponibilités par leur ID direct dans son établissement ---
// Montées sous un chemin comme /establishments/:establishmentId/staff-availabilities-management/availabilities/:availabilityId

router.get('/availabilities/:availabilityId', staffAvailabilityController.getById);

router.patch('/availabilities/:availabilityId', verifyCsrfToken, staffAvailabilityController.update);

router.delete('/availabilities/:availabilityId', verifyCsrfToken, staffAvailabilityController.delete);

export default router;