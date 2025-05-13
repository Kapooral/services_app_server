J'ai terminé l'analyse approfondie de la documentation technique du module "Gestion des Membres". C'est un document très complet qui détaille bien les fonctionnalités, l'architecture, les modèles de données, les services, les API et les aspects de sécurité.

Pour vérifier l'alignement entre cette documentation et l'implémentation réelle, j'aurai besoin des fichiers de code source suivants. J'ai regroupé les demandes par catégorie et expliqué brièvement pourquoi chaque fichier ou groupe de fichiers est nécessaire.

**1. Modèles de Données (Sequelize) & Associations :**
*   **Localisation typique :** `src/models/`
*   **Fichiers demandés :**
    *   `user.model.ts` (ou `User.ts`): Pour vérifier la structure de l'entité `User` (Section 3.1) et ses relations.
    *   `establishment.model.ts` (ou `Establishment.ts`): Pour vérifier la structure de l'entité `Establishment` (Section 3.2) et ses relations.
    *   `membership.model.ts` (ou `Membership.ts`): Fichier central pour ce module, définissant l'entité `Membership`, ses attributs (invitations, rôles, statuts), et ses relations (Section 3.3).
    *   `service-member-assignment.model.ts` (ou `ServiceMemberAssignment.ts`): Pour la table de jonction entre `Service` et `Membership` (Section 3.4).
    *   `staff-availability.model.ts` (ou `StaffAvailability.ts`): Pour les règles de disponibilité (`rrule`) spécifiques aux membres (Section 3.5).
    *   `service.model.ts` (ou `Service.ts`): Pertinent pour vérifier les relations avec `Membership` via `ServiceMemberAssignment` (Section 3.6).
    *   `booking.model.ts` (ou `Booking.ts`): Pertinent pour vérifier la relation `assignedMembershipId` avec `Membership` (Section 3.7).
    *   `role.model.ts` / `user-role.model.ts` (si ces modèles existent et sont séparés) : Pour la gestion globale des rôles utilisateurs mentionnée en 2.1.1.
    *   `availability-rule.model.ts` & `availability-override.model.ts`: Nécessaires pour comprendre pleinement `AvailabilityService.ts` si celui-ci utilise ces modèles pour calculer la disponibilité de l'établissement avant de la croiser avec celle du staff (implicitement mentionné en 4.5.2.1.4, étape 2).
    *   `index.ts` (situé dans `src/models/` ou équivalent) : Ce fichier est **crucial** car il définit généralement les associations Sequelize (`hasMany`, `belongsTo`, `belongsToMany`, etc.) entre tous les modèles (référencé pour chaque relation dans la Section 3).

**2. Fichiers de Migration (Sequelize) :**
*   **Localisation typique :** `src/database/migrations/` ou `migrations/`
*   **Fichiers demandés :** Les fichiers de migration correspondant à la création et aux modifications des tables : `Users`, `Establishments`, `Memberships`, `ServiceMemberAssignments`, `StaffAvailabilities`.
    *   **Pourquoi :** Pour vérifier la mise en place correcte des colonnes, types, clés étrangères, index (ex: `idx_membership_user`, `idx_membership_establishment`, `idx_membership_status`) et contraintes uniques (ex: `unique_user_establishment`, `unique_pending_invited_email` sur `Memberships`) comme détaillé en Section 3.3.2.

**3. Services Backend :**
*   **Localisation typique :** `src/services/` ou `src/modules/{moduleName}/services/`
*   **Fichiers demandés :**
    *   `MembershipService.ts`: Service principal contenant la logique métier clé (invitations, activations, CRUD sur memberships, logiques de protection) décrite en Section 4.1.
    *   `AuthService.ts`: Pour vérifier l'implémentation de `registerViaInvitation` et la gestion de session associée, comme décrit en Section 4.2.
    *   `UserService.ts`: Pour vérifier la fonction `createUser` telle qu'utilisée dans le flux d'invitation (Section 4.3).
    *   `NotificationService.ts`: Pour vérifier l'envoi des emails transactionnels (invitation, membre rejoint) décrits en Section 4.4.
    *   `AvailabilityService.ts`: Pour vérifier comment les `StaffAvailability` et les règles `rrule` sont utilisées pour calculer les disponibilités (Section 4.5).

