**Documentation Technique du Module - Gestion de Planning (APP_NAME)**

**Fonctionnalité Initiale : Gestion des Demandes de Congés/Absences**

**Version:** 0.1 (Date: [Date Actuelle])

**Table des Matières (Partielle pour cette fonctionnalité)**

1.  Introduction et Objectifs
2.  Modèles de Données et Relations
3.  Logique Métier : Services Backend
4.  API : Contrôleurs et Endpoints
5.  DTOs (Data Transfer Objects) et Validation (Zod)
6.  Middlewares d'Autorisation Spécifiques
7.  Workflow des Demandes de Congés
8.  Gestion des Erreurs Spécifiques
9.  Annexe

---

**1. Introduction et Objectifs**

Ce document détaille l'architecture technique, les composants, les flux de données et les mécanismes de sécurité pour la fonctionnalité de "Gestion des Demandes de Congés/Absences" au sein du module "Gestion de Planning" de l'application "APP_NAME". Cette fonctionnalité s'intègre à l'écosystème backend existant, en tirant parti de ses services d'authentification, de gestion des membres et de calcul de disponibilité.

*   **1.1. Vue d'Ensemble de la Fonctionnalité**
    La fonctionnalité de gestion des demandes de congés permet aux membres du personnel (`Staff`) d'un établissement de soumettre des requêtes pour des périodes d'absence (congés payés, maladie, etc.). Les administrateurs (`Admin`) de l'établissement peuvent ensuite examiner ces demandes, les approuver, les rejeter, ou les annuler. Une fois qu'une demande de congé est approuvée, elle impacte directement la disponibilité calculée du membre concerné, le rendant indisponible pour des réservations pendant la période approuvée. Ce système vise à centraliser et rationaliser la gestion des absences du personnel, en assurant une mise à jour automatique des plannings.

