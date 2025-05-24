---

[ Plan pour la Fonctionnalité B3 : Gestion des Demandes de Congés/Absences (Approbation) - MIS À JOUR ]

#### 1.1. Rappel de l'Objectif Fonctionnel Principal
Permettre aux membres Staff de soumettre des demandes de congés/absences et aux Admins de les approuver, rejeter ou annuler. Les absences approuvées impactent la disponibilité du membre via `AvailabilityService`.

#### 1.2. Décomposition Technique Séquentielle

*   **Modèle(s) :**
    *   **Nouveau Modèle : `TimeOffRequest`**
        *   `id`: `INTEGER.UNSIGNED`, PK, AutoIncrement
        *   `membershipId`: `INTEGER.UNSIGNED`, FK vers `Memberships.id`, NOT NULL
        *   `establishmentId`: `INTEGER.UNSIGNED`, FK vers `Establishments.id`, NOT NULL
        *   `type`: `ENUM('PAID_LEAVE', 'UNPAID_LEAVE', 'SICK_LEAVE', 'OTHER')`, NOT NULL
        *   `startDate`: `DATEONLY`, NOT NULL
        *   `endDate`: `DATEONLY`, NOT NULL
        *   `reason`: `TEXT`, NULLABLE
        *   `status`: `ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED_BY_MEMBER', 'CANCELLED_BY_ADMIN')`, NOT NULL, Default: `'PENDING'`
        *   `adminNotes`: `TEXT`, NULLABLE
        *   `processedByMembershipId`: `INTEGER.UNSIGNED`, FK vers `Memberships.id`, NULLABLE
        *   `cancelledByMembershipId`: `INTEGER.UNSIGNED`, FK vers `Memberships.id`, NULLABLE (Qui a annulé)
        *   `cancellationReason`: `TEXT`, NULLABLE (Si annulé)
        *   `createdAt`: `DATE`
        *   `updatedAt`: `DATE`
        *   **Associations :**
            *   `belongsTo Membership as 'requestingMember'`
            *   `belongsTo Establishment as 'establishment'`
            *   `belongsTo Membership as 'processingAdmin'`
            *   `belongsTo Membership as 'cancellingActor'` (via `cancelledByMembershipId`)

