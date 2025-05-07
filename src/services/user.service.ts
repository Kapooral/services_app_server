// src/services/user.service.ts
import { Includeable, ModelCtor, Op } from 'sequelize';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import User, {UserAttributes, UserCreationAttributes} from '../models/User';
import { fileService } from './file.service';
import { INotificationService } from './notification.service';
import { CreateUserDto, UpdateEmailDto, UpdateUserDto } from '../dtos/user.validation';
import {
    DuplicateEmailError,
    DuplicateUsernameError,
    InvalidCredentialsError,
    MissingActivationTokenError,
    ProfilePictureNotFoundError,
    UserNotFoundError,
    VerificationActivationTokenError,
    VerificationCodeError
} from '../errors/user.errors';
import { AppError } from '../errors/app.errors';
import { AuthService } from './auth.service';
import db from '../models/index';
import {RegisterViaInvitationDto} from "../dtos/membership.validation";
import {Request} from "express";
import {AuthTokensDto} from "../dtos/auth.validation";
import {MembershipAttributes} from "../models/Membership";
import {MembershipService} from "./membership.service";


const SALT_ROUNDS = 10;
const CODE_EXPIRATION_MINUTES = 15;
const VERIFICATION_CODE_LENGTH = 6;
const RECOVERY_CODE_LENGTH = 8;
const ACTIVATION_TOKEN_BYTES = 32;
const ACTIVATION_TOKEN_EXPIRATION_HOURS = 24;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_EXPIRATION_MINUTES = 60;

export class UserService {
    private userModel: ModelCtor<User>;
    private notificationService: INotificationService;
    private authService?: AuthService;
    private membershipService: MembershipService | undefined;

    constructor(
        userModel: ModelCtor<User>,
        notificationService: INotificationService
    ) {
        this.userModel = userModel;
        this.notificationService = notificationService;
    }

    public setAuthService(authService: AuthService) {
        this.authService = authService;
    }
    public setMembershipService(membershipService: MembershipService) {
        this.membershipService = membershipService;
    }

