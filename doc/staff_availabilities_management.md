---

**Documentation Technique du Module - Gestion de Planning (APP_NAME)**

**Fonctionnalité : Gestion Manuelle des Disponibilités des Membres (par Admin)**

**Version:** 0.1 (Date: [Date Actuelle])

**Table des Matières**

1.  **Introduction et Objectifs**
    *   1.1. Vue d'Ensemble de la Fonctionnalité
    *   1.2. Cas d'Usage Principaux (Admin de l'Établissement)
2.  **Modèle de Données Concerné : `StaffAvailability`**
    *   2.1. Rôle du Modèle dans la Gestion Manuelle
    *   2.2. Détail des Colonnes Clés et Leur Interprétation
    *   2.3. Colonne de Traçage : `created_by_membership_id`
    *   2.4. Colonne de Liaison aux Templates : `applied_shift_template_rule_id` et son Comportement
3.  **Logique Métier : Service `StaffAvailabilityService.ts`**
    *   3.1. Rôle et Responsabilités Globales
    *   3.2. Méthodes Publiques Détaillées
        *   3.2.1. `createStaffAvailability`
        *   3.2.2. `getStaffAvailabilityById`
        *   3.2.3. `listStaffAvailabilitiesForMember`
        *   3.2.4. `updateStaffAvailability`
        *   3.2.5. `deleteStaffAvailability`
4.  **API : Contrôleur `StaffAvailabilityController.ts` et Endpoints**
    *   4.1. Rôle et Responsabilités du Contrôleur
    *   4.2. Tableau Récapitulatif des Endpoints
    *   4.3. Détail de Chaque Endpoint API
        *   4.3.1. `POST /api/users/me/establishments/:establishmentId/memberships/:membershipId/availabilities`
        *   4.3.2. `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId/availabilities`
        *   4.3.3. `GET /api/users/me/establishments/:establishmentId/staff-availabilities-management/availabilities/:availabilityId`
        *   4.3.4. `PATCH /api/users/me/establishments/:establishmentId/staff-availabilities-management/availabilities/:availabilityId`
        *   4.3.5. `DELETE /api/users/me/establishments/:establishmentId/staff-availabilities-management/availabilities/:availabilityId`
5.  **DTOs (Data Transfer Objects) et Validation (Zod)**
    *   5.1. `CreateStaffAvailabilityDtoSchema`
    *   5.2. `UpdateStaffAvailabilityDtoSchema`
    *   5.3. `StaffAvailabilityOutputDtoSchema`
    *   5.4. `ListStaffAvailabilitiesQueryDtoSchema`
6.  **Middlewares d'Autorisation Clés**
    *   6.1. `requireAuth` et `ensureMembership([MembershipRole.ADMIN])`
    *   6.2. `loadTargetMembershipForAdminAction`
    *   6.3. Vérification d'Appartenance au Niveau du Service
7.  **Workflows Clés (Gestion Manuelle)**
    *   7.1. Création d'une Disponibilité pour un Membre
    *   7.2. Modification d'une Disponibilité Existante
8.  **Gestion des Erreurs Spécifiques**
    *   8.1. `StaffAvailabilityNotFoundError`
    *   8.2. `StaffAvailabilityCreationError`
    *   8.3. `StaffAvailabilityUpdateError`
    *   8.4. `MembershipNotFoundError` (dans ce contexte)
9.  **Annexe**
    *   9.1. Exemples de Payloads JSON

---

**1. Introduction et Objectifs**

Ce document détaille les aspects techniques de la fonctionnalité permettant aux administrateurs d'établissements de gérer manuellement les disponibilités individuelles (`StaffAvailability`) des membres de leur personnel au sein de l'application "APP_NAME".

*   **1.1. Vue d'Ensemble de la Fonctionnalité**
    La gestion manuelle des `StaffAvailability` offre aux administrateurs (`Admin`) un contrôle direct et granulaire sur les horaires de travail et les périodes d'indisponibilité de chaque membre du personnel (`Staff`) de leur établissement. Contrairement aux disponibilités générées par l'application de "Shift Templates", cette fonctionnalité permet des ajustements ponctuels, la création de règles de disponibilité ad hoc, ou la correction d'horaires spécifiques pour un membre. Elle complète la gestion des absences formelles (via les demandes de congés) et la planification par templates en offrant une flexibilité maximale.

*   **1.2. Cas d'Usage Principaux (Admin de l'Établissement)**
    L'administrateur de l'établissement est l'utilisateur principal de cette fonctionnalité. Ses actions typiques incluent :
    *   **Créer une nouvelle règle de disponibilité/indisponibilité pour un membre spécifique :** Définir une récurrence (via une chaîne `rrule`), une durée, des dates de début/fin effectives, et si la période correspond à du temps de travail ou non. Utile pour des horaires spécifiques non couverts par des templates, ou pour bloquer des périodes d'indisponibilité imprévues.
    *   **Consulter les règles de disponibilité d'un membre :** Lister toutes les `StaffAvailability` (manuelles ou issues de templates) pour un membre donné, avec des options de filtrage.
    *   **Modifier une règle de disponibilité existante d'un membre :** Ajuster la récurrence, la durée, les dates, ou la description d'une règle `StaffAvailability`. Si la règle modifiée avait été générée par un template, elle est "détachée" de ce dernier.
    *   **Supprimer une règle de disponibilité d'un membre :** Retirer une règle `StaffAvailability` qui n'est plus applicable.

---

**2. Modèle de Données Concerné : `StaffAvailability`**

Le modèle `StaffAvailability` (table `staff_availabilities`) est l'entité centrale pour cette fonctionnalité, comme il l'est pour les disponibilités générées par les templates. Sa structure permet de stocker des règles de disponibilité flexibles, qu'elles soient créées manuellement ou via un template.

*   **2.1. Rôle du Modèle dans la Gestion Manuelle**
    Lorsqu'un administrateur gère manuellement les disponibilités d'un membre, il interagit directement avec les enregistrements de la table `staff_availabilities`. Chaque enregistrement représente une règle (récurrente ou ponctuelle) qui définit une période de travail ou d'indisponibilité pour un `Membership` spécifique.

