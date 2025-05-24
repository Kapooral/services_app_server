import { Router } from 'express';
import { ShiftTemplateController } from '../../controllers/shift-template.controller';

import { verifyCsrfToken } from '../../middlewares/csrf.middleware';
import { loadShiftTemplateAndVerifyOwnership } from '../../middlewares/planning.middleware';

const shiftTemplateController = new ShiftTemplateController();

const router = Router({ mergeParams: true });

router.post('/', verifyCsrfToken, shiftTemplateController.create);

router.get('/', shiftTemplateController.listForEstablishment);

router.get('/:templateId', loadShiftTemplateAndVerifyOwnership('templateId'), shiftTemplateController.getById);

router.put('/:templateId', loadShiftTemplateAndVerifyOwnership('templateId'), verifyCsrfToken, shiftTemplateController.update);

router.delete('/:templateId', loadShiftTemplateAndVerifyOwnership('templateId'), verifyCsrfToken, shiftTemplateController.delete);

router.post('/:templateId/apply', loadShiftTemplateAndVerifyOwnership('templateId'), verifyCsrfToken, shiftTemplateController.applyToMemberships);

export default router;