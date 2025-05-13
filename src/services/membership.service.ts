// src/services/membership.service.ts
import {ModelCtor, Op, WhereOptions, Order, Includeable, FindOptions} from 'sequelize';
import crypto from 'crypto';
import db from '../models'; // Accès à tous les modèles via db
import User, { UserAttributes } from '../models/User';
import Establishment from '../models/Establishment';
import Membership, { MembershipStatus, MembershipRole, MembershipAttributes } from '../models/Membership';
import { InviteMemberDto, UpdateMembershipDto, GetMembershipsQueryDto } from '../dtos/membership.validation';
import { INotificationService } from './notification.service';
import { AppError } from '../errors/app.errors';
import { MembershipNotFoundError, InvitationTokenInvalidError, UserAlreadyMemberError, CannotUpdateLastAdminError, CannotDeleteLastAdminError } from '../errors/membership.errors';
import { UserNotFoundError, DuplicateEmailError } from '../errors/user.errors';
import { AuthorizationError } from '../errors/auth.errors';

const INVITATION_TOKEN_BYTES = 32;
const INVITATION_TOKEN_EXPIRATION_DAYS = 7;

export class MembershipService {
    private membershipModel: ModelCtor<Membership>;
    private userModel: ModelCtor<User>;
    private establishmentModel: ModelCtor<Establishment>;
    private notificationService: INotificationService;

    constructor(
        membershipModel: ModelCtor<Membership>,
        userModel: ModelCtor<User>,
        establishmentModel: ModelCtor<Establishment>,
        notificationService: INotificationService
    ) {
        this.membershipModel = membershipModel;
        this.userModel = userModel;
        this.establishmentModel = establishmentModel;
        this.notificationService = notificationService;
    }