*   **2.2. Détail des Colonnes Clés et Leur Interprétation lors d'une Gestion Manuelle**

    | Nom de la Colonne (BDD)    | Type de Données (Sequelize) | Signification dans la Gestion Manuelle                                                                                                                                                             |
        |----------------------------|-----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `id`                       | `INTEGER.UNSIGNED`          | Identifiant unique de la règle de disponibilité.                                                                                                                                                     |
    | `membership_id`            | `INTEGER.UNSIGNED`          | ID du `Membership` du membre Staff concerné par cette règle.                                                                                                                                           |
    | `rrule_string`             | `TEXT`                      | Chaîne `rrule` (`RFC 5545`) définissant la récurrence. Pour une règle manuelle, il est attendu que `DTSTART` soit fourni avec une heure (ex: `DTSTART=20240902T090000` ou `FREQ=WEEKLY;BYDAY=MO;DTSTART=T090000`). Le service `AvailabilityService` interprétera cette heure dans le fuseau horaire de l'établissement lors de la génération des occurrences de disponibilité.                |
    | `duration_minutes`         | `INTEGER.UNSIGNED`          | Durée en minutes de chaque bloc de temps généré par la `rruleString`. Doit être > 0.                                                                                                                   |
    | `is_working`               | `BOOLEAN`                   | `true` si la règle définit une période de travail (disponibilité), `false` pour une indisponibilité (ex: absence ponctuelle définie par l'admin, ou pause).                                         |
    | `effective_start_date`     | `DATEONLY` (`string`)       | Date (format `YYYY-MM-DD`) à partir de laquelle cette règle commence à s'appliquer.                                                                                                                    |
    | `effective_end_date`       | `DATEONLY` (`string`\|`null`)| Date optionnelle (format `YYYY-MM-DD`) à laquelle cette règle cesse de s'appliquer. Si `null`, la règle s'applique indéfiniment (ou jusqu'à la date `UNTIL` dans la `rruleString`).                 |
    | `description`              | `STRING(255)`\|`null`       | Description textuelle optionnelle fournie par l'administrateur pour cette règle spécifique.                                                                                                            |
    | `created_at`               | `DATE`                      | Timestamp de création de la règle.                                                                                                                                                                   |
    | `updated_at`               | `DATE`                      | Timestamp de la dernière modification de la règle.                                                                                                                                                   |

*   **2.3. Colonne de Traçage : `created_by_membership_id`**
    *   **Nom de la Colonne (BDD) :** `created_by_membership_id`
    *   **Type de Données :** `INTEGER.UNSIGNED`, `NULLABLE`, FK vers `memberships.id` (`ON DELETE SET NULL`).
    *   **Signification :**
        *   Lorsqu'un administrateur crée ou modifie manuellement une `StaffAvailability` pour un membre, cette colonne stocke l'ID du `Membership` de cet administrateur.
        *   Cela permet de savoir quel administrateur a initié ou dernièrement modifié manuellement la règle.
        *   Pour les `StaffAvailability` générées par l'application d'un `ShiftTemplate`, cette colonne est également renseignée avec l'ID du `Membership` de l'administrateur qui a *appliqué* le template.

*   **2.4. Colonne de Liaison aux Templates : `applied_shift_template_rule_id` et son Comportement**
    *   **Nom de la Colonne (BDD) :** `applied_shift_template_rule_id`
    *   **Type de Données :** `INTEGER.UNSIGNED`, `NULLABLE`, FK vers `shift_template_rules.id` (`ON DELETE SET NULL`).
    *   **Signification lors de la Gestion Manuelle :**
        *   **Création Manuelle :** Lorsqu'un administrateur crée une nouvelle `StaffAvailability` manuellement (non issue d'un template), la valeur de `applied_shift_template_rule_id` est explicitement mise à `NULL`.
        *   **Modification Manuelle :** Si un administrateur modifie une `StaffAvailability` qui avait été *précédemment générée par un Shift Template* (c'est-à-dire que `applied_shift_template_rule_id` avait une valeur), le `StaffAvailabilityService.updateStaffAvailability` mettra cette colonne à `NULL`.
        *   **Comportement :** Ce mécanisme "détache" la règle de disponibilité de son template d'origine dès qu'elle est modifiée manuellement. Elle devient alors une règle purement manuelle et ne sera plus affectée par les réapplications ou modifications ultérieures du template dont elle était issue. Cela donne à l'admin la flexibilité de personnaliser les horaires générés par un template sans perdre la configuration initiale du template lui-même pour d'autres applications.

---

**3. Logique Métier : Service `StaffAvailabilityService.ts`**

Ce service est dédié à la gestion des opérations CRUD directes sur les enregistrements `StaffAvailability` par un administrateur.

*   **3.1. Rôle et Responsabilités Globales du Service dans le cadre de la gestion manuelle par un admin**
    Le `StaffAvailabilityService` est responsable de :
    *   Permettre aux administrateurs de créer, lire, mettre à jour et supprimer des règles de disponibilité (`StaffAvailability`) pour les membres de leur propre établissement.
    *   Valider les données fournies pour une `StaffAvailability` (ex: cohérence des dates, validité basique de la `rruleString`, positivité de la durée).
    *   S'assurer que les opérations sont effectuées sur des `Membership`s valides et appartenant à l'établissement de l'administrateur effectuant l'action.
    *   Gérer la logique de "détachement" d'une `StaffAvailability` de son template d'origine (en mettant `appliedShiftTemplateRuleId` à `NULL`) si elle est modifiée manuellement.
    *   Tracer l'auteur de la création/modification manuelle via le champ `createdByMembershipId`.
    *   Lever des erreurs métier spécifiques (ex: `StaffAvailabilityNotFoundError`, `StaffAvailabilityCreationError`) en cas de problème.

*   **3.2. Détail des Méthodes Publiques**

    *   **3.2.1. `createStaffAvailability(dto: CreateStaffAvailabilityDto, actorAdminMembership: MembershipAttributes, targetMembershipId: number): Promise<StaffAvailabilityAttributes>`**
        *   **Fonction :** Crée une nouvelle règle de `StaffAvailability` manuelle pour un membre spécifique (`targetMembershipId`) au nom d'un administrateur (`actorAdminMembership`).
        *   **Paramètres :**
            *   `dto: CreateStaffAvailabilityDto`: Objet contenant les détails de la règle à créer (`rruleString`, `durationMinutes`, `isWorking`, `effectiveStartDate`, `effectiveEndDate?`, `description?`).
            *   `actorAdminMembership: MembershipAttributes`: Le `Membership` de l'administrateur effectuant la création. Son `establishmentId` est utilisé pour valider l'appartenance du `targetMembershipId`, et son `id` pour `createdByMembershipId`.
            *   `targetMembershipId: number`: L'ID du `Membership` du membre pour qui la règle est créée.
        *   **Retour :** `Promise<StaffAvailabilityAttributes>` - L'enregistrement `StaffAvailability` nouvellement créé.
        *   **Logique Clé :**
            1.  Valide la `dto.rruleString` (via `RRule.fromString()`).
            2.  Valide les champs communs (`durationMinutes`, cohérence `effectiveStartDate`/`effectiveEndDate`).
            3.  Vérifie que le `targetMembership` (identifié par `targetMembershipId`) existe et appartient au même `establishmentId` que l'`actorAdminMembership`. Lève `MembershipNotFoundError` si ce n'est pas le cas.
            4.  Prépare les données pour la création, en s'assurant que `membershipId` est `targetMembershipId`, `createdByMembershipId` est `actorAdminMembership.id`, et `appliedShiftTemplateRuleId` est explicitement `null` (car c'est une création manuelle).
            5.  Crée l'enregistrement `StaffAvailability` en base de données.
        *   **Validations Importantes :** Format de `rruleString`, dates effectives, durée, appartenance du membre cible à l'établissement de l'admin.
        *   **Erreurs Spécifiques :** `StaffAvailabilityCreationError`, `MembershipNotFoundError`.

    *   **3.2.2. `getStaffAvailabilityById(staffAvailabilityId: number, establishmentId: number): Promise<StaffAvailabilityAttributes | null>`**
        *   **Fonction :** Récupère une `StaffAvailability` spécifique par son ID, en s'assurant qu'elle appartient à l'établissement spécifié (celui de l'admin).
        *   **Paramètres :**
            *   `staffAvailabilityId: number`: L'ID de la `StaffAvailability` à récupérer.
            *   `establishmentId: number`: L'ID de l'établissement de l'administrateur effectuant la requête.
        *   **Retour :** `Promise<StaffAvailabilityAttributes | null>` - L'enregistrement `StaffAvailability` trouvé ou `null` s'il n'existe pas ou n'appartient pas à l'établissement.
        *   **Logique Clé :**
            1.  Recherche la `StaffAvailability` par `staffAvailabilityId`.
            2.  Inclut l'association `membership` pour pouvoir vérifier `membership.establishmentId`.
            3.  Si trouvée, vérifie que `staffAvailability.membership.establishmentId` est égal à l'`establishmentId` fourni. Si ce n'est pas le cas, retourne `null` (ou pourrait lever une erreur d'autorisation selon la stratégie). L'implémentation actuelle retourne `null` si la condition n'est pas remplie après la jointure.
        *   **Validations Importantes :** Appartenance de la règle de disponibilité à l'établissement de l'admin.
        *   **Erreurs Spécifiques :** Aucune directement (retourne `null`). Le contrôleur gère le cas `null` en levant `StaffAvailabilityNotFoundError`.

    *   **3.2.3. `listStaffAvailabilitiesForMember(targetMembershipId: number, establishmentId: number, queryDto: ListStaffAvailabilitiesQueryDto): Promise<PaginationDto<StaffAvailabilityAttributes>>`**
        *   **Fonction :** Liste toutes les `StaffAvailability` pour un membre spécifique (`targetMembershipId`), en s'assurant que ce membre appartient à l'établissement de l'admin. Supporte la pagination et des filtres de base.
        *   **Paramètres :**
            *   `targetMembershipId: number`: L'ID du `Membership` du membre dont on veut lister les disponibilités.
            *   `establishmentId: number`: L'ID de l'établissement de l'administrateur.
            *   `queryDto: ListStaffAvailabilitiesQueryDto`: Contient les options de pagination (`page`, `limit`), de tri (`sortBy`, `sortOrder`), et de filtrage (`isWorking?`, `filterRangeStart?`, `filterRangeEnd?`).
        *   **Retour :** `Promise<PaginationDto<StaffAvailabilityAttributes>>` - Un objet contenant les données paginées et les informations de pagination.
        *   **Logique Clé :**
            1.  Vérifie que le `targetMembership` (identifié par `targetMembershipId`) existe et appartient à `establishmentId`. Lève `MembershipNotFoundError` sinon.
            2.  Construit les conditions `WHERE` basées sur `targetMembershipId` et les filtres optionnels (`isWorking`, plage de dates).
            3.  Effectue une requête `findAndCountAll` avec `limit`, `offset`, et `order`.
            4.  Utilise `createPaginationResult` pour formater la réponse.
        *   **Validations Importantes :** Appartenance du membre cible à l'établissement de l'admin.
        *   **Erreurs Spécifiques :** `MembershipNotFoundError`.

    *   **3.2.4. `updateStaffAvailability(staffAvailabilityId: number, dto: UpdateStaffAvailabilityDto, establishmentId: number, actorAdminMembershipId: number): Promise<StaffAvailabilityAttributes>`**
        *   **Fonction :** Met à jour une `StaffAvailability` existante. Si la règle modifiée était issue d'un template, elle est "détachée".
        *   **Paramètres :**
            *   `staffAvailabilityId: number`: L'ID de la `StaffAvailability` à mettre à jour.
            *   `dto: UpdateStaffAvailabilityDto`: Objet contenant les champs à mettre à jour (tous optionnels).
            *   `establishmentId: number`: L'ID de l'établissement de l'admin, pour vérifier la propriété.
            *   `actorAdminMembershipId: number`: L'ID du `Membership` de l'admin effectuant la mise à jour (pour `createdByMembershipId`).
        *   **Retour :** `Promise<StaffAvailabilityAttributes>` - L'enregistrement `StaffAvailability` mis à jour.
        *   **Logique Clé :**
            1.  Récupère la `StaffAvailability` par `staffAvailabilityId`, en s'assurant (via `include` et `where` sur le `Membership` associé) qu'elle appartient à l'`establishmentId` de l'admin. Lève `StaffAvailabilityNotFoundError` si non trouvée ou si elle n'appartient pas à l'établissement.
            2.  Si `dto.rruleString` est fourni, le valide.
            3.  Valide les champs communs (`durationMinutes`, cohérence des dates effectives) avec les valeurs existantes si non fournies dans le DTO.
            4.  Prépare l'objet `updateData` avec les champs du DTO.
            5.  **Logique de Détachement :** Si `existingStaffAvailability.appliedShiftTemplateRuleId` a une valeur (c'est-à-dire qu'elle vient d'un template) ET que `dto` contient au moins un champ à mettre à jour, alors `updateData.appliedShiftTemplateRuleId` est mis à `NULL`. La description peut aussi être préfixée pour indiquer une modification manuelle.
            6.  Met à jour `createdByMembershipId` (ou un champ `lastModifiedByMembershipId` si préféré sémantiquement) avec `actorAdminMembershipId`.
            7.  Effectue la mise à jour en base de données.
            8.  Re-récupère l'instance mise à jour pour retourner toutes les données.
        *   **Validations Importantes :** Appartenance de la règle à l'établissement de l'admin, validité des champs fournis dans le DTO.
        *   **Erreurs Spécifiques :** `StaffAvailabilityNotFoundError`, `StaffAvailabilityUpdateError`, `StaffAvailabilityCreationError` (si `validateCommonFields` ou `validateRRuleString` échouent).

    *   **3.2.5. `deleteStaffAvailability(staffAvailabilityId: number, establishmentId: number): Promise<void>`**
        *   **Fonction :** Supprime une `StaffAvailability` existante.
        *   **Paramètres :**
            *   `staffAvailabilityId: number`: L'ID de la `StaffAvailability` à supprimer.
            *   `establishmentId: number`: L'ID de l'établissement de l'admin.
        *   **Retour :** `Promise<void>`
        *   **Logique Clé :**
            1.  Récupère la `StaffAvailability` par `staffAvailabilityId`, en s'assurant (via `include` et `where` sur le `Membership` associé) qu'elle appartient à l'`establishmentId` de l'admin. Lève `StaffAvailabilityNotFoundError` sinon.
            2.  Supprime l'enregistrement.
        *   **Validations Importantes :** Appartenance de la règle à l'établissement de l'admin.
        *   **Erreurs Spécifiques :** `StaffAvailabilityNotFoundError`.

---

**4. API : Contrôleur `StaffAvailabilityController.ts` et Endpoints**

*   **4.1. Rôle et Responsabilités du Contrôleur (`StaffAvailabilityController`)**
    Le `StaffAvailabilityController` gère les requêtes HTTP relatives à la gestion manuelle des `StaffAvailability` par un administrateur. Il assure la liaison entre les routes API et le `StaffAvailabilityService`. Ses tâches incluent :
    1.  Recevoir les requêtes HTTP pour les opérations CRUD sur les `StaffAvailability` d'un membre spécifique ou par ID direct de disponibilité.
    2.  Valider les données d'entrée (`req.body`, `req.query`, `req.params`) via les schémas Zod de `staff-availability.validation.ts`.
    3.  Extraire les informations contextuelles : `req.membership` (l'admin authentifié), `establishmentId`, `targetMembershipId` (si applicable), `availabilityId`.
    4.  Appeler les méthodes appropriées du `StaffAvailabilityService`.
    5.  Formater les réponses HTTP (200, 201, 204) avec les `StaffAvailabilityOutputDto` ou les données de pagination.
    6.  Déléguer la gestion des erreurs au middleware global.

*   **4.2. Tableau Récapitulatif des Endpoints**
    *(Préfixe commun de base : `/api/users/me/establishments/:establishmentId`)*
    *(Toutes ces routes sont destinées aux Admins et nécessitent `requireAuth` et `ensureMembership([MembershipRole.ADMIN])` appliqués par le routeur parent.)*

    | Méthode HTTP | Chemin URL Relatif (sous le préfixe + `/staff-availabilities-management`) | Méthode du Contrôleur | Brève Description                                                                   |
        |--------------|----------------------------------------------------------------------------|-------------------------|-------------------------------------------------------------------------------------|
    | `POST`       | `/memberships/:membershipId/availabilities`                                | `create`                | Crée une `StaffAvailability` pour un membre spécifique.                             |
    | `GET`        | `/memberships/:membershipId/availabilities`                                | `listForMember`         | Liste les `StaffAvailability` d'un membre spécifique.                               |
    | `GET`        | `/availabilities/:availabilityId`                                          | `getById`               | Récupère une `StaffAvailability` spécifique par son ID (de l'établissement actuel). |
    | `PATCH`      | `/availabilities/:availabilityId`                                          | `update`                | Met à jour une `StaffAvailability` spécifique.                                      |
    | `DELETE`     | `/availabilities/:availabilityId`                                          | `delete`                | Supprime une `StaffAvailability` spécifique.                                        |

*   **4.3. Détail de Chaque Endpoint API**
    *(Préfixe de base pour les chemins : `/api/users/me/establishments/:establishmentId/staff-availabilities-management`)*

    *   **4.3.1. `POST /memberships/:membershipId/availabilities`**
        *   **Méthode HTTP & Chemin :** `POST .../staff-availabilities-management/memberships/:membershipId/availabilities`
        *   **Description :** Permet à un admin de créer une nouvelle règle de disponibilité manuelle pour un membre (`:membershipId`) de son établissement.
        *   **Middlewares (spécifiques à cette route, après ceux du parent) :**
            1.  `loadTargetMembershipForAdminAction('membershipId')` : Charge `req.targetMembership` et vérifie son appartenance à l'établissement de l'admin (`req.membership.establishmentId`).
            2.  `verifyCsrfToken`.
        *   **Paramètres d'URL :** `:establishmentId` (du parent), `:membershipId` (membre cible).
        *   **Corps de Requête :** `CreateStaffAvailabilityDto` (validé par `CreateStaffAvailabilityDtoSchema`).
        *   **Réponse Succès :**
            *   Statut HTTP: `201 Created`.
            *   Corps: `StaffAvailabilityOutputDto` - La règle de disponibilité créée.
        *   **Réponses Erreur Typiques :** `400 Bad Request` (validation DTO, `StaffAvailabilityCreationError`), `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`MembershipNotFoundError` pour le membre cible).

    *   **4.3.2. `GET /memberships/:membershipId/availabilities`**
        *   **Méthode HTTP & Chemin :** `GET .../staff-availabilities-management/memberships/:membershipId/availabilities`
        *   **Description :** Permet à un admin de lister les règles de disponibilité d'un membre spécifique de son établissement.
        *   **Middlewares (spécifiques) :**
            1.  `loadTargetMembershipForAdminAction('membershipId')`.
        *   **Paramètres d'URL :** `:establishmentId`, `:membershipId`.
        *   **Paramètres de Requête (Query) :** `ListStaffAvailabilitiesQueryDto` (validé par `ListStaffAvailabilitiesQueryDtoSchema`).
        *   **Réponse Succès :**
            *   Statut HTTP: `200 OK`.
            *   Corps: `PaginationDto<StaffAvailabilityOutputDto>`.
        *   **Réponses Erreur Typiques :** `400 Bad Request` (validation query DTO), `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`MembershipNotFoundError`).

    *   **4.3.3. `GET /availabilities/:availabilityId`**
        *   **Méthode HTTP & Chemin :** `GET .../staff-availabilities-management/availabilities/:availabilityId`
        *   **Description :** Récupère une règle de disponibilité spécifique par son ID, à condition qu'elle appartienne à l'établissement de l'admin.
        *   **Middlewares (spécifiques) :** Aucun en plus de ceux du parent (la vérification d'appartenance est dans le service).
        *   **Paramètres d'URL :** `:establishmentId`, `:availabilityId`.
        *   **Corps de Requête :** Aucun.
        *   **Réponse Succès :**
            *   Statut HTTP: `200 OK`.
            *   Corps: `StaffAvailabilityOutputDto`.
        *   **Réponses Erreur Typiques :** `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`StaffAvailabilityNotFoundError` si non trouvée ou n'appartient pas à l'établissement de l'admin).

    *   **4.3.4. `PATCH /availabilities/:availabilityId`**
        *   **Méthode HTTP & Chemin :** `PATCH .../staff-availabilities-management/availabilities/:availabilityId`
        *   **Description :** Met à jour une règle de disponibilité spécifique.
        *   **Middlewares (spécifiques) :** `verifyCsrfToken`. (La vérification d'appartenance est dans le service).
        *   **Paramètres d'URL :** `:establishmentId`, `:availabilityId`.
        *   **Corps de Requête :** `UpdateStaffAvailabilityDto` (validé par `UpdateStaffAvailabilityDtoSchema`).
        *   **Réponse Succès :**
            *   Statut HTTP: `200 OK`.
            *   Corps: `StaffAvailabilityOutputDto` - La règle mise à jour.
        *   **Réponses Erreur Typiques :** `400 Bad Request` (validation DTO, `StaffAvailabilityCreationError` pour validations métier), `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`StaffAvailabilityNotFoundError`).

    *   **4.3.5. `DELETE /availabilities/:availabilityId`**
        *   **Méthode HTTP & Chemin :** `DELETE .../staff-availabilities-management/availabilities/:availabilityId`
        *   **Description :** Supprime une règle de disponibilité spécifique.
        *   **Middlewares (spécifiques) :** `verifyCsrfToken`. (La vérification d'appartenance est dans le service).
        *   **Paramètres d'URL :** `:establishmentId`, `:availabilityId`.
        *   **Corps de Requête :** Aucun.
        *   **Réponse Succès :**
            *   Statut HTTP: `204 No Content`.
        *   **Réponses Erreur Typiques :** `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`StaffAvailabilityNotFoundError`).

---

**5. DTOs (Data Transfer Objects) et Validation (Zod) (`src/dtos/staff-availability.validation.ts`)**

Cette section détaille les DTOs et leurs schémas de validation Zod utilisés pour les opérations de gestion manuelle des `StaffAvailability`. Le code complet de ces DTOs se trouve dans le fichier `src/dtos/staff-availability.validation.ts` (tel que défini et corrigé précédemment).

*   **5.1. `CreateStaffAvailabilityDtoSchema` et `CreateStaffAvailabilityDto`**
    *   **Objectif :** Valider les données d'entrée lors de la création manuelle d'une nouvelle règle de `StaffAvailability` par un administrateur pour un membre.
    *   **Schéma Zod et Type :**
        ```typescript
        // Extrait de src/dtos/staff-availability.validation.ts
        export const CreateStaffAvailabilityDtoSchema = z.object({
            rruleString: z.string().min(10, "RRule string must be a valid iCalendar RRule.")
                .refine(val => val.includes('FREQ='), { message: "RRule string must contain FREQ component." }),
            durationMinutes: z.number().int().positive("Duration must be a positive integer of minutes."),
            isWorking: z.boolean({ required_error: "isWorking field is required (true for available, false for unavailable)." }),
            effectiveStartDate: z.string({ required_error: "Effective start date is required." })
                .regex(/^\d{4}-\d{2}-\d{2}$/, "Effective start date must be in YYYY-MM-DD format."),
            effectiveEndDate: z.string()
                .regex(/^\d{4}-\d{2}-\d{2}$/, "Effective end date must be in YYYY-MM-DD format.")
                .nullable()
                .optional(),
            description: z.string().max(255, "Description cannot exceed 255 characters.").optional().nullable(),
        }).refine(data => {
            if (data.effectiveEndDate && data.effectiveStartDate) {
                return moment(data.effectiveEndDate).isSameOrAfter(moment(data.effectiveStartDate));
            }
            return true;
        }, {
            message: "Effective end date cannot be before effective start date.",
            path: ["effectiveEndDate"],
        });
        export type CreateStaffAvailabilityDto = z.infer<typeof CreateStaffAvailabilityDtoSchema>;
        ```
    *   **Champs Clés et Validations :**
        *   `rruleString`: (`string`) Chaîne `rrule` (RFC 5545) définissant la récurrence. Obligatoire. Doit contenir `FREQ=`.
        *   `durationMinutes`: (`number`) Durée en minutes de chaque bloc. Doit être un entier positif. Obligatoire.
        *   `isWorking`: (`boolean`) Indique si la période est travaillée (`true`) ou non (`false`). Obligatoire.
        *   `effectiveStartDate`: (`string`) Date de début d'application (format `YYYY-MM-DD`). Obligatoire.
        *   `effectiveEndDate`: (`string | null`) Date de fin optionnelle (format `YYYY-MM-DD`). Si fournie, doit être >= `effectiveStartDate`.
        *   `description`: (`string | null`) Description optionnelle. Max 255 caractères.

*   **5.2. `UpdateStaffAvailabilityDtoSchema` et `UpdateStaffAvailabilityDto`**
    *   **Objectif :** Valider les données d'entrée pour la mise à jour manuelle d'une `StaffAvailability` existante.
    *   **Schéma Zod et Type :**
        ```typescript
        // Extrait de src/dtos/staff-availability.validation.ts
        export const UpdateStaffAvailabilityDtoSchema = z.object({
            rruleString: z.string().min(10).refine(val => val.includes('FREQ='), { message: "RRule string must contain FREQ." })
                .nullish().transform(val => val ?? undefined).optional(),
            durationMinutes: z.number().int().positive().optional(),
            isWorking: z.boolean().optional(),
            effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date format YYYY-MM-DD").optional(),
            effectiveEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date format YYYY-MM-DD")
                .nullish().transform(val => val ?? undefined).optional(),
            description: z.string().max(255)
                .nullish().transform(val => val ?? undefined).optional(),
        }).refine(data => Object.keys(data).filter(key => data[key as keyof typeof data] !== undefined).length > 0, {
            message: "At least one field must be provided for update.",
        }).refine(data => {
            if (data.effectiveEndDate && data.effectiveStartDate) {
                return moment(data.effectiveEndDate).isSameOrAfter(moment(data.effectiveStartDate));
            }
            return true;
        }, {
            message: "Effective end date cannot be before effective start date if both are provided.",
            path: ["effectiveEndDate"],
        });
        export type UpdateStaffAvailabilityDto = z.infer<typeof UpdateStaffAvailabilityDtoSchema>;
        ```
    *   **Champs Clés et Validations :**
        *   Tous les champs de `CreateStaffAvailabilityDtoSchema` sont présents mais rendus `optional()`.
        *   Les champs `string` optionnels utilisent `.nullish().transform(val => val ?? undefined).optional()` pour permettre l'envoi de `null` (pour effacer une valeur) ou l'omission du champ, tout en s'assurant que le service reçoit `undefined` si le champ est nul ou absent, ce qui simplifie la logique de mise à jour partielle.
        *   Validation `.refine` : Au moins un champ doit être fourni pour la mise à jour. Une autre validation `.refine` vérifie la cohérence des dates si `effectiveStartDate` et `effectiveEndDate` sont toutes deux fournies.

*   **5.3. `StaffAvailabilityOutputDtoSchema` et `StaffAvailabilityOutputDto`**
    *   **Objectif :** Définir la structure de sortie standard pour un enregistrement `StaffAvailability`.
    *   **Schéma Zod et Type (incluant les sous-DTOs pour la clarté) :**
        ```typescript
        // Extrait de src/dtos/staff-availability.validation.ts
        const ShortUserForStaffAvailSchema = z.object({ /* ... */ });
        const ShortMembershipOutputForStaffAvailSchema = z.object({ /* ... */ });

        export const StaffAvailabilityOutputDtoSchema = z.object({
            id: z.number().int().positive(),
            membershipId: z.number().int().positive(),
            rruleString: z.string(),
            durationMinutes: z.number().int().positive(),
            isWorking: z.boolean(),
            effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            effectiveEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
            description: z.string().nullable(),
            appliedShiftTemplateRuleId: z.number().int().positive().nullable().optional(),
            createdByMembershipId: z.number().int().positive().nullable().optional(),
            // createdBy: ShortMembershipOutputForStaffAvailSchema.nullable().optional(), // Si l'association est incluse par le service
            createdAt: z.coerce.date(),
            updatedAt: z.coerce.date(),
        });
        export type StaffAvailabilityOutputDto = z.infer<typeof StaffAvailabilityOutputDtoSchema>;
        ```
    *   **Champs Clés :**
        *   Représente tous les champs pertinents du modèle `StaffAvailability`.
        *   `effectiveStartDate` et `effectiveEndDate` sont des chaînes `YYYY-MM-DD` (format de `DATEONLY`).
        *   `appliedShiftTemplateRuleId` et `createdByMembershipId` sont inclus (optionnels et nullables).
        *   Un champ `createdBy` (avec un DTO utilisateur simplifié) pourrait être ajouté si le service inclut cette association lors de la récupération des données.

*   **5.4. `ListStaffAvailabilitiesQueryDtoSchema` et `ListStaffAvailabilitiesQueryDto`**
    *   **Objectif :** Valider les paramètres de requête pour la liste des `StaffAvailability` d'un membre.
    *   **Schéma Zod et Type :**
        ```typescript
        // Extrait de src/dtos/staff-availability.validation.ts
        export const ListStaffAvailabilitiesQueryDtoSchema = z.object({
            page: z.coerce.number().int().positive().optional().default(1),
            limit: z.coerce.number().int().positive().max(100).optional().default(10),
            sortBy: z.enum(['effectiveStartDate', 'createdAt'] as const)
                .optional()
                .default('effectiveStartDate'),
            sortOrder: z.enum(['asc', 'desc'] as const)
                .optional()
                .default('asc'),
            isWorking: z.preprocess(val => {
                if (val === 'true') return true;
                if (val === 'false') return false;
                return val;
            }, z.boolean().optional()),
            filterRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Filter range start date must be in YYYY-MM-DD format.").optional(),
            filterRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Filter range end date must be in YYYY-MM-DD format.").optional(),
        }).refine(data => { /* ... validation de cohérence filterRangeStart/End ... */ });
        export type ListStaffAvailabilitiesQueryDto = z.infer<typeof ListStaffAvailabilitiesQueryDtoSchema>;
        ```
    *   **Champs Clés et Validations :**
        *   `page`, `limit`: Pagination standard.
        *   `sortBy`: Champ de tri (défaut: `effectiveStartDate`).
        *   `sortOrder`: Ordre de tri (défaut: `asc`).
        *   `isWorking`: Filtre optionnel par statut de travail (booléen).
        *   `filterRangeStart`, `filterRangeEnd`: Filtre optionnel pour les disponibilités actives dans une plage de dates. Si l'un est fourni, l'autre l'est aussi, et `filterRangeEnd` >= `filterRangeStart`.

---

**6. Middlewares d'Autorisation Clés (utilisés pour cette fonctionnalité)**

La sécurisation des endpoints de gestion manuelle des `StaffAvailability` par un administrateur repose sur une combinaison de middlewares pour s'assurer de l'authentification et des droits d'accès appropriés.

*   **6.1. `requireAuth` (défini dans `src/middlewares/auth.middleware.ts`)**
    *   **Rôle :** Assure que la requête provient d'un utilisateur authentifié.
    *   **Fonctionnement :** Valide le JWT `accessToken` fourni dans l'en-tête `Authorization`. Si valide, attache les informations de l'utilisateur (y compris ses rôles globaux) à `req.user`.
    *   **Utilisation :** Appliqué en premier lieu par le routeur parent (ex: `/api/users/me/establishments/:establishmentId`) avant d'atteindre les routes spécifiques de cette fonctionnalité.

*   **6.2. `ensureMembership([MembershipRole.ADMIN])` (défini dans `src/middlewares/auth.middleware.ts`)**
    *   **Rôle :** Vérifie que l'utilisateur authentifié (`req.user`) est un membre actif de l'établissement (`:establishmentId` de l'URL) ET qu'il a le rôle `ADMIN`.
    *   **Fonctionnement :** Utilise `req.user.id` et `req.params.establishmentId` pour trouver le `Membership` correspondant. Valide son statut et son rôle. Si la vérification est réussie, attache l'instance `Membership` de l'administrateur à `req.membership`.
    *   **Utilisation :** Appliqué par le routeur parent (ex: `/api/users/me/establishments/:establishmentId`) après `requireAuth`. Ainsi, toutes les routes de gestion des `StaffAvailability` montées sous ce parent ont accès à `req.membership` (l'admin) et la garantie que l'acteur est bien un admin de l'établissement concerné.

*   **6.3. `verifyCsrfToken` (défini dans `src/middlewares/csrf.middleware.ts`)**
    *   **Rôle :** Protège contre les attaques CSRF.
    *   **Utilisation :** Appliqué à toutes les routes de cette fonctionnalité qui modifient l'état : `POST` (création), `PATCH` (mise à jour), `DELETE` (suppression).

*   **6.4. `loadTargetMembershipForAdminAction(targetMembershipIdParamName: string)` (défini dans `src/middlewares/planning.middleware.ts`)**
    *   **Rôle :** Pour les routes qui ciblent un membre spécifique (ex: créer/lister les disponibilités pour un `:membershipId` particulier). Il charge le `Membership` de ce membre cible et vérifie qu'il appartient bien à l'établissement de l'admin (`req.membership`).
    *   **Fonctionnement :**
        1.  S'appuie sur `req.membership` (l'admin, déjà chargé).
        2.  Extrait l'ID du `Membership` cible de `req.params[targetMembershipIdParamName]`.
        3.  Récupère le `targetMembership`. S'il n'est pas trouvé, renvoie `MembershipNotFoundError` (404).
        4.  Vérifie que `targetMembership.establishmentId === req.membership.establishmentId`. Si non, renvoie `MembershipNotFoundError` (ou 403) pour indiquer que le membre cible n'est pas dans le périmètre de l'admin.
        5.  Si tout est correct, attache le `targetMembership` à `req.targetMembership`.
    *   **Utilisation :** Appliqué sur les routes `POST .../memberships/:membershipId/availabilities` et `GET .../memberships/:membershipId/availabilities`.

*   **Clarification sur la Vérification d'Appartenance pour les routes `/availabilities/:availabilityId` :**
    Pour les routes qui accèdent à une `StaffAvailability` directement par son `:availabilityId` (ex: `GET/PATCH/DELETE .../availabilities/:availabilityId`), il n'y a pas de middleware spécifique pour charger la `StaffAvailability` et vérifier son appartenance *avant* d'atteindre le contrôleur.
    La sécurité repose sur :
    1.  Le middleware parent `ensureMembership([MembershipRole.ADMIN])` qui garantit que `req.membership` est un admin de l'établissement (`:establishmentId` dans l'URL).
    2.  Le **`StaffAvailabilityService`** lui-même. Ses méthodes (`getStaffAvailabilityById`, `updateStaffAvailability`, `deleteStaffAvailability`) prennent en paramètre l'`establishmentId` de l'admin (via `req.membership.establishmentId`). Elles effectuent ensuite une requête en base de données qui inclut une condition pour s'assurer que la `StaffAvailability` (identifiée par `:availabilityId`) appartient bien à un `Membership` qui est lui-même rattaché à cet `establishmentId`. Si ce n'est pas le cas, le service retourne `null` ou lève une `StaffAvailabilityNotFoundError`, ce que le contrôleur interprète comme un 404. Cette approche est efficace et évite un middleware de chargement supplémentaire pour ces cas.

---

**7. Workflows Clés (Gestion Manuelle)**

*   **7.1. Workflow de Création d'une `StaffAvailability` pour un Membre par un Admin**

    ```text
    Admin (UI)          Frontend App                API Backend (Controller)    StaffAvailabilityService   Database
    ----------          ------------                ------------------------    ------------------------   --------
        |                     |                               |                           |                    |
    1. Sélectionne Membre, -> Affiche formulaire création   |                           |                    |
        |  Définit Règle          | (rrule, durée, dates, etc.) |                           |                    |
        | (pour Membre X)         |                               |                           |                    |
        |                         |                               |                           |                    |
    2. Soumet Formulaire  ----> POST /establishments/:eid/memberships/:mid/availabilities (CreateStaffAvailabilityDto) |          |
        |                         |                               |                           |                    |
        |                         |  <-------------------------- Valide Auth (requireAuth, ensureMembership([ADMIN]), loadTargetMembership, CSRF)
        |                         |                               |                           |                    |
        |                         |                               |--- StaffAvailabilityController.create(req) -> |
        |                         |                               |                           |                    |
        |                         |                               |   Valide DTO (Zod)        |                    |
        |                         |                               |                           |                    |
        |                         |                               |   Appelle service.createStaffAvailability(dto, req.membership, targetMembershipId) -> |
        |                         |                               |                           |                    |
        |                         |                               |                           | Valide rrule, dates |
        |                         |                               |                           | Vérifie targetMember appartient à estab. de l'admin |
        |                         |                               |                           | Crée StaffAvailability (avec createdBy=adminId, appliedTemplate=null) -> INSERT
        |                         |                               |                           | <- StaffAvailability (objet) |
        |                         |                               |                                   |
        |                         |<------------------------------ StaffAvailabilityOutputDto      |
        |                         |                               |                                   |
    3. Reçoit Confirmation <---- 201 Created (StaffAvailabilityOutputDto) |                                   |
        | (Règle créée)         |                               |                                   |
    ```

*   **7.2. Workflow de Modification d'une `StaffAvailability` existante par un Admin**

    ```text
    Admin (UI)          Frontend App                API Backend (Controller)    StaffAvailabilityService   Database
    ----------          ------------                ------------------------    ------------------------   --------
        |                     |                               |                           |                    |
    1. Sélectionne Règle  -> Affiche formulaire édition     |                           |                    |
        |  à Modifier             | (pré-rempli avec données règle) |                           |                    |
        |                         |                               |                           |                    |
    2. Modifie & Soumet ----> PATCH /establishments/:eid/availabilities/:aid (UpdateStaffAvailabilityDto) |        |
        |                         |                               |                           |                    |
        |                         |  <-------------------------- Valide Auth (requireAuth, ensureMembership([ADMIN]), CSRF)
        |                         |                               |                           |                    |
        |                         |                               |--- StaffAvailabilityController.update(req) -> |
        |                         |                               |                           |                    |
        |                         |                               |   Valide DTO (Zod)        |                    |
        |                         |                               |                           |                    |
        |                         |                               |   Appelle service.updateStaffAvailability(aid, dto, estabId, adminMid) -> |
        |                         |                               |                           |                    |
        |                         |                               |                           | Récupère StaffAvailability par aid (vérifie appartenance à estabId) -> Requête BDD
        |                         |                               |                           | <- StaffAvailability (objet existant) |
        |                         |                               |                           | Valide rrule (si modifiée), dates |
        |                         |                               |                           | Si appliedShiftTemplateRuleId existait, le met à NULL. Met à jour createdByMid. |
        |                         |                               |                           | Met à jour la règle -> UPDATE StaffAvailability
        |                         |                               |                           | <- StaffAvailability (objet MàJ) |
        |                         |                               |                                   |
        |                         |<------------------------------ StaffAvailabilityOutputDto      |
        |                         |                               |                                   |
    3. Reçoit Confirmation <---- 200 OK (StaffAvailabilityOutputDto)   |                                   |
        | (Règle modifiée)        |                               |                                   |
    ```

---

**8. Gestion des Erreurs Spécifiques**

Cette section détaille les erreurs personnalisées pertinentes pour la fonctionnalité de "Gestion Manuelle des Disponibilités des Membres (par Admin)". Ces erreurs sont généralement levées par le `StaffAvailabilityService` ou les middlewares d'autorisation et sont gérées par le middleware d'erreur global pour fournir des réponses API structurées.

*   **8.1. `StaffAvailabilityNotFoundError`**
    *   **Fichier de Définition :** `src/errors/planning.errors.ts`
    *   **Code HTTP Associé :** `404 Not Found`
    *   **Description de la Cause :** Levée lorsqu'une `StaffAvailability` spécifique, identifiée par son ID, ne peut être trouvée en base de données ou n'appartient pas à l'établissement de l'administrateur effectuant l'action.
    *   **Exemples de Contexte :**
        *   Appel à `GET .../availabilities/:availabilityId` avec un `:availabilityId` inexistant.
        *   Appel à `PATCH .../availabilities/:availabilityId` où `:availabilityId` existe mais est lié à un `Membership` d'un autre établissement que celui de l'admin.
        *   Dans `StaffAvailabilityService.getStaffAvailabilityById`, `updateStaffAvailability`, ou `deleteStaffAvailability` si la règle n'est pas trouvée ou si la vérification d'appartenance à l'établissement échoue.

*   **8.2. `StaffAvailabilityCreationError`**
    *   **Fichier de Définition :** `src/errors/planning.errors.ts`
    *   **Code HTTP Associé :** `400 Bad Request`
    *   **Description de la Cause :** Levée lors de la création (`StaffAvailabilityService.createStaffAvailability`) ou de la mise à jour (`StaffAvailabilityService.updateStaffAvailability`) d'une `StaffAvailability` si une validation métier échoue. Cela inclut des problèmes avec la `rruleString`, la cohérence des dates (`effectiveEndDate` < `effectiveStartDate`), ou une `durationMinutes` non positive.
    *   **Exemples de Contexte :**
        *   Fourniture d'une `rruleString` malformée que la bibliothèque `rrule.js` ne peut pas parser.
        *   Spécification d'une `durationMinutes` de `0` ou négative.
        *   Indication d'une `effectiveEndDate` antérieure à `effectiveStartDate`.

*   **8.3. `StaffAvailabilityUpdateError`**
    *   **Fichier de Définition :** `src/errors/planning.errors.ts`
    *   **Code HTTP Associé :** `500 Internal Server Error` (ou `400 Bad Request` si l'erreur est due à une validation métier avant la tentative de mise à jour, comme dans `StaffAvailabilityCreationError`). Dans le code actuel du service, elle est plus pour un échec inattendu post-validation.
    *   **Description de la Cause :** Levée par `StaffAvailabilityService.updateStaffAvailability` si une erreur inattendue se produit pendant l'opération de mise à jour en base de données, après que les validations initiales ont réussi.
    *   **Exemples de Contexte :**
        *   Un problème de connexion à la base de données survient pendant l'appel à `staffAvailabilityModel.update()`.
        *   Une contrainte de base de données inattendue est violée (peu probable si les validations sont bonnes).

*   **8.4. `MembershipNotFoundError` (dans ce contexte)**
    *   **Fichier de Définition :** `src/errors/membership.errors.ts`
    *   **Code HTTP Associé :** `404 Not Found`
    *   **Description de la Cause :** Levée lorsque l'administrateur tente d'effectuer une action (ex: créer une disponibilité, lister les disponibilités) pour un `targetMembershipId` qui n'existe pas, ou qui n'appartient pas à l'établissement de l'administrateur.
    *   **Exemples de Contexte :**
        *   Appel à `POST .../memberships/:membershipId/availabilities` où `:membershipId` n'est pas un ID de membre valide ou est un membre d'un autre établissement.
        *   Levée par le middleware `loadTargetMembershipForAdminAction` ou directement par le `StaffAvailabilityService` lors de la vérification du `targetMembershipId`.

*   **Autres Erreurs Standard Pertinentes :**
    *   **`AppError('InvalidInput', 400, message)` :**
        *   Levée par les contrôleurs (`StaffAvailabilityController`) si la validation Zod des DTOs (`CreateStaffAvailabilityDtoSchema`, `UpdateStaffAvailabilityDtoSchema`, `ListStaffAvailabilitiesQueryDtoSchema`) échoue pour `req.body` ou `req.query`.
        *   Levée si les paramètres d'URL (ex: `:establishmentId`, `:membershipId`, `:availabilityId`) ne sont pas des nombres valides.
    *   **`AuthenticationError` (401) :**
        *   Levée par le middleware `requireAuth` si aucun token JWT valide n'est fourni.
    *   **`AuthorizationError` (403) :**
        *   Levée par le middleware `ensureMembership([MembershipRole.ADMIN])` si l'utilisateur authentifié n'est pas un administrateur actif de l'établissement concerné.
        *   Levée par le middleware `loadTargetMembershipForAdminAction` si l'admin tente d'agir sur un membre qui n'est pas dans son établissement (bien que ce middleware retourne souvent `MembershipNotFoundError` pour masquer l'information).
    *   Les erreurs liées à la protection `CSRF` (typiquement 403) sont gérées par le middleware `verifyCsrfToken`.

---

**9. Annexe**

*   **9.1. Exemples de Payloads JSON pour les Requêtes API Clés**

    *   **Création d'une `StaffAvailability` manuelle par un admin pour un membre (`POST /api/users/me/establishments/{establishmentId}/memberships/{membershipId}/availabilities`)**
        Exemple : Ajouter une disponibilité hebdomadaire tous les lundis de 9h à 12h pour le membre `{membershipId}`.
        ```json
        {
          "rruleString": "FREQ=WEEKLY;BYDAY=MO;DTSTART=T090000",
          "durationMinutes": 180,
          "isWorking": true,
          "effectiveStartDate": "2024-09-02",
          "effectiveEndDate": "2024-12-31",
          "description": "Permanence du lundi matin"
        }
        ```
        Exemple : Ajouter une indisponibilité ponctuelle pour une journée spécifique.
        ```json
        {
          "rruleString": "FREQ=DAILY;COUNT=1;DTSTART=T000000", 
          "durationMinutes": 1440, // 24 * 60 minutes pour toute la journée
          "isWorking": false,
          "effectiveStartDate": "2024-10-15",
          "effectiveEndDate": "2024-10-15", // Pour un événement unique, startDate et endDate sont souvent les mêmes
          "description": "Absence exceptionnelle - Formation"
        }
        ```

    *   **Mise à jour d'une `StaffAvailability` existante (`PATCH /api/users/me/establishments/{establishmentId}/staff-availabilities-management/availabilities/{availabilityId}`)**
        Exemple : Changer la description et le statut `isWorking` d'une règle existante.
        ```json
        {
          "description": "Réunion d'équipe hebdomadaire (confirmée)",
          "isWorking": false 
        }
        ```
        Exemple : Modifier uniquement la date de fin d'une règle existante.
        ```json
        {
          "effectiveEndDate": "2025-06-30"
        }
        ```
        Exemple : Effacer la description d'une règle existante.
        ```json
        {
          "description": null
        }
        ```

---