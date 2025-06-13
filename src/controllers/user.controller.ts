// src/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { fileService } from '../services/file.service';
import {
    CreateUserSchema, UpdateUserSchema, UpdateEmailSchema, RequestPasswordResetSchema,
    ValidateResetTokenSchema, UpdatePasswordSchema, DeleteAccountConfirmationSchema, PerformPasswordResetSchema,
    ActivateAccountSchema, mapToUserOutputDto, mapToMeOutputDto
} from '../dtos/user.validation';
import { UserNotFoundError, BadRequestError, InvalidCredentialsError, AuthenticationError } from '../errors/user.errors';
import { AppError } from '../errors/app.errors';
import { ZodError } from 'zod';

export class UserController {
    private userService: UserService;

    constructor(userService: UserService) {
        this.userService = userService;

        this.create = this.create.bind(this);
        this.activateAccount = this.activateAccount.bind(this);
        this.getMe = this.getMe.bind(this);
        this.getById = this.getById.bind(this);
        this.updateProfile = this.updateProfile.bind(this);
        this.updatePassword = this.updatePassword.bind(this);
        this.updateEmail = this.updateEmail.bind(this);
        this.delete = this.delete.bind(this);
        this.requestEmailVerification = this.requestEmailVerification.bind(this);
        this.requestPasswordReset = this.requestPasswordReset.bind(this);
        this.requestPasswordReset = this.requestPasswordReset.bind(this);
        this.validateResetToken = this.validateResetToken.bind(this);
        this.performPasswordReset = this.performPasswordReset.bind(this);
        this.updateProfilePicture = this.updateProfilePicture.bind(this);
        this.deleteProfilePicture = this.deleteProfilePicture.bind(this);
    }