    private _hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    async inviteMember(
        inviterMembership: MembershipAttributes,
        establishmentId: number,
        inviteDto: InviteMemberDto
    ): Promise<Membership> {
        const { email: invitedEmail, role } = inviteDto;
        console.log(`[inviteMember] START - Estab: ${establishmentId}, Invitee: ${invitedEmail}, Inviter: User ${inviterMembership.userId}`); // Log Entrée

        try { // Envelopper presque tout pour un meilleur suivi
            // 0. Vérif Permission (déjà faite dans le service, mais ok)
            if (inviterMembership.establishmentId !== establishmentId || inviterMembership.role !== MembershipRole.ADMIN) {
                console.warn(`[inviteMember] Permission check failed internally. Inviter Role: ${inviterMembership.role}, Inviter Estab: ${inviterMembership.establishmentId}, Target Estab: ${establishmentId}`);
                throw new AppError('Forbidden', 403, "You don't have permission to invite members to this establishment.");
            }

            // 1. Vérif User existant
            console.log(`[inviteMember] Checking existing user for email: ${invitedEmail}`);
            const existingUser = await this.userModel.findOne({ where: { email: invitedEmail }, attributes: ['id', 'username'] });
            console.log(`[inviteMember] Existing user check result: ${existingUser ? `ID ${existingUser.id}` : 'null'}`);

            // 2. Vérif Membership existant
            console.log(`[inviteMember] Checking existing membership for Estab ${establishmentId} and Email ${invitedEmail} or User ${existingUser?.id}`);
            const orConditions: any[] = [{ invitedEmail: invitedEmail, status: MembershipStatus.PENDING }];
            if (existingUser) {
                orConditions.push({ userId: existingUser.id, status: { [Op.in]: [MembershipStatus.ACTIVE, MembershipStatus.INACTIVE] } });
            }
            const existingMembership = await this.membershipModel.findOne({
                where: { establishmentId, [Op.or]: orConditions }
            });
            console.log(`[inviteMember] Existing membership check result: ${existingMembership ? `ID ${existingMembership.id}, Status ${existingMembership.status}` : 'null'}`);

            if (existingMembership) {
                if (existingMembership.status === MembershipStatus.PENDING) {
                    console.warn(`[inviteMember] Conflict: Pending invitation already exists for ${invitedEmail}`);
                    throw new UserAlreadyMemberError(`An invitation has already been sent to ${invitedEmail} for this establishment.`);
                } else {
                    console.warn(`[inviteMember] Conflict: User ${invitedEmail} (ID: ${existingUser?.id}) is already a member (Status: ${existingMembership.status})`);
                    throw new UserAlreadyMemberError(`${invitedEmail} is already a member of this establishment.`);
                }
            }

            // 3. Générer Token
            console.log(`[inviteMember] Generating invitation token...`);
            let plainInvitationToken: string;
            let hashedInvitationToken: string;
            try {
                plainInvitationToken = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString('hex');
                hashedInvitationToken = this._hashToken(plainInvitationToken);
            } catch (tokenError) {
                console.error("[inviteMember] CRITICAL: Failed to generate invitation token:", tokenError);
                throw new AppError('TokenGenerationFailed', 500, 'Could not generate a secure invitation token.');
            }
            const expiresAt = new Date(Date.now() + INVITATION_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
            console.log(`[inviteMember] Token generated. Expires: ${expiresAt.toISOString()}`);


            // 4. Créer Membership
            console.log(`[inviteMember] Creating PENDING membership record...`);
            let newMembership: Membership;
            try {
                newMembership = await this.membershipModel.create({
                    userId: existingUser?.id ?? null,
                    establishmentId,
                    role,
                    status: MembershipStatus.PENDING,
                    invitedEmail: invitedEmail,
                    invitationTokenHash: hashedInvitationToken,
                    invitationTokenExpiresAt: expiresAt,
                });
                console.log(`[inviteMember] Membership ${newMembership.id} created successfully.`);
            } catch (dbCreateError) {
                console.error(`[inviteMember] CRITICAL: Database error during membership creation:`, dbCreateError);
                // Remonter des erreurs spécifiques si possible (contraintes uniques...)
                if (dbCreateError instanceof AppError && dbCreateError.name === 'SequelizeUniqueConstraintError') {
                    // Devrait théoriquement être attrapé par la vérif précédente, mais sécurité en plus
                    console.warn(`[inviteMember] Unique constraint violation during create, likely race condition or logic flaw.`);
                    throw new UserAlreadyMemberError('This user or email is already associated with a membership or pending invitation.');
                }
                throw new AppError('DatabaseError', 500, 'Failed to save the invitation.'); // Erreur DB générique
            }


            // 5. Envoyer Email (dans un try/catch séparé pour ne pas bloquer)
            console.log(`[inviteMember] Attempting to send notification email...`);
            try {
                const establishment = await this.establishmentModel.findByPk(establishmentId, { attributes: ['name'] });
                const inviter = await this.userModel.findByPk(inviterMembership.userId!, { attributes: ['username'] });

                if (!establishment || !inviter) {
                    console.error(`[inviteMember] Could not find establishment ${establishmentId} or inviter user ${inviterMembership.userId} for notification.`);
                } else {
                    await this.notificationService.sendInvitationEmail(
                        invitedEmail,
                        plainInvitationToken, // Utiliser le token clair généré plus haut
                        establishment.name,
                        inviter.username
                    );
                    console.log(`[inviteMember] Invitation email supposedly sent to ${invitedEmail}.`);
                }
            } catch (emailError) {
                console.error(`[inviteMember] Failed to send invitation email to ${invitedEmail} for establishment ${establishmentId}. Error:`, emailError);
                // Loggé, mais on continue et on retourne le membership créé
            }

            // ** Ajout pour Test Uniquement (si nécessaire pour récupérer le token clair) **
            if (process.env.NODE_ENV === 'test') {
                (newMembership as any).plainInvitationToken = plainInvitationToken;
            }

            return newMembership;

        } catch (error) { // Catch global pour la fonction inviteMember
            console.error(`[inviteMember] UNHANDLED ERROR in inviteMember:`, error);
            // Remonter les erreurs AppError connues
            if (error instanceof AppError) { throw error; }
            // Pour toute autre erreur inattendue, lancer une erreur 500
            throw new AppError('InternalServerError', 500, 'An unexpected error occurred while processing the invitation.');
        }
    }

    async getInvitationDetails(plainToken: string): Promise<{ invitedEmail: string }> {
        const hashedToken = this._hashToken(plainToken);

        const membership = await this.membershipModel.findOne({
            where: {
                invitationTokenHash: hashedToken,
                status: MembershipStatus.PENDING,
                invitationTokenExpiresAt: { [Op.gt]: new Date() }
            },
            attributes: ['invitedEmail']
        });

        if (!membership || !membership.invitedEmail) {
            throw new InvitationTokenInvalidError("Invalid or expired invitation token.");
        }

        return { invitedEmail: membership.invitedEmail };
    }

    async activateByToken(plainToken: string, userId: number): Promise<Membership> {
        const hashedToken = this._hashToken(plainToken);

        const membership = await this.membershipModel.findOne({
            where: {
                invitationTokenHash: hashedToken,
                status: MembershipStatus.PENDING,
                invitationTokenExpiresAt: { [Op.gt]: new Date() }
            }
        });

        if (!membership) { throw new InvitationTokenInvalidError("Invalid or expired invitation token."); }

        // Vérifier que l'email de l'utilisateur correspond à l'email invité
        const user = await this.userModel.findByPk(userId, { attributes: ['email'] });
        if (!user) { throw new UserNotFoundError(`User ${userId} not found during activation.`); } // Should not happen if called after login/register

        if (user.email !== membership.invitedEmail) {
            console.warn(`Email mismatch during activation: User ${userId} (${user.email}) tried to accept invitation for ${membership.invitedEmail}`);
            throw new InvitationTokenInvalidError("Invitation was sent to a different email address.");
        }

        // Activer le membership
        await membership.update({
            userId: userId, // Lier l'utilisateur
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
            invitationTokenHash: null, // Nettoyer le token
            invitationTokenExpiresAt: null,
            invitedEmail: null // Nettoyer l'email invité
        });

        console.log(`Membership ${membership.id} activated for user ${userId} in establishment ${membership.establishmentId}.`);

        // Recharger pour obtenir les associations par défaut si nécessaire
        await membership.reload();
        return membership;
    }

    async notifyAdminsMemberJoined(activatedMembership: MembershipAttributes): Promise<void> {
        if (!activatedMembership.userId) {
            console.error(`Cannot notify admins: activated membership ${activatedMembership.id} has no userId.`);
            return;
        }
        try {
            const establishmentId = activatedMembership.establishmentId;
            const newMember = await this.userModel.findByPk(activatedMembership.userId, { attributes: ['username'] });
            const establishment = await this.establishmentModel.findByPk(establishmentId, { attributes: ['name'] });

            if (!newMember || !establishment) {
                console.error(`Could not find new member ${activatedMembership.userId} or establishment ${establishmentId} for admin notification.`);
                return;
            }

            const admins = await this.membershipModel.findAll({
                where: {
                    establishmentId: establishmentId,
                    role: MembershipRole.ADMIN,
                    status: MembershipStatus.ACTIVE // Ne notifier que les admins actifs
                },
                include: [{ model: this.userModel, as: 'user', attributes: ['email'], required: true }]
            });

            for (const adminMembership of admins) {
                if (adminMembership.user?.email) {
                    this.notificationService.sendMemberJoinedNotification(
                        adminMembership.user.email,
                        newMember.username,
                        establishment.name
                    ).catch(e => console.error(`Failed sending member joined notification to admin ${adminMembership.user?.email}:`, e));
                }
            }
        } catch (error) {
            console.error(`Failed to retrieve data for admin notification (Membership ID: ${activatedMembership.id}):`, error);
        }
    }

    /**
     * Récupère la liste des memberships pour un établissement donné.
     * Vérifie que l'appelant est ADMIN de cet établissement.
     */
    async getMembershipsByEstablishment(
        establishmentId: number,
        actorMembership: MembershipAttributes,
        queryOptions: GetMembershipsQueryDto
    ): Promise<{ rows: Membership[]; count: number; totalPages: number; currentPage: number }> {
        console.log(`[getMembershipsByEstablishment] Fetching memberships for establishment ${establishmentId}, requested by user ${actorMembership.userId}, query:`, queryOptions);

        const { page, limit, status: queryStatus, role, search, sortBy, sortOrder: querySortOrder } = queryOptions;
        const offset = (page - 1) * limit;

        const whereClausesForAnd: WhereOptions<MembershipAttributes>[] = [{ establishmentId }];

        if (queryStatus) { whereClausesForAnd.push({ status: queryStatus }); }
        else { whereClausesForAnd.push({ status: MembershipStatus.ACTIVE }); }

        if (role) { whereClausesForAnd.push({ role }); }

        if (search) {
            const searchTerm = `%${search}%`;
            const likeOperator = db.sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;

            const searchOrConditions: WhereOptions[] = [
                { '$user.username$': { [likeOperator]: searchTerm } },
                { '$user.email$': { [likeOperator]: searchTerm } },
                { invitedEmail: { [likeOperator]: searchTerm } }
            ];
            whereClausesForAnd.push({ [Op.or]: searchOrConditions });
        }

        const findOptions: FindOptions = {
            limit, offset,
            include: [],
            order: [],
            subQuery: false,
        };

        if (whereClausesForAnd.length > 1) {
            findOptions.where = { [Op.and]: whereClausesForAnd };
        } else if (whereClausesForAnd.length === 1) {
            findOptions.where = whereClausesForAnd[0];
        } else {
            findOptions.where = {};
        }

        const orderClause: Order = [];
        const sortDirection = querySortOrder || (['createdAt', 'joinedAt'].includes(sortBy) ? 'DESC' : 'ASC');
        switch (sortBy) {
            case 'username':
                orderClause.push([{ model: this.userModel, as: 'user' }, 'username', sortDirection]);
                break;
            case 'email':
                orderClause.push([{ model: this.userModel, as: 'user' }, 'email', sortDirection]);
                break;
            case 'joinedAt':
                orderClause.push([sortBy, sortDirection]);
                break;
        }
        orderClause.push(['id', 'ASC']);
        findOptions.order = orderClause

        const userInclude: Includeable = {
            model: this.userModel, as: 'user',
            attributes: ['id', 'username', 'email', 'profile_picture'], required: false,
        };
        findOptions.include = [userInclude]

        const { count, rows } = await this.membershipModel.findAndCountAll(findOptions);
        const totalPages = Math.ceil(count / limit);

        return { rows, count, totalPages, currentPage: page };
    }

    /**
     * Récupère les détails d'un membership spécifique au sein d'un établissement.
     * Vérifie que l'appelant est soit ADMIN de l'établissement, soit le propriétaire du membership demandé.
     */
    async getMembershipById(membershipId: number, establishmentId: number, actorMembership: MembershipAttributes): Promise<Membership> {
        console.log(`[getMembershipById] Fetching membership ${membershipId} for establishment ${establishmentId}, requested by user ${actorMembership.userId}`);

        const targetMembership = await this.membershipModel.findOne({
            where: {
                id: membershipId,
                establishmentId: establishmentId // Assure qu'il appartient au bon établissement
            },
            include: [{ // Inclure l'utilisateur pour l'affichage et la vérification
                model: this.userModel,
                as: 'user',
                attributes: ['id', 'username', 'email', 'profile_picture']
            }]
        });

        if (!targetMembership) {
            throw new MembershipNotFoundError(`Membership with ID ${membershipId} not found in establishment ${establishmentId}.`);
        }

        // Vérification d'autorisation : L'acteur est-il ADMIN de cet établissement OU est-ce son propre membership ?
        const isOwner = actorMembership.userId === targetMembership.userId;
        const isAdminOfThisEstablishment = actorMembership.role === MembershipRole.ADMIN && actorMembership.establishmentId === establishmentId;

        if (!isAdminOfThisEstablishment && !isOwner) {
            console.warn(`[getMembershipById] Authorization failed: User ${actorMembership.userId} (Role: ${actorMembership.role}) trying to access membership ${membershipId} owned by ${targetMembership.userId}`);
            throw new AuthorizationError("You do not have permission to view this membership.");
        }

        return targetMembership;
    }

    /**
     * Met à jour le statut et/ou le rôle d'un membership.
     * Vérifie que l'appelant est ADMIN de l'établissement concerné.
     * Empêche un admin de se dégrader ou de se désactiver s'il est le dernier admin actif.
     */
    async updateMembership(membershipId: number, updateDto: UpdateMembershipDto, actorMembership: MembershipAttributes): Promise<Membership> {
        console.log(`[updateMembership] Request to update membership ${membershipId} by user ${actorMembership.userId} with data:`, updateDto);

        const targetMembership = await this.membershipModel.findByPk(membershipId);
        if (!targetMembership) { throw new MembershipNotFoundError(); }

        if (targetMembership.status === MembershipStatus.PENDING) {
            console.warn(`[updateMembership] Attempt to modify PENDING membership ${membershipId} via PATCH.`);
            throw new AppError('CannotModifyPendingMembership', 400, 'Cannot directly update a PENDING membership status/role via this endpoint. Use invitation flow or revoke/re-invite.');
        }

        // 1. Vérification d'autorisation : L'acteur doit être ADMIN de l'établissement du membre cible.
        if (actorMembership.role !== MembershipRole.ADMIN || actorMembership.establishmentId !== targetMembership.establishmentId) {
            console.warn(`[updateMembership] Authorization failed: User ${actorMembership.userId} (Role: ${actorMembership.role}, Estab: ${actorMembership.establishmentId}) trying to update membership ${membershipId} in Estab ${targetMembership.establishmentId}`);
            throw new AuthorizationError("You do not have permission to update this membership.");
        }

        const { status: newStatus, role: newRole } = updateDto;
        const updates: Partial<MembershipAttributes> = {};
        let isUpdatingSelf = actorMembership.userId === targetMembership.userId;

        // 2. Logique de Protection "Seul Admin"
        if (isUpdatingSelf && targetMembership.role === MembershipRole.ADMIN) {
            // Compter les *autres* admins actifs dans l'établissement
            const otherActiveAdminsCount = await this.membershipModel.count({
                where: {
                    establishmentId: targetMembership.establishmentId,
                    role: MembershipRole.ADMIN,
                    status: MembershipStatus.ACTIVE,
                    id: { [Op.ne]: membershipId } // Exclure soi-même
                }
            });

            // Si on essaie de changer son rôle et qu'on est le seul admin actif
            if (newRole && newRole !== MembershipRole.ADMIN && otherActiveAdminsCount === 0) {
                console.warn(`[updateMembership] Prevented role change for last admin: User ${actorMembership.userId}`);
                throw new CannotUpdateLastAdminError("Cannot change the role of the last active administrator.");
            }
            // Si on essaie de se désactiver et qu'on est le seul admin actif
            if (newStatus === MembershipStatus.INACTIVE && otherActiveAdminsCount === 0) {
                console.warn(`[updateMembership] Prevented status change for last admin: User ${actorMembership.userId}`);
                throw new CannotUpdateLastAdminError("Cannot deactivate the last active administrator.");
            }
        }

        // 3. Préparer les mises à jour
        if (newStatus !== undefined && newStatus !== targetMembership.status) {
            updates.status = newStatus;
        }
        if (newRole !== undefined && newRole !== targetMembership.role) {
            // Vérification supplémentaire : Peut-on rétrograder le *propriétaire* de l'établissement ?
            // Pour l'instant, on suppose que le propriétaire a un membership ADMIN, mais il pourrait être bon
            // d'empêcher de changer le rôle du user dont l'ID est dans Establishment.owner_id.
            const establishment = await this.establishmentModel.findByPk(targetMembership.establishmentId, { attributes: ['owner_id']});
            if (establishment && establishment.owner_id === targetMembership.userId && newRole !== MembershipRole.ADMIN) {
                console.warn(`[updateMembership] Prevented role change for establishment owner: User ${targetMembership.userId}`);
                throw new CannotUpdateLastAdminError("Cannot change the role of the establishment owner.");
            }
            updates.role = newRole;
        }

        // 4. Appliquer la mise à jour si des changements sont nécessaires
        if (Object.keys(updates).length > 0) {
            console.log(`[updateMembership] Applying updates to membership ${membershipId}:`, updates);
            await targetMembership.update(updates);
            // Recharger pour avoir les données à jour (optionnel si .update retourne l'instance à jour)
            // await targetMembership.reload();
        } else {
            console.log(`[updateMembership] No effective changes for membership ${membershipId}.`);
        }

        return targetMembership;
    }

    /**
     * Supprime un membership (retire un membre d'un établissement).
     * Vérifie que l'appelant est ADMIN de l'établissement concerné.
     * Empêche un admin de se supprimer s'il est le dernier admin.
     */
    async deleteMembership(membershipId: number, actorMembership: MembershipAttributes): Promise<void> {
        console.log(`[deleteMembership] Request to delete membership ${membershipId} by user ${actorMembership.userId}`);

        const targetMembership = await this.membershipModel.findByPk(membershipId);
        if (!targetMembership) { throw new MembershipNotFoundError(); } // 404 si non trouvé

        // 1. Vérification d'autorisation : L'acteur doit être ADMIN de l'établissement du membre cible.
        if (actorMembership.role !== MembershipRole.ADMIN || actorMembership.establishmentId !== targetMembership.establishmentId) {
            console.warn(`[deleteMembership] Authorization failed: User ${actorMembership.userId} (Role: ${actorMembership.role}, Estab: ${actorMembership.establishmentId}) trying to delete membership ${membershipId} in Estab ${targetMembership.establishmentId}`);
            throw new AuthorizationError("You do not have permission to remove this member.");
        }

        // 2. Logique de Protection "Seul Admin"
        if (actorMembership.userId === targetMembership.userId && targetMembership.role === MembershipRole.ADMIN) {
            // Compter les *autres* admins (actifs ou inactifs)
            const otherAdminsCount = await this.membershipModel.count({
                where: {
                    establishmentId: targetMembership.establishmentId,
                    role: MembershipRole.ADMIN,
                    id: { [Op.ne]: membershipId } // Exclure soi-même
                }
            });

            if (otherAdminsCount === 0) {
                console.warn(`[deleteMembership] Prevented deletion of last admin: User ${actorMembership.userId}`);
                throw new CannotDeleteLastAdminError("Cannot remove the last administrator of the establishment.");
            }
        }

        // 3. Supprimer le membership
        // Note : Les dépendances (StaffAvailability, ServiceMemberAssignment) seront supprimées par CASCADE défini en BDD/modèle.
        // Les réservations assignées auront leur `assignedMembershipId` mis à NULL (ON DELETE SET NULL).
        console.log(`[deleteMembership] Proceeding with deletion of membership ${membershipId}`);
        await targetMembership.destroy();
        console.log(`[deleteMembership] Membership ${membershipId} deleted successfully.`);
    }
}