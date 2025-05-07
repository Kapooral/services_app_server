// src/routes/membership.routes.ts
import { Router } from 'express';
import { MembershipController } from '../controllers/membership.controller';
import { MembershipService } from '../services/membership.service';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';
import { requireAuth, ensureAdminOfTargetMembership } from '../middlewares/auth.middleware';
import db from '../models';
import { ConsoleNotificationService, INotificationService } from '../services/notification.service';

// --- Instanciation (Adapter selon votre DI) ---
const membershipService = new MembershipService(db.Membership, db.User, db.Establishment, new ConsoleNotificationService());
const membershipController = new MembershipController(membershipService);
// --- Fin Instanciation ---

const router = Router();

// Route publique pour récupérer les détails avant inscription/connexion
router.get('/invitation-details/:token', membershipController.getInvitationDetails);

// Route protégée pour activer l'invitation après s'être connecté
router.post('/activate-after-login', requireAuth, membershipController.activateAfterLogin);

router.patch('/:membershipId', requireAuth, ensureAdminOfTargetMembership, verifyCsrfToken, membershipController.updateMembership);
router.delete('/:membershipId', requireAuth, ensureAdminOfTargetMembership, verifyCsrfToken, membershipController.deleteMembership);

export default router;