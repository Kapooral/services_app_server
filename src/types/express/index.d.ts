// src/types/express/index.d.ts
import { MembershipAttributes } from '../../models/Membership'; // Ajustez le chemin vers votre modèle
import { TimeOffRequestAttributes } from '../../models/TimeOffRequest'; // Ajustez le chemin vers votre modèle

declare global {
    namespace Express {
        interface Request {
            user?: { id: number; username: string; email: string; is_active: boolean; roles: string[]; };
            membership?: MembershipAttributes;
            csrfToken?: () => string;
            targetMembership?: MembershipAttributes; // Le membership cible (ex: via /:membershipId/)
            actorMembershipInTargetContext?: MembershipAttributes; // Acteur dans le contexte du targetMembership.establishmentId
            targetTimeOffRequest?: TimeOffRequestAttributes;
        }
    }
}