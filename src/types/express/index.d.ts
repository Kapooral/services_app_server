// src/types/express/index.d.ts
import { MembershipAttributes } from '../../models/Membership'; // Ajustez le chemin vers votre modèle

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: number;
                username: string;
                email: string;
                is_active: boolean;
                roles: string[];
            };
            membership?: MembershipAttributes;
            csrfToken?: () => string;
        }
    }
}