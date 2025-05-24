// src/types/express/index.d.ts
import { MembershipAttributes } from '../../models/Membership';
import { ShiftTemplateAttributes } from '../../models/ShiftTemplate';
import { TimeOffRequestAttributes } from '../../models/TimeOffRequest';
import { StaffAvailabilityAttributes } from '../../models/StaffAvailability'

declare global {
    namespace Express {
        interface Request {
            user?: { id: number; username: string; email: string; is_active: boolean; roles: string[]; };
            membership?: MembershipAttributes;
            csrfToken?: () => string;
            targetMembership?: MembershipAttributes; // Le membership cible (ex: via /:membershipId/)
            actorMembershipInTargetContext?: MembershipAttributes; // Acteur dans le contexte du targetMembership.establishmentId
            targetShiftTemplate?: ShiftTemplateAttributes  // Attaché par loadShiftTemplateAndVerifyOwnership
            targetTimeOffRequest?: TimeOffRequestAttributes; // Attaché par loadTimeOffRequestAndVerifyAccessDetails
            targetStaffAvailability?: StaffAvailabilityAttributes
        }
    }
}