*   **1.2. Cas d'Usage Principaux**

    *   **Pour le Membre du Personnel (Staff) :**
        *   Soumettre une nouvelle demande de congé/absence en spécifiant le type, les dates de début et de fin, et une raison optionnelle.
        *   Consulter la liste de ses propres demandes de congés avec leur statut actuel.
        *   Annuler une de ses propres demandes de congé si elle est encore en statut `PENDING`.
        *   Recevoir des notifications lorsque sa demande est traitée (approuvée/rejetée) ou annulée par un administrateur.

    *   **Pour l'Administrateur de l'Établissement (Admin) :**
        *   Consulter la liste de toutes les demandes de congés pour tous les membres de son établissement, avec des options de filtrage et de tri.
        *   Consulter les détails d'une demande de congé spécifique.
        *   Approuver ou rejeter une demande de congé en statut `PENDING`, avec la possibilité d'ajouter des notes.
        *   Annuler une demande de congé (qu'elle soit `PENDING` ou `APPROVED`).
        *   Recevoir des notifications lorsqu'un membre soumet une nouvelle demande de congé ou annule une demande existante.

---
**2. Modèles de Données et Relations**

Cette section décrit le nouveau modèle de données introduit pour la gestion des demandes de congés, ainsi que les modèles existants avec lesquels il interagit.

*   **2.1. Nouveau Modèle : `TimeOffRequest`**
    Le modèle `TimeOffRequest` est l'entité centrale pour cette fonctionnalité. Il stocke toutes les informations relatives à une demande d'absence soumise par un membre du personnel.

    *   **2.1.1. Définition Complète des Colonnes**

        | Nom de la Colonne (BDD: `snake_case`) | Type de Données (Sequelize/SQL)                 | Contraintes/Options                                                                 | Description Détaillée du Rôle                                                                                                                                      |
                |---------------------------------------|-------------------------------------------------|-------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
        | `id`                                  | `DataTypes.INTEGER.UNSIGNED`                    | PK, AutoIncrement, NOT NULL                                                         | Identifiant unique de la demande de congé.                                                                                                                          |
        | `membership_id`                       | `DataTypes.INTEGER.UNSIGNED`                    | FK vers `memberships.id`, NOT NULL, `ON DELETE CASCADE`                             | Référence le `Membership` du membre du personnel qui a soumis la demande. Si le membre est supprimé, ses demandes de congé le sont aussi.                          |
        | `establishment_id`                    | `DataTypes.INTEGER.UNSIGNED`                    | FK vers `establishments.id`, NOT NULL, `ON DELETE CASCADE`                          | Référence l'établissement auquel cette demande de congé est rattachée.                                                                                              |
        | `type`                                | `DataTypes.ENUM('PAID_LEAVE', 'UNPAID_LEAVE', 'SICK_LEAVE', 'OTHER')` | `NOT NULL`                                                          | Type de congé demandé. Valeurs issues de l'enum `TimeOffRequestType`.                                                                                                |
        | `start_date`                          | `DataTypes.DATEONLY`                            | `NOT NULL`                                                                          | Date de début du congé (format `YYYY-MM-DD`). Inclusive.                                                                                                               |
        | `end_date`                            | `DataTypes.DATEONLY`                            | `NOT NULL`                                                                          | Date de fin du congé (format `YYYY-MM-DD`). Inclusive.                                                                                                                 |
        | `reason`                              | `DataTypes.TEXT`                                | `NULLABLE`                                                                          | Raison ou détails supplémentaires fournis par le demandeur.                                                                                                         |
        | `status`                              | `DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED_BY_MEMBER', 'CANCELLED_BY_ADMIN')` | `NOT NULL`, `Default: 'PENDING'`              | Statut actuel de la demande. Valeurs issues de l'enum `TimeOffRequestStatus`.                                                                                        |
        | `admin_notes`                         | `DataTypes.TEXT`                                | `NULLABLE`                                                                          | Notes ajoutées par l'administrateur lors du traitement de la demande (approbation/rejet).                                                                        |
        | `processed_by_membership_id`          | `DataTypes.INTEGER.UNSIGNED`                    | FK vers `memberships.id`, `NULLABLE`, `ON DELETE SET NULL`                          | Référence le `Membership` de l'administrateur qui a traité (approuvé/rejeté) la demande. `NULL` si non encore traitée ou si l'admin est supprimé.                |
        | `cancelled_by_membership_id`          | `DataTypes.INTEGER.UNSIGNED`                    | FK vers `memberships.id`, `NULLABLE`, `ON DELETE SET NULL`                          | Référence le `Membership` de l'acteur (membre ou admin) qui a annulé la demande. `NULL` si non annulée ou si l'acteur est supprimé.                          |
        | `cancellation_reason`                 | `DataTypes.TEXT`                                | `NULLABLE`                                                                          | Raison fournie lors de l'annulation de la demande.                                                                                                                  |
        | `created_at`                          | `DataTypes.DATE`                                | `NOT NULL`                                                                          | Date et heure de création de la demande.                                                                                                                            |
        | `updated_at`                          | `DataTypes.DATE`                                | `NOT NULL`                                                                          | Date et heure de la dernière modification de la demande.                                                                                                          |

    *   **Enums Spécifiques :**
        *   `TimeOffRequestType`: Définit les types de congés possibles.
            ```typescript
            export enum TimeOffRequestType {
                PAID_LEAVE = 'PAID_LEAVE',
                UNPAID_LEAVE = 'UNPAID_LEAVE',
                SICK_LEAVE = 'SICK_LEAVE',
                OTHER = 'OTHER'
            }
            ```
        *   `TimeOffRequestStatus`: Définit les statuts possibles d'une demande de congé.
            ```typescript
            export enum TimeOffRequestStatus {
                PENDING = 'PENDING',
                APPROVED = 'APPROVED',
                REJECTED = 'REJECTED',
                CANCELLED_BY_MEMBER = 'CANCELLED_BY_MEMBER',
                CANCELLED_BY_ADMIN = 'CANCELLED_BY_ADMIN'
            }
            ```

    *   **2.1.2. Index et Contraintes**
        *   PK sur `id`.
        *   Index sur `membership_id` pour une recherche rapide des demandes d'un membre.
        *   Index sur `establishment_id` pour lister les demandes d'un établissement.
        *   Index sur `status` pour filtrer par statut.
        *   Index sur (`start_date`, `end_date`) pour les requêtes basées sur des plages de dates.
        *   FK `membership_id` référence `memberships(id)` avec `ON DELETE CASCADE`.
        *   FK `establishment_id` référence `establishments(id)` avec `ON DELETE CASCADE`.
        *   FK `processed_by_membership_id` référence `memberships(id)` avec `ON DELETE SET NULL`.
        *   FK `cancelled_by_membership_id` référence `memberships(id)` avec `ON DELETE SET NULL`.

    *   **2.1.3. Relations avec `Membership` et `Establishment` (définies dans `src/models/index.ts`)**
        *   **`TimeOffRequest.belongsTo(Membership, { as: 'requestingMember', foreignKey: 'membershipId' })`**: Chaque demande appartient au membre qui l'a soumise.
        *   **`TimeOffRequest.belongsTo(Establishment, { as: 'establishment', foreignKey: 'establishmentId' })`**: Chaque demande est associée à un établissement.
        *   **`TimeOffRequest.belongsTo(Membership, { as: 'processingAdmin', foreignKey: 'processedByMembershipId' })`**: Une demande peut être traitée par un administrateur.
        *   **`TimeOffRequest.belongsTo(Membership, { as: 'cancellingActor', foreignKey: 'cancelledByMembershipId' })`**: Une demande peut être annulée par un acteur (membre ou admin).
        *   Les associations inverses (`Membership.hasMany(TimeOffRequest, ...)` et `Establishment.hasMany(TimeOffRequest, ...)`) sont également définies pour faciliter les requêtes.

*   **2.2. Modèles Existants Pertinents**
    *   **`Membership.ts`**: Le modèle `Membership` est crucial. Il représente le lien entre un `User` et un `Establishment`, avec un `role` (`ADMIN`, `STAFF`) et un `status` (`PENDING`, `ACTIVE`, `INACTIVE`, `REVOKED`). Une `TimeOffRequest` est toujours initiée par un `Membership` actif.
    *   **`Establishment.ts`**: Le modèle `Establishment` est référencé pour lier la demande à un contexte organisationnel. Son attribut `timezone` est essentiel pour l'interprétation correcte des `startDate` et `endDate` lors des calculs de disponibilité.
    *   **`User.ts`**: Le modèle `User` contient les informations de l'utilisateur (comme `username`, `email`) qui sont utiles pour les notifications et l'affichage des informations du demandeur ou de l'admin.

---
**3. Logique Métier : Services Backend**

Cette section détaille les services responsables de la logique métier pour la gestion des demandes de congés.

*   **3.1. Nouveau Service : `TimeOffRequestService.ts`**

    *   **3.1.1. Rôle et Responsabilités Globales**
        Le `TimeOffRequestService` encapsule toute la logique métier liée à la création, la lecture, la mise à jour (traitement, annulation) et la suppression (si applicable, bien que l'annulation soit la suppression logique ici) des demandes de congés/absences. Il interagit avec les modèles de données `TimeOffRequest`, `Membership`, `User` et `Establishment`. Il est également responsable de l'orchestration des notifications via le `NotificationService` lors des événements clés du cycle de vie d'une demande.

    *   **3.1.2. Méthodes Publiques**

        *   **`createTimeOffRequest(dto: CreateTimeOffRequestDto, actorMembership: MembershipAttributes): Promise<TimeOffRequestAttributes>`**
            *   **Fonction :** Crée une nouvelle demande de congé pour le membre (`actorMembership`). Le `membershipId` de la demande est celui de l'`actorMembership`.
            *   **Paramètres :**
                *   `dto: CreateTimeOffRequestDto`: Contient le type, les dates de début/fin, et la raison.
                *   `actorMembership: MembershipAttributes`: Le `Membership` de l'utilisateur qui soumet la demande. Utilisé pour déterminer `membershipId` et `establishmentId` de la demande.
            *   **Retour :** `Promise<TimeOffRequestAttributes>` - La demande de congé nouvellement créée.
            *   **Logique Clé et Validations :**
                1.  Vérifie que `actorMembership` a un `establishmentId` et `userId` valides.
                2.  Valide que `endDate` n'est pas antérieure à `startDate`.
                3.  Vérifie les chevauchements : s'assure qu'aucune autre demande `PENDING` ou `APPROVED` n'existe déjà pour ce membre sur les dates demandées. Lève `TimeOffRequestInvalidActionError` si un chevauchement est détecté.
                4.  Crée l'enregistrement `TimeOffRequest` avec le statut initial `PENDING`.
                5.  Récupère les informations du `requestingUser` (via `actorMembership.userId`) et de l'`establishment`.
                6.  Récupère les `Membership`s `ADMIN` actifs de l'établissement.
                7.  Pour chaque admin, appelle `NotificationService.sendTimeOffRequestSubmittedNotification`.
                *   *Note sur l'implémentation fournie vs plan :* La documentation est basée sur l'hypothèse que si un Admin crée une demande via une route où le `:membershipId` (target) est différent de son propre `membershipId` (actor), la demande est quand même pour le `targetMembershipId`. Le service `createTimeOffRequest` actuel utilise `actorMembership.id` comme `membershipId` de la demande. Pour la route `POST /api/memberships/:membershipId/time-off-requests`, cela implique que `:membershipId` dans l'URL doit être celui de l'acteur. Si un admin veut créer une demande *pour un autre membre*, une méthode de service distincte ou une adaptation de celle-ci serait nécessaire, où le `targetMembershipId` serait un paramètre explicite. Pour l'instant, on assume que l'acteur crée pour lui-même.*

        *   **`getTimeOffRequestById(requestId: number): Promise<TimeOffRequestAttributes>`**
            *   **Fonction :** Récupère les détails d'une demande de congé spécifique par son ID. L'accès à cette demande (par le demandeur ou un admin) est vérifié par les middlewares en amont.
            *   **Paramètres :**
                *   `requestId: number`: L'ID de la demande de congé.
            *   **Retour :** `Promise<TimeOffRequestAttributes>` - Les détails de la demande.
            *   **Logique Clé et Validations :**
                1.  Trouve la `TimeOffRequest` par son `id`.
                2.  Inclut les associations `requestingMember`, `processingAdmin`, et `cancellingActor` (avec leurs `User` respectifs) pour un affichage complet.
                3.  Lève `TimeOffRequestNotFoundError` si la demande n'est pas trouvée.

        *   **`listTimeOffRequestsForMember(establishmentId: number, targetMembershipId: number, queryDto: ListTimeOffRequestsQueryDto): Promise<PaginationDto<TimeOffRequestAttributes>>`**
            *   **Fonction :** Liste les demandes de congés pour un membre spécifique (`targetMembershipId`) au sein d'un établissement donné, avec pagination et filtrage. L'accès (par le membre lui-même ou un admin de l'établissement) est vérifié par les middlewares.
            *   **Paramètres :**
                *   `establishmentId: number`: L'ID de l'établissement.
                *   `targetMembershipId: number`: L'ID du `Membership` dont on veut lister les demandes.
                *   `queryDto: ListTimeOffRequestsQueryDto`: Contient les paramètres de pagination (`page`, `limit`), de filtrage (`status`), et de tri (`sortBy`, `sortOrder`).
            *   **Retour :** `Promise<PaginationDto<TimeOffRequestAttributes>>` - Un objet contenant les données paginées et les informations de pagination.
            *   **Logique Clé et Validations :**
                1.  Construit les conditions `WHERE` basées sur `establishmentId`, `targetMembershipId`, et le `status` optionnel.
                2.  Effectue une requête `findAndCountAll` avec `limit`, `offset`, et `order`.
                3.  Inclut les associations `requestingMember` et `processingAdmin` (avec leurs `User`).
                4.  Utilise `createPaginationResult` pour formater la réponse.

        *   **`listTimeOffRequestsForEstablishment(establishmentId: number, queryDto: ListAllTimeOffRequestsForEstablishmentQueryDto): Promise<PaginationDto<TimeOffRequestAttributes>>`**
            *   **Fonction :** Liste toutes les demandes de congés pour un établissement donné, avec des options de filtrage étendues (statut, type, membre spécifique, plage de dates) et pagination. Réservé aux administrateurs de l'établissement (vérifié par middleware).
            *   **Paramètres :**
                *   `establishmentId: number`: L'ID de l'établissement.
                *   `queryDto: ListAllTimeOffRequestsForEstablishmentQueryDto`: Contient les paramètres de pagination, de filtrage (par `status`, `type`, `membershipId`, `dateRangeStart`, `dateRangeEnd`), et de tri.
            *   **Retour :** `Promise<PaginationDto<TimeOffRequestAttributes>>` - Données paginées et informations de pagination.
            *   **Logique Clé et Validations :**
                1.  Valide que si `dateRangeStart` ou `dateRangeEnd` est fourni, l'autre l'est aussi, et que `dateRangeEnd` >= `dateRangeStart`.
                2.  Construit les conditions `WHERE` basées sur `establishmentId` et les filtres optionnels. Pour la plage de dates, utilise `startDate <= dateRangeEnd` et `endDate >= dateRangeStart` pour trouver les demandes qui chevauchent la plage.
                3.  Effectue `findAndCountAll` avec `limit`, `offset`, `order`, et inclut les associations `requestingMember`, `processingAdmin`, `cancellingActor`.
                4.  Formate la réponse avec `createPaginationResult`.

        *   **`processTimeOffRequest(requestId: number, dto: ProcessTimeOffRequestDto, actorMembership: MembershipAttributes): Promise<TimeOffRequestAttributes>`**
            *   **Fonction :** Permet à un administrateur (`actorMembership`) de traiter (approuver ou rejeter) une demande de congé.
            *   **Paramètres :**
                *   `requestId: number`: L'ID de la demande à traiter.
                *   `dto: ProcessTimeOffRequestDto`: Contient le nouveau `status` (`APPROVED` ou `REJECTED`) et les `adminNotes` optionnelles.
                *   `actorMembership: MembershipAttributes`: Le `Membership` de l'administrateur qui effectue l'action.
            *   **Retour :** `Promise<TimeOffRequestAttributes>` - La demande de congé mise à jour.
            *   **Logique Clé et Validations :**
                1.  Récupère la `TimeOffRequest` par `requestId`. Lève `TimeOffRequestNotFoundError` si non trouvée.
                2.  Vérifie que le statut actuel de la demande est `PENDING`. Lève `TimeOffRequestInvalidActionError` sinon.
                3.  Vérifie que l'`establishmentId` de la demande correspond à celui de l'`actorMembership` (admin). Lève `AppError('Forbidden', ...)` sinon.
                4.  Met à jour le `status` de la demande, les `adminNotes`, et `processedByMembershipId` avec l'ID de l'`actorMembership`.
                5.  Sauvegarde les modifications.
                6.  Récupère les informations du `requestingMember` (celui qui a fait la demande) et de son `establishment`.
                7.  Appelle `NotificationService.sendTimeOffRequestProcessedNotification` pour informer le membre du traitement de sa demande.

        *   **`cancelTimeOffRequest(requestId: number, dto: CancelTimeOffRequestDto, actorMembership: MembershipAttributes): Promise<TimeOffRequestAttributes>`**
            *   **Fonction :** Permet d'annuler une demande de congé. Les conditions d'annulation dépendent du statut de la demande et du rôle de l'acteur.
            *   **Paramètres :**
                *   `requestId: number`: L'ID de la demande à annuler.
                *   `dto: CancelTimeOffRequestDto`: Contient la `cancellationReason` optionnelle.
                *   `actorMembership: MembershipAttributes`: Le `Membership` de l'acteur qui effectue l'annulation (membre ou admin).
            *   **Retour :** `Promise<TimeOffRequestAttributes>` - La demande de congé annulée.
            *   **Logique Clé et Validations :**
                1.  Récupère la `TimeOffRequest` par `requestId`. Lève `TimeOffRequestNotFoundError` si non trouvée.
                2.  Détermine si l'acteur est le propriétaire de la demande (`isOwner`) ou un administrateur de l'établissement de la demande (`isAdmin`).
                3.  Logique de transition de statut :
                    *   Si `isOwner` ET le statut actuel est `PENDING` : le nouveau statut devient `CANCELLED_BY_MEMBER`.
                    *   Si `isAdmin` ET le statut actuel est `PENDING` OU `APPROVED` : le nouveau statut devient `CANCELLED_BY_ADMIN`.
                    *   Sinon, lève `TimeOffRequestInvalidActionError` (ex: le membre essaie d'annuler une demande déjà approuvée, ou un admin essaie d'annuler une demande déjà rejetée).
                4.  Met à jour le `status` de la demande, `cancellationReason`, et `cancelledByMembershipId` avec l'ID de l'`actorMembership`.
                5.  Sauvegarde les modifications.
                6.  Notification :
                    *   Si le membre annule (`isOwner`), notifie les administrateurs de l'établissement via `NotificationService.sendTimeOffRequestCancelledByMemberNotification`.
                    *   Si l'admin annule (`isAdmin`), notifie le membre demandeur via `NotificationService.sendTimeOffRequestCancelledByAdminNotification`.

*   **3.2. Modifications Service Existant : `AvailabilityService.ts`**

    *   **3.2.1. Intégration des Congés Approuvés dans `isMemberAvailableForSlot`**
        La méthode `isMemberAvailableForSlot` du `AvailabilityService` a été modifiée pour prendre en compte les demandes de congé approuvées comme des périodes d'indisponibilité pour un membre.
        *   **Logique Ajoutée :**
            1.  Avant de vérifier les conflits de réservation existants, la méthode interroge la table `TimeOffRequests`.
            2.  Elle recherche une `TimeOffRequest` pour le `membershipId` concerné où :
                *   Le `status` est `TimeOffRequestStatus.APPROVED`.
                *   La plage de dates de la demande de congé (`startDate` à `endDate`) chevauche la plage du créneau testé (`slotStartDateTimeUTC` à `slotEndDateTimeUTC`). La comparaison des dates se fait après conversion des `startDate`/`endDate` de la demande (qui sont en `YYYY-MM-DD` dans le fuseau de l'établissement) en plages UTC couvrant toute la journée.
            3.  Si une telle demande de congé approuvée est trouvée, la méthode retourne `{ available: false, reason: "Member has approved time off..." }`.
        *   **Impact :** Cela garantit que `AvailabilityService` ne considère pas un membre comme disponible s'il est en congé approuvé, même si ses règles `StaffAvailability` indiqueraient une période de travail.

*   **3.3. Modifications Service Existant : `NotificationService.ts` (ou son implémentation `ConsoleNotificationService`)**

    *   **3.3.1. Nouvelles Méthodes pour les Notifications de Demandes de Congés**
        L'interface `INotificationService` et son implémentation (`ConsoleNotificationService`) ont été étendues avec les méthodes suivantes pour gérer les communications liées aux demandes de congés :

        *   **`sendTimeOffRequestSubmittedNotification(adminEmail: string, requestingUser: UserAttributes, timeOffRequest: TimeOffRequestAttributes, establishment: EstablishmentAttributes): Promise<void>`**
            *   **Rôle :** Notifie un administrateur qu'une nouvelle demande de congé a été soumise par un membre de son établissement.
            *   **Contenu Typique de l'Email :** Nom du demandeur, nom de l'établissement, type de congé, dates, raison (si fournie), et un lien vers la demande dans le panel admin.

        *   **`sendTimeOffRequestProcessedNotification(memberEmail: string, memberUser: UserAttributes, timeOffRequest: TimeOffRequestAttributes, establishment: EstablishmentAttributes): Promise<void>`**
            *   **Rôle :** Notifie le membre demandeur que sa demande de congé a été traitée (approuvée ou rejetée).
            *   **Contenu Typique de l'Email :** Statut final de la demande (Approuvée/Rejetée), nom de l'établissement, dates, notes de l'admin (si fournies), et un lien vers les détails de sa demande.

        *   **`sendTimeOffRequestCancelledByMemberNotification(adminEmail: string, requestingUser: UserAttributes, timeOffRequest: TimeOffRequestAttributes, establishment: EstablishmentAttributes): Promise<void>`**
            *   **Rôle :** Notifie un administrateur que le membre demandeur a annulé sa propre demande de congé.
            *   **Contenu Typique de l'Email :** Nom du membre, nom de l'établissement, dates de la demande annulée, raison de l'annulation (si fournie).

        *   **`sendTimeOffRequestCancelledByAdminNotification(memberEmail: string, memberUser: UserAttributes, timeOffRequest: TimeOffRequestAttributes, establishment: EstablishmentAttributes): Promise<void>`**
            *   **Rôle :** Notifie le membre demandeur que sa demande de congé a été annulée par un administrateur.
            *   **Contenu Typique de l'Email :** Nom de l'établissement, dates de la demande annulée, raison de l'annulation par l'admin (si fournie).


**4. API : Contrôleurs et Endpoints**

Cette section décrit l'interface de programmation applicative (API) RESTful exposée par le backend pour interagir avec la fonctionnalité de gestion des demandes de congés/absences.

*   **4.1. Nouveau Contrôleur : `TimeOffRequestController.ts`**

    *   **4.1.1. Rôle et Responsabilités**
        Le `TimeOffRequestController` est responsable de la gestion des requêtes HTTP entrantes relatives aux demandes de congés/absences. Il agit comme une couche d'orchestration entre les routes API et le `TimeOffRequestService`. Ses principales responsabilités incluent :
        1.  Recevoir les requêtes HTTP pour les opérations CRUD sur les `TimeOffRequest`.
        2.  Valider les données d'entrée (corps de la requête, paramètres d'URL, paramètres de requête) à l'aide des schémas Zod définis dans les DTOs.
        3.  Extraire les informations contextuelles nécessaires de l'objet `req` (ex: `req.user`, `req.membership`, `req.targetMembership`, `req.targetTimeOffRequest` attachés par les middlewares).
        4.  Appeler les méthodes appropriées du `TimeOffRequestService` en leur transmettant les données validées et le contexte de l'acteur.
        5.  Formater les réponses HTTP (succès ou erreur) en utilisant les DTOs de sortie et les codes de statut HTTP appropriés.
        6.  Déléguer la gestion des erreurs au middleware d'erreur global.

    *   **4.1.2. Méthodes de Contrôleur et Endpoints Associés**

        | Nom de la Méthode du Contrôleur | Endpoint API Géré                                                                               | Brève Description de l'Action                                                                  |
                |---------------------------------|-------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
        | `create`                        | `POST /api/memberships/:membershipId/time-off-requests`                                         | Crée une nouvelle demande de congé pour le membre spécifié.                                    |
        | `listForMember`                 | `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId/time-off-requests` | Liste les demandes de congés pour un membre spécifique au sein d'un établissement.             |
        | `listForEstablishment`          | `GET /api/users/me/establishments/:establishmentId/time-off-requests`                           | Liste toutes les demandes de congés pour un établissement spécifique (Admin uniquement).         |
        | `getById`                       | `GET /api/memberships/:membershipId/time-off-requests/:requestId`                               | Récupère les détails d'une demande de congé spécifique.                                        |
        | `processRequest`                | `PATCH /api/memberships/:membershipId/time-off-requests/:requestId`                             | Traite (approuve/rejette) une demande de congé (Admin uniquement).                             |
        | `cancelRequest`                 | `DELETE /api/memberships/:membershipId/time-off-requests/:requestId`                            | Annule une demande de congé (par le membre si PENDING, par l'Admin si PENDING ou APPROVED).    |

*   **4.2. Détail des Endpoints API**

    *   **`POST /api/memberships/:membershipId/time-off-requests`**
        *   **Méthode HTTP :** `POST`
        *   **Chemin URL :** `/api/memberships/:membershipId/time-off-requests`
        *   **Description :** Crée une nouvelle demande de congé/absence pour le `Membership` spécifié par `:membershipId`. L'acteur doit être le membre lui-même ou un administrateur de l'établissement du membre.
        *   **Middlewares :**
            1.  `requireAuth`: Assure que l'utilisateur est authentifié.
            2.  `loadAndVerifyMembershipContext('membershipId')`: Charge `req.targetMembership` (basé sur `:membershipId` de l'URL) et `req.actorMembershipInTargetContext` (le membership de l'acteur dans l'établissement de `targetMembership`).
            3.  `ensureAccessToMembershipResource([MembershipRole.ADMIN], true)`: Vérifie que l'acteur est soit le `targetMembership` lui-même (`allowSelf=true`), soit un `ADMIN` de l'établissement de `targetMembership`. Le contrôleur utilisera `actorMembershipInTargetContext` comme acteur effectif.
            4.  `verifyCsrfToken`: Protection contre les attaques CSRF.
        *   **Paramètres d'URL :**
            *   `membershipId` (number): L'ID du `Membership` pour lequel créer la demande.
        *   **Corps de Requête (DTO) :** `CreateTimeOffRequestDto` (Voir Section 5.1)
            *   Champs: `type`, `startDate`, `endDate`, `reason?`.
        *   **Réponse Succès (DTO) :**
            *   Statut HTTP: `201 Created`
            *   Corps: `TimeOffRequestOutputDto` (Voir Section 5.2) - La demande de congé nouvellement créée.
        *   **Réponses Erreur :**
            *   `400 Bad Request`: Données du DTO invalides (ex: format de date, `endDate` < `startDate`, `startDate` dans le passé).
            *   `401 Unauthorized`: Authentification échouée (géré par `requireAuth`).
            *   `403 Forbidden`: L'acteur n'a pas la permission de créer une demande pour ce membre (géré par `ensureAccessToMembershipResource`) ou échec CSRF.
            *   `404 Not Found`: Le `Membership` cible (`:membershipId`) n'existe pas (géré par `loadAndVerifyMembershipContext`).
            *   `409 Conflict`: Une demande de congé chevauchante (`PENDING` ou `APPROVED`) existe déjà pour ce membre (géré par `TimeOffRequestService`, résulte en `TimeOffRequestInvalidActionError`).
            *   `500 Internal Server Error`: Erreur serveur inattendue.

    *   **`GET /api/users/me/establishments/:establishmentId/memberships/:membershipId/time-off-requests`**
        *   **Méthode HTTP :** `GET`
        *   **Chemin URL :** `/api/users/me/establishments/:establishmentId/memberships/:membershipId/time-off-requests`
        *   **Description :** Liste toutes les demandes de congés/absences pour un `Membership` spécifique (`:membershipId`) au sein d'un `Establishment` spécifique (`:establishmentId`). Accessible par le membre lui-même ou un administrateur de l'établissement.
        *   **Middlewares :**
            1.  `requireAuth`.
            2.  `ensureMembership([MembershipRole.ADMIN, MembershipRole.STAFF])`: Attaché au routeur parent (`/api/users/me/establishments/:establishmentId`), il assure que l'acteur (`req.membership`) est un membre actif (Admin ou Staff) de l'établissement (`:establishmentId`).
            3.  `ensureCanListMemberTimeOffRequestsOnEstablishmentRoute`: Valide que l'acteur (`req.membership`) peut lister les demandes pour le `targetMembershipId` (soit parce qu'il est Admin, soit parce que `req.membership.id === targetMembershipId`).
        *   **Paramètres d'URL :**
            *   `establishmentId` (number): L'ID de l'établissement.
            *   `membershipId` (number): L'ID du `Membership` dont les demandes sont listées.
        *   **Paramètres de Requête (Query DTO) :** `ListTimeOffRequestsQueryDto` (Voir Section 5.5)
            *   Champs: `page?`, `limit?`, `status?`, `sortBy?`, `sortOrder?`.
        *   **Réponse Succès (DTO) :**
            *   Statut HTTP: `200 OK`
            *   Corps: `PaginationDto<TimeOffRequestOutputDto>` - Un objet contenant un tableau `data` de `TimeOffRequestOutputDto` et les informations de `pagination`.
        *   **Réponses Erreur :**
            *   `400 Bad Request`: Paramètres de requête invalides.
            *   `401 Unauthorized`.
            *   `403 Forbidden`: Accès non autorisé (géré par `ensureMembership` ou `ensureCanListMemberTimeOffRequestsOnEstablishmentRoute`).
            *   `404 Not Found`: L'établissement ou le `Membership` cible n'existe pas.

    *   **`GET /api/users/me/establishments/:establishmentId/time-off-requests`**
        *   **Méthode HTTP :** `GET`
        *   **Chemin URL :** `/api/users/me/establishments/:establishmentId/time-off-requests`
        *   **Description :** Liste toutes les demandes de congés/absences pour un `Establishment` spécifique (`:establishmentId`). Réservé aux administrateurs de cet établissement.
        *   **Middlewares :**
            1.  `requireAuth`.
            2.  `ensureMembership([MembershipRole.ADMIN])`: Attaché au routeur parent (`/api/users/me/establishments/:establishmentId`), il assure que l'acteur (`req.membership`) est un `ADMIN` actif de l'établissement.
        *   **Paramètres d'URL :**
            *   `establishmentId` (number): L'ID de l'établissement.
        *   **Paramètres de Requête (Query DTO) :** `ListAllTimeOffRequestsForEstablishmentQueryDto` (Voir Section 5.6)
            *   Champs: `page?`, `limit?`, `status?`, `type?`, `membershipId?` (pour filtrer par membre), `dateRangeStart?`, `dateRangeEnd?`, `sortBy?`, `sortOrder?`.
        *   **Réponse Succès (DTO) :**
            *   Statut HTTP: `200 OK`
            *   Corps: `PaginationDto<TimeOffRequestOutputDto>` - Un objet contenant un tableau `data` de `TimeOffRequestOutputDto` et les informations de `pagination`.
        *   **Réponses Erreur :**
            *   `400 Bad Request`: Paramètres de requête invalides.
            *   `401 Unauthorized`.
            *   `403 Forbidden`: Accès non autorisé (l'acteur n'est pas Admin).
            *   `404 Not Found`: L'établissement n'existe pas.

    *   **`GET /api/memberships/:membershipId/time-off-requests/:requestId`**
        *   **Méthode HTTP :** `GET`
        *   **Chemin URL :** `/api/memberships/:membershipId/time-off-requests/:requestId`
        *   **Description :** Récupère les détails d'une demande de congé/absence spécifique.
        *   **Middlewares :**
            1.  `requireAuth`.
            2.  `loadAndVerifyMembershipContext('membershipId')`.
            3.  `loadTimeOffRequestAndVerifyAccessDetails('requestId', [MembershipRole.ADMIN], true)`: Vérifie que l'acteur est le demandeur lui-même ou un Admin de l'établissement de la demande. Attache `req.targetTimeOffRequest`.
        *   **Paramètres d'URL :**
            *   `membershipId` (number): L'ID du `Membership` propriétaire de la demande.
            *   `requestId` (number): L'ID de la `TimeOffRequest`.
        *   **Réponse Succès (DTO) :**
            *   Statut HTTP: `200 OK`
            *   Corps: `TimeOffRequestOutputDto` - Les détails de la demande.
        *   **Réponses Erreur :**
            *   `400 Bad Request`: IDs invalides.
            *   `401 Unauthorized`.
            *   `403 Forbidden`: Accès non autorisé ou la demande n'appartient pas au membre spécifié.
            *   `404 Not Found`: `Membership` ou `TimeOffRequest` non trouvée.

    *   **`PATCH /api/memberships/:membershipId/time-off-requests/:requestId`**
        *   **Méthode HTTP :** `PATCH`
        *   **Chemin URL :** `/api/memberships/:membershipId/time-off-requests/:requestId`
        *   **Description :** Traite une demande de congé (approbation ou rejet). Réservé aux administrateurs de l'établissement de la demande.
        *   **Middlewares :**
            1.  `requireAuth`.
            2.  `loadAndVerifyMembershipContext('membershipId')`.
            3.  `loadTimeOffRequestAndVerifyAccessDetails('requestId', [MembershipRole.ADMIN], false)`: Vérifie que l'acteur est un `ADMIN` de l'établissement de la demande.
            4.  `verifyCsrfToken`.
        *   **Paramètres d'URL :**
            *   `membershipId` (number): L'ID du `Membership` propriétaire de la demande.
            *   `requestId` (number): L'ID de la `TimeOffRequest` à traiter.
        *   **Corps de Requête (DTO) :** `ProcessTimeOffRequestDto` (Voir Section 5.3)
            *   Champs: `status` (`APPROVED` ou `REJECTED`), `adminNotes?`.
        *   **Réponse Succès (DTO) :**
            *   Statut HTTP: `200 OK`
            *   Corps: `TimeOffRequestOutputDto` - La demande mise à jour.
        *   **Réponses Erreur :**
            *   `400 Bad Request`: IDs invalides, DTO invalide.
            *   `401 Unauthorized`.
            *   `403 Forbidden`: Accès non autorisé (pas Admin) ou échec CSRF.
            *   `404 Not Found`: `Membership` ou `TimeOffRequest` non trouvée.
            *   `409 Conflict`: La demande n'est pas en statut `PENDING` (géré par `TimeOffRequestService`, résulte en `TimeOffRequestInvalidActionError`).

    *   **`DELETE /api/memberships/:membershipId/time-off-requests/:requestId`**
        *   **Méthode HTTP :** `DELETE`
        *   **Chemin URL :** `/api/memberships/:membershipId/time-off-requests/:requestId`
        *   **Description :** Annule une demande de congé. Le membre peut annuler si `PENDING`. L'administrateur peut annuler si `PENDING` ou `APPROVED`.
        *   **Middlewares :**
            1.  `requireAuth`.
            2.  `loadAndVerifyMembershipContext('membershipId')`.
            3.  `loadTimeOffRequestAndVerifyAccessDetails('requestId', [MembershipRole.ADMIN], true)`: Vérifie que l'acteur est le demandeur ou un Admin.
            4.  `verifyCsrfToken`.
        *   **Paramètres d'URL :**
            *   `membershipId` (number): L'ID du `Membership` propriétaire de la demande.
            *   `requestId` (number): L'ID de la `TimeOffRequest` à annuler.
        *   **Corps de Requête (DTO) :** `CancelTimeOffRequestDto` (Voir Section 5.4)
            *   Champs: `cancellationReason?`.
        *   **Réponse Succès (DTO) :**
            *   Statut HTTP: `200 OK`
            *   Corps: `TimeOffRequestOutputDto` - La demande annulée.
        *   **Réponses Erreur :**
            *   `400 Bad Request`: IDs invalides, DTO invalide.
            *   `401 Unauthorized`.
            *   `403 Forbidden`: Accès non autorisé ou échec CSRF.
            *   `404 Not Found`: `Membership` ou `TimeOffRequest` non trouvée.
            *   `409 Conflict`: La demande ne peut pas être annulée dans son état actuel par cet acteur (géré par `TimeOffRequestService`, résulte en `TimeOffRequestInvalidActionError`).

---
**5. DTOs (Data Transfer Objects) et Validation (Zod)**

Cette section détaille les DTOs utilisés pour la fonctionnalité de gestion des demandes de congés, ainsi que leurs schémas de validation Zod.

*   **5.1. `CreateTimeOffRequestDto` et `CreateTimeOffRequestDtoSchema`**
    Utilisé dans le corps de la requête `POST /api/memberships/:membershipId/time-off-requests`.
    *   **Schéma Zod (`CreateTimeOffRequestDtoSchema`) :**
        ```typescript
        // src/dtos/timeoff-request.validation.ts
        export const CreateTimeOffRequestDtoSchema = z.object({
            type: z.nativeEnum(TimeOffRequestType, {
                errorMap: () => ({ message: "Invalid time off request type." }),
            }),
            startDate: z.string({ required_error: "Start date is required." })
                .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format."),
            endDate: z.string({ required_error: "End date is required." })
                .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format."),
            reason: z.string().max(1000, "Reason must be 1000 characters or less.").optional().nullable(),
        }).refine(data => new Date(data.endDate) >= new Date(data.startDate), { // Ajouté pour être cohérent avec le plan
            message: "End date cannot be before start date.",
            path: ["endDate"],
        }).refine(data => new Date(data.startDate) >= new Date(new Date().toISOString().split('T')[0]), { // Ajouté du fichier fourni
            message: "Start date cannot be in the past.",
            path: ["startDate"]
        });
        export type CreateTimeOffRequestDto = z.infer<typeof CreateTimeOffRequestDtoSchema>;
        ```
    *   **Rôle des Champs :**
        *   `type`: (`TimeOffRequestType`) Type de congé demandé (ex: `PAID_LEAVE`). Obligatoire.
        *   `startDate`: (`string`) Date de début du congé au format `YYYY-MM-DD`. Obligatoire. Ne peut pas être dans le passé.
        *   `endDate`: (`string`) Date de fin du congé au format `YYYY-MM-DD`. Obligatoire. Doit être égale ou postérieure à `startDate`.
        *   `reason`: (`string | null`) Raison de la demande. Optionnel, max 1000 caractères.

*   **5.2. `TimeOffRequestOutputDto` et `TimeOffRequestOutputDtoSchema`**
    Utilisé comme structure de réponse pour représenter une demande de congé.
    *   **Sous-DTOs (`ShortUserOutputDto`, `ShortMembershipOutputDto`) :**
        ```typescript
        // src/dtos/timeoff-request.validation.ts
        export const ShortUserOutputDtoSchema = z.object({
            id: z.number().int().positive(),
            username: z.string(),
            profile_picture: z.string().url().nullable().optional(), // URL absolue ou relative selon impl.
        });
        export type ShortUserOutputDto = z.infer<typeof ShortUserOutputDtoSchema>;

        export const ShortMembershipOutputDtoSchema = z.object({
            id: z.number().int().positive(),
            user: ShortUserOutputDtoSchema.nullable(),
        });
        export type ShortMembershipOutputDto = z.infer<typeof ShortMembershipOutputDtoSchema>;
        ```
    *   **Schéma Zod (`TimeOffRequestOutputDtoSchema`) :**
        ```typescript
        // src/dtos/timeoff-request.validation.ts
        export const TimeOffRequestOutputDtoSchema = z.object({
            id: z.number().int().positive(),
            membershipId: z.number().int().positive(),
            requestingMember: ShortMembershipOutputDtoSchema.nullable(),
            establishmentId: z.number().int().positive(),
            type: z.nativeEnum(TimeOffRequestType),
            startDate: z.string(), // YYYY-MM-DD
            endDate: z.string(),   // YYYY-MM-DD
            reason: z.string().nullable(),
            status: z.nativeEnum(TimeOffRequestStatus),
            adminNotes: z.string().nullable(),
            processedByMembershipId: z.number().int().positive().nullable(),
            processingAdmin: ShortMembershipOutputDtoSchema.nullable(),
            cancelledByMembershipId: z.number().int().positive().nullable(),
            cancellingActor: ShortMembershipOutputDtoSchema.nullable(),
            cancellationReason: z.string().nullable(),
            createdAt: z.coerce.date(), // Convertit en objet Date JS
            updatedAt: z.coerce.date(), // Convertit en objet Date JS
        });
        export type TimeOffRequestOutputDto = z.infer<typeof TimeOffRequestOutputDtoSchema>;
        ```
    *   **Rôle des Champs :** Tous les champs du modèle `TimeOffRequestAttributes` sont représentés, avec `requestingMember`, `processingAdmin`, et `cancellingActor` imbriquant des informations utilisateur simplifiées. Les dates (`createdAt`, `updatedAt`) sont des objets Date JavaScript. `startDate` et `endDate` restent des chaînes `YYYY-MM-DD`.

*   **5.3. `ProcessTimeOffRequestDto` et `ProcessTimeOffRequestDtoSchema`**
    Utilisé dans le corps de la requête `PATCH /api/memberships/:membershipId/time-off-requests/:requestId` par un admin.
    *   **Schéma Zod (`ProcessTimeOffRequestDtoSchema`) :**
        ```typescript
        // src/dtos/timeoff-request.validation.ts
        export const ProcessTimeOffRequestDtoSchema = z.object({
            status: z.enum([TimeOffRequestStatus.APPROVED, TimeOffRequestStatus.REJECTED], {
                errorMap: () => ({ message: "Invalid status for processing. Must be APPROVED or REJECTED." }),
            }),
            adminNotes: z.string().max(1000, "Admin notes must be 1000 characters or less.").optional().nullable(),
        });
        export type ProcessTimeOffRequestDto = z.infer<typeof ProcessTimeOffRequestDtoSchema>;
        ```
    *   **Rôle des Champs :**
        *   `status`: (`TimeOffRequestStatus.APPROVED | TimeOffRequestStatus.REJECTED`) Le nouveau statut à appliquer. Obligatoire.
        *   `adminNotes`: (`string | null`) Notes de l'administrateur. Optionnel, max 1000 caractères.

*   **5.4. `CancelTimeOffRequestDto` et `CancelTimeOffRequestDtoSchema`**
    Utilisé dans le corps de la requête `DELETE /api/memberships/:membershipId/time-off-requests/:requestId`.
    *   **Schéma Zod (`CancelTimeOffRequestDtoSchema`) :**
        ```typescript
        // src/dtos/timeoff-request.validation.ts
        export const CancelTimeOffRequestDtoSchema = z.object({
            cancellationReason: z.string().max(1000, "Cancellation reason must be 1000 characters or less.").optional().nullable(),
        });
        export type CancelTimeOffRequestDto = z.infer<typeof CancelTimeOffRequestDtoSchema>;
        ```
    *   **Rôle des Champs :**
        *   `cancellationReason`: (`string | null`) Raison de l'annulation. Optionnel, max 1000 caractères.

*   **5.5. `ListTimeOffRequestsQueryDto` et `ListTimeOffRequestsQueryDtoSchema`**
    Utilisé pour les paramètres de requête de `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId/time-off-requests`.
    *   **Schéma Zod (`ListTimeOffRequestsQueryDtoSchema`) :**
        ```typescript
        // src/dtos/timeoff-request.validation.ts
        export const ListTimeOffRequestsQueryDtoSchema = z.object({
            page: z.coerce.number().int().positive().default(1),
            limit: z.coerce.number().int().positive().max(100).default(10),
            status: z.nativeEnum(TimeOffRequestStatus).optional(),
            sortBy: z.enum(['createdAt', 'startDate', 'status']).default('createdAt'),
            sortOrder: z.enum(['asc', 'desc']).default('desc'),
        });
        export type ListTimeOffRequestsQueryDto = z.infer<typeof ListTimeOffRequestsQueryDtoSchema>;
        ```
    *   **Rôle des Champs :**
        *   `page`: Numéro de page (défaut: 1).
        *   `limit`: Nombre d'items par page (défaut: 10, max: 100).
        *   `status`: Filtre par statut de demande. Optionnel.
        *   `sortBy`: Champ de tri (défaut: `createdAt`).
        *   `sortOrder`: Ordre de tri (défaut: `desc`).

*   **5.6. `ListAllTimeOffRequestsForEstablishmentQueryDto` et `ListAllTimeOffRequestsForEstablishmentQueryDtoSchema`**
    Utilisé pour les paramètres de requête de `GET /api/users/me/establishments/:establishmentId/time-off-requests`.
    *   **Schéma Zod (`ListAllTimeOffRequestsForEstablishmentQueryDtoSchema`) :**
        ```typescript
        // src/dtos/timeoff-request.validation.ts
        export const ListAllTimeOffRequestsForEstablishmentQueryDtoSchema = z.object({
            page: z.coerce.number().int().positive().optional().default(1),
            limit: z.coerce.number().int().positive().max(100).optional().default(10),
            status: z.nativeEnum(TimeOffRequestStatus).optional(),
            type: z.nativeEnum(TimeOffRequestType).optional(),
            membershipId: z.coerce.number().int().positive().optional(),
            dateRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateRangeStart must be in YYYY-MM-DD format.").optional(),
            dateRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateRangeEnd must be in YYYY-MM-DD format.").optional(),
            sortBy: z.enum(['createdAt', 'updatedAt', 'startDate', 'endDate', 'status', 'type']).optional().default('createdAt'),
            sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
        }).refine(data => { /* ... validation de dateRange ... */ }); // Validation de cohérence des dateRange
        export type ListAllTimeOffRequestsForEstablishmentQueryDto = z.infer<typeof ListAllTimeOffRequestsForEstablishmentQueryDtoSchema>;
        ```
    *   **Rôle des Champs :**
        *   `page`, `limit`, `status`, `sortBy`, `sortOrder`: Similaires à `ListTimeOffRequestsQueryDto`.
        *   `type`: Filtre par type de congé. Optionnel.
        *   `membershipId`: Filtre par l'ID du membre demandeur. Optionnel.
        *   `dateRangeStart`, `dateRangeEnd`: Filtre les demandes chevauchant cette plage de dates. Optionnels, mais si l'un est fourni, l'autre l'est aussi et `dateRangeEnd` >= `dateRangeStart`.

---
**6. Middlewares d'Autorisation Spécifiques**

Plusieurs middlewares d'autorisation spécifiques sont introduits ou adaptés pour sécuriser les endpoints de la fonctionnalité de gestion des demandes de congés. Ils s'appuient sur le `req.user` (attaché par `requireAuth`) et interagissent avec les modèles `Membership` et `TimeOffRequest`.

*   **6.1. `loadAndVerifyMembershipContext(membershipIdParamName: string)`**
    *   **Fichier :** `src/middlewares/auth.middleware.ts`
    *   **Rôle :** Ce middleware est crucial pour les routes qui opèrent dans le contexte d'un `Membership` spécifique (le "membre cible" de l'action, identifié par un paramètre d'URL).
    *   **Fonctionnement Général :**
        1.  Extrait l'ID du `Membership` cible (`targetMembershipId`) du paramètre d'URL spécifié par `membershipIdParamName`.
        2.  Récupère l'instance `Membership` correspondante (`targetMembership`) depuis la base de données. Si non trouvée, renvoie une erreur `404 MembershipNotFoundError`.
        3.  Attache `targetMembership.get({ plain: true })` à `req.targetMembership`.
        4.  Récupère le `Membership` de l'utilisateur actuellement authentifié (`req.user.id`) *au sein de l'établissement du `targetMembership`* (`targetMembership.establishmentId`). Ce `Membership` de l'acteur est crucial pour déterminer son rôle dans le contexte de l'action.
        5.  Attache ce `Membership` de l'acteur à `req.actorMembershipInTargetContext`.
        6.  Si l'acteur n'est pas un membre actif de l'établissement du `targetMembership` (et n'est pas `SUPER_ADMIN`), renvoie une erreur `403 Forbidden`.
    *   **Utilisation :** Principalement sur les routeurs de base pour les ressources imbriquées sous un `Membership` spécifique (ex: `/api/memberships/:membershipId/...`). Il établit le contexte pour les middlewares d'autorisation plus spécifiques qui suivent.

*   **6.2. `ensureAccessToMembershipResource(allowedActorRolesInContext?: MembershipRole[], allowSelf: boolean = false)`**
    *   **Fichier :** `src/middlewares/auth.middleware.ts`
    *   **Rôle :** Vérifie si l'acteur a la permission d'accéder ou de modifier une ressource directement liée au `req.targetMembership` (qui doit avoir été chargé par `loadAndVerifyMembershipContext`).
    *   **Fonctionnement Général :**
        1.  Requiert que `req.user`, `req.targetMembership` soient définis.
        2.  Si l'utilisateur est `SUPER_ADMIN`, autorise l'accès.
        3.  Requiert que `req.actorMembershipInTargetContext` soit défini (sauf pour `SUPER_ADMIN`).
        4.  Si `allowSelf` est `true` ET que l'ID de `req.actorMembershipInTargetContext` est égal à celui de `req.targetMembership`, autorise l'accès (l'acteur est le propriétaire de la ressource principale).
        5.  Si `allowedActorRolesInContext` est fourni ET que le rôle de `req.actorMembershipInTargetContext` est inclus dans cette liste, autorise l'accès (l'acteur a un rôle suffisant dans l'établissement du `targetMembership`).
        6.  Sinon, renvoie une erreur `403 Forbidden`.
    *   **Utilisation :** Typiquement utilisé après `loadAndVerifyMembershipContext` pour contrôler l'accès aux sous-ressources de `/api/memberships/:membershipId/`. Par exemple, pour créer une demande de congé pour soi-même (`allowSelf=true`) ou si l'on est admin (`allowedActorRolesInContext=[MembershipRole.ADMIN]`).

*   **6.3. `ensureCanListMemberTimeOffRequestsOnEstablishmentRoute()`**
    *   **Fichier :** `src/middlewares/auth.middleware.ts`
    *   **Rôle :** Spécifique à la route `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId/time-off-requests`. Il vérifie si l'acteur (identifié par `req.membership`, qui est son appartenance à `:establishmentId`) a le droit de lister les demandes de congé pour le `targetMembershipId` (également dans `:establishmentId`).
    *   **Fonctionnement Général :**
        1.  Requiert `req.membership` (le membership de l'acteur pour l'établissement de l'URL, déjà chargé par `ensureMembership` sur le routeur parent `/api/users/me/establishments/:establishmentId`).
        2.  Extrait `targetMembershipId` et `establishmentIdFromRoute` des paramètres d'URL.
        3.  Si l'acteur est `SUPER_ADMIN`, vérifie que le `targetMembershipId` existe dans l'`establishmentIdFromRoute` et autorise.
        4.  Si `req.membership.role` est `ADMIN` (de l'établissement de l'URL), vérifie que le `targetMembershipId` appartient bien à cet établissement et autorise.
        5.  Si `req.membership.role` est `STAFF`, vérifie que `req.membership.id` est égal au `targetMembershipId` (le Staff ne peut voir que ses propres demandes via cette route).
        6.  Sinon, renvoie une erreur `403 Forbidden`.
    *   **Utilisation :** Appliqué directement à la route de listage des demandes d'un membre spécifique au sein d'un établissement.

*   **6.4. `loadTimeOffRequestAndVerifyAccessDetails(requestIdParamName: string, allowedActorRolesInContext?: MembershipRole[], allowSelfOnResource: boolean = false)`**
    *   **Fichier :** `src/middlewares/auth.middleware.ts`
    *   **Rôle :** Conçu pour les routes qui manipulent une `TimeOffRequest` spécifique (ex: GET, PATCH, DELETE d'une demande). Il charge la demande, s'assure qu'elle appartient au `req.targetMembership` (préalablement chargé via `loadAndVerifyMembershipContext`), puis vérifie les permissions de l'acteur.
    *   **Fonctionnement Général :**
        1.  Requiert `req.user`, `req.targetMembership`, et (sauf pour `SUPER_ADMIN`) `req.actorMembershipInTargetContext`.
        2.  Extrait l'ID de la `TimeOffRequest` (`requestId`) du paramètre d'URL spécifié par `requestIdParamName`.
        3.  Récupère l'instance `TimeOffRequest`. Si non trouvée, `404 TimeOffRequestNotFoundError`.
        4.  **Crucial :** Vérifie que `loadedTimeOffRequest.membershipId` est égal à `req.targetMembership.id`. Cela garantit que la demande de congé en question appartient bien au membre spécifié dans la première partie de l'URL (`/api/memberships/:membershipId/...`). Si non, `403 Forbidden`.
        5.  Attache la `TimeOffRequest` chargée à `req.targetTimeOffRequest`.
        6.  Si l'acteur est `SUPER_ADMIN`, autorise l'accès.
        7.  Vérifie les permissions en utilisant `req.actorMembershipInTargetContext` (le rôle de l'acteur dans l'établissement de la demande) :
            *   Si `allowSelfOnResource` est `true` ET que `req.actorMembershipInTargetContext.id` est égal à `req.targetTimeOffRequest.membershipId` (l'acteur est celui qui a fait la demande), autorise.
            *   Si `allowedActorRolesInContext` est fourni ET que le rôle de `req.actorMembershipInTargetContext` est inclus, autorise.
        8.  Sinon, renvoie `403 Forbidden`.
    *   **Utilisation :** Utilisé sur les routes d'action sur une `TimeOffRequest` spécifique, après `loadAndVerifyMembershipContext`. Par exemple, pour `GET /api/memberships/:membershipId/time-off-requests/:requestId`, `allowSelfOnResource` serait `true` et `allowedActorRolesInContext` serait `[MembershipRole.ADMIN]`. Pour `PATCH .../:requestId`, `allowSelfOnResource` serait `false` et `allowedActorRolesInContext` serait `[MembershipRole.ADMIN]`.
    


**7. Workflow des Demandes de Congés**

Cette section décrit les flux typiques d'interaction pour la gestion des demandes de congés.

*   **7.1. Soumission d'une Demande par un Membre Staff**

    Le diagramme ci-dessous illustre les étapes clés lorsqu'un membre du personnel (`Staff`) soumet une demande de congé.

    ```text
    Membre Staff (UI)         Frontend (App)             API Backend             TimeOffRequestService    NotificationService      Database
    -----------------         --------------             -----------             ---------------------    -------------------      --------
          |                         |                         |                            |                       |                  |
    1. Initie demande congé ---------> Remplit formulaire      |                            |                       |                  |
          |                         | (type, dates, raison)   |                            |                       |                  |
          |                         |                         |                            |                       |                  |
    2. Soumet formulaire  ---------> POST /api/memberships/:mid/time-off-requests (DTO) |                         |                  |
          |                         |                         |                            |                       |                  |
          |                         |             <--------- Valide DTO, AuthZ (middlewares) |                       |                  |
          |                         |                         |                            |                       |                  |
          |                         |                         |---- createTimeOffRequest(dto, actor) -> |                       |                  |
          |                         |                         |                            |                       |                  |
          |                         |                         |                            | Valide chevauchement ---> Requête BDD      |
          |                         |                         |                            | <---------------------- (Aucun chevauchement) |
          |                         |                         |                            |                       |                  |
          |                         |                         |                            | Crée TimeOffRequest ---> Enregistre en BDD |
          |                         |                         |                            | <---------------------- (Demande créée)  |
          |                         |                         |                            |                       |                  |
          |                         |                         |                            | Récupère infos (user, estab, admins) |     |
          |                         |                         |                            |                       |                  |
          |                         |                         |                            | Notifie Admins ---------> Envoie emails    |
          |                         |                         |                            |                       | (log ou envoi réel) |
          |                         |                         |                            |                       |                  |
          |                         |                         |<--- TimeOffRequest (objet)  |                       |                  |
          |                         |                         |                            |                       |                  |
    3. Reçoit confirmation <-------- 201 Created (TimeOffRequestOutputDto) |                            |                       |                  |
          |                         |                         |                            |                       |                  |
    ```

    **Étapes Détaillées :**
    1.  **Initiation (UI) :** Le membre Staff authentifié accède à la section de demande de congé de l'application. Il remplit un formulaire en spécifiant le type de congé, la date de début, la date de fin et une raison optionnelle.
    2.  **Soumission (Frontend -> Backend) :**
        *   Le frontend envoie une requête `POST` à l'endpoint `/api/memberships/{actorMembership.id}/time-off-requests` avec les données du formulaire (formatées en `CreateTimeOffRequestDto`).
        *   Les middlewares (`requireAuth`, `loadAndVerifyMembershipContext`, `ensureAccessToMembershipResource`, `verifyCsrfToken`) valident l'authentification, les permissions (le membre peut créer pour lui-même) et le token CSRF. `req.actorMembershipInTargetContext` (qui est ici le `actorMembership`) est disponible.
        *   Le `TimeOffRequestController.create` valide le DTO.
    3.  **Traitement (Service) :**
        *   Le `TimeOffRequestService.createTimeOffRequest` est appelé.
        *   Il vérifie la validité des dates (fin >= début, début non passé).
        *   Il vérifie s'il existe des demandes `PENDING` ou `APPROVED` qui chevauchent les dates demandées pour ce membre. Si oui, une erreur `TimeOffRequestInvalidActionError` (409) est levée.
        *   Un nouvel enregistrement `TimeOffRequest` est créé en base de données avec le statut `PENDING`, lié au `membershipId` de l'acteur et à son `establishmentId`.
        *   Le service récupère les informations de l'utilisateur demandeur, de l'établissement, et la liste des administrateurs actifs de cet établissement.
        *   Le `NotificationService.sendTimeOffRequestSubmittedNotification` est appelé pour chaque administrateur.
    4.  **Réponse (Backend -> Frontend) :**
        *   L'API retourne une réponse `201 Created` avec le `TimeOffRequestOutputDto` de la demande créée.
        *   Le frontend affiche une confirmation au membre Staff.

*   **7.2. Traitement (Approbation/Rejet) par un Admin**

    ```text
    Admin Étab. (UI)         Frontend (App)               API Backend              TimeOffRequestService   NotificationService     Database
    -----------------        --------------               -----------              ---------------------   -------------------     --------
         |                          |                          |                             |                      |                 |
    1. Consulte demande -----------> Affiche détails demande   |                             |                      |                 |
         | (statut: PENDING)        |                          |                             |                      |                 |
         |                          |                          |                             |                      |                 |
    2. Choisit Approuver/Rejeter -> PATCH /api/memberships/:mid/time-off-requests/:rid (DTO: status, notes) |                      |                 |
         | (ajoute notes option.)   |                          |                             |                      |                 |
         |                          |            <---------- Valide DTO, AuthZ (middlewares) |                      |                 |
         |                          |                          |                             |                      |                 |
         |                          |                          |--- processTimeOffRequest(rid, dto, actorAdmin) -> |                 |
         |                          |                          |                             |                      |                 |
         |                          |                          |                             | Récupère demande ----> Requête BDD      |
         |                          |                          |                             | <-------------------- (Demande PENDING) |
         |                          |                          |                             |                      |                 |
         |                          |                          |                             | Valide statut PENDING |                 |
         |                          |                          |                             |                      |                 |
         |                          |                          |                             | Met à jour statut, notes, processedBy -> Enregistre BDD |
         |                          |                          |                             | <-------------------- (Demande MàJ)   |
         |                          |                          |                             |                      |                 |
         |                          |                          |                             | Récupère infos (membre, estab) |        |
         |                          |                          |                             |                      |                 |
         |                          |                          |                             | Notifie Membre ------> Envoie email     |
         |                          |                          |                             |                      | (log/envoi réel)|
         |                          |                          |                             |                      |                 |
         |                          |                          |<---- TimeOffRequest (MàJ)    |                      |                 |
         |                          |                          |                             |                      |                 |
    3. Reçoit confirmation <--------- 200 OK (TimeOffRequestOutputDto) |                             |                      |                 |
         |                          |                          |                             |                      |                 |
    ```

    **Étapes Détaillées :**
    1.  **Consultation (UI) :** L'administrateur authentifié accède à la liste des demandes de congés de son établissement et sélectionne une demande en statut `PENDING` pour la traiter.
    2.  **Action (Frontend -> Backend) :**
        *   L'administrateur choisit d'approuver ou de rejeter la demande, et peut ajouter des notes.
        *   Le frontend envoie une requête `PATCH` à l'endpoint `/api/memberships/{requestingMember.id}/time-off-requests/{requestId}` avec le `ProcessTimeOffRequestDto` (contenant le nouveau `status` et les `adminNotes`).
        *   Les middlewares (`requireAuth`, `loadAndVerifyMembershipContext`, `loadTimeOffRequestAndVerifyAccessDetails` avec `allowedActorRolesInContext=['ADMIN']`, `verifyCsrfToken`) valident l'authentification, les permissions de l'admin, et le token CSRF. `req.actorMembershipInTargetContext` (admin) et `req.targetTimeOffRequest` sont disponibles.
        *   Le `TimeOffRequestController.processRequest` valide le DTO.
    3.  **Traitement (Service) :**
        *   Le `TimeOffRequestService.processTimeOffRequest` est appelé.
        *   Il récupère la `TimeOffRequest` par son ID.
        *   Il vérifie que le statut actuel de la demande est `PENDING`. Si ce n'est pas le cas (ex: déjà traitée ou annulée), une erreur `TimeOffRequestInvalidActionError` (409) est levée.
        *   Il met à jour le `status` de la demande (`APPROVED` ou `REJECTED`), les `adminNotes`, et le champ `processedByMembershipId` avec l'ID du `Membership` de l'administrateur.
        *   Les modifications sont sauvegardées en base de données.
        *   Le service récupère les informations de l'utilisateur membre (demandeur) et de l'établissement.
        *   Le `NotificationService.sendTimeOffRequestProcessedNotification` est appelé pour informer le membre du résultat.
        *   **Impact sur `AvailabilityService` :** Si la demande est `APPROVED`, l'`AvailabilityService`, lors de ses prochains calculs pour ce membre, considérera cette période comme une indisponibilité.
    4.  **Réponse (Backend -> Frontend) :**
        *   L'API retourne une réponse `200 OK` avec le `TimeOffRequestOutputDto` de la demande mise à jour.
        *   Le frontend met à jour l'affichage de la demande.

*   **7.3. Annulation d'une Demande (par Membre ou Admin)**

    **Cas 1: Annulation par le Membre Staff**
    ```text
    Membre Staff (UI)        Frontend (App)             API Backend              TimeOffRequestService   NotificationService      Database
    -----------------        --------------             -----------              ---------------------   -------------------      --------
         |                        |                          |                             |                      |                  |
    1. Consulte sa demande ------> Affiche détails demande   |                             |                      |                  |
         | (statut: PENDING)      | (bouton Annuler visible) |                             |                      |                  |
         |                        |                          |                             |                      |                  |
    2. Clique Annuler ----------> DELETE /api/memberships/:mid/time-off-requests/:rid (DTO: reason?) |                     |                  |
         | (ajoute raison opt.)   |                          |                             |                      |                  |
         |                        |            <---------- Valide AuthZ (self, middlewares) |                      |                  |
         |                        |                          |                             |                      |                  |
         |                        |                          |--- cancelTimeOffRequest(rid, dto, actorMember) -> |                 |
         |                        |                          |                             |                      |                  |
         |                        |                          |                             | Récupère demande ----> Requête BDD       |
         |                        |                          |                             | <-------------------- (Demande PENDING)  |
         |                        |                          |                             |                      |                  |
         |                        |                          |                             | Valide condition (acteur=demandeur, statut=PENDING) |
         |                        |                          |                             |                      |                  |
         |                        |                          |                             | Met à jour statut (CANCELLED_BY_MEMBER), reason, cancelledBy -> Enreg. BDD |
         |                        |                          |                             | <-------------------- (Demande MàJ)    |
         |                        |                          |                             |                      |                  |
         |                        |                          |                             | Notifie Admins ------> Envoie emails     |
         |                        |                          |                             |                      | (log/envoi réel) |
         |                        |                          |                             |                      |                  |
         |                        |                          |<---- TimeOffRequest (MàJ)    |                      |                  |
    3. Reçoit confirmation <------- 200 OK (TimeOffRequestOutputDto) |                             |                      |                  |
    ```

    **Étapes Détaillées (Membre Staff) :**
    1.  **Consultation (UI) :** Le membre Staff consulte une de ses demandes de congé qui est en statut `PENDING`. Un bouton "Annuler" est disponible.
    2.  **Action (Frontend -> Backend) :**
        *   Le membre clique sur "Annuler" et peut fournir une raison d'annulation.
        *   Le frontend envoie une requête `DELETE` à `/api/memberships/{actorMembership.id}/time-off-requests/{requestId}` avec le `CancelTimeOffRequestDto`.
        *   Les middlewares (`requireAuth`, `loadAndVerifyMembershipContext`, `loadTimeOffRequestAndVerifyAccessDetails` avec `allowSelfOnResource=true`, `verifyCsrfToken`) valident l'accès.
        *   Le `TimeOffRequestController.cancelRequest` valide le DTO.
    3.  **Traitement (Service) :**
        *   Le `TimeOffRequestService.cancelTimeOffRequest` est appelé.
        *   Il récupère la demande.
        *   Il vérifie que l'acteur est bien le demandeur (`actorMembership.id === timeOffRequest.membershipId`) ET que le statut actuel de la demande est `PENDING`. Si ces conditions ne sont pas remplies, une `TimeOffRequestInvalidActionError` est levée.
        *   Le statut est mis à jour à `CANCELLED_BY_MEMBER`, la `cancellationReason` et `cancelledByMembershipId` sont enregistrés.
        *   Le `NotificationService.sendTimeOffRequestCancelledByMemberNotification` est appelé pour informer les administrateurs.
    4.  **Réponse (Backend -> Frontend) :**
        *   L'API retourne `200 OK` avec la demande mise à jour.
        *   Le frontend met à jour l'affichage.

    **Cas 2: Annulation par l'Administrateur**
    *   **Étapes similaires à l'annulation par le membre, mais :**
        *   L'administrateur initie l'action depuis son interface de gestion.
        *   La validation dans le `TimeOffRequestService` vérifiera que l'acteur est un `ADMIN` de l'établissement de la demande ET que le statut de la demande est `PENDING` ou `APPROVED`.
        *   Le statut sera mis à jour à `CANCELLED_BY_ADMIN`.
        *   Le `NotificationService.sendTimeOffRequestCancelledByAdminNotification` sera appelé pour informer le membre demandeur.
        *   Si une demande `APPROVED` est annulée, l'`AvailabilityService` ne la considérera plus comme une indisponibilité lors des prochains calculs.

---
**8. Gestion des Erreurs Spécifiques**

La fonctionnalité de gestion des demandes de congés introduit des erreurs personnalisées pour gérer des scénarios métier spécifiques. Ces erreurs héritent généralement de `AppError` et sont interceptées par le middleware d'erreur global pour retourner une réponse JSON structurée à l'API avec un code HTTP approprié.

*   **8.1. `TimeOffRequestNotFoundError` (`src/errors/availability.errors.ts`)**
    *   **Hérite de :** `AppError`
    *   **Code HTTP typique :** `404 Not Found`
    *   **Description :** Levée lorsque qu'une `TimeOffRequest` spécifiée par son ID ne peut pas être trouvée en base de données.
    *   **Contextes d'utilisation :** Typiquement dans les méthodes du `TimeOffRequestService` qui tentent de récupérer une demande par ID avant de la traiter ou de l'annuler (ex: `getTimeOffRequestById`, `processTimeOffRequest`, `cancelTimeOffRequest`).

*   **8.2. `TimeOffRequestInvalidActionError` (`src/errors/availability.errors.ts`)**
    *   **Hérite de :** `AppError`
    *   **Code HTTP typique :** `409 Conflict` (ou parfois `400 Bad Request` selon la nature de l'action invalide)
    *   **Description :** Levée lorsqu'une action tentée sur une `TimeOffRequest` n'est pas permise en raison de son état actuel ou d'autres contraintes métier. Le message de l'erreur précise la nature de l'invalidité.
    *   **Contextes d'utilisation :**
        *   Dans `TimeOffRequestService.createTimeOffRequest` : Si une demande chevauchante (`PENDING` ou `APPROVED`) existe déjà pour le membre aux dates spécifiées.
        *   Dans `TimeOffRequestService.processTimeOffRequest` : Si un admin tente de traiter (approuver/rejeter) une demande qui n'est plus en statut `PENDING`.
        *   Dans `TimeOffRequestService.cancelTimeOffRequest` :
            *   Si un membre tente d'annuler une demande qui n'est plus `PENDING`.
            *   Si un admin tente d'annuler une demande qui n'est ni `PENDING` ni `APPROVED`.
            *   Si un acteur non autorisé tente d'effectuer l'annulation.

*   **Autres Erreurs Standard `AppError` pertinentes (non spécifiques mais utilisées) :**
    *   `AppError('InvalidInput', 400, message)` : Pour des DTOs invalides (ex: `endDate` < `startDate`, format de date incorrect non attrapé par Zod mais par la logique service).
    *   `AppError('Forbidden', 403, message)` : Si un middleware d'autorisation spécifique bloque l'accès et que l'erreur n'est pas une `AuthorizationError` plus générique.
    *   Les erreurs d'authentification (`AuthenticationError`, `AuthorizationError`) et de validation Zod sont gérées par leurs mécanismes respectifs et le middleware d'erreur global.

---
**9. Annexe**

*   **9.1. Exemples de Payloads JSON pour les Requêtes Clés**

    *   **Exemple 1: Création d'une demande de congé (`POST /api/memberships/{membershipId}/time-off-requests`)**
        ```json
        {
          "type": "PAID_LEAVE",
          "startDate": "2024-12-20",
          "endDate": "2024-12-24",
          "reason": "Congés de fin d'année."
        }
        ```

    *   **Exemple 2: Traitement d'une demande de congé par un Admin (`PATCH /api/memberships/{membershipId}/time-off-requests/{requestId}`)**
        *   Pour approuver :
            ```json
            {
              "status": "APPROVED",
              "adminNotes": "Demande approuvée. Bonnes vacances !"
            }
            ```
        *   Pour rejeter :
            ```json
            {
              "status": "REJECTED",
              "adminNotes": "Demande rejetée en raison d'un manque de personnel sur cette période."
            }
            ```

    *   **Exemple 3: Annulation d'une demande de congé (`DELETE /api/memberships/{membershipId}/time-off-requests/{requestId}`)**
        *   Le corps de la requête peut contenir une raison optionnelle :
            ```json
            {
              "cancellationReason": "Changement de plans personnels."
            }
            ```
        *   Ou être vide si aucune raison n'est fournie :
            ```json
            {}
            ```

---