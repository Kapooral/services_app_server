// tests/helpers/auth.helpers.ts
import supertest from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../../src/models';
import User, { UserAttributes, UserCreationAttributes } from '../../src/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECRET_KEY';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'YOUR_COOKIE_SECRET';
const SALT_ROUNDS = 10; // Assurer la cohérence avec UserService

export async function generateTestUser(userData: Partial<UserCreationAttributes>): Promise<UserAttributes> {
    const passwordToHash = userData.password || 'password123';
    // Générer le hash (le sel est inclus dedans)
    const hash = await bcrypt.hash(passwordToHash, SALT_ROUNDS);
    // console.log(`[generateTestUser] Hashing '${passwordToHash}', Hash generated: ${hash}`); // Log de debug

    const defaultUser: Omit<UserCreationAttributes, 'id' | 'salt'> = { // Exclure 'salt'
        username: userData.username || `testuser_${Date.now()}`,
        email: userData.email || `test_${Date.now()}@test.com`,
        email_masked: `t***t@test.com`,
        password: hash, // Stocker le hash complet
        is_active: true,
        is_email_active: true,
        is_phone_active: false,
        is_recovering: false,
        is_two_factor_enabled: false, // Mettre à false par défaut, les tests spécifiques l'activeront si besoin
    };

    // Fusionner les données par défaut avec celles fournies, en s'assurant que password n'est pas écrasé par userData si userData.password était null/undefined
    const finalUserData = { ...defaultUser, ...userData, password: hash };


    const newUser = await db.User.create(finalUserData);
    // console.log(`[generateTestUser] User created with ID: ${newUser.id}, Stored Hash: ${newUser.password}`); // Vérifier le hash stocké
    return newUser.get({ plain: true });
}

// loginTestUser reste inchangé (il ne valide pas le mot de passe)
export async function loginTestUser(
    agent: any,
    credentials: { email: string; password?: string } // password non utilisé ici
): Promise<{ accessToken: string; userId: number }> {
    const user = await db.User.findOne({ where: { email: credentials.email }, include: ['roles'] });
    if (!user) { throw new Error(`Test user ${credentials.email} not found for login.`); }

    // ATTENTION : Ce helper ne simule PAS le flux de login complet (pas de check mdp, pas de 2FA)
    // Il génère juste un token d'accès valide pour l'utilisateur trouvé.
    const payload: any = { // Utiliser 'any' pour flexibilité du payload
        userId: user.id,
        username: user.username,
        // email: user.email, // Inclure email? A vérifier selon AccessTokenPayload
        // roles: user.roles?.map(r => r.name) || [], // Inclure roles?
        type: 'access',
    };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '5m' });
    return { accessToken, userId: user.id };
}

export async function getCsrfTokenFromAgent(
    agent: any
): Promise<string> {
    try {
        const response = await agent.get('/api/auth/csrf-cookie');
        const cookies = response.headers['set-cookie'];
        if (cookies) {
            const xsrfCookie = cookies.find((cookie: string) => /XSRF-TOKEN=/.test(cookie));
            if (xsrfCookie) {
                const match = xsrfCookie.match(/XSRF-TOKEN=([^;]+)/);
                if (match && match[1]) {
                    return match[1];
                }
            }
        }
    } catch (error: any) {
        console.error("Failed to get CSRF token via dedicated route:", error.message || error);
    }

    console.warn("Could not extract XSRF-TOKEN from agent cookies. Returning fallback.");
    return 'fallback-dummy-csrf-token';
}

interface AccessTokenPayload {
    userId: number;
    username: string;
    email: string;
    roles: string[];
    type: 'access';
    iat?: number;
    exp?: number;
}
export interface TestUserCredentials { email: string; password?: string; }