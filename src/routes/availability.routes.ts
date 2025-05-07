import { Router } from 'express';
import { EstablishmentService } from '../services/establishment.service';
import { EstablishmentController } from '../controllers/establishment.controller';
import { requireAuth, requireRuleOwner, requireOverrideOwner } from '../middlewares/auth.middleware';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';
import {MembershipService} from "../services/membership.service";

export const createAvailabilityRouter = (
    establishmentService: EstablishmentService,
    membershipService: MembershipService
): Router => {
    const router = Router();

    const establishmentController = new EstablishmentController(establishmentService, membershipService);

    router.put('/rules/:ruleId', requireAuth, requireRuleOwner, verifyCsrfToken, establishmentController.updateRule);
    router.delete('/rules/:ruleId', requireAuth, requireRuleOwner, verifyCsrfToken, establishmentController.deleteRule);
    router.put('/overrides/:overrideId', requireAuth, requireOverrideOwner, verifyCsrfToken, establishmentController.updateOverride);
    router.delete('/overrides/:overrideId', requireAuth, requireOverrideOwner, verifyCsrfToken, establishmentController.deleteOverride);

    return router;
};