---

# Documentation Technique : Module Gestion des Membres (v3.0)

## 1. Introduction et Objectifs du Module "Gestion des Membres"
    1.1. Vue d'Ensemble de la Fonctionnalité
        1.1.1. Positionnement dans l'Application Globale
        1.1.2. Bénéfices pour les Utilisateurs
    1.2. Buts et Cas d'Usage Principaux
        1.2.1. Pour l'Administrateur de l'Établissement (Propriétaire/Gérant)
            1.2.1.1. Inviter des collaborateurs (Staff).
            1.2.1.2. Gérer les rôles et statuts des membres.
            1.2.1.3. Retirer des membres de l'établissement.
            1.2.1.4. Assigner des membres à des services.
            1.2.1.5. Gérer les disponibilités spécifiques des membres.
        1.2.2. Pour le Membre (Staff)
            1.2.2.1. Accepter une invitation.
            1.2.2.2. Accéder aux informations et fonctionnalités autorisées de l'établissement.
            1.2.2.3. Gérer ses propres disponibilités (si la fonctionnalité est activée).
        1.2.3. Pour l'Utilisateur Invité (avant acceptation)
            1.2.3.1. S'inscrire ou se connecter pour accepter une invitation.

## 2. Architecture Générale et Flux Utilisateurs Clés
    2.1. Composants Techniques Majeurs Impliqués
        2.1.1. Modèles de Données (Référence Section 3)
        2.1.2. Services Backend (Référence Section 4)
        2.1.3. Endpoints API (Référence Section 5)
        2.1.4. Middlewares d'Authentification et d'Autorisation
    2.2. Flux d'Invitation et d'Acceptation d'un Membre
        2.2.1. Diagramme de Séquence Détaillé (Admin invite -> Email -> Utilisateur accepte/s'inscrit -> Activation)
        2.2.2. Étapes Clés et Interactions Techniques
            2.2.2.1. Initiation de l'Invitation par l'Admin
            2.2.2.2. Génération et Envoi de l'Email d'Invitation (avec Token)
            2.2.2.3. Gestion de la Page d'Acceptation Frontend
            2.2.2.4. Scénario d'Inscription via Invitation
            2.2.2.5. Scénario d'Activation après Connexion d'un Utilisateur Existant
            2.2.2.6. Notification de l'Admin post-acceptation
    2.3. Flux des Opérations CRUD sur un Membre par l'Administrateur
        2.3.1. Lister les Membres
        2.3.2. Consulter les Détails d'un Membre
        2.3.3. Modifier le Rôle ou le Statut d'un Membre
        2.3.4. Supprimer un Membre de l'Établissement

## 3. Modèles de Données et Relations (Schéma de Base de Données)
    3.1. Modèle `User`
        3.1.1. Colonnes Pertinentes (id, username, email, isActive, etc.)
        3.1.2. Relations avec `Membership` (One-to-Many)
    3.2. Modèle `Establishment`
        3.2.1. Colonnes Pertinentes (id, ownerId, name, etc.)
        3.2.2. Relations avec `Membership` (One-to-Many)
    3.3. Modèle `Membership` (Pivot Central)
        3.3.1. Définition Complète des Colonnes
            3.3.1.1. `id`: INTEGER (PK)
            3.3.1.2. `userId`: INTEGER (FK vers `Users`, nullable)
            3.3.1.3. `establishmentId`: INTEGER (FK vers `Establishments`)
            3.3.1.4. `role`: ENUM (`ADMIN`, `STAFF`)
            3.3.1.5. `status`: ENUM (`PENDING`, `ACTIVE`, `INACTIVE`, `REVOKED`)
            3.3.1.6. `invitedEmail`: VARCHAR (nullable)
            3.3.1.7. `invitationTokenHash`: VARCHAR (unique, nullable)
            3.3.1.8. `invitationTokenExpiresAt`: TIMESTAMPTZ (nullable)
            3.3.1.9. `joinedAt`: TIMESTAMPTZ (nullable)
            3.3.1.10. `createdAt`, `updatedAt`: TIMESTAMPTZ
        3.3.2. Index et Contraintes (Unique, FK, Contraintes Partielles)
        3.3.3. Relations Clés
            3.3.3.1. BelongsTo `User` (as 'user')
            3.3.3.2. BelongsTo `Establishment` (as 'establishment')
            3.3.3.3. HasMany `StaffAvailability` (as 'staffAvailabilities')
            3.3.3.4. BelongsToMany `Service` via `ServiceMemberAssignment` (as 'assignedServices')
            3.3.3.5. HasMany `Booking` (pour `assignedMembershipId`, as 'assignedBookings')
    3.4. Modèle `ServiceMemberAssignment` (Table de Jonction)
        3.4.1. Définition Complète des Colonnes (id, serviceId, membershipId, timestamps)
        3.4.2. Index et Contraintes (PK, FKs, Unique `serviceId`+`membershipId`)
        3.4.3. Relations avec `Service` et `Membership`
    3.5. Modèle `StaffAvailability` (Basé sur `rrule`)
        3.5.1. Définition Complète des Colonnes
            3.5.1.1. `id`: INTEGER (PK)
            3.5.1.2. `membershipId`: INTEGER (FK vers `Memberships`)
            3.5.1.3. `rruleString`: TEXT (RFC 5545)
            3.5.1.4. `durationMinutes`: INTEGER
            3.5.1.5. `effectiveStartDate`: DATE
            3.5.1.6. `effectiveEndDate`: DATE (nullable)
            3.5.1.7. `isWorking`: BOOLEAN
            3.5.1.8. `description`: VARCHAR (nullable)
            3.5.1.9. `createdAt`, `updatedAt`: TIMESTAMPTZ
        3.5.2. Index et Contraintes
        3.5.3. Relation avec `Membership`
    3.6. Modèle `Service` (Parties pertinentes)
        3.6.1. Relations avec `ServiceMemberAssignment`
    3.7. Modèle `Booking` (Parties pertinentes)
        3.7.1. Colonne `assignedMembershipId` (FK vers `Memberships`, nullable)
        3.7.2. Relation avec `Membership`

## 4. Logique Métier : Services Backend
    4.1. `MembershipService.ts`
        4.1.1. Rôle et Responsabilités Globales du Service
        4.1.2. Méthodes Publiques
            4.1.2.1. `inviteMember(inviterMembership, establishmentId, inviteDto)`
                4.1.2.1.1. Fonction: Création d'une invitation pour un email.
                4.1.2.1.2. Paramètres: `inviterMembership` (Membership de l'admin invitant), `establishmentId` (ID de l'établissement), `inviteDto` (`InviteMemberDto`).
                4.1.2.1.3. Retour: Promise<`Membership`> (instance PENDING).
                4.1.2.1.4. Logique Clé: Vérification permission invitant, unicité invitation/membre, génération/hashage token, création DB, appel `NotificationService`.
            4.1.2.2. `getInvitationDetails(plainToken)`
                4.1.2.2.1. Fonction: Valide un token d'invitation et retourne l'email associé.
                4.1.2.2.2. Paramètres: `plainToken` (string).
                4.1.2.2.3. Retour: Promise<{ `invitedEmail`: string }>.
                4.1.2.2.4. Logique Clé: Hashage token, recherche DB (PENDING, non expiré).
            4.1.2.3. `activateByToken(plainToken, userId)`
                4.1.2.3.1. Fonction: Active un membership PENDING en le liant à un utilisateur.
                4.1.2.3.2. Paramètres: `plainToken` (string), `userId` (number).
                4.1.2.3.3. Retour: Promise<`Membership`> (instance ACTIVE).
                4.1.2.3.4. Logique Clé: Validation token, vérification correspondance email (user vs invite), mise à jour DB (status, `userId`, nettoyage token).
            4.1.2.4. `notifyAdminsMemberJoined(activatedMembership)`
                4.1.2.4.1. Fonction: Notifie les admins d'un établissement qu'un nouveau membre a rejoint.
                4.1.2.4.2. Paramètres: `activatedMembership` (`MembershipAttributes`).
                4.1.2.4.3. Retour: Promise<void>.
                4.1.2.4.4. Logique Clé: Récupération des admins actifs, appel `NotificationService`.
            4.1.2.5. `getMembershipsByEstablishment(establishmentId, actorMembership)`
                4.1.2.5.1. Fonction: Récupère tous les memberships (tout statut) d'un établissement.
                4.1.2.5.2. Paramètres: `establishmentId` (number), `actorMembership` (`MembershipAttributes`).
                4.1.2.5.3. Retour: Promise<`Membership`[]>.
                4.1.2.5.4. Logique Clé: Requête DB avec inclusion des données utilisateur.
            4.1.2.6. `getMembershipById(membershipId, establishmentId, actorMembership)`
                4.1.2.6.1. Fonction: Récupère un membership spécifique.
                4.1.2.6.2. Paramètres: `membershipId` (number), `establishmentId` (number), `actorMembership` (`MembershipAttributes`).
                4.1.2.6.3. Retour: Promise<`Membership`>.
                4.1.2.6.4. Logique Clé: Vérification d'appartenance à l'établissement, autorisation (Admin ou soi-même).
            4.1.2.7. `updateMembership(membershipId, updateDto, actorMembership)`
                4.1.2.7.1. Fonction: Met à jour le statut ou le rôle d'un membership.
                4.1.2.7.2. Paramètres: `membershipId` (number), `updateDto` (`UpdateMembershipDto`), `actorMembership` (`MembershipAttributes`).
                4.1.2.7.3. Retour: Promise<`Membership`>.
                4.1.2.7.4. Logique Clé: Autorisation Admin, protection "dernier admin actif", protection "owner". Interdiction de modifier PENDING.
            4.1.2.8. `deleteMembership(membershipId, actorMembership)`
                4.1.2.8.1. Fonction: Supprime un membership (retire un membre ou annule une invitation).
                4.1.2.8.2. Paramètres: `membershipId` (number), `actorMembership` (`MembershipAttributes`).
                4.1.2.8.3. Retour: Promise<void>.
                4.1.2.8.4. Logique Clé: Autorisation Admin, protection "dernier admin".
    4.2. `AuthService.ts` (Fonctions liées à l'invitation)
        4.2.1. Rôle et Responsabilités (focus sur l'inscription via invitation)
        4.2.2. Méthodes Publiques
            4.2.2.1. `registerViaInvitation(registerDto, req?)`
                4.2.2.1.1. Fonction: Gère l'inscription d'un nouvel utilisateur suite à une invitation.
                4.2.2.1.2. Paramètres: `registerDto` (`RegisterViaInvitationDto`), `req` (optionnel).
                4.2.2.1.3. Retour: Promise<{ `tokens`: `AuthTokensDto`, `membership`: `MembershipAttributes` }>.
                4.2.2.1.4. Logique Clé: Appels à `MembershipService.getInvitationDetails`, `UserService.createUser`, `MembershipService.activateByToken`, `_generateAuthTokens`, `MembershipService.notifyAdminsMemberJoined`.
    4.3. `UserService.ts` (Fonctions liées à la création via invitation)
        4.3.1. Rôle et Responsabilités (focus sur `createUser` appelé par `AuthService`)
        4.3.2. Méthodes Publiques
            4.3.2.1. `createUser(userData)` (aspects pertinents si différents pour invite)
    4.4. `NotificationService.ts`
        4.4.1. Rôle et Responsabilités (envoi des emails transactionnels)
        4.4.2. Méthodes Publiques
            4.4.2.1. `sendInvitationEmail(toEmail, token, establishmentName, inviterName)`
                4.4.2.1.1. Fonction: Envoie l'email d'invitation.
                4.4.2.1.2. Paramètres: Destinataire, token clair, nom établissement, nom invitant.
                4.4.2.1.3. Retour: Promise<void>.
            4.4.2.2. `sendMemberJoinedNotification(adminEmail, newMemberUsername, establishmentName)`
                4.4.2.2.1. Fonction: Notifie un admin qu'un membre a rejoint.
                4.4.2.2.2. Paramètres: Email admin, username nouveau membre, nom établissement.
                4.4.2.2.3. Retour: Promise<void>.
    4.5. `AvailabilityService.ts` (Impact sur `getAvailability` pour Staff)
        4.5.1. Rôle et Responsabilités (calcul des disponibilités)
        4.5.2. Méthodes Publiques
            4.5.2.1. `getAvailability(params: { establishmentId, serviceId, dateRange, membershipId? })`
                4.5.2.1.1. Fonction: Calcule les créneaux disponibles.
                4.5.2.1.2. Paramètres: Inclut `membershipId` optionnel.
                4.5.2.1.3. Retour: Promise<`string`[]>.
                4.5.2.1.4. Logique Clé: Parsing des `rruleString` de `StaffAvailabilities` (si `membershipId` fourni), génération des occurrences, intersection avec dispo établissement, exclusion des réservations.

## 5. API : Contrôleurs et Endpoints
    5.1. `EstablishmentController.ts` (pour les routes imbriquées)
        5.1.1. Rôle: Gérer les opérations CRUD sur les memberships au sein d'un établissement spécifique.
        5.1.2. Méthodes de Contrôleur et Endpoints Associés
            5.1.2.1. `inviteMember` -> `POST /api/users/me/establishments/:establishmentId/memberships/invite`
            5.1.2.2. `getMemberships` -> `GET /api/users/me/establishments/:establishmentId/memberships`
            5.1.2.3. `getMembershipById` -> `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId`
    5.2. `MembershipController.ts` (pour les routes non imbriquées ou spécifiques à un membership)
        5.2.1. Rôle: Gérer les opérations sur un `Membership` spécifique (activation, détails token, modification, suppression).
        5.2.2. Méthodes de Contrôleur et Endpoints Associés
            5.2.2.1. `getInvitationDetails` -> `GET /api/memberships/invitation-details/:token`
            5.2.2.2. `activateAfterLogin` -> `POST /api/memberships/activate-after-login`
            5.2.2.3. `updateMembership` -> `PATCH /api/memberships/:membershipId`
            5.2.2.4. `deleteMembership` -> `DELETE /api/memberships/:membershipId`
    5.3. `AuthController.ts` (pour l'inscription via invitation)
        5.3.1. Rôle: Gérer l'authentification et la création de compte.
        5.3.2. Méthodes de Contrôleur et Endpoints Associés
            5.3.2.1. `registerViaInvitation` -> `POST /api/auth/register-via-invitation`
    5.4. Définition Détaillée des Routes API
        5.4.1. Routes d'Invitation et d'Acceptation
            5.4.1.1. `POST /api/users/me/establishments/:establishmentId/memberships/invite`
                5.4.1.1.1. Description: Inviter un utilisateur à rejoindre un établissement.
                5.4.1.1.2. Middlewares: `requireAuth`, `ensureMembership(['ADMIN'])`, `verifyCsrfToken`.
                5.4.1.1.3. Paramètres URL: `establishmentId` (number).
                5.4.1.1.4. Corps Requête: `InviteMemberDto`.
                5.4.1.1.5. Réponse Succès (201): `{ message: string, membership: MembershipDto (status PENDING) }`.
                5.4.1.1.6. Erreurs: 400 (DTO), 401, 403, 404 (Estab.), 409 (Conflit), 500.
            5.4.1.2. `GET /api/memberships/invitation-details/:token`
                5.4.1.2.1. Description: Valider un token d'invitation et récupérer l'email.
                5.4.1.2.2. Middlewares: Aucun (Publique).
                5.4.1.2.3. Paramètres URL: `token` (string).
                5.4.1.2.4. Corps Requête: Aucun.
                5.4.1.2.5. Réponse Succès (200): `InvitationDetailsDto`.
                5.4.1.2.6. Erreurs: 400 (Token format), 404 (Token invalide/expiré).
            5.4.1.3. `POST /api/auth/register-via-invitation`
                5.4.1.3.1. Description: Inscrire un nouvel utilisateur et accepter une invitation.
                5.4.1.3.2. Middlewares: Aucun (Publique).
                5.4.1.3.3. Paramètres URL: Aucun.
                5.4.1.3.4. Corps Requête: `RegisterViaInvitationDto`.
                5.4.1.3.5. Réponse Succès (201): `{ message: string, accessToken: string, membership: MembershipDto (status ACTIVE) }` (Cookies de session).
                5.4.1.3.6. Erreurs: 400 (DTO, Token), 409 (Conflit User), 500.
            5.4.1.4. `POST /api/memberships/activate-after-login`
                5.4.1.4.1. Description: Lier une invitation à un utilisateur existant après sa connexion.
                5.4.1.4.2. Middlewares: `requireAuth`.
                5.4.1.4.3. Paramètres URL: Aucun.
                5.4.1.4.4. Corps Requête: `ActivateMembershipDto`.
                5.4.1.4.5. Réponse Succès (200): `{ message: string, membership: MembershipDto (status ACTIVE) }`.
                5.4.1.4.6. Erreurs: 400 (DTO, Token, Email mismatch), 401, 500.
        5.4.2. Routes CRUD de Gestion des Membres (par Admin)
            5.4.2.1. `GET /api/users/me/establishments/:establishmentId/memberships`
                5.4.2.1.1. Description: Lister tous les membres d'un établissement.
                5.4.2.1.2. Middlewares: `requireAuth`, `ensureMembership(['ADMIN'])`.
                5.4.2.1.3. Paramètres URL: `establishmentId` (number).
                5.4.2.1.4. Corps Requête: Aucun.
                5.4.2.1.5. Réponse Succès (200): `MembershipDto[]`.
                5.4.2.1.6. Erreurs: 401, 403, 404 (Estab.).
            5.4.2.2. `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId`
                5.4.2.2.1. Description: Voir les détails d'un membre spécifique.
                5.4.2.2.2. Middlewares: `requireAuth`, `ensureAdminOrSelfForMembership`.
                5.4.2.2.3. Paramètres URL: `establishmentId` (number), `membershipId` (number).
                5.4.2.2.4. Corps Requête: Aucun.
                5.4.2.2.5. Réponse Succès (200): `MembershipDto`.
                5.4.2.2.6. Erreurs: 400 (ID invalide), 401, 403, 404 (Membership/Estab.).
            5.4.2.3. `PATCH /api/memberships/:membershipId`
                5.4.2.3.1. Description: Modifier le statut ou le rôle d'un membre.
                5.4.2.3.2. Middlewares: `requireAuth`, `ensureAdminOfTargetMembership`, `verifyCsrfToken`.
                5.4.2.3.3. Paramètres URL: `membershipId` (number).
                5.4.2.3.4. Corps Requête: `UpdateMembershipDto`.
                5.4.2.3.5. Réponse Succès (200): `MembershipDto` (mis à jour).
                5.4.2.3.6. Erreurs: 400 (DTO, Logique "dernier admin"), 401, 403, 404 (Membership).
            5.4.2.4. `DELETE /api/memberships/:membershipId`
                5.4.2.4.1. Description: Supprimer un membre d'un établissement (ou révoquer une invitation).
                5.4.2.4.2. Middlewares: `requireAuth`, `ensureAdminOfTargetMembership`, `verifyCsrfToken`.
                5.4.2.4.3. Paramètres URL: `membershipId` (number).
                5.4.2.4.4. Corps Requête: Aucun.
                5.4.2.4.5. Réponse Succès (204): Aucun contenu.
                5.4.2.4.6. Erreurs: 400 (Logique "dernier admin"), 401, 403, 404 (Membership).
        5.4.3. Routes CRUD de Gestion des Disponibilités Staff
            5.4.3.1. `POST /api/memberships/:membershipId/availabilities`
                5.4.3.1.1. Description: Créer une nouvelle règle de disponibilité `rrule` pour un membre.
                5.4.3.1.2. Middlewares: `requireAuth`, `ensureMembershipAccess`, `verifyCsrfToken`.
                5.4.3.1.3. Paramètres URL: `membershipId` (number).
                5.4.3.1.4. Corps Requête: `CreateStaffAvailabilityDto`.
                5.4.3.1.5. Réponse Succès (201): `StaffAvailabilityDto`.
                5.4.3.1.6. Erreurs: 400 (DTO), 401, 403, 404 (Membership).
            5.4.3.2. `GET /api/memberships/:membershipId/availabilities`
            5.4.3.3. `PUT /api/memberships/:membershipId/availabilities/:availabilityId`
            5.4.3.4. `DELETE /api/memberships/:membershipId/availabilities/:availabilityId`
                // (Structure similaire à POST pour les autres CRUD de StaffAvailability)

## 6. DTOs (Data Transfer Objects) Clés
    6.1. `InviteMemberDto` (Requête)
        6.1.1. Champs: `email` (string, email), `role` (enum `MembershipRole.STAFF`).
        6.1.2. Validation Zod.
    6.2. `InvitationDetailsDto` (Réponse)
        6.2.1. Champs: `invitedEmail` (string, email).
    6.3. `RegisterViaInvitationDto` (Requête)
        6.3.1. Champs: `username` (string), `password` (string), `token` (string).
        6.3.2. Validation Zod.
    6.4. `ActivateMembershipDto` (Requête)
        6.4.1. Champs: `token` (string).
    6.5. `MembershipDto` (Réponse)
        6.5.1. Champs: `id`, `establishmentId`, `role`, `status`, `joinedAt`, `createdAt`, `updatedAt`, `user` (object nullable avec `id`, `username`, `email`, `profilePictureUrl`), `invitedEmail` (string nullable).
        6.5.2. Mapper: `mapToMembershipDto`.
    6.6. `UpdateMembershipDto` (Requête)
        6.6.1. Champs: `status` (enum `MembershipStatus`, optionnel), `role` (enum `MembershipRole`, optionnel).
        6.6.2. Validation Zod (avec `.refine`).
    6.7. `StaffAvailabilityDto` (Réponse)
        6.7.1. Champs: `id`, `membershipId`, `rruleString`, `durationMinutes`, `effectiveStartDate`, `effectiveEndDate`, `isWorking`, `description`, `createdAt`, `updatedAt`.
    6.8. `CreateStaffAvailabilityDto` (Requête)
        6.8.1. Champs: `rruleString`, `durationMinutes`, `effectiveStartDate`, `effectiveEndDate?`, `isWorking`, `description?`.
    6.9. `UpdateStaffAvailabilityDto` (Requête)
        6.9.1. Champs: Optionnels de `CreateStaffAvailabilityDto`.

## 7. Workflow d'Invitation et d'Acceptation (Pas à Pas Détaillé)
    7.1. Étape 1: L'Admin initie l'invitation via l'UI.
        7.1.1. Frontend envoie `POST /api/users/me/establishments/:establishmentId/memberships/invite`.
    7.2. Étape 2: Backend (`MembershipService.inviteMember`)
        7.2.1. Valide la requête, génère token, crée `Membership` (PENDING).
        7.2.2. Appelle `NotificationService.sendInvitationEmail`.
    7.3. Étape 3: L'utilisateur reçoit l'email et clique sur le lien.
        7.3.1. Redirection vers `FRONTEND_URL/accept-invitation/:plainToken`.
    7.4. Étape 4: Page Frontend d'Acceptation
        7.4.1. Valide token via `GET /api/memberships/invitation-details/:token`.
        7.4.2. Affiche formulaire inscription (email pré-rempli) ou lien connexion.
    7.5. Étape 5a: Inscription via Invitation
        7.5.1. Frontend envoie `POST /api/auth/register-via-invitation`.
        7.5.2. Backend (`AuthService.registerViaInvitation`) crée `User`, active `Membership`, connecte user, notifie admins.
    7.6. Étape 5b: Activation après Connexion
        7.6.1. Utilisateur se connecte. Frontend détecte token d'invitation (stocké).
        7.6.2. Frontend envoie `POST /api/memberships/activate-after-login`.
        7.6.3. Backend (`MembershipService.activateByToken`) active `Membership`, notifie admins.
    7.7. Étape 6: Notifications
        7.7.1. L'Admin reçoit un email "Membre Rejoint".

## 8. Gestion des Permissions et Sécurité
    8.1. Rôles au sein d'un Établissement
        8.1.1. `ADMIN`: Capacités complètes sur les membres (inviter, CRUD, assigner), gestion établissement.
        8.1.2. `STAFF`: Accès limité, peut gérer ses propres disponibilités.
    8.2. Middlewares d'Autorisation Clés
        8.2.1. `ensureMembership(requiredRoles)`: Vérifie l'appartenance active et le rôle de l'acteur à l'établissement de la route.
        8.2.2. `ensureAdminOrSelfForMembership`: Pour la consultation d'un membership spécifique.
        8.2.3. `ensureAdminOfTargetMembership`: Pour la modification/suppression d'un membership.
        8.2.4. `ensureMembershipAccess`: Pour la gestion des disponibilités Staff.
    8.3. Logiques de Protection Spécifiques
        8.3.1. "Dernier Admin Actif" : Empêche la désactivation ou la dégradation du rôle.
        8.3.2. "Propriétaire de l'Établissement" : Empêche la dégradation du rôle du `owner_id`.
        8.3.3. "Dernier Admin" (Suppression) : Empêche la suppression.
    8.4. Sécurité des Tokens d'Invitation
        8.4.1. Génération (crypto, entropie).
        8.4.2. Stockage (hashé).
        8.4.3. Expiration.
        8.4.4. Nettoyage après utilisation.
        8.4.5. Vérification de la correspondance email lors de l'activation.

## 9. Annexe
    9.1. Exemples de Payloads JSON pour Requêtes API
        9.1.1. `InviteMemberDto`
        9.1.2. `RegisterViaInvitationDto`
        9.1.3. `UpdateMembershipDto`
        9.1.4. `CreateStaffAvailabilityDto`
    9.2. Variables d'Environnement Pertinentes
        9.2.1. `FRONTEND_URL` (pour les liens dans les emails)
        9.2.2. `INVITATION_TOKEN_EXPIRATION_DAYS` (si configurable)
    9.3. Considérations Futures / Améliorations Possibles
        9.3.1. Gestion des permissions plus fine (au-delà de ADMIN/STAFF).
        9.3.2. Audit logs pour les actions sur les membres.
        9.3.3. Possibilité pour un membre de quitter un établissement.

---
