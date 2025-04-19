// src/services/auth.service.ts
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { ModelCtor } from 'sequelize';
import { Request } from 'express';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import User from '../models/User';
import RefreshToken from '../models/RefreshToken';
import { UserService } from './user.service';
import { INotificationService } from './notification.service';
import { LoginInitiateDto, PreTwoFactorPayload, AccessTokenPayload, RefreshTokenPayload, AuthTokensDto, TwoFactorChallengeDto } from '../dtos/auth.validation';
import { InvalidCredentialsError, TwoFactorRequiredError, InvalidPre2FATokenError, TwoFactorMethodUnavailableError, InvalidTwoFactorCodeError, TwoFactorNotEnabledError } from '../errors/auth.errors';
import { AppError } from '../errors/app.errors';
import { UserNotFoundError } from '../errors/user.errors';
import { encryptionService, EncryptionService } from './encryption.service'; // Importer l'instance et le type

// --- Constantes --- (inchangées)
const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECRET_KEY';
const JWT_ACCESS_EXPIRATION_SECONDS = parseInt(process.env.JWT_ACCESS_EXPIRATION_SECONDS || '900', 10);
const JWT_REFRESH_EXPIRATION_SECONDS = parseInt(process.env.JWT_REFRESH_EXPIRATION_SECONDS || '604800', 10);
const JWT_PRE_2FA_EXPIRATION_SECONDS = parseInt(process.env.JWT_PRE_2FA_EXPIRATION_SECONDS || '600', 10);
const OTP_EXPIRATION_MINUTES = parseInt(process.env.OTP_EXPIRATION_MINUTES || '10', 10);
const OTP_LENGTH = 6;
const OTP_HASH_ROUNDS = 10;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '10', 10);
const APP_NAME = process.env.APP_NAME || 'MyApp';

export class AuthService {
    private userService: UserService;
    private notificationService: INotificationService;
    private userModel: ModelCtor<User>;
    private refreshTokenModel: ModelCtor<RefreshToken>;
    private encryptionService: EncryptionService; // Déclarer la propriété

    constructor(
        userService: UserService,
        notificationService: INotificationService,
        userModel: ModelCtor<User>,
        refreshTokenModel: ModelCtor<RefreshToken>,
        encryptionSrv: EncryptionService // Accepter le service en argument
    ) {
        this.userService = userService;
        this.notificationService = notificationService;
        this.userModel = userModel;
        this.refreshTokenModel = refreshTokenModel;
        this.encryptionService = encryptionSrv; // Initialiser la propriété
    }

    // --- Méthodes privées --- (inchangées)
    private signJwt(payload: object, secret: string, expiresInSeconds: number): string {
        const options = { expiresIn: expiresInSeconds };
        return jwt.sign(payload, secret, options);
    }

    private verifyJwt<T>(token: string, secret: string): T | null {
        try { return jwt.verify(token, secret) as T; }
        catch (error) {
            // Log plus détaillé si besoin en dev/staging
            // console.error("JWT Verification failed:", error);
            return null;
        }
    }

    private _generateOtp(length: number = OTP_LENGTH): string {
        return crypto.randomInt(10**(length-1), 10**length - 1).toString().padStart(length, '0');
    }

    private async _hashOtp(otp: string): Promise<string> {
        return bcrypt.hash(otp, OTP_HASH_ROUNDS);
    }

    private async _verifyOtp(plainOtp: string, hash: string): Promise<boolean> {
        if (!plainOtp || !hash) return false;
        return bcrypt.compare(plainOtp, hash);
    }

