// src/types/express/index.d.ts
import { MembershipAttributes } from '../../models/Membership';
import { TimeOffRequestAttributes } from '../../models/TimeOffRequest';

declare global {
    namespace Express {
        interface Request {
            user?: { id: number; username: string; email: string; is_active: boolean; roles: string[]; };
            membership?: MembershipAttributes;
            csrfToken?: () => string;
            targetMembership?: MembershipAttributes; // Le membership cible (ex: via /:membershipId/)
            actorMembershipInTargetContext?: MembershipAttributes; // Acteur dans le contexte du targetMembership.establishmentId
            targetTimeOffRequest?: TimeOffRequestAttributes; // Attaché par loadTimeOffRequestAndVerifyAccessDetails
        }
    }
}