    private _hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    // Correction: Retourne directement la promesse de string du hash
    private async _hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, SALT_ROUNDS); // bcrypt gère le sel interne
    }

    private async _comparePassword(plainPassword: string, hash: string): Promise<boolean> {
        try {
            return await bcrypt.compare(plainPassword, hash);
        } catch (error) {
            console.error("Error comparing password:", error);
            return false;
        }
    }

    private _maskEmail(email: string): string {
        if (!email || !email.includes('@')) return email;
        const [user, domain] = email.split('@');
        if (user.length <= 3) return `${user[0]}***@${domain}`;
        return `${user.substring(0, 2)}***${user.slice(-1)}@${domain}`;
    }

    private _maskPhone(phone?: string): string | undefined {
        if (!phone || phone.length < 5) return phone;
        const visiblePrefix = phone.substring(0, 2);
        const visibleSuffix = phone.substring(phone.length - 2);
        const maskedPart = '*'.repeat(phone.length - 4);
        return `${visiblePrefix}${maskedPart}${visibleSuffix}`;
    }

    async createUser(userData: CreateUserDto): Promise<User> {
        const existingUser = await this.userModel.findOne({ where: { [Op.or]: [{ email: userData.email }, { username: userData.username }] }});
        if (existingUser) {
            if (existingUser.email === userData.email) throw new DuplicateEmailError();
            if (existingUser.username === userData.username) throw new DuplicateUsernameError();
        }
        const hash = await this._hashPassword(userData.password); // Récupère le hash directement
        const email_masked = this._maskEmail(userData.email);
        const phone_masked = this._maskPhone(userData.phone ?? undefined);

        const plainActivationToken = crypto.randomBytes(ACTIVATION_TOKEN_BYTES).toString('hex');
        const hashedActivationToken = this._hashToken(plainActivationToken);
        const activationExpiresAt = new Date(Date.now() + ACTIVATION_TOKEN_EXPIRATION_HOURS * 60 * 60 * 1000);

        try {
            const newUser = await this.userModel.create({
                ...userData,
                phone: userData.phone ?? undefined,
                profile_picture: userData.profile_picture ?? undefined,
                password: hash,
                email_masked,
                phone_masked,
                is_active: false,
                is_email_active: false,
                email_activation_token: hashedActivationToken,
                email_activation_token_expires_at: activationExpiresAt,
                is_two_factor_enabled: false // Default
            } as Omit<UserAttributes, 'salt' | 'id'>); // Adapter le type ici aussi si UserAttributes a encore 'salt'
            try {
                await this.notificationService.sendActivationEmail(newUser.email, plainActivationToken);
            } catch (emailError) {
                console.error(`Failed to send activation email to ${newUser.email} for user ${newUser.id}:`, emailError);
            }

            if (this.authService) {
                try {
                    await this.authService.generateAndStoreRecoveryCodes(newUser.id);
                } catch (recoveryError) {
                    console.error(`Failed to generate initial recovery codes for user ${newUser.id}:`, recoveryError);
                }
            } else {
                console.warn("AuthService not set in UserService, cannot generate initial recovery codes.");
            }

            return await this.getUserById(newUser.id, {}) ?? newUser;

        } catch (error: any) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                if (error.fields?.email) throw new DuplicateEmailError();
                if (error.fields?.username) throw new DuplicateUsernameError();
            }
            console.error("Error creating user in DB:", error);
            throw error;
        }
    }

    async activateUserAccount(plainToken: string): Promise<User> {
        if (!plainToken) { throw new MissingActivationTokenError(); }
        const hashedToken = this._hashToken(plainToken);

        const user = await this.userModel.findOne({
            where: {
                email_activation_token: hashedToken,
                email_activation_token_expires_at: { [Op.gt]: new Date() }
            }
        });
        if (!user) { throw new VerificationActivationTokenError(); }

        if (user.is_active && user.is_email_active) {
            return await this.getUserById(user.id, {}) ?? user;
        }

        await user.update({
            is_active: true,
            is_email_active: true,
            email_activation_token: null,
            email_activation_token_expires_at: null
        });

        try { await this.notificationService.sendWelcomeEmail(user.email); }
        catch (emailError) { console.error(`Failed to send welcome email to ${user.email}:`, emailError); }

        return await this.getUserById(user.id, {}) ?? user;
    }

    private _generateVerificationCode(length: number = VERIFICATION_CODE_LENGTH): string {
        const len = length === RECOVERY_CODE_LENGTH ? RECOVERY_CODE_LENGTH : VERIFICATION_CODE_LENGTH;
        return crypto.randomInt(10**(len-1), 10**len - 1).toString().padStart(len, '0');
    }

    private _isCodeExpired(requestedAt: Date | null | undefined): boolean {
        if (!requestedAt) return true;
        const expirationTime = new Date(requestedAt.getTime() + CODE_EXPIRATION_MINUTES * 60000);
        return new Date() > expirationTime;
    }

    async initiatePasswordRecovery(email: string): Promise<void> {
        const user = await this.getUserByEmail(email, true);
        if (!user || !user.is_active) {
            console.warn(`Password recovery initiated for non-existent or inactive email: ${email}`);
            return;
        }

        const plainResetToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
        const hashedResetToken = this._hashToken(plainResetToken);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRATION_MINUTES * 60000);

        await user.update({
            password_reset_token: hashedResetToken,
            password_reset_expires_at: expiresAt,
            is_recovering: true
        });

        try { await this.notificationService.sendPasswordRecoveryToken(user.email, plainResetToken, RESET_TOKEN_EXPIRATION_MINUTES); }
        catch (error) { console.error(`Failed to send password recovery email to ${email}:`, error); }
    }

    async validatePasswordResetToken(plainResetToken: string): Promise<{ valid: boolean; userId?: number; error?: string }> {
        if (!plainResetToken) { return { valid: false, error: 'Token is required.' }; }
        const hashedToken = this._hashToken(plainResetToken);

        const user = await this.userModel.findOne({
            where: { password_reset_token: hashedToken, password_reset_expires_at: { [Op.gt]: new Date() } },
            attributes: ['id', 'is_active', 'is_recovering']
        });

        if (!user || !user.is_active || !user.is_recovering) {
            let errorMsg = 'Invalid or expired password reset token.';
            if (user && !user.is_active) errorMsg = 'Account is inactive.';
            if (user && !user.is_recovering) errorMsg = 'Password reset process not active for this token.';
            return { valid: false, error: errorMsg };
        }
        return { valid: true, userId: user.id };
    }

    async performPasswordReset(plainResetToken: string, newPassword: string): Promise<boolean> {
        const validationResult = await this.validatePasswordResetToken(plainResetToken);
        if (!validationResult.valid || !validationResult.userId) {
            throw new AppError('InvalidResetToken', 400, validationResult.error || 'Invalid or expired token.');
        }
        const userId = validationResult.userId;

        // Appelle updatePassword qui gère le hachage et la révocation des tokens
        const passwordUpdated = await this.updatePassword(userId, newPassword);

        // Nettoyer les champs de reset après succès
        if (passwordUpdated) {
            try {
                const user = await this.userModel.findByPk(userId);
                if (user) { await user.update({ password_reset_token: null, password_reset_expires_at: null, is_recovering: false }); }
            } catch (clearTokenError) {
                console.error(`Failed to clear password reset token for user ${userId}:`, clearTokenError);
            }
        }
        return passwordUpdated;
    }

    async getUserById(id: number, options: { includeSensitive?: boolean; includeMeData?: boolean } = {}): Promise<User | null> {
        const { includeSensitive = false, includeMeData = false } = options;
        const attributesToExclude = includeSensitive ? [] : ['password', /* autres champs sensibles sans salt */];
        const includes: Includeable[] = [];
        if (includeMeData) {
            includes.push({ model: db.Role, as: 'roles', attributes: ['name'], through: { attributes: [] } });
            includes.push({ model: db.Establishment, as: 'ownedEstablishments', attributes: ['id'], required: false });
        }
        return this.userModel.findByPk(id, { attributes: { exclude: attributesToExclude }, include: includes.length > 0 ? includes : undefined });
    }

    async getUserByEmail(email: string, includeSensitive: boolean = false): Promise<User | null> {
        const attributesToExclude = includeSensitive ? [] : ['password', /* autres champs sensibles */];
        return this.userModel.findOne({ where: { email }, attributes: { exclude: attributesToExclude } });
    }

    async getUserByUsername(username: string, includeSensitive: boolean = false): Promise<User | null> {
        const attributesToExclude = includeSensitive ? [] : ['password', /* autres champs sensibles */];
        return this.userModel.findOne({ where: { username }, attributes: { exclude: attributesToExclude } });
    }

    async updateUserProfile(id: number, data: UpdateUserDto): Promise<User> {
        const user = await this.getUserById(id); // Utilise la méthode qui exclut déjà les champs sensibles par défaut
        if (!user) throw new UserNotFoundError();
        if (data.username && data.username !== user.username) {
            const existing = await this.getUserByUsername(data.username);
            if(existing && existing.id !== id) throw new DuplicateUsernameError();
        }
        // Ne met à jour que les champs fournis dans le DTO (username)
        await user.update({ username: data.username ?? user.username });
        // Retourne l'utilisateur ( potentiellement sans le mot de passe etc.)
        return user;
    }

    async deleteProfilePicture(id: number): Promise<User> {
        const user = await this.getUserById(id);
        if (!user) throw new UserNotFoundError();
        const oldPictureUrl = user.profile_picture;
        if (!oldPictureUrl) throw new ProfilePictureNotFoundError();
        await fileService.deleteFileByUrl(oldPictureUrl);
        await user.update({ profile_picture: null });
        return user;
    }

    async deleteUser(id: number, password: string): Promise<void> {
        const isPasswordValid = await this.validatePassword(password, id);
        if (!isPasswordValid) { throw new InvalidCredentialsError('Incorrect password provided for account deletion.'); }

        const userToDelete = await this.userModel.findByPk(id); // Récupérer avec toutes les données pour l'email
        if (!userToDelete) throw new UserNotFoundError();

        if (this.authService) {
            try { await this.authService.revokeAllUserTokens(id); }
            catch (e) { console.error(`Failed to revoke tokens for deleted user ${id}`, e); }
        }

        const userEmail = userToDelete.email;
        await userToDelete.destroy(); // Suppression logique ou physique selon config Sequelize

        try { await this.notificationService.sendAccountDeletionConfirmation(userEmail); }
        catch (emailError) { console.error(`Failed to send account deletion confirmation to ${userEmail}:`, emailError); }
    }

    async validatePassword(password: string, userId: number): Promise<boolean> {
        const user = await this.userModel.findByPk(userId, { attributes: ['id', 'password'] });
        if (!user || !user.password) {
            console.warn(`[validatePassword] User ${userId} not found or has no password hash.`);
            return false;
        }
        return this._comparePassword(password, user.password);
    }

    async updatePassword(userId: number, newPassword: string): Promise<boolean> {
        const user = await this.userModel.findByPk(userId); // Récupérer l'instance complète pour update
        if (!user) throw new UserNotFoundError();

        const hash = await this._hashPassword(newPassword);
        await user.update({ password: hash, is_recovering: false }); // Mise à jour sans 'salt'

        if (this.authService) {
            try { await this.authService.revokeAllUserTokens(userId); }
            catch (revokeError) { console.error(`Failed to revoke tokens for user ${userId} after password update:`, revokeError); }
        } else { console.warn("AuthService not set in UserService, cannot revoke tokens after password update."); }
        return true;
    }

    async updateUserEmail(userId: number, data: UpdateEmailDto): Promise<User> {
        // La validation du mot de passe est faite dans le contrôleur avant d'appeler cette méthode
        const user = await this.userModel.findByPk(userId);
        if (!user) { throw new UserNotFoundError(); }

        if (user.email === data.newEmail) { return user; } // Pas de changement

        const existingUserWithNewEmail = await this.userModel.findOne({ where: { email: data.newEmail, id: { [Op.ne]: userId } }, attributes: ['id'] });
        if (existingUserWithNewEmail) { throw new DuplicateEmailError('This email address is already in use.'); }

        const newEmailCode = this._generateVerificationCode();
        const newEmailMasked = this._maskEmail(data.newEmail);

        try {
            await user.update({
                email: data.newEmail, email_masked: newEmailMasked,
                is_email_active: false,
                email_code: newEmailCode, email_code_requested_at: new Date()
            });
        } catch (dbError: any) {
            if (dbError.name === 'SequelizeUniqueConstraintError' && dbError.fields?.email) { throw new DuplicateEmailError('This email address is already in use.'); }
            console.error(`Database error updating email for user ${userId}:`, dbError);
            throw dbError;
        }

        try { await this.notificationService.sendEmailVerificationCode(data.newEmail, newEmailCode); }
        catch (notificationError) { console.error(`Failed to send verification email to ${data.newEmail}:`, notificationError); }

        // Retourner l'utilisateur avec les données mises à jour (mais potentiellement sans champs sensibles)
        return await this.getUserById(userId, { includeMeData: true }) ?? user; // Inclure les données pour Me DTO
    }

    async requestEmailVerification(userId: number): Promise<void> {
        const user = await this.userModel.findByPk(userId); // Récupérer pour obtenir l'email actuel
        if (!user) throw new UserNotFoundError();
        // Ne renvoyer que si l'email n'est PAS déjà actif
        if (user.is_email_active) {
            console.log(`Email for user ${userId} is already active. No verification needed.`);
            return;
        }
        const code = this._generateVerificationCode();
        await user.update({ email_code: code, email_code_requested_at: new Date() });
        try { await this.notificationService.sendEmailVerificationCode(user.email, code); }
        catch (error) { console.error(`Failed to send email verification code for user ${userId}:`, error); }
    }

    async verifyEmail(userId: number, code: string): Promise<User> {
        const user = await this.userModel.findByPk(userId, { attributes: { include: ['email_code', 'email_code_requested_at', 'is_email_active'] }});
        if (!user) throw new UserNotFoundError();
        if (user.is_email_active) return user; // Déjà actif

        if (!user.email_code || !user.email_code_requested_at || user.email_code !== code) {
            throw new VerificationCodeError('Invalid verification code');
        }
        if (this._isCodeExpired(user.email_code_requested_at)) {
            await user.update({ email_code: undefined, email_code_requested_at: undefined });
            throw new VerificationCodeError('Verification code expired');
        }

        await user.update({ is_email_active: true, email_code: undefined, email_code_requested_at: undefined });
        return user; // Retourne l'instance mise à jour
    }
}