*   **DTO(s) :**
    *   **`CreateTimeOffRequestDto` (Requête - Membre Staff) :**
        *   `type`: `z.nativeEnum(TimeOffRequestType)`
        *   `startDate`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (date YYYY-MM-DD)
        *   `endDate`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
        *   `reason`: `z.string().optional()`
        *   *Validation Zod : `endDate` >= `startDate`. Le `membershipId` sera extrait de `req.membership.id` dans le service.*
    *   **`TimeOffRequestOutputDto` (Réponse) :**
        *   `id`: `number`
        *   `membershipId`: `number`
        *   `requestingMember`: `ShortMembershipDto { id, user: { username } }`
        *   `establishmentId`: `number`
        *   `type`: `TimeOffRequestType`
        *   `startDate`: `string` (YYYY-MM-DD)
        *   `endDate`: `string` (YYYY-MM-DD)
        *   `reason`: `string | null`
        *   `status`: `TimeOffRequestStatus` (incluant `CANCELLED_BY_MEMBER`, `CANCELLED_BY_ADMIN`)
        *   `adminNotes`: `string | null`
        *   `processedByMembershipId`: `number | null`
        *   `processingAdmin`: `ShortMembershipDto | null`
        *   `cancelledByMembershipId`: `number | null`
        *   `cancellingActor`: `ShortMembershipDto | null`
        *   `cancellationReason`: `string | null`
        *   `createdAt`: `Date`
        *   `updatedAt`: `Date`
    *   **`ProcessTimeOffRequestDto` (Requête - Admin pour Approuver/Rejeter) :**
        *   `status`: `z.enum([TimeOffRequestStatus.APPROVED, TimeOffRequestStatus.REJECTED])`
        *   `adminNotes`: `z.string().optional()`
    *   **`CancelTimeOffRequestDto` (Requête - Admin ou Membre) :**
        *   `cancellationReason`: `z.string().optional()`
    *   **`ListTimeOffRequestsQueryDto` (Requête - Admin/Membre) :**
        *   `page`, `limit`: `number`
        *   `status`: `z.nativeEnum(TimeOffRequestStatus).optional()`
        *   `sortBy`: `z.enum(['createdAt', 'startDate', 'status']).default('createdAt')`
        *   `sortOrder`: `z.enum(['asc', 'desc']).default('desc')`
        *   *(Note: Si la liste est pour un admin voyant toutes les demandes de l'établissement, un `membershipId` en query param pourrait être ajouté pour filtrer par membre.)*

*   **Service(s) :**
    *   **Nouveau Service : `TimeOffRequestService.ts`**
        *   `createTimeOffRequest(dto: CreateTimeOffRequestDto, actorMembership: Membership): Promise<TimeOffRequest>`
            *   Logique : `establishmentId` issu de `actorMembership.establishmentId`. Le `membershipId` de la demande est `actorMembership.id`. Valide DTO. Crée `TimeOffRequest`. Notification Admin.
        *   `getTimeOffRequestById(requestId: number, actorMembership: Membership): Promise<TimeOffRequest>`
            *   Logique : Récupère la demande. L'accès est vérifié par le middleware en amont.
        *   `listTimeOffRequestsForMember(establishmentId: number, targetMembershipId: number, queryDto: ListTimeOffRequestsQueryDto, actorMembership: Membership): Promise<{ data: TimeOffRequest[], pagination: PaginationDto }>`
            *   Logique : L'accès et la correspondance `establishmentId`/`targetMembershipId` sont vérifiés par le middleware. Récupère les demandes paginées/filtrées.
        *   `processTimeOffRequest(requestId: number, dto: ProcessTimeOffRequestDto, actorMembership: Membership): Promise<TimeOffRequest>`
            *   Logique : L'accès Admin est vérifié par middleware. Vérifie que la demande est `PENDING`. Met à jour statut, `adminNotes`, `processedByMembershipId`. `AvailabilityService` lira dynamiquement les statuts. Notification au membre.
        *   `cancelTimeOffRequest(requestId: number, dto: CancelTimeOffRequestDto, actorMembership: Membership): Promise<TimeOffRequest>`
            *   Logique : L'accès est vérifié par middleware.
                *   Si `actorMembership` est le demandeur : peut annuler si statut est `PENDING`. Change statut à `CANCELLED_BY_MEMBER`.
                *   Si `actorMembership` est Admin de l'établissement : peut annuler si statut est `PENDING` ou `APPROVED`. Change statut à `CANCELLED_BY_ADMIN`.
                *   Enregistre `cancelledByMembershipId` et `cancellationReason`. Notification à l'autre partie.
    *   **Modification Service Existant : `AvailabilityService.ts` (Central et Enrichi)**
        *   Toutes les méthodes calculant la disponibilité d'un membre (ex: `isMemberAvailableForSlot`, et la logique pour `getEstablishmentSchedule`) :
            *   Doivent impérativement lire les `TimeOffRequest` et considérer uniquement celles avec `status='APPROVED'` comme des périodes d'indisponibilité. Les statuts `PENDING`, `REJECTED`, `CANCELLED_BY_MEMBER`, `CANCELLED_BY_ADMIN` sont ignorés pour le calcul de disponibilité.

*   **Contrôleur(s) :**
    *   **Nouveau Contrôleur : `TimeOffRequestController.ts`**
        *   `create(req, res, next)`: Pour `POST /api/memberships/:membershipId/time-off-requests`
        *   `getById(req, res, next)`: Pour `GET /api/memberships/:membershipId/time-off-requests/:requestId`
        *   `listForMember(req, res, next)`: Pour `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId/time-off-requests`
        *   `processRequest(req, res, next)`: Pour `PATCH /api/memberships/:membershipId/time-off-requests/:requestId`
        *   `cancelRequest(req, res, next)`: Pour `DELETE /api/memberships/:membershipId/time-off-requests/:requestId`

*   **Route(s) :**
    *   `POST /api/memberships/:membershipId/time-off-requests`
        *   Contrôleur: `TimeOffRequestController.create`
        *   Middleware: `requireAuth`, `ensureMembershipAccess('membershipId')` (vérifie que l'acteur est le membre lui-même ou un Admin de son établissement), `verifyCsrfToken`.
    *   `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId/time-off-requests`
        *   Contrôleur: `TimeOffRequestController.listForMember`
        *   Middleware: `requireAuth`, `ensureEstablishmentAccessByAdminOrSelf(':establishmentId', ':membershipId')`.
    *   `GET /api/memberships/:membershipId/time-off-requests/:requestId`
        *   Contrôleur: `TimeOffRequestController.getById`
        *   Middleware: `requireAuth`, `loadTimeOffRequestAndEnsureAccess(':requestId', ':membershipId', ['ANY'])`.
    *   `PATCH /api/memberships/:membershipId/time-off-requests/:requestId`
        *   Contrôleur: `TimeOffRequestController.processRequest`
        *   Middleware: `requireAuth`, `loadTimeOffRequestAndEnsureAccess(':requestId', ':membershipId', ['ADMIN'])`, `verifyCsrfToken`.
    *   `DELETE /api/memberships/:membershipId/time-off-requests/:requestId`
        *   Contrôleur: `TimeOffRequestController.cancelRequest`
        *   Middleware: `requireAuth`, `loadTimeOffRequestAndEnsureAccess(':requestId', ':membershipId', ['ANY'])`, `verifyCsrfToken`.

*   **Middleware(s) :**
    *   **`ensureEstablishmentAccessByAdminOrSelf(establishmentIdParam, membershipIdParam)` (À créer ou adapter) :**
        *   Récupère `actorMembership` via `req.user.id` et `req.params[establishmentIdParam]`.
        *   Si `actorMembership.role === 'ADMIN'` ET `actorMembership.establishmentId` (numérique) est égal à `req.params[establishmentIdParam]` (numérique) : Autorisé. L'acteur est Admin de l'établissement cible.
        *   Sinon, si `actorMembership.id` (numérique) est égal à `req.params[membershipIdParam]` (numérique) ET `actorMembership.establishmentId` est égal à `req.params[establishmentIdParam]` : Autorisé. L'acteur est le membre spécifique cible au sein de l'établissement correct.
        *   Sinon, 403/404.
    *   **`loadTimeOffRequestAndEnsureAccess(requestIdParam, membershipIdParam, allowedActorTypes: ('ANY' | 'ADMIN' | 'SELF')[])` (Nouveau) :**
        *   Charge la `TimeOffRequest` via `req.params[requestIdParam]`. Si non trouvée, 404.
        *   Vérifie que `loadedTimeOffRequest.membershipId` (numérique) est égal à `req.params[membershipIdParam]` (numérique). Si non, 404 (ou 403, car la requête est mal formée pour la ressource).
        *   Attache la `loadedTimeOffRequest` à `req.targetTimeOffRequest`.
        *   Récupère `actorMembership` pour `req.user.id` et `loadedTimeOffRequest.establishmentId`. Si non trouvé (l'acteur n'est pas membre de l'établissement de la demande), 403.
        *   Si `allowedActorTypes` contient `'ANY'`: Autorisé.
        *   Si `allowedActorTypes` contient `'ADMIN'` ET `actorMembership.role === 'ADMIN'`: Autorisé.
        *   Si `allowedActorTypes` contient `'SELF'` ET `actorMembership.id === loadedTimeOffRequest.membershipId`: Autorisé.
        *   Si aucune condition n'est remplie, 403.

*   **Gestion des Erreurs :**
    *   `400 Bad Request`: DTO invalide, `endDate` < `startDate`.
    *   `403 Forbidden`: Action non autorisée.
    *   `404 Not Found`: `TimeOffRequest`, `Membership`, ou `Establishment` non trouvé.
    *   `TimeOffRequestAlreadyProcessedError`: Si Admin tente de traiter (approuver/rejeter) une demande non `PENDING`.
    *   `TimeOffRequestCannotBeCancelledError`: Si tentative d'annuler une demande dans un état non annulable par l'acteur (ex: membre tente d'annuler une demande déjà approuvée).

#### 1.3. Considérations Particulières
*   Logique d'annulation affinée : la mise à jour du statut à `CANCELLED_BY_MEMBER` ou `CANCELLED_BY_ADMIN` gère l'historique. `AvailabilityService` ignore ces statuts pour le calcul de la disponibilité.
*   Notifications claires pour chaque changement de statut.
```

```markdown
[ Plan pour la Fonctionnalité B4 : Outils d'Assignation et de Réassignation des Réservations - VALIDÉ ]

Le plan d'implémentation précédemment fourni pour la Fonctionnalité B4 est maintenu et considéré comme validé. Les points clés incluent :
*   Utilisation du champ `assignedMembershipId` existant sur le modèle `Booking`.
*   Création d'un DTO `AssignBookingDto`.
*   Modification du `BookingService` pour inclure :
    *   `assignBookingToMember(...)` : Gère l'assignation/désassignation, vérifie l'éligibilité du membre au service (via `ServiceMemberAssignment`), et **impérativement** sa disponibilité réelle via `AvailabilityService.isMemberAvailableForSlot(...)`.
    *   `getEligibleMembersForBooking(...)` : Suggère des membres pour une réservation.
*   Ajout de la méthode `isMemberAvailableForSlot(...)` dans `AvailabilityService`.
*   Nouvelles routes `PATCH /api/bookings/:bookingId/assign-member` et `GET /api/bookings/:bookingId/eligible-members`.
*   Utilisation d'un middleware `ensureAdminOfBookingEstablishment`.
*   Gestion d'erreurs spécifiques comme `MemberNotAvailableError` et `MemberNotEligibleForServiceError`.
```

```markdown
[ Plan pour les Fonctionnalités B1/B2 : Vue d'Ensemble du Planning et Données Centralisées - JUSTIFICATION EMPLACEMENT ]

#### 3.1. Rappel de l'Objectif Fonctionnel Principal
*   **B1 (Vue d'Ensemble du Planning de l'Équipe - Admin):** Fournir à l'Admin une vision globale des plannings des membres (blocs de travail issus de `StaffAvailability`, réservations assignées, absences approuvées via `TimeOffRequest`).
*   **B2 (Données Centralisées de Disponibilité - Aspect Lecture Admin):** Permettre à l'Admin de récupérer facilement toutes les données de planning agrégées pour son établissement sur une période donnée, servant de base à B1.

#### 3.2. Justification de l'Emplacement Service/Contrôleur

La méthode `getEstablishmentSchedule` a pour objectif principal de collecter et d'agréger des données de différentes sources (`StaffAvailability`, `Booking`, `TimeOffRequest`) pour construire une vue calendaire des événements d'un établissement, souvent par membre.

*   **Choix Précédent et Maintenu : Nouveau `StaffScheduleService.ts`**
    *   **Justification :**
        1.  **Single Responsibility Principle (SRP) :** `AvailabilityService` est déjà dédié au calcul complexe des *slots libres* pour les clients. Y ajouter l'agrégation de plannings *remplis* pour l'admin le surchargerait. Un `StaffScheduleService` dédié maintient la séparation des préoccupations.
        2.  **Clarté Architecturale :** Indique clairement où se trouve la logique spécifique à la construction des vues de planning du staff.
        3.  **Orchestration :** Ce service agira comme un orchestrateur, appelant d'autres services (ex: `MembershipService` pour lister les membres, `BookingService` pour les réservations, `TimeOffRequestService` pour les congés, et des helpers de `AvailabilityService` ou directement le modèle `StaffAvailability` pour les règles de travail).
        4.  **Scalabilité :** Idéal pour accueillir des fonctionnalités futures de planning avancées (ex: détection de conflits complexe, gestion de rotations) sans impacter les services de base.

*   **Contrôleur Suggéré : Nouveau `StaffScheduleController.ts`**
    *   Ce contrôleur sera responsable de la gestion des requêtes liées à la vue de planning du staff.
    *   Route principale : `GET /api/establishments/:establishmentId/staff-schedule` -> `StaffScheduleController.getSchedule`.

#### 3.3. Décomposition Technique Séquentielle (pour `getEstablishmentSchedule`)

*   **Modèle(s) :**
    *   Aucun nouveau modèle. Utilisation de `StaffAvailability`, `Booking`, `TimeOffRequest`, `Membership`.

*   **DTO(s) :**
    *   **`GetEstablishmentScheduleQueryDto` (Requête - Admin) :**
        *   `startDate`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
        *   `endDate`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
        *   `membershipIds`: `z.array(z.number().int().positive()).optional()`
        *   `serviceIds`: `z.array(z.number().int().positive()).optional()`
    *   **`StaffAvailabilityOutputDto` (Réponse, partie de `EstablishmentScheduleOutputDto`) :**
        *   `id`: `number`
        *   `rruleString`: `string` (La règle brute)
        *   `occurrences`: `Array<{ start: Date, end: Date }>` (Les occurrences calculées pour la période demandée)
        *   `durationMinutes`: `number`
        *   `isWorking`: `boolean`
        *   `description`: `string | null`
    *   **`EstablishmentScheduleOutputDto` (Réponse - Admin) :**
        *   `startDate`: `string`
        *   `endDate`: `string`
        *   `staffSchedules`: `Array<{ membership: ShortMembershipDto, workingRuleOccurrences: StaffAvailabilityOutputDto[], assignedBookings: BookingOutputDto[], approvedTimeOffs: TimeOffRequestOutputDto[] }>`
        *   *(`ShortMembershipDto`, `BookingOutputDto`, `TimeOffRequestOutputDto` sont des DTOs existants ou définis ailleurs).*

*   **Service(s) :**
    *   **Nouveau Service : `StaffScheduleService.ts`**
        *   `getEstablishmentSchedule(establishmentId: number, queryDto: GetEstablishmentScheduleQueryDto, actorMembership: Membership): Promise<EstablishmentScheduleOutputDto>`
            *   Logique : Réservé aux Admins (vérifié par middleware).
            *   Récupère les `Membership`s actifs (`STAFF`, `ADMIN`) de l'établissement (filtrés par `queryDto.membershipIds` si fourni).
            *   Pour chaque membre pertinent :
                *   Récupère ses `StaffAvailability` (règles `rrule`). **Utilise `rrule.js` (ou équivalent) côté serveur** pour calculer les occurrences effectives (`workingRuleOccurrences`) dans la période `startDate` - `endDate` pour chaque règle.
                *   Récupère ses `Booking`s assignées pour la période (filtrées par `queryDto.serviceIds` si fourni).
                *   Récupère ses `TimeOffRequest` avec statut `APPROVED` pour la période.
            *   Assemble les données dans `EstablishmentScheduleOutputDto`.
            *   **(B5 - Détection de Conflits) :** Pour une V1, cette logique est omise du backend. Les conflits peuvent être visuellement identifiés par l'Admin sur le frontend. Une détection de conflits plus avancée côté serveur (populant un champ `detectedConflicts` dans le DTO) est une amélioration pour une V2+.

*   **Contrôleur(s) :**
    *   **Nouveau Contrôleur : `StaffScheduleController.ts`**
        *   `getSchedule(req, res, next)`: Appelle `StaffScheduleService.getEstablishmentSchedule`.

*   **Route(s) :**
    *   `GET /api/establishments/:establishmentId/staff-schedule` (Admin)
        *   Contrôleur: `StaffScheduleController.getSchedule`
        *   Middleware: `requireAuth`, `ensureMembership(['ADMIN'], ':establishmentId')`.
        *   Query: `GetEstablishmentScheduleQueryDto`

*   **Middleware(s) :**
    *   Utilisation du middleware existant `ensureMembership(['ADMIN'], ':establishmentId')`.

*   **Gestion des Erreurs :**
    *   `400 Bad Request`: DTO de requête invalide (dates, etc.).
    *   `403 Forbidden`: Action non autorisée.
    *   `404 Not Found`: `Establishment` non trouvé.

#### 3.4. Considérations Particulières
*   **Performance :** La requête `getEstablishmentSchedule` reste potentiellement lourde. L'utilisation de `rrule.js` côté serveur pour calculer les occurrences de chaque `StaffAvailability` pour chaque membre peut consommer des ressources. Des optimisations (mise en cache des occurrences calculées si la période est standard, requêtes SQL efficaces) seront importantes.
*   **Volume de Données :** Pour de longues périodes ou de nombreux membres, la taille de la réponse JSON peut devenir importante. Une pagination au niveau des membres dans la réponse `staffSchedules` pourrait être envisagée si cela devient un problème, bien que cela complexifie la vue globale.
```

```markdown
[ Plan pour la Fonctionnalité B.10 : Définition de Modèles d'Horaires/Shifts Réutilisables ]

#### 4.1. Rappel de l'Objectif Fonctionnel Principal
Simplifier la création de plannings pour l'Admin en lui permettant de créer des "modèles de shift" (ensembles préconfigurés de règles `rrule` et durées) et de les appliquer à un ou plusieurs membres Staff pour générer automatiquement leurs `StaffAvailability`.

#### 4.2. Décomposition Technique Séquentielle

*   **Modèle(s) :**
    *   **Nouveau Modèle : `ShiftTemplate`**
        *   `id`: `INTEGER.UNSIGNED`, PK, AutoIncrement
        *   `establishmentId`: `INTEGER.UNSIGNED`, FK vers `Establishments.id`, NOT NULL
        *   `name`: `STRING(100)`, NOT NULL
        *   `description`: `TEXT`, NULLABLE
        *   `createdAt`: `DATE`
        *   `updatedAt`: `DATE`
        *   **Associations :**
            *   `belongsTo Establishment as 'establishment'`
            *   `hasMany ShiftTemplateRule as 'rules' { onDelete: 'CASCADE', onUpdate: 'CASCADE' }`
    *   **Nouveau Modèle : `ShiftTemplateRule`**
        *   `id`: `INTEGER.UNSIGNED`, PK, AutoIncrement
        *   `shiftTemplateId`: `INTEGER.UNSIGNED`, FK vers `ShiftTemplates.id`, NOT NULL
        *   `rruleString`: `TEXT`, NOT NULL (Stocke la règle `rrule` *sans* `DTSTART` spécifique, ou avec un `DTSTART` relatif/symbolique. Le `DTSTART` effectif sera basé sur `effectiveStartDate` lors de l'application.)
        *   `startTime`: `TIME` (Ex: '09:00:00'. Utilisé pour construire le `DTSTART` effectif avec `effectiveStartDate`.)
        *   `durationMinutes`: `INTEGER.UNSIGNED`, NOT NULL (`CHECK > 0`)
        *   `isWorking`: `BOOLEAN`, NOT NULL, Default: `true`
        *   `ruleDescription`: `STRING(255)`, NULLABLE
        *   `createdAt`: `DATE`
        *   `updatedAt`: `DATE`
        *   **Associations :**
            *   `belongsTo ShiftTemplate as 'shiftTemplate'`

*   **DTO(s) :**
    *   **`ShiftTemplateRuleInputDto` (Pour création/màj de template) :**
        *   `id`: `z.number().int().positive().optional()` (Pour màj)
        *   `rruleString`: `z.string().min(1)` (Ex: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`)
        *   `startTime`: `z.string().regex(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)` (HH:MM:SS)
        *   `durationMinutes`: `z.number().int().positive()`
        *   `isWorking`: `z.boolean().default(true)`
        *   `ruleDescription`: `z.string().max(255).optional().nullable()`
    *   **`CreateShiftTemplateDto` (Requête - Admin) :**
        *   `name`: `z.string().min(1).max(100)`
        *   `description`: `z.string().optional().nullable()`
        *   `rules`: `z.array(ShiftTemplateRuleInputDto).min(1)`
    *   **`UpdateShiftTemplateDto` (Requête - Admin) :**
        *   `name`: `z.string().min(1).max(100).optional()`
        *   `description`: `z.string().optional().nullable()`
        *   `rules`: `z.array(ShiftTemplateRuleInputDto).min(1).optional()` (Si fourni, remplace les règles)
    *   **`ShiftTemplateRuleOutputDto` (Dans `ShiftTemplateOutputDto`) :**
        *   `id`: `number`
        *   `rruleString`: `string`
        *   `startTime`: `string` (HH:MM:SS)
        *   `durationMinutes`: `number`
        *   `isWorking`: `boolean`
        *   `ruleDescription`: `string | null`
    *   **`ShiftTemplateOutputDto` (Réponse) :**
        *   `id`: `number`
        *   `establishmentId`: `number`
        *   `name`: `string`
        *   `description`: `string | null`
        *   `rules`: `ShiftTemplateRuleOutputDto[]`
        *   `createdAt`: `Date`
        *   `updatedAt`: `Date`
    *   **`ApplyShiftTemplateDto` (Requête - Admin) :**
        *   `membershipIds`: `z.array(z.number().int().positive()).min(1)`
        *   `effectiveStartDate`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
        *   `effectiveEndDate`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()`
        *   `overwriteMode`: `z.enum(['NONE', 'REPLACE_IN_PERIOD', 'REPLACE_TEMPLATE_TAGGED']).default('NONE')`
            *   `NONE`: Ajoute les nouvelles disponibilités, ne supprime rien.
            *   `REPLACE_IN_PERIOD`: Supprime toutes les `StaffAvailability` existantes du/des membre(s) DANS la période `effectiveStartDate` - `effectiveEndDate` avant d'ajouter les nouvelles.
            *   `REPLACE_TEMPLATE_TAGGED`: Supprime uniquement les `StaffAvailability` existantes qui ont été précédemment générées par un template (nécessite de marquer ces `StaffAvailability`). Pour V1, `NONE` ou `REPLACE_IN_PERIOD` sont plus simples.
        *   `(Optionnel) tagForGeneratedAvailabilities`: `z.string().optional()` (Si on veut marquer les `StaffAvailability` générées).

*   **Service(s) :**
    *   **Nouveau Service : `ShiftTemplateService.ts`**
        *   `createShiftTemplate(establishmentId: number, dto: CreateShiftTemplateDto, actorMembership: Membership): Promise<ShiftTemplate>`
        *   `getShiftTemplateById(templateId: number, establishmentId: number, actorMembership: Membership): Promise<ShiftTemplate>`
        *   `listShiftTemplatesForEstablishment(establishmentId: number, actorMembership: Membership): Promise<ShiftTemplate[]>`
        *   `updateShiftTemplate(templateId: number, establishmentId: number, dto: UpdateShiftTemplateDto, actorMembership: Membership): Promise<ShiftTemplate>`
        *   `deleteShiftTemplate(templateId: number, establishmentId: number, actorMembership: Membership): Promise<void>`
        *   `applyShiftTemplateToMembers(templateId: number, establishmentId: number, dto: ApplyShiftTemplateDto, actorMembership: Membership): Promise<{ createdCount: number, overwrittenCount: number }>`
            *   Logique :
                1.  Valide DTO. Récupère `ShiftTemplate` et ses `rules`.
                2.  Pour chaque `membershipId` dans `dto.membershipIds`:
                    *   Vérifie que le membre appartient à `establishmentId`.
                    *   Gestion de `overwriteMode`:
                        *   Si `REPLACE_IN_PERIOD`, supprime les `StaffAvailability` existantes pour ce membre dont `effectiveStartDate` et `effectiveEndDate` (ou la durée de la règle) tombent entièrement ou partiellement dans la période d'application du template. Cette logique de suppression doit être précise pour éviter de supprimer trop ou pas assez.
                    *   Prépare une liste de `StaffAvailability` à créer.
                    *   Pour chaque `rule` dans le template :
                        *   Construire la `rruleString` finale pour `StaffAvailability` : prendre `rule.rruleString` et y ajouter/modifier `DTSTART`. Le `DTSTART` sera `dto.effectiveStartDate` combiné avec `rule.startTime` et converti en UTC. (Ex: `dto.effectiveStartDate` = '2024-07-01', `rule.startTime` = '09:00:00' -> `DTSTART=20240701T090000Z`).
                        *   Si `dto.effectiveEndDate` est fourni, ajouter `UNTIL=dto.effectiveEndDate` (converti en UTC, fin de journée) à la `rruleString` si elle n'a pas déjà un `COUNT` ou `UNTIL` plus restrictif.
                        *   Crée un objet `StaffAvailability` (sans le sauvegarder encore) avec :
                            *   `membershipId`: `current_membershipId`
                            *   `rruleString`: La `rruleString` construite ci-dessus.
                            *   `durationMinutes`: `rule.durationMinutes`
                            *   `effectiveStartDate`: `dto.effectiveStartDate`
                            *   `effectiveEndDate`: `dto.effectiveEndDate`
                            *   `isWorking`: `rule.isWorking`
                            *   `description`: `ShiftTemplate.name + ' - ' + (rule.ruleDescription || 'Auto-generated')`
                            *   `(Optionnel) templateAppliedTag`: `dto.tagForGeneratedAvailabilities || templateId`
                    *   Insérer en masse (batch create) les nouvelles `StaffAvailability` pour ce membre.
                3.  Retourne le nombre de `StaffAvailability` créées et écrasées.
    *   **(Optionnel) `StaffAvailabilityService.ts`**
        *   Méthode pour supprimer les `StaffAvailability` d'un membre dans une période donnée, ou celles taguées par un template.

*   **Contrôleur(s) :**
    *   **Nouveau Contrôleur : `ShiftTemplateController.ts`** (hébergé par exemple dans `src/controllers/admin/ShiftTemplateController.ts`)
        *   Méthodes CRUD standard: `create`, `getById`, `listForEstablishment`, `update`, `delete`.
        *   `applyToMembers(req, res, next)`

*   **Route(s) :**
    *   Routes CRUD imbriquées sous `/api/establishments/:establishmentId/shift-templates`:
        *   `POST /` -> `ShiftTemplateController.create`
        *   `GET /` -> `ShiftTemplateController.listForEstablishment`
        *   `GET /:templateId` -> `ShiftTemplateController.getById`
        *   `PUT /:templateId` -> `ShiftTemplateController.update`
        *   `DELETE /:templateId` -> `ShiftTemplateController.delete`
    *   Route d'application :
        *   `POST /:templateId/apply` -> `ShiftTemplateController.applyToMembers`
    *   **(Middlewares Communs pour toutes ces routes):** `requireAuth`, `ensureMembership(['ADMIN'], ':establishmentId')` (l'acteur doit être Admin de l'établissement), `verifyCsrfToken` (pour POST/PUT/DELETE).

*   **Middleware(s) :**
    *   Utilisation du middleware existant `ensureMembership(['ADMIN'], ':establishmentId')`.

*   **Gestion des Erreurs :**
    *   `400 Bad Request`: DTO invalide, `rruleString` invalide dans un template, `membershipIds` contenant des membres non liés à l'établissement.
    *   `404 Not Found`: `ShiftTemplate`, `Establishment` non trouvé.
    *   Erreurs lors de la construction des `rruleString` finales (ex: date/heure invalide).

#### 4.3. Considérations Particulières
*   **Construction du `DTSTART` effectif :** Le champ `startTime` dans `ShiftTemplateRule` est crucial. Il est combiné avec `dto.effectiveStartDate` lors de l'application pour former le `DTSTART` de chaque `rrule` à insérer dans `StaffAvailability`. La gestion des fuseaux horaires doit être cohérente (stocker/traiter en UTC).
*   **Complexité de `overwriteMode` :** `REPLACE_IN_PERIOD` est le mode d'écrasement le plus utile mais demande une logique de suppression précise des `StaffAvailability` existantes.
*   **Interface Utilisateur (UI) :** L'UI pour créer des `ShiftTemplateRule` devra être intuitive, peut-être avec des aides pour construire les `rruleString` et `startTime`.
*   **Performance de l'application :** L'application d'un template à de nombreux membres peut générer un grand nombre d'écritures en base de données. Utiliser des transactions et des opérations en masse (batch-insert pour `StaffAvailability`) est recommandé.
*   **Validation des `rruleString` :** Idéalement, valider la syntaxe des `rruleString` dès la création/mise à jour du `ShiftTemplateRule` en utilisant `rrule.js` côté serveur pour éviter les erreurs lors de l'application.
```
---


Ok NexusAI, merci pour le prompt précédent.

Voici la **réponse exacte** que j'ai obtenu de **CodeArchitect-TS** en utilisant le prompt que tu as fourni :

```response :
C'est une excellente initiative de vouloir définir clairement le périmètre fonctionnel avant de se lancer dans l'implémentation. En m'appuyant sur ma compréhension des documents fournis et l'objectif de gestion de planning pour les membres Staff, voici une proposition de fonctionnalités pertinentes pour le module "Gestion de planning des Membres" :

---

**Fonctionnalités Proposées pour le Module "Gestion de Planning des Membres Staff"**

**A. Fonctionnalités Centrées sur le Membre Staff (Autonomie et Visibilité)**

1.  **Tableau de Bord du Planning Personnel (Vue Staff)**
    *   **Objectif :** Fournir au membre Staff une vue claire et interactive de son propre emploi du temps.
    *   **Description :** Affichage calendaire (jour, semaine, mois) de ses blocs de travail définis (via `StaffAvailability`), de ses réservations assignées (`Booking`), et de ses périodes d'indisponibilité (congés, absences).
    *   **Bénéficiaire :** Membre Staff.
    *   **Interactions Clés :**
        *   Lecture des `StaffAvailability` où `membershipId` est celui du membre connecté.
        *   Lecture des `Booking` où `assignedMembershipId` est celui du membre connecté.
        *   Interaction avec le futur système de `TimeOffRequest` (voir point 3).

2.  **Gestion Intuitive de ses Disponibilités Personnelles (Extension de `StaffAvailability`)**
    *   **Objectif :** Simplifier la manière dont un membre Staff définit et met à jour ses horaires de travail réguliers ou ses indisponibilités récurrentes.
    *   **Description :** Interface utilisateur dédiée et conviviale (potentiellement plus visuelle que la gestion brute de `rrule`) pour créer, modifier, et supprimer ses propres enregistrements `StaffAvailability`.
    *   **Bénéficiaire :** Membre Staff.
    *   **Interactions Clés :**
        *   CRUD sur le modèle `StaffAvailability` pour ses propres enregistrements (sécurisé par `ensureMembershipAccess`).
        *   Impacte directement les calculs de `AvailabilityService` pour ce membre et pour les services auxquels il est assigné.

3.  **Soumission et Suivi des Demandes de Congés/Absences**
    *   **Objectif :** Permettre aux membres Staff de demander formellement des périodes d'indisponibilité (congés payés, maladie, absence non planifiée) qui nécessitent une approbation.
    *   **Description :** Un système où le membre Staff peut soumettre une demande avec dates, type d'absence, et motif. Il peut ensuite suivre le statut de sa demande (En attente, Approuvée, Rejetée).
    *   **Bénéficiaires :** Membre Staff (initiateur), Admin de l'établissement (approbateur).
    *   **Interactions Clés :**
        *   Nécessite un nouveau modèle (ex: `TimeOffRequest`) lié au `Membership`, avec des champs comme `startDate`, `endDate`, `type`, `reason`, `status`.
        *   À l'approbation par un Admin, une règle `StaffAvailability` (avec `isWorking=false`) pourrait être automatiquement créée pour le membre.
        *   Notification à l'Admin lors de la soumission, et au membre Staff lors du changement de statut.

4.  **Notifications Personnalisées liées au Planning**
    *   **Objectif :** Informer activement les membres Staff des événements importants concernant leur planning.
    *   **Description :** Envoi de notifications (in-app, et potentiellement email via `NotificationService`) pour :
        *   Nouvelle réservation assignée.
        *   Modification ou annulation d'une réservation assignée.
        *   Approbation ou rejet d'une demande de congé.
        *   Modification de ses `StaffAvailability` par un Admin.
    *   **Bénéficiaire :** Membre Staff.
    *   **Interactions Clés :** Déclenché par des opérations CRUD sur `Booking` (si `assignedMembershipId` concerné), `TimeOffRequest`, ou `StaffAvailability`.

**B. Fonctionnalités Centrées sur l'Admin de l'Établissement (Supervision et Optimisation)**

5.  **Vue d'Ensemble du Planning de l'Équipe (Vue Admin)**
    *   **Objectif :** Offrir à l'Admin une vision globale et centralisée des plannings de tous les membres Staff, facilitant la coordination et l'identification des disponibilités.
    *   **Description :** Affichage calendaire (jour, semaine, mois) permettant de superposer ou de visualiser côte à côte les plannings des membres. Inclut les blocs de travail, les réservations assignées, et les absences approuvées. Possibilité de filtrer par membre(s) ou par service(s).
    *   **Bénéficiaire :** Admin de l'établissement.
    *   **Interactions Clés :**
        *   Lecture des `StaffAvailability` de tous les membres de l'établissement.
        *   Lecture des `Booking` de l'établissement, avec indication du membre assigné.
        *   Lecture des `TimeOffRequest` approuvées.

6.  **Gestion Centralisée des Disponibilités des Membres (par Admin)**
    *   **Objectif :** Permettre à l'Admin de définir ou de modifier directement les `StaffAvailability` (horaires de travail, indisponibilités) pour n'importe quel membre Staff de son établissement.
    *   **Description :** L'Admin peut intervenir sur les `StaffAvailability` de ses membres, par exemple pour initialiser un planning, corriger une erreur, ou gérer une absence imprévue.
    *   **Bénéficiaire :** Admin de l'établissement.
    *   **Interactions Clés :**
        *   CRUD sur le modèle `StaffAvailability` pour tous les membres de son établissement (sécurisé par `ensureMembershipAccess` ou un middleware similaire pour Admin).
        *   Notification au membre Staff concerné en cas de modification par l'Admin.

7.  **Gestion des Demandes de Congés/Absences (Approbation)**
    *   **Objectif :** Fournir à l'Admin une interface pour examiner et traiter les demandes de congés soumises par les membres Staff.
    *   **Description :** Liste des `TimeOffRequest` en attente, avec la possibilité pour l'Admin de les approuver ou de les rejeter (avec un motif optionnel).
    *   **Bénéficiaire :** Admin de l'établissement.
    *   **Interactions Clés :**
        *   Mise à jour du statut des `TimeOffRequest`.
        *   Si approbation, potentielle création/modification automatique d'une `StaffAvailability` (`isWorking=false`).
        *   Notification au membre Staff du résultat.

8.  **Outils d'Assignation et de Réassignation des Réservations**
    *   **Objectif :** Faciliter l'attribution des réservations aux membres Staff compétents et disponibles.
    *   **Description :** L'Admin peut visualiser les réservations non assignées ou modifier l'assignation existante. Le système pourrait suggérer des membres éligibles (assignés au service, disponibles selon leur `StaffAvailability` et leurs réservations existantes).
    *   **Bénéficiaire :** Admin de l'établissement.
    *   **Interactions Clés :**
        *   Modification du champ `assignedMembershipId` sur le modèle `Booking`.
        *   Nécessite de vérifier :
            *   L'association du membre au `Service` (via `ServiceMemberAssignment`).
            *   La disponibilité réelle du membre au moment de la réservation (via `AvailabilityService`, en considérant ses `StaffAvailability` et autres `Booking`s).
        *   Notification au membre Staff concerné (ancien et nouveau si réassignation).

9.  **Détection et Signalement de Conflits de Planning**
    *   **Objectif :** Aider l'Admin à identifier proactivement les problèmes dans le planning.
    *   **Description :** Le système pourrait signaler visuellement dans la vue planning de l'Admin les conflits potentiels :
        *   Un membre Staff assigné à deux réservations simultanées.
        *   Une réservation assignée en dehors des heures de travail définies d'un membre (si l'assignation manuelle a outrepassé les règles de `StaffAvailability`).
        *   Un service avec une forte demande mais peu de Staff disponible.
    *   **Bénéficiaire :** Admin de l'établissement.
    *   **Interactions Clés :** Analyse croisée des `Booking`s, `StaffAvailability`, et `ServiceMemberAssignment`.

**C. Fonctionnalités Avancées et Améliorations Expérience Utilisateur**

10. **Définition de Modèles d'Horaires/Shifts Réutilisables**
    *   **Objectif :** Simplifier la création de plannings pour l'Admin, surtout si l'établissement fonctionne avec des roulements ou des horaires types.
    *   **Description :** L'Admin peut créer des "modèles de shift" (ex: "Shift Matin Lundi-Vendredi 9h-13h", "Shift Soir Week-end 17h-22h") qui sont essentiellement des ensembles préconfigurés de règles `rrule` et de durées. Il peut ensuite appliquer ces modèles à un ou plusieurs membres Staff pour une période donnée, générant ainsi automatiquement les `StaffAvailability` correspondantes.
    *   **Bénéficiaire :** Admin de l'établissement.
    *   **Interactions Clés :**
        *   Nécessite un nouveau modèle (ex: `ShiftTemplate`).
        *   L'application d'un template à un membre déclencherait la création de plusieurs enregistrements `StaffAvailability`.

11. **Export du Planning (ICS / PDF)**
    *   **Objectif :** Permettre aux utilisateurs (Staff et Admin) d'exporter leur planning ou celui de l'équipe dans des formats standards.
    *   **Description :**
        *   Pour le membre Staff : un bouton pour exporter son planning personnel au format ICS (compatible avec Google Calendar, Outlook, etc.).
        *   Pour l'Admin : un bouton pour exporter le planning de l'équipe (filtré) au format ICS ou PDF pour impression/partage.
    *   **Bénéficiaires :** Membre Staff, Admin de l'établissement.
    *   **Interactions Clés :** Génération de fichiers ICS ou PDF à partir des données de planning.

12. **Journal des Modifications du Planning (Audit Simplifié)**
    *   **Objectif :** Fournir une traçabilité basique des changements importants apportés au planning d'un membre.
    *   **Description :** Lorsqu'une `StaffAvailability` d'un membre est modifiée par un Admin, ou lorsqu'une réservation lui est assignée/réassignée, un log simple pourrait être enregistré et visible (par ex. dans les détails du membre ou une section "Historique").
    *   **Bénéficiaires :** Admin de l'établissement, Membre Staff (pour comprendre les changements).
    *   **Interactions Clés :** Enregistrement d'événements lors de modifications de `StaffAvailability` ou `Booking.assignedMembershipId`.

---

Cette liste couvre un éventail de fonctionnalités, des plus fondamentales aux plus avancées. Certaines, comme la détection de conflits ou les modèles de shifts, apporteraient une valeur ajoutée significative mais représentent une complexité d'implémentation plus élevée.

Nous pourrons discuter de la priorisation de ces fonctionnalités pour définir un périmètre réaliste pour une première version du module. Je suis prêt à passer à l'étape suivante lorsque vous le souhaitez.
```
---

**Mon feedback** :
Très bien, nous partageons cette vision. Dans un premier temps, nous allons nous focaliser sur le point suivant : **B. Fonctionnalités Centrées sur l'Admin de l'Établissement (Supervision et Optimisation)**. Nous travaillerons sur le backend pendant qu'une autre équipe se focalisera sur le frontend.

Nous développerons le module étape par étape en prenant en compte le workflow (au minimum) de mise à jour suivant :
**adaptation fichier model -> adaptation fichier dtos -> adaptation fichier service -> adaptation fichier contrôleur -> adaptation fichier route -> adaptation middlewares -> adaptation fichier erreur**.

Avant de commencer à écrire du code, nous voulons que tu définisse un plan d'implémentation fonctionnel et technique, couvrant tous les aspects du point **B. Fonctionnalités Centrées sur l'Admin de l'Établissement (Supervision et Optimisation)**, qui nous servira de plan d'action. Ce plan doit être extrêmement accessible, pouvant être suivi étape par étape. Une fois que nous aurons valider ce plan, nous pourrons commencer à les implémenter.
---

Pour toi **NexusAI** : Peux-tu me fournir le prochain prompt optimisé basé sur ces éléments ?