    private _hashRefreshToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private _generateRecoveryCode(length: number = RECOVERY_CODE_LENGTH): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < length; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); }
        return code;
    }

    // --- Méthodes publiques --- (inchangées, mais utilisent maintenant this.encryptionService)

    async initiateLogin(loginData: LoginInitiateDto, req?: Request): Promise<{ type: 'tokens', tokens: AuthTokensDto } | { type: '2fa_challenge', challenge: TwoFactorChallengeDto, pre2faToken: string }> {
        const { usernameOrEmail, password } = loginData;
        const isEmail = usernameOrEmail.includes('@');
        const user = isEmail
            ? await this.userService.getUserByEmail(usernameOrEmail, true) // Demande les données sensibles (incluant 2FA)
            : await this.userService.getUserByUsername(usernameOrEmail, true);

        if (!user || !(await this.userService.validatePassword(password, user.id))) {
            throw new InvalidCredentialsError();
        }
        if (!user.is_active) {
            // On peut choisir de donner le même message pour ne pas révéler si le compte existe mais est inactif
            throw new InvalidCredentialsError('Account is inactive.');
        }

        // La 2FA est-elle configurée pour cet utilisateur ?
        // Basé sur User.is_two_factor_enabled = true par défaut, on suppose qu'elle l'est.
        // Il faut vérifier si au moins une méthode est utilisable.

        const availableMethods: Array<'email' | 'sms' | 'totp'> = [];
        // Vérifier si les méthodes sont actives ET configurées
        if (user.is_email_active && user.email) availableMethods.push('email');
        // Note: 'sms' est simulé, mais on vérifie si le téléphone est actif et existe
        if (user.is_phone_active && user.phone) availableMethods.push('sms');
        // Vérifier si le secret TOTP existe (il est stocké chiffré)
        if (user.two_factor_secret) availableMethods.push('totp');

        if (availableMethods.length === 0) {
            // Cas critique: 2FA activée mais aucune méthode valide/vérifiée.
            // L'utilisateur devrait utiliser un code de récupération ou contacter le support.
            console.warn(`User ${user.id} has 2FA enabled but no available methods (email/sms/totp).`);
            throw new TwoFactorMethodUnavailableError("No verified 2FA methods found. Please use a recovery code or contact support.");
        }

        // Si au moins une méthode est dispo, générer le token pré-2FA
        const pre2faPayload: PreTwoFactorPayload = { userId: user.id, type: 'pre-2fa' };
        const pre2faToken = this.signJwt(pre2faPayload, JWT_SECRET, JWT_PRE_2FA_EXPIRATION_SECONDS);

        const challenge: TwoFactorChallengeDto = { methods: availableMethods };
        return { type: '2fa_challenge', challenge, pre2faToken };
    }

    async sendTwoFactorCode(pre2faToken: string, method: 'email' | 'sms'): Promise<void> {
        const payload = this.verifyJwt<PreTwoFactorPayload>(pre2faToken, JWT_SECRET);
        if (!payload || payload.type !== 'pre-2fa') throw new InvalidPre2FATokenError();

        const user = await this.userModel.findByPk(payload.userId);
        if (!user) throw new UserNotFoundError("User associated with token not found.");

        let recipient: string | undefined = undefined;
        let canUseMethod = false;

        if (method === 'email') {
            canUseMethod = user.is_email_active && !!user.email;
            if (canUseMethod) recipient = user.email!;
        } else if (method === 'sms') {
            canUseMethod = user.is_phone_active && !!user.phone;
            if (canUseMethod) recipient = user.phone!;
        }

        if (!canUseMethod || !recipient) {
            throw new TwoFactorMethodUnavailableError(`Method '${method}' is not available or verified for this user.`);
        }

        const otp = this._generateOtp();
        const otpHash = await this._hashOtp(otp);
        const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60000);

        // Stocker le hash et l'expiration, et la méthode utilisée pour ce code OTP
        await user.update({
            two_factor_method: method, // Indique que le code OTP a été envoyé via cette méthode
            two_factor_code_hash: otpHash,
            two_factor_code_expires_at: expiresAt,
        });

        // Envoyer le code via le service de notification
        try {
            if (method === 'email') await this.notificationService.sendEmailVerificationCode(recipient, otp);
            else if (method === 'sms') await this.notificationService.sendPhoneVerificationCode(recipient, otp); // Simulation
        } catch (error) {
            // Logguer l'échec mais ne pas nécessairement annuler l'opération (le code est en BDD)
            console.error(`Failed to send 2FA code via ${method} for user ${user.id}:`, error);
            // On pourrait choisir de lancer une erreur ici si l'envoi est critique
            // throw new AppError('NotificationFailed', 500, `Failed to send 2FA code via ${method}.`);
        }
    }

    async verifyTwoFactorCode(pre2faToken: string, code: string, req?: Request): Promise<AuthTokensDto> {
        const payload = this.verifyJwt<PreTwoFactorPayload>(pre2faToken, JWT_SECRET);
        if (!payload || payload.type !== 'pre-2fa') throw new InvalidPre2FATokenError();

        // Inclure les champs nécessaires pour la vérification
        const user = await this.userModel.findByPk(payload.userId, {
            attributes: [
                'id', 'username', 'is_active', // Infos de base
                'two_factor_secret', // Pour TOTP
                'two_factor_method', 'two_factor_code_hash', 'two_factor_code_expires_at', // Pour OTP
                'recovery_codes_hashes' // Pour codes de récupération
            ]
        });
        if (!user) throw new UserNotFoundError("User associated with token not found.");
        if (!user.is_active) throw new InvalidCredentialsError('Account is inactive.'); // Ou une erreur plus spécifique

        let codeVerified = false;
        let usedMethod: 'totp' | 'otp' | 'recovery' | null = null;

        // 1. Essayer TOTP (si configuré)
        if (user.two_factor_secret) {
            const decryptedSecret = this.encryptionService.decryptFromStorage(user.two_factor_secret);
            if (decryptedSecret && this.verifyTotpCode(decryptedSecret, code)) {
                codeVerified = true;
                usedMethod = 'totp';
                console.log(`User ${user.id}: 2FA verified via TOTP.`);
            }
        }

        // 2. Si TOTP échoue ou n'est pas configuré, essayer le code OTP (Email/SMS)
        if (!codeVerified && user.two_factor_code_hash && user.two_factor_code_expires_at) {
            if (new Date() < user.two_factor_code_expires_at) { // Vérifier l'expiration d'abord
                if (await this._verifyOtp(code, user.two_factor_code_hash)) {
                    codeVerified = true;
                    usedMethod = 'otp';
                    console.log(`User ${user.id}: 2FA verified via OTP (${user.two_factor_method}).`);
                }
            } else {
                console.log(`User ${user.id}: OTP code expired.`);
            }
        }

        // 3. Si OTP échoue ou n'est pas applicable, essayer les codes de récupération
        if (!codeVerified) {
            if (await this.verifyAndConsumeRecoveryCode(user.id, code)) {
                codeVerified = true;
                usedMethod = 'recovery';
                console.log(`User ${user.id}: 2FA verified via recovery code.`);
            }
        }

        // Nettoyer les champs OTP après la tentative, qu'elle réussisse ou échoue, pour éviter réutilisation
        if (user.two_factor_code_hash || user.two_factor_code_expires_at || user.two_factor_method) {
            try {
                await user.update({
                    two_factor_method: null,
                    two_factor_code_hash: null,
                    two_factor_code_expires_at: null
                });
            } catch(updateError) {
                console.error(`Failed to clear OTP fields for user ${user.id} after 2FA attempt:`, updateError);
            }
        }

        // Si aucune méthode n'a fonctionné
        if (!codeVerified) {
            // TODO: Implémenter un comptage des tentatives échouées ? (Rate limiting déjà présent)
            throw new InvalidTwoFactorCodeError('Invalid or expired two-factor code or recovery code.');
        }

        // Si la vérification a réussi
        console.log(`User ${user.id} logged in successfully (2FA verified via ${usedMethod}).`);
        // Générer et retourner les tokens d'authentification
        return await this._generateAuthTokens(user, req);
    }

    private async _generateAuthTokens(user: User, req?: Request): Promise<AuthTokensDto> {
        const accessTokenPayload: AccessTokenPayload = { userId: user.id, username: user.username, type: 'access' };
        // Utiliser UUID ou crypto.randomBytes pour un JTI (JWT ID) unique pour le refresh token
        const jwtid = crypto.randomBytes(16).toString('hex');
        const refreshTokenPayload: RefreshTokenPayload & { jti: string } = { userId: user.id, type: 'refresh', jti: jwtid };

        const accessToken = this.signJwt(accessTokenPayload, JWT_SECRET, JWT_ACCESS_EXPIRATION_SECONDS);
        const refreshToken = this.signJwt(refreshTokenPayload, JWT_SECRET, JWT_REFRESH_EXPIRATION_SECONDS);

        // Stocker le hash du refresh token en BDD pour la révocation/rotation
        const refreshTokenHash = this._hashRefreshToken(refreshToken);
        const expiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRATION_SECONDS * 1000);

        // Récupérer User-Agent et IP pour audit/sécurité
        const userAgent = req?.get('user-agent') ?? 'unknown';
        const ipAddress = req?.ip ?? req?.socket?.remoteAddress ?? 'unknown';

        try {
            await this.refreshTokenModel.create({
                user_id: user.id,
                token_hash: refreshTokenHash,
                expires_at: expiresAt,
                user_agent: userAgent,
                ip_address: ipAddress,
                is_revoked: false // Important: nouveau token n'est pas révoqué
            });
        } catch (dbError) {
            console.error(`Failed to store refresh token for user ${user.id}:`, dbError);
            // Faut-il lancer une erreur ici? L'utilisateur a réussi la 2FA...
            // Peut-être juste logguer pour le moment.
        }

        return { accessToken, refreshToken };
    }

    async refreshAccessToken(refreshToken: string, req?: Request): Promise<AuthTokensDto> {
        const payload = this.verifyJwt<RefreshTokenPayload & { jti?: string }>(refreshToken, JWT_SECRET);

        if (!payload || payload.type !== 'refresh' || !payload.jti) { // Vérifier aussi la présence du jti
            console.error('[AuthService Refresh] Invalid JWT payload, type, or missing jti.');
            throw new AppError('InvalidRefreshToken', 401, 'Invalid or expired refresh token (JWT check).');
        }

        const refreshTokenHash = this._hashRefreshToken(refreshToken);
        const storedToken = await this.refreshTokenModel.findOne({
            where: {
                token_hash: refreshTokenHash,
                user_id: payload.userId
                // On ne peut pas vérifier le jti ici car il n'est pas stocké (seul le hash l'est)
            }
        });

        if (!storedToken) {
            console.warn(`[AuthService Refresh] Refresh token hash not found in DB for user ${payload.userId}. Potential misuse or cleared token.`);
            // On pourrait vouloir invalider tous les tokens de l'utilisateur ici par précaution
            // await this.revokeAllUserTokens(payload.userId);
            throw new AppError('InvalidRefreshToken', 401, 'Refresh token not found.');
        }

        if (storedToken.is_revoked) {
            console.warn(`[AuthService Refresh] Attempted to use a revoked refresh token. User: ${payload.userId}. Token ID: ${storedToken.id}.`);
            // Mesure de sécurité: Révoquer tous les tokens de cet utilisateur car une fuite est possible
            await this.revokeAllUserTokens(payload.userId);
            throw new AppError('InvalidRefreshToken', 401, 'Refresh token has been revoked.');
        }

        if (storedToken.expires_at < new Date()) {
            console.warn(`[AuthService Refresh] Refresh token expired in DB. User: ${payload.userId}. Token ID: ${storedToken.id}.`);
            // Pas besoin de révoquer tous les tokens, juste celui-ci (qui est déjà expiré)
            // Marquer comme révoqué si ce n'est pas déjà fait peut être une bonne pratique
            if (!storedToken.is_revoked) await storedToken.update({ is_revoked: true });
            throw new AppError('InvalidRefreshToken', 401, 'Refresh token has expired.');
        }

        // Si le token est valide, non révoqué, non expiré :
        // 1. Révoquer l'ancien token utilisé pour le refresh (Rotation)
        await storedToken.update({ is_revoked: true });

        // 2. Récupérer l'utilisateur associé
        const user = await this.userModel.findByPk(payload.userId);
        if (!user || !user.is_active) {
            console.warn(`[AuthService Refresh] User ${payload.userId} not found or inactive during refresh.`);
            // Si l'utilisateur n'existe plus ou est inactif, on ne devrait pas délivrer de nouveau token
            throw new AppError('UserNotFoundOrInactive', 401, 'User not found or inactive.');
        }

        // 3. Générer un nouveau couple Access/Refresh token
        console.log(`[AuthService Refresh] Old token ${storedToken.id} revoked for user ${user.id}. Generating new tokens...`);
        return await this._generateAuthTokens(user, req); // Génère et stocke le nouveau refresh token
    }

    async revokeRefreshToken(refreshToken: string): Promise<boolean> {
        const refreshTokenHash = this._hashRefreshToken(refreshToken);
        // On cherche le token par son hash ET on s'assure qu'il n'est pas déjà révoqué
        const [affectedCount] = await this.refreshTokenModel.update(
            { is_revoked: true },
            { where: { token_hash: refreshTokenHash, is_revoked: false } }
        );
        // Retourne true si au moins une ligne a été affectée (donc le token existait et n'était pas révoqué)
        return affectedCount > 0;
    }

    async revokeAllUserTokens(userId: number): Promise<number> {
        const [affectedCount] = await this.refreshTokenModel.update(
            { is_revoked: true },
            { where: { user_id: userId, is_revoked: false } } // Ne met à jour que ceux qui ne sont pas déjà révoqués
        );
        console.log(`Revoked ${affectedCount} active refresh tokens for user ${userId}.`);
        return affectedCount;
    }

    // --- Méthodes TOTP ---
    generateTotpSecret(): string {
        return authenticator.generateSecret(); // Génère un secret base32
    }

    async generateTotpQrCodeUri(secret: string, email: string, issuer: string = APP_NAME): Promise<string> {
        // L'URI doit contenir l'email de l'utilisateur et le nom de l'application (issuer)
        const uri = authenticator.keyuri(email, issuer, secret);
        return qrcode.toDataURL(uri); // Génère directement un Data URI pour le QR code
    }

    verifyTotpCode(secret: string, token: string): boolean {
        // Vérifie le token actuel contre le secret
        // Gère la fenêtre de temps (par défaut +/- 1 période de 30s)
        return authenticator.verify({ token, secret });
    }

    async enableTotpForUser(userId: number, plainSecret: string, token: string): Promise<boolean> {
        // 1. Vérifier le premier token fourni par l'utilisateur avec le secret généré
        if (!this.verifyTotpCode(plainSecret, token)) {
            console.warn(`Initial TOTP token verification failed for user ${userId}`);
            return false; // Le token n'est pas valide
        }

        const user = await this.userModel.findByPk(userId);
        if (!user) throw new UserNotFoundError();

        // 2. Chiffrer le secret avant de le stocker en BDD
        const encryptedSecret = this.encryptionService.encryptForStorage(plainSecret);
        if (!encryptedSecret) {
            console.error(`Failed to encrypt TOTP secret for user ${userId}`);
            throw new AppError('EncryptionError', 500, 'Failed to secure TOTP secret.');
        }

        try {
            // 3. Mettre à jour l'utilisateur pour activer TOTP
            await user.update({
                is_two_factor_enabled: true, // Assurer qu'il est bien activé
                two_factor_method: 'totp',    // Indiquer la méthode principale
                two_factor_secret: encryptedSecret, // Stocker le secret chiffré
                // Nettoyer les champs OTP potentiels si on active TOTP
                two_factor_code_hash: null,
                two_factor_code_expires_at: null,
            });

            // 4. Générer et stocker les codes de récupération (fait dans le contrôleur après succès)
            // C'est mieux de le faire dans le contrôleur pour pouvoir les retourner à l'utilisateur.

            console.log(`TOTP enabled successfully for user ${userId}. Recovery codes should be generated next.`);
            return true;

        } catch(error) {
            console.error(`Failed to enable TOTP in DB for user ${userId}:`, error);
            // Si la mise à jour échoue, renvoyer false ou lancer une erreur DB
            throw new AppError('DatabaseUpdateError', 500, 'Failed to save TOTP configuration.');
        }
    }

    async disableTotpForUser(userId: number): Promise<boolean> {
        const user = await this.userModel.findByPk(userId);
        if (!user) throw new UserNotFoundError();

        // Vérifier si TOTP était la méthode active avant de la désactiver
        const wasTotpActive = user.two_factor_method === 'totp';

        try {
            await user.update({
                two_factor_secret: null, // Supprimer le secret
                // Réinitialiser la méthode si c'était TOTP. Si c'était email/sms, on ne touche pas.
                two_factor_method: wasTotpActive ? null : user.two_factor_method,
                // On ne désactive pas is_two_factor_enabled ici, car l'utilisateur
                // pourrait encore avoir email/sms actif. La désactivation complète
                // devrait être une action séparée.
                // is_two_factor_enabled: false, // NE PAS FAIRE ÇA ICI
                recovery_codes_hashes: null // Supprimer les anciens codes de récupération associés à TOTP
            });
            console.log(`TOTP disabled for user ${userId}.`);
            return true;
        } catch(error) {
            console.error(`Failed to disable TOTP for user ${userId}:`, error);
            throw new AppError('DatabaseUpdateError', 500, 'Failed to disable TOTP configuration.');
        }
    }

    // --- Méthodes pour les Codes de Récupération ---

    async generateAndStoreRecoveryCodes(userId: number): Promise<string[]> {
        const user = await this.userModel.findByPk(userId);
        if (!user) throw new UserNotFoundError();

        const plainCodes: string[] = [];
        const hashedCodes: string[] = [];

        for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
            const code = this._generateRecoveryCode(); // Génère un code alphanumérique
            plainCodes.push(code);
            // Hasher chaque code individuellement avec bcrypt
            hashedCodes.push(await bcrypt.hash(code, SALT_ROUNDS));
        }

        // Stocker les hashes dans le champ JSON de l'utilisateur
        try {
            await user.update({ recovery_codes_hashes: hashedCodes });
            console.log(`Generated and stored new recovery codes for user ${userId}.`);
            return plainCodes; // Retourner les codes en clair pour affichage unique
        } catch(error) {
            console.error(`Failed to store recovery codes for user ${userId}:`, error);
            throw new AppError('DatabaseUpdateError', 500, 'Failed to save recovery codes.');
        }
    }

    async verifyAndConsumeRecoveryCode(userId: number, providedCode: string): Promise<boolean> {
        const user = await this.userModel.findByPk(userId, {
            attributes: ['id', 'recovery_codes_hashes'] // On a besoin des hashes
        });
        // Vérifier si l'utilisateur existe et a des codes de récupération
        if (!user || !user.recovery_codes_hashes || user.recovery_codes_hashes.length === 0) {
            return false; // Pas de codes à vérifier
        }

        let codeIsValid = false;
        let usedCodeHashIndex = -1;
        const currentHashes = [...user.recovery_codes_hashes]; // Copie pour modification

        // Itérer sur les hashes stockés et comparer avec le code fourni
        for (let i = 0; i < currentHashes.length; i++) {
            const hash = currentHashes[i];
            // Comparer le code en clair fourni avec le hash stocké
            if (await bcrypt.compare(providedCode, hash)) {
                codeIsValid = true;
                usedCodeHashIndex = i;
                break; // Sortir dès qu'une correspondance est trouvée
            }
        }

        // Si une correspondance est trouvée
        if (codeIsValid) {
            // Supprimer le hash utilisé du tableau
            currentHashes.splice(usedCodeHashIndex, 1);
            // Mettre à jour la BDD avec le nouveau tableau de hashes
            try {
                await user.update({ recovery_codes_hashes: currentHashes });
                console.log(`Consumed recovery code for user ${userId}. ${currentHashes.length} codes remaining.`);
                return true; // Le code était valide et a été consommé
            } catch(error) {
                console.error(`Failed to update recovery codes after consumption for user ${userId}:`, error);
                // Que faire ici? Le code était valide mais la DB n'a pas pu être mise à jour.
                // Renvoyer false pourrait permettre une nouvelle tentative, mais risque d'épuiser les codes.
                // Renvoyer true pourrait bloquer l'utilisateur s'il réessaie.
                // Lancer une erreur serveur est peut-être le plus sûr.
                throw new AppError('DatabaseUpdateError', 500, 'Failed to consume recovery code.');
            }
        }

        // Si aucune correspondance n'a été trouvée
        return false;
    }
}