**4. Contrôleurs API :** (TODO)
*   **Localisation typique :** `src/controllers/` ou `src/modules/{moduleName}/controllers/`
*   **Fichiers demandés :**
    *   `EstablishmentController.ts`: Pour les endpoints gérant les actions sur les memberships imbriqués sous un établissement (Section 5.1).
    *   `MembershipController.ts`: Pour les endpoints gérant les actions spécifiques à un membership ou à l'activation d'invitations (Section 5.2 et 5.4.3).
    *   `AuthController.ts`: Pour l'endpoint `registerViaInvitation` (Section 5.3).
    *   (Optionnel) `StaffAvailabilityController.ts`: Si les routes CRUD pour les disponibilités (`/api/memberships/:membershipId/availabilities/...`) sont gérées par un contrôleur séparé et non dans `MembershipController.ts`.

**5. Fichiers de Routes API (Express) :**
*   **Localisation typique :** `src/routes/`, `src/api/routes/`, ou `src/modules/{moduleName}/routes/`
*   **Fichiers demandés :** Le(s) fichier(s) où les routes API listées en Section 2.1.3 et détaillées en Section 5.4 sont définies et associées à leurs contrôleurs et middlewares. Par exemple :
    *   `establishment.routes.ts` (ou similaire)
    *   `membership.routes.ts` (ou similaire, potentiellement incluant les routes de `staff-availability`)
    *   `auth.routes.ts` (ou similaire)

**6. Middlewares :**
*   **Localisation typique :** `src/middlewares/`
*   **Fichiers demandés :**
    *   Le fichier contenant le middleware `requireAuth.ts` (ou son implémentation).
    *   Le fichier contenant le middleware `verifyCsrfToken.ts` (ou son implémentation).
    *   Le(s) fichier(s) contenant les middlewares d'autorisation spécifiques décrits en Section 2.1.4 et 8.2 : `ensureMembership`, `ensureAdminOrSelfForMembership`, `ensureAdminOfTargetMembership`, `ensureMembershipAccess`. Ceux-ci pourraient être dans un fichier unique (ex: `authorization.middleware.ts`) ou des fichiers séparés.

**7. DTOs et Schémas de Validation (Zod) :**
*   **Localisation typique :** `src/dtos/`, `src/schemas/`, `src/validators/`, ou structurés par module (ex: `src/modules/membership/dtos/`).
*   **Fichiers demandés :** Les fichiers définissant les DTOs et les schémas Zod correspondants listés en Section 6 (ex: `InviteMemberDto.ts` et `InviteMemberSchema.ts`, `RegisterViaInvitationDto.ts` et `RegisterViaInvitationSchema.ts`, etc. pour tous les DTOs listés).

**8. Utilitaires / Helpers / Erreurs personnalisées :**
*   **Localisation typique :** `src/utils/`, `src/helpers/`, `src/mappers/`, `src/errors/`
*   **Fichiers demandés :**
    *   Le fichier contenant la fonction `mapToMembershipDto` (mentionnée en Section 6.5) si elle est externalisée.
    *   Le(s) fichier(s) où les erreurs personnalisées (ex: `UserAlreadyMemberError`, `InvitationTokenInvalidError`, `CannotUpdateLastAdminError`, etc.) sont définies.

**9. Configuration :**
*   **Fichiers demandés :** Le(s) fichier(s) où les variables d'environnement comme `FRONTEND_URL` et `INVITATION_TOKEN_EXPIRATION_DAYS` sont chargées et rendues accessibles au code (ex: `src/config/index.ts`).