    // POST /users
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const createUserDto = CreateUserSchema.parse(req.body);
            const newUser = await this.userService.createUser(createUserDto);
            const userOutput = mapToMeOutputDto(newUser);
            res.status(201).json(userOutput);
        } catch (error) {
            // Si ZodError, géré par le middleware d'erreur global
            // Si DuplicateEmail/Username, géré par le middleware d'erreur global
            // Passe toutes les erreurs au middleware suivant (le gestionnaire d'erreurs)
            next(error);
        }
    }

    // POST /users/activate-account
    async activateAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { token } = ActivateAccountSchema.parse(req.body);
            const activatedUser = await this.userService.activateUserAccount(token);
            const userOutput = mapToUserOutputDto(activatedUser.get({ plain: true }));
            res.status(200).json({ message: 'Account activated successfully.', user: userOutput });
        } catch (error) {
            next(error);
        }
    }

    // GET /users/me
    async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
        if (!req.user || typeof req.user.id !== 'number') {
            throw new AuthenticationError('Authentication failed or user ID not found in token payload.');
        }

        try {
            const user = await this.userService.getUserById(req.user.id, { includeMeData: true });
            if (!user) { throw new UserNotFoundError(); }
            const meOutput = mapToMeOutputDto(user);
            res.status(200).json(meOutput);
        } catch (error) {
            next(error);
        }
    }

    // GET /users/:id
    async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = parseInt(req.params.id, 10);
            if (isNaN(userId)) { throw new BadRequestError('Invalid user ID parameter') }
            const user = await this.userService.getUserById(userId);
            if (!user) { throw new UserNotFoundError() }
            const userOutput = mapToUserOutputDto(user);
            res.status(200).json(userOutput);
        } catch (error) {
            next(error);
        }
    }

    // PATCH /users/:id/profile
    async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = parseInt(req.params.id, 10);
            if (isNaN(userId)) { throw new BadRequestError('Invalid user ID parameter') }

            const updateUserDto = UpdateUserSchema.parse(req.body);
            if (Object.keys(updateUserDto).length === 0) { throw new BadRequestError('Request body cannot be empty for update') }

            const updatedUser = await this.userService.updateUserProfile(userId, updateUserDto);
            const userOutput = mapToUserOutputDto(updatedUser.get({ plain: true }));
            res.status(200).json(userOutput);
        } catch (error) {
            next(error);
        }
    }

    // PATCH /users/:id/password
    async updatePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {

            if (!req.user || typeof req.user.id !== 'number') { throw new AuthenticationError('Authentication required.'); }
            const authenticatedUserId = req.user.id;

            console.log('[UserController.updatePassword()] Request body : ', req.body)
            const { currentPassword, newPassword } = UpdatePasswordSchema.parse(req.body);

            const isCurrentPasswordValid = await this.userService.validatePassword(currentPassword, authenticatedUserId);
            if (!isCurrentPasswordValid) { throw new InvalidCredentialsError('Incorrect current password.'); }

            await this.userService.updatePassword(authenticatedUserId, newPassword);
            res.status(200).json({ message: 'Password updated successfully.' });

        } catch (error) {
            next(error);
        }
    }

    // PATCH /users/:id/email
    async updateEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') { throw new AuthenticationError('Authentication required.');}
            const authenticatedUserId = req.user.id;
            console.log('[UserController.updateEmail()] Request body : ', req.body)
            const updateEmailDto = UpdateEmailSchema.parse(req.body);

            const isCurrentPasswordValid = await this.userService.validatePassword(
                updateEmailDto.currentPassword, authenticatedUserId
            );
            if (!isCurrentPasswordValid) { throw new InvalidCredentialsError('Incorrect password.'); }

            const updatedUser = await this.userService.updateUserEmail(authenticatedUserId, updateEmailDto);
            const meOutput = mapToMeOutputDto(updatedUser);

            res.status(200).json({ message: 'Email update initiated. Please check your new email for verification.', user: meOutput });

        } catch (error) {
            next(error);
        }
    }

    // DELETE /users/:id
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') { throw new AuthenticationError('Authentication required.'); }
            const authenticatedUserId = req.user.id;
            const { password } = DeleteAccountConfirmationSchema.parse(req.body);
            await this.userService.deleteUser(authenticatedUserId, password)
            res.status(204).send();

        } catch (error) {
            next(error);
        }
    }

    // POST /users/:id/request-email-verification
    async requestEmailVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = parseInt(req.params.id, 10);
            if (isNaN(userId)) { throw new BadRequestError('Invalid user ID parameter') }
            // TODO: Vérification des permissions (ensureSelf)

            await this.userService.requestEmailVerification(userId);
            res.status(202).json({ message: "Email verification process initiated." });
        } catch (error) {
            next(error);
        }
    }

    // PATCH /users/:id/profile-picture
    async updateProfilePicture(req: Request, res: Response, next: NextFunction): Promise<void> {
        if (!req.user || typeof req.user.id !== 'number') {
            throw new AuthenticationError('Authentication failed or user ID not found in token payload.');
        }
        if (!req.file) {
            return next(new AppError('MissingFile', 400, 'No profile picture file uploaded.'));
        }

        try {
            const currentUser = await this.userService.getUserById(req.user.id, { includeSensitive: true });
            if (!currentUser) throw new UserNotFoundError();

            const oldPictureUrl = currentUser.profile_picture;
            const newPictureUrl = await fileService.saveProfilePicture(req.file, oldPictureUrl);
            await currentUser.update({ profile_picture: newPictureUrl });

            const updatedUser = await this.userService.getUserById(req.user.id, { includeMeData: true });
            if (!updatedUser) throw new UserNotFoundError();
            const meOutput = mapToMeOutputDto(updatedUser);

            res.status(200).json({ message: 'Profile picture updated successfully.', user: meOutput });
        } catch (error) {
            next(error);
        }
    }

    // DELETE /users/:id/profile-picture
    async deleteProfilePicture(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') { throw new AuthenticationError('Authentication required.'); }

            const user = await this.userService.deleteProfilePicture(req.user.id);
            const meOutput = mapToMeOutputDto(user);

            res.status(200).json({ message: 'Profile picture removed successfully.', user: meOutput });
        } catch (error) {
            next(error);
        }
    }

    // POST /users/request-password-reset
    async requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { email } = RequestPasswordResetSchema.parse(req.body);

            try {
                await this.userService.initiatePasswordRecovery(email);
            } catch (innerError) {
                if (!(innerError instanceof UserNotFoundError)) {
                    console.error("[UserController.requestPasswordReset] Internal error during recovery initiation:", innerError);
                }
            }

            res.status(202).json({ message: "If an account with this email exists, a password reset link has been sent." });

        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({
                    message: "Validation failed",
                    errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
                });
            }

            next(error);
        }
    }

    // POST /users/validate-reset-token
    async validateResetToken(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { token } = ValidateResetTokenSchema.parse(req.body);
            const result = await this.userService.validatePasswordResetToken(token);
            if (!result.valid) {
                throw new AppError('InvalidOrExpiredToken', 400, result.error || 'Invalid or expired token.');
            }
            res.status(200).json({ message: 'Token is valid.' });
        } catch (error) {
            next(error);
        }
    }

    // POST /users/perform-password-reset
    async performPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { token, newPassword } = PerformPasswordResetSchema.parse(req.body);
            await this.userService.performPasswordReset(token, newPassword);
            res.status(200).json({ message: "Password has been reset successfully." });
        } catch (error) {
            next(error);
        }
    }
}