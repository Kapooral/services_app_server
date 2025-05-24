---

**Documentation Technique du Module - Gestion de Planning (APP_NAME)**

**Fonctionnalité : Gestion des Shift Templates (Modèles d'Horaires/Shifts Réutilisables)**

**Version:** 0.1 (Date: [Date Actuelle])

**Table des Matières**

1.  **Introduction et Objectifs**
    *   1.1. Vue d'Ensemble de la Fonctionnalité
    *   1.2. Cas d'Usage Principaux (Admin de l'Établissement)
2.  **Modèles de Données et Relations**
    *   2.1. Modèle `ShiftTemplate`
        *   2.1.1. Définition des Colonnes
        *   2.1.2. Associations Clés
    *   2.2. Modèle `ShiftTemplateRule`
        *   2.2.1. Définition des Colonnes
        *   2.2.2. Associations Clés
    *   2.3. Impact sur le Modèle `StaffAvailability`
3.  **Logique Métier : Service `ShiftTemplateService.ts`**
    *   3.1. Rôle et Responsabilités Globales
    *   3.2. Méthodes Publiques Détaillées
        *   3.2.1. `createShiftTemplate`
        *   3.2.2. `getShiftTemplateById`
        *   3.2.3. `listShiftTemplatesForEstablishment`
        *   3.2.4. `updateShiftTemplate`
        *   3.2.5. `deleteShiftTemplate`
        *   3.2.6. `applyShiftTemplateToMemberships`
4.  **API : Contrôleur `ShiftTemplateController.ts` et Endpoints**
    *   4.1. Rôle et Responsabilités du Contrôleur
    *   4.2. Tableau Récapitulatif des Endpoints
    *   4.3. Détail de Chaque Endpoint API
        *   4.3.1. `POST /api/users/me/establishments/:establishmentId/shift-templates`
        *   4.3.2. `GET /api/users/me/establishments/:establishmentId/shift-templates`
        *   4.3.3. `GET /api/users/me/establishments/:establishmentId/shift-templates/:templateId`
        *   4.3.4. `PUT /api/users/me/establishments/:establishmentId/shift-templates/:templateId`
        *   4.3.5. `DELETE /api/users/me/establishments/:establishmentId/shift-templates/:templateId`
        *   4.3.6. `POST /api/users/me/establishments/:establishmentId/shift-templates/:templateId/apply`
5.  **DTOs (Data Transfer Objects) et Validation (Zod)**
    *   5.1. `ShiftTemplateRuleInputDtoSchema`
    *   5.2. `CreateShiftTemplateDtoSchema`
    *   5.3. `UpdateShiftTemplateDtoSchema`
    *   5.4. `ShiftTemplateRuleOutputDtoSchema`
    *   5.5. `ShiftTemplateOutputDtoSchema`
    *   5.6. `ApplyShiftTemplateDtoSchema` (et Enum `OverwriteMode`)
    *   5.7. `ListShiftTemplatesQueryDtoSchema`
    *   5.8. Interface `ApplyTemplateErrorDetail`
6.  **Middlewares d'Autorisation Spécifiques**
    *   6.1. `ensureMembership([MembershipRole.ADMIN])` (Contexte Parent)
    *   6.2. `loadShiftTemplateAndVerifyOwnership`
7.  **Workflows Clés**
    *   7.1. Création d'un Shift Template
    *   7.2. Application d'un Shift Template à des Membres
8.  **Gestion des Erreurs Spécifiques**
    *   8.1. `ShiftTemplateNotFoundError`
    *   8.2. `ShiftTemplateCreationError`
    *   8.3. `ApplyTemplateError`
9.  **Annexe**
    *   9.1. Exemples de Payloads JSON

---

**1. Introduction et Objectifs**

Ce document fournit les détails techniques de la fonctionnalité "Gestion des Shift Templates" au sein du module "Gestion de Planning" de l'application backend "APP_NAME". Cette fonctionnalité est conçue pour être utilisée exclusivement par les administrateurs d'établissements.

*   **1.1. Vue d'Ensemble de la Fonctionnalité**
    La gestion des Shift Templates (modèles d'horaires/shifts) vise à simplifier et accélérer la configuration des plannings du personnel pour les administrateurs d'établissements. Elle permet aux administrateurs de définir des ensembles réutilisables de règles de disponibilité (appelés "Shift Templates"), qui peuvent ensuite être appliqués à un ou plusieurs membres du personnel (`Staff`) pour une période donnée. L'application d'un template génère ou met à jour automatiquement les enregistrements de disponibilité individuelle (`StaffAvailability`) pour les membres concernés, reflétant ainsi le planning défini par le template.

*   **1.2. Cas d'Usage Principaux (Admin de l'Établissement)**
    L'administrateur de l'établissement est le seul utilisateur de cette fonctionnalité. Ses actions principales incluent :
    *   **Créer un nouveau Shift Template :** Définir un nom, une description, et un ensemble de règles de disponibilité (ex: "Shift Matin 9h-13h en semaine", "Service Continu Samedi", "Pause Déjeuner Quotidienne"). Chaque règle spécifie une récurrence (via une chaîne `rrule`), une durée, et si elle correspond à une période de travail ou d'indisponibilité.
    *   **Consulter les Shift Templates existants :** Lister tous les templates créés pour son établissement, avec la possibilité de voir les détails de chaque template (y compris ses règles).
    *   **Modifier un Shift Template :** Mettre à jour le nom, la description, ou l'ensemble des règles d'un template existant.
    *   **Supprimer un Shift Template :** Retirer un template qui n'est plus utilisé. La suppression d'un template ne supprime pas les `StaffAvailability` qui auraient pu être générées précédemment par celui-ci (elles deviennent des disponibilités manuelles).
    *   **Appliquer un Shift Template :** Sélectionner un template, un ou plusieurs membres du personnel, une date de début et une date de fin optionnelle pour l'application. Le système génère alors les enregistrements `StaffAvailability` correspondants pour les membres sélectionnés pendant la période spécifiée, en se basant sur les règles du template. L'administrateur peut choisir un mode de remplacement des disponibilités existantes.

---

**2. Modèles de Données et Relations**

Deux nouveaux modèles Sequelize sont introduits pour cette fonctionnalité : `ShiftTemplate` et `ShiftTemplateRule`. Ils interagissent avec les modèles existants `Establishment`, `Membership`, et `StaffAvailability`.

*   **2.1. Modèle `ShiftTemplate` (`shift_templates` table)**
    Représente un modèle d'horaire ou de shift global défini par un administrateur pour son établissement.

    *   **2.1.1. Définition des Colonnes**

        | Nom de la Colonne (BDD)         | Type de Données (Sequelize)    | Contraintes/Options                                                                 | Description                                                                                                |
                |---------------------------------|--------------------------------|-------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
        | `id`                            | `INTEGER.UNSIGNED`             | PK, AutoIncrement, NOT NULL                                                         | Identifiant unique du template.                                                                            |
        | `establishment_id`              | `INTEGER.UNSIGNED`             | FK vers `establishments.id`, NOT NULL, `ON DELETE CASCADE`                          | Lie le template à un établissement spécifique.                                                              |
        | `name`                          | `STRING(100)`                  | NOT NULL, Unique par `establishment_id`                                             | Nom descriptif et unique (par établissement) du template (ex: "Ouverture Matin", "Service Soirée").        |
        | `description`                   | `TEXT`                         | `NULLABLE`                                                                          | Description plus détaillée du template et de son usage.                                                    |
        | `created_by_membership_id`      | `INTEGER.UNSIGNED`             | FK vers `memberships.id`, NOT NULL, `ON DELETE RESTRICT`                            | `Membership ID` de l'administrateur qui a créé (et "possède") ce template. `RESTRICT` pour éviter la suppression d'un admin qui a des templates. |
        | `created_at`                    | `DATE`                         | NOT NULL                                                                            | Timestamp de création.                                                                                     |
        | `updated_at`                    | `DATE`                         | NOT NULL                                                                            | Timestamp de dernière modification.                                                                        |

    *   **2.1.2. Associations Clés**
        *   `ShiftTemplate.belongsTo(Establishment, { as: 'establishment', foreignKey: 'establishmentId' })`
        *   `ShiftTemplate.belongsTo(Membership, { as: 'creator', foreignKey: 'createdByMembershipId' })`
        *   `ShiftTemplate.hasMany(ShiftTemplateRule, { as: 'rules', foreignKey: 'shiftTemplateId', onDelete: 'CASCADE' })`

*   **2.2. Modèle `ShiftTemplateRule` (`shift_template_rules` table)**
    Définit une règle de disponibilité spécifique (un bloc de temps de travail ou de non-travail) au sein d'un `ShiftTemplate`.

    *   **2.2.1. Définition des Colonnes**

        | Nom de la Colonne (BDD) | Type de Données (Sequelize) | Contraintes/Options                                       | Description                                                                                                                                                                                                           |
                |-------------------------|-----------------------------|-----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
        | `id`                    | `INTEGER.UNSIGNED`          | PK, AutoIncrement, NOT NULL                               | Identifiant unique de la règle.                                                                                                                                                                                       |
        | `shift_template_id`     | `INTEGER.UNSIGNED`          | FK vers `shift_templates.id`, NOT NULL, `ON DELETE CASCADE` | Lie la règle à son template parent.                                                                                                                                                                                     |
        | `rrule_string`          | `TEXT`                      | NOT NULL                                                  | Chaîne `rrule` (RFC 5545) définissant la récurrence. **Note :** Le `DTSTART` dans cette chaîne est typiquement une heure locale (ex: `T090000`) qui sera interprétée avec la date d'application et le fuseau de l'établissement. |
        | `duration_minutes`      | `INTEGER.UNSIGNED`          | NOT NULL                                                  | Durée en minutes de chaque bloc de temps généré par cette règle.                                                                                                                                                        |
        | `is_working`            | `BOOLEAN`                   | NOT NULL, Default: `true`                                 | `true` si la règle définit une période de travail/disponibilité, `false` pour une indisponibilité (ex: pause planifiée).                                                                                                |
        | `rule_description`      | `STRING(255)`               | `NULLABLE`                                                | Description optionnelle pour cette règle spécifique (ex: "Bloc du matin", "Pause déjeuner").                                                                                                                            |
        | `created_at`            | `DATE`                      | NOT NULL                                                  | Timestamp de création.                                                                                                                                                                                                |
        | `updated_at`            | `DATE`                      | NOT NULL                                                  | Timestamp de dernière modification.                                                                                                                                                                                   |

    *   **2.2.2. Associations Clés**
        *   `ShiftTemplateRule.belongsTo(ShiftTemplate, { as: 'shiftTemplate', foreignKey: 'shiftTemplateId' })`

*   **2.3. Impact sur le Modèle `StaffAvailability` (`staff_availabilities` table)**
    Pour permettre de tracer l'origine des disponibilités générées par des templates, la colonne `applied_shift_template_rule_id` a été ajoutée au modèle `StaffAvailability` (et à sa table `staff_availabilities`).

    *   **Nouvelle Colonne (Optionnelle mais recommandée) :**
        *   `applied_shift_template_rule_id`: `INTEGER.UNSIGNED`, FK vers `shift_template_rules.id`, `NULLABLE`, `ON DELETE SET NULL`.
            *   **Rôle :** Lorsque le `ShiftTemplateService` applique une `ShiftTemplateRule`, il renseigne la colonne `applied_shift_template_rule_id` de la `StaffAvailability` générée avec l'ID de la `ShiftTemplateRule` source. 
            *   Si cette `ShiftTemplateRule` parente est ultérieurement supprimée de la base de données, la contrainte de clé étrangère `ON DELETE SET NULL` assure que `applied_shift_template_rule_id` devient `NULL` pour les `StaffAvailability` associées, les détachant ainsi du template. 
            *   De plus, si un administrateur modifie manuellement une `StaffAvailability` qui avait été générée par un template (via le `StaffAvailabilityService`), sa `applied_shift_template_rule_id` est également mise à `NULL` pour indiquer qu'elle n'est plus directement gérée par le template.

    *   **Colonne Existante (Utilisation pour Traçage) :**
        *   `created_by_membership_id`: `INTEGER.UNSIGNED`, FK vers `memberships.id`, `NULLABLE`, `ON DELETE SET NULL`.
            *   **Rôle :** Pour les `StaffAvailability` générées par un template, cette colonne stockera l'ID du `Membership` de l'administrateur qui a *appliqué* le template. Pour les `StaffAvailability` créées/modifiées manuellement par un admin, elle stockera l'ID de cet admin.

---

**3. Logique Métier : Service `ShiftTemplateService.ts`**

Ce service est le cœur de la logique métier pour la gestion des modèles de shifts et leur application.

*   **3.1. Rôle et Responsabilités Globales**
    Le `ShiftTemplateService` est responsable de :
    *   La création, la lecture, la mise à jour et la suppression (CRUD) des entités `ShiftTemplate` et de leurs `ShiftTemplateRule` associées.
    *   La validation des données métier lors de ces opérations (ex: unicité du nom du template par établissement, intégrité des règles).
    *   L'orchestration de l'application d'un `ShiftTemplate` à un ou plusieurs `Membership`s (membres du personnel). Cela inclut :
        *   L'interprétation correcte des `rruleString` des règles du template en tenant compte du fuseau horaire de l'établissement et de la période d'application.
        *   La génération des enregistrements `StaffAvailability` correspondants.
        *   La gestion des `StaffAvailability` existantes des membres cibles en fonction du mode de remplacement (`overwriteMode`) spécifié.
    *   L'utilisation de transactions de base de données pour garantir l'atomicité des opérations complexes (création/mise à jour de template avec ses règles, application de template).
    *   La levée d'erreurs métier spécifiques (ex: `ShiftTemplateNotFoundError`, `ShiftTemplateCreationError`, `ApplyTemplateError`) en cas de problème.

*   **3.2. Détail des Méthodes Publiques**

    *   **3.2.1. `createShiftTemplate(dto: CreateShiftTemplateDto, actorMembership: MembershipAttributes): Promise<ShiftTemplateOutputDto>`**
        *   **Fonction :** Crée un nouveau `ShiftTemplate` avec ses règles associées pour l'établissement de l'administrateur (`actorMembership`).
        *   **Paramètres :**
            *   `dto: CreateShiftTemplateDto`: Objet contenant `name`, `description?` et un tableau `rules` (chacune avec `rruleString`, `durationMinutes`, `isWorking`, `ruleDescription?`).
            *   `actorMembership: MembershipAttributes`: Le `Membership` de l'administrateur effectuant la création. Utilisé pour l'`establishmentId` et `createdByMembershipId`.
        *   **Retour :** `Promise<ShiftTemplateOutputDto>` - Le `ShiftTemplate` nouvellement créé, incluant ses règles et des informations sur le créateur.
        *   **Logique Clé :**
            1.  Valide que le `name` du template est unique au sein de l'`establishmentId` de l'acteur. Lève `ShiftTemplateCreationError` si un nom dupliqué est trouvé.
            2.  Démarre une transaction Sequelize.
            3.  Crée l'enregistrement `ShiftTemplate` en base de données, en liant `establishmentId` et `createdByMembershipId` à partir de `actorMembership`.
            4.  Pour chaque objet règle dans `dto.rules`, crée un enregistrement `ShiftTemplateRule` associé au `ShiftTemplate` nouvellement créé.
            5.  Commit la transaction.
            6.  Récupère et retourne le `ShiftTemplate` complet (avec ses règles et les détails du créateur) sous forme de `ShiftTemplateOutputDto`.
        *   **Validations Importantes :** Unicité du nom du template par établissement. Validité des données des DTOs (gérée par Zod en amont dans le contrôleur, mais le service peut effectuer des validations métier supplémentaires si nécessaire).
        *   **Erreurs Spécifiques :** `ShiftTemplateCreationError`.

    *   **3.2.2. `getShiftTemplateById(templateId: number, establishmentId: number): Promise<ShiftTemplateOutputDto | null>`**
        *   **Fonction :** Récupère un `ShiftTemplate` spécifique par son ID, en s'assurant qu'il appartient à l'établissement spécifié.
        *   **Paramètres :**
            *   `templateId: number`: L'ID du `ShiftTemplate` à récupérer.
            *   `establishmentId: number`: L'ID de l'établissement auquel le template doit appartenir (celui de l'admin effectuant la requête).
        *   **Retour :** `Promise<ShiftTemplateOutputDto | null>` - Le `ShiftTemplate` trouvé (avec ses règles et créateur) ou `null` s'il n'est pas trouvé ou n'appartient pas à l'établissement.
        *   **Logique Clé :**
            1.  Effectue une recherche `findOne` sur `ShiftTemplate` avec `id = templateId` ET `establishmentId = establishmentId`.
            2.  Inclut les associations `rules` et `creator` (avec `user`).
        *   **Validations Importantes :** L'appartenance du template à l'établissement est assurée par la clause `WHERE`.
        *   **Erreurs Spécifiques :** Aucune levée directement par cette méthode (retourne `null` si non trouvé). Le contrôleur lèvera `ShiftTemplateNotFoundError` si `null` est retourné.

    *   **3.2.3. `listShiftTemplatesForEstablishment(establishmentId: number, queryDto: ListShiftTemplatesQueryDto): Promise<PaginationDto<ShiftTemplateOutputDto>>`**
        *   **Fonction :** Liste tous les `ShiftTemplate` pour un établissement donné, avec support de la pagination, du tri et de la recherche par nom.
        *   **Paramètres :**
            *   `establishmentId: number`: L'ID de l'établissement.
            *   `queryDto: ListShiftTemplatesQueryDto`: Contient les options de pagination (`page`, `limit`), de tri (`sortBy`, `sortOrder`), et de recherche (`search`).
        *   **Retour :** `Promise<PaginationDto<ShiftTemplateOutputDto>>` - Un objet contenant un tableau des `ShiftTemplateOutputDto` (sans leurs règles détaillées par défaut pour la performance) et les informations de pagination.
        *   **Logique Clé :**
            1.  Construit les conditions `WHERE` basées sur `establishmentId` et le `search` (sur le champ `name`).
            2.  Effectue une requête `findAndCountAll` avec `limit`, `offset`, et `order`.
            3.  Inclut l'association `creator` (avec `user`) pour afficher le nom du créateur. Les `rules` ne sont pas incluses par défaut dans la liste.
            4.  Formate les résultats en `ShiftTemplateOutputDto` et utilise `createPaginationResult`.
        *   **Validations Importantes :** Les DTOs de requête sont validés par Zod dans le contrôleur.
        *   **Erreurs Spécifiques :** Aucune directement, mais des erreurs de base de données sont possibles.

    *   **3.2.4. `updateShiftTemplate(templateId: number, dto: UpdateShiftTemplateDto, establishmentId: number): Promise<ShiftTemplateOutputDto>`**
        *   **Fonction :** Met à jour un `ShiftTemplate` existant et/ou ses règles.
        *   **Paramètres :**
            *   `templateId: number`: L'ID du `ShiftTemplate` à mettre à jour.
            *   `dto: UpdateShiftTemplateDto`: Objet contenant les champs optionnels `name?`, `description?`, et `rules?`.
            *   `establishmentId: number`: L'ID de l'établissement de l'admin, pour vérifier la propriété.
        *   **Retour :** `Promise<ShiftTemplateOutputDto>` - Le `ShiftTemplate` mis à jour avec ses règles.
        *   **Logique Clé :**
            1.  Récupère le `ShiftTemplate` par `templateId` et `establishmentId`. Lève `ShiftTemplateNotFoundError` si non trouvé.
            2.  Si `dto.name` est fourni et différent du nom actuel, vérifie l'unicité du nouveau nom au sein de l'établissement. Lève `ShiftTemplateCreationError` si conflit.
            3.  Démarre une transaction.
            4.  Met à jour les attributs de base du `ShiftTemplate` (`name`, `description`) si fournis.
            5.  Si `dto.rules` est fourni (et est un tableau), supprime toutes les `ShiftTemplateRule` existantes pour ce `templateId`, puis crée les nouvelles règles à partir de `dto.rules`.
            6.  Commit la transaction.
            7.  Re-récupère le template mis à jour avec ses associations pour retourner un DTO complet.
        *   **Validations Importantes :** Propriété du template, unicité du nom si modifié.
        *   **Erreurs Spécifiques :** `ShiftTemplateNotFoundError`, `ShiftTemplateCreationError`.

    *   **3.2.5. `deleteShiftTemplate(templateId: number, establishmentId: number): Promise<void>`**
        *   **Fonction :** Supprime un `ShiftTemplate`.
        *   **Paramètres :**
            *   `templateId: number`: L'ID du `ShiftTemplate` à supprimer.
            *   `establishmentId: number`: L'ID de l'établissement de l'admin.
        *   **Retour :** `Promise<void>`
        *   **Logique Clé :**
            1.  Récupère le `ShiftTemplate` par `templateId` et `establishmentId`. Lève `ShiftTemplateNotFoundError` si non trouvé.
            2.  Supprime l'enregistrement `ShiftTemplate`. Grâce à `onDelete: 'CASCADE'` sur l'association `ShiftTemplate.hasMany(ShiftTemplateRule)`, les `ShiftTemplateRule` associées sont automatiquement supprimées.
            3.  Si la colonne `appliedShiftTemplateRuleId` existe sur `StaffAvailability` avec `ON DELETE SET NULL`, les liens vers les règles supprimées seront automatiquement mis à `NULL` dans `StaffAvailability`.
        *   **Validations Importantes :** Propriété du template.
        *   **Erreurs Spécifiques :** `ShiftTemplateNotFoundError`.

    *   **3.2.6. `applyShiftTemplateToMemberships(templateId: number, dto: ApplyShiftTemplateDto, establishmentId: number, actorAdminMembershipId: number): Promise<{ generatedAvailabilitiesCount: number; errors: ApplyTemplateErrorDetail[] }>`**
        *   **Fonction :** Applique un `ShiftTemplate` à une liste de membres pour une période donnée, générant les `StaffAvailability` correspondantes.
        *   **Paramètres :**
            *   `templateId: number`: L'ID du `ShiftTemplate` à appliquer.
            *   `dto: ApplyShiftTemplateDto`: Contient `targetMembershipIds`, `applicationStartDate`, `applicationEndDate?`, `overwriteMode?`.
            *   `establishmentId: number`: L'ID de l'établissement de l'admin.
            *   `actorAdminMembershipId: number`: L'ID du `Membership` de l'admin qui effectue l'application (pour `createdByMembershipId` sur les `StaffAvailability`).
        *   **Retour :** `Promise<{ generatedAvailabilitiesCount: number; errors: ApplyTemplateErrorDetail[] }>` - Un objet indiquant le nombre de disponibilités générées et un tableau d'erreurs partielles (ex: si un membre cible n'a pas été trouvé).
        *   **Logique Clé (détaillée) :**
            1.  **Validation initiale :** Récupère le `ShiftTemplate` (avec ses `rules`) par `templateId`. Vérifie qu'il appartient à `establishmentId` et qu'il a des règles. Lève `ShiftTemplateNotFoundError` sinon.
            2.  Récupère l'objet `Establishment` pour obtenir son `timezone` (essentiel). Lève `EstablishmentNotFoundError` si non trouvé ou si `timezone` est manquant.
            3.  Démarre une transaction Sequelize.
            4.  **Boucle sur `targetMembershipIds` :** Pour chaque `targetMembershipId` fourni dans le DTO :
                a.  Vérifie que le `Membership` cible existe et appartient bien à l'`establishmentId`. Si non, ajoute une erreur à la liste `errors` et passe au membre suivant.
                b.  **Gestion des `StaffAvailability` existantes (selon `dto.overwriteMode`) :**
                i.  Détermine la période d'application en UTC (`periodStart`, `periodEnd`) à partir de `dto.applicationStartDate`, `dto.applicationEndDate`, et le `establishment.timezone`.
                ii. Si `overwriteMode` est `REPLACE_ALL_IN_PERIOD` : Supprime toutes les `StaffAvailability` du `targetMembershipId` dont la période effective (`effectiveStartDate` à `effectiveEndDate` des `StaffAvailability`) chevauche la `periodStart`/`periodEnd` de l'application.
                iii. Si `overwriteMode` est `REPLACE_TEMPLATE_GENERATED_IN_PERIOD` (nécessite la colonne `appliedShiftTemplateRuleId` sur `StaffAvailability`) : Supprime les `StaffAvailability` du `targetMembershipId` ayant `appliedShiftTemplateRuleId IS NOT NULL` et qui chevauchent la période d'application.
                c.  **Boucle sur `template.rules` :** Pour chaque `ShiftTemplateRule` :
                i.  **Interprétation de `rule.rruleString` et `DTSTART` :**
                *   Extrait l'heure locale de `DTSTART` de `rule.rruleString` (ex: `T090000` signifie 9h00).
                *   Crée une date/heure `DTSTART` absolue en UTC pour la première occurrence : combine `dto.applicationStartDate` avec l'heure locale extraite, interprète cette date/heure dans le `establishment.timezone`, puis la convertit en UTC.
                *   Construit la `rruleString` finale pour la `StaffAvailability` en utilisant ce `DTSTART` absolu UTC et les autres composantes de `rule.rruleString`.
                ii. **Création de la `StaffAvailability` :**
                *   `membershipId`: `targetMembershipId`.
                *   `rruleString`: La chaîne `rrule` finale avec `DTSTART` absolu UTC.
                *   `durationMinutes`: `rule.durationMinutes`.
                *   `isWorking`: `rule.isWorking`.
                *   `effectiveStartDate`: `dto.applicationStartDate` (stockée en `YYYY-MM-DD`).
                *   `effectiveEndDate`: `dto.applicationEndDate` (stockée en `YYYY-MM-DD` ou `null`). La logique de `rrule.js` avec `UNTIL` dans la règle et cette `effectiveEndDate` devra être gérée par `AvailabilityService` lors de la génération des occurrences.
                *   `description`: `rule.ruleDescription` ou généré.
                *   `appliedShiftTemplateRuleId`: `rule.id`.
                *   `createdByMembershipId`: `actorAdminMembershipId`.
                iii. Enregistre la nouvelle `StaffAvailability` en base de données. Incrémente `generatedAvailabilitiesCount`.
            5.  Commit la transaction.
            6.  Retourne `{ generatedAvailabilitiesCount, errors }`.
        *   **Validations Importantes :** Appartenance du template et des membres cibles à l'établissement, existence du `timezone` de l'établissement, validité des dates d'application.
        *   **Erreurs Spécifiques :** `ShiftTemplateNotFoundError`, `EstablishmentNotFoundError`, `MembershipNotFoundError` (pour un membre cible), `ApplyTemplateError` (pour des erreurs générales durant l'application). Les erreurs sur des membres individuels sont collectées dans le tableau `errors` du retour.

---

**4. API : Contrôleur `ShiftTemplateController.ts` et Endpoints**

*   **4.1. Rôle et Responsabilités du Contrôleur (`ShiftTemplateController`)**
    Le `ShiftTemplateController` sert d'interface entre les requêtes HTTP relatives aux modèles de shifts et le `ShiftTemplateService`. Ses responsabilités sont :
    1.  Recevoir les requêtes HTTP pour le CRUD des `ShiftTemplate` et pour leur application.
    2.  Valider les données d'entrée (corps, paramètres d'URL, requêtes) en utilisant les schémas Zod de `shift-template.validation.ts`.
    3.  Extraire `establishmentId` des paramètres d'URL (fourni par le routeur parent).
    4.  Extraire `req.membership` (l'admin authentifié, attaché par `ensureMembership` sur le routeur parent) pour passer le contexte de l'acteur au service.
    5.  Appeler les méthodes appropriées du `ShiftTemplateService`.
    6.  Formater les réponses HTTP (200 OK, 201 Created, 204 No Content) avec les DTOs de sortie (`ShiftTemplateOutputDto`, ou le résultat de l'application).
    7.  Gérer les erreurs en les passant à `next(error)`.

*   **4.2. Tableau Récapitulatif des Endpoints**

    | Méthode HTTP | Chemin URL Relatif (sous `/establishments/:establishmentId/shift-templates`) | Méthode du Contrôleur   | Brève Description                                               |
        |--------------|------------------------------------------------------------------------------|---------------------------|-----------------------------------------------------------------|
    | `POST`       | `/`                                                                          | `create`                  | Crée un nouveau modèle de shift.                                  |
    | `GET`        | `/`                                                                          | `listForEstablishment`    | Liste tous les modèles de shift de l'établissement.             |
    | `GET`        | `/:templateId`                                                               | `getById`                 | Récupère les détails d'un modèle de shift spécifique.             |
    | `PUT`        | `/:templateId`                                                               | `update`                  | Met à jour un modèle de shift existant.                         |
    | `DELETE`     | `/:templateId`                                                               | `delete`                  | Supprime un modèle de shift.                                    |
    | `POST`       | `/:templateId/apply`                                                         | `applyToMemberships`      | Applique un modèle de shift à un ou plusieurs membres.        |

*   **4.3. Détail de Chaque Endpoint API**
    *(Préfixe commun pour tous les chemins : `/api/users/me/establishments/:establishmentId/shift-templates`)*
    *(Middlewares communs appliqués par le routeur parent : `requireAuth`, `ensureMembership([MembershipRole.ADMIN])`)*

    *   **4.3.1. `POST /` (Créer un Shift Template)**
        *   **Méthode HTTP & Chemin :** `POST /api/users/me/establishments/:establishmentId/shift-templates`
        *   **Description :** Permet à un administrateur de créer un nouveau modèle de shift pour son établissement.
        *   **Middlewares (spécifiques à la route) :** `verifyCsrfToken`.
        *   **Paramètres d'URL :** `:establishmentId` (géré par le routeur parent).
        *   **Corps de Requête :** `CreateShiftTemplateDto` (validé par `CreateShiftTemplateDtoSchema`).
        *   **Réponse Succès :**
            *   Statut HTTP: `201 Created`.
            *   Corps: `ShiftTemplateOutputDto` - Le modèle de shift nouvellement créé avec ses règles.
        *   **Réponses Erreur Typiques :** `400 Bad Request` (validation DTO, `ShiftTemplateCreationError` pour nom dupliqué), `401 Unauthorized`, `403 Forbidden` (pas Admin, échec CSRF).

    *   **4.3.2. `GET /` (Lister les Shift Templates)**
        *   **Méthode HTTP & Chemin :** `GET /api/users/me/establishments/:establishmentId/shift-templates`
        *   **Description :** Permet à un administrateur de lister tous les modèles de shift de son établissement, avec pagination et recherche.
        *   **Middlewares (spécifiques à la route) :** Aucun en plus de ceux du parent.
        *   **Paramètres d'URL :** `:establishmentId`.
        *   **Paramètres de Requête (Query) :** `ListShiftTemplatesQueryDto` (validé par `ListShiftTemplatesQueryDtoSchema`).
        *   **Réponse Succès :**
            *   Statut HTTP: `200 OK`.
            *   Corps: `PaginationDto<ShiftTemplateOutputDto>` - Liste paginée des modèles (sans les règles détaillées par défaut).
        *   **Réponses Erreur Typiques :** `400 Bad Request` (validation query DTO), `401 Unauthorized`, `403 Forbidden`.

    *   **4.3.3. `GET /:templateId` (Obtenir un Shift Template par ID)**
        *   **Méthode HTTP & Chemin :** `GET /api/users/me/establishments/:establishmentId/shift-templates/:templateId`
        *   **Description :** Récupère les détails complets (incluant les règles) d'un modèle de shift spécifique.
        *   **Middlewares (spécifiques à la route) :** `loadShiftTemplateAndVerifyOwnership('templateId')`.
        *   **Paramètres d'URL :** `:establishmentId`, `:templateId`.
        *   **Corps de Requête :** Aucun.
        *   **Réponse Succès :**
            *   Statut HTTP: `200 OK`.
            *   Corps: `ShiftTemplateOutputDto` - Le modèle de shift demandé.
        *   **Réponses Erreur Typiques :** `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`ShiftTemplateNotFoundError` si le template n'existe pas ou n'appartient pas à l'établissement de l'admin).

    *   **4.3.4. `PUT /:templateId` (Mettre à jour un Shift Template)**
        *   **Méthode HTTP & Chemin :** `PUT /api/users/me/establishments/:establishmentId/shift-templates/:templateId`
        *   **Description :** Permet à un administrateur de mettre à jour un modèle de shift existant.
        *   **Middlewares (spécifiques à la route) :** `loadShiftTemplateAndVerifyOwnership('templateId')`, `verifyCsrfToken`.
        *   **Paramètres d'URL :** `:establishmentId`, `:templateId`.
        *   **Corps de Requête :** `UpdateShiftTemplateDto` (validé par `UpdateShiftTemplateDtoSchema`).
        *   **Réponse Succès :**
            *   Statut HTTP: `200 OK`.
            *   Corps: `ShiftTemplateOutputDto` - Le modèle de shift mis à jour.
        *   **Réponses Erreur Typiques :** `400 Bad Request` (validation DTO, `ShiftTemplateCreationError` pour nom dupliqué), `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`ShiftTemplateNotFoundError`).

    *   **4.3.5. `DELETE /:templateId` (Supprimer un Shift Template)**
        *   **Méthode HTTP & Chemin :** `DELETE /api/users/me/establishments/:establishmentId/shift-templates/:templateId`
        *   **Description :** Permet à un administrateur de supprimer un modèle de shift.
        *   **Middlewares (spécifiques à la route) :** `loadShiftTemplateAndVerifyOwnership('templateId')`, `verifyCsrfToken`.
        *   **Paramètres d'URL :** `:establishmentId`, `:templateId`.
        *   **Corps de Requête :** Aucun.
        *   **Réponse Succès :**
            *   Statut HTTP: `204 No Content`.
        *   **Réponses Erreur Typiques :** `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`ShiftTemplateNotFoundError`).

    *   **4.3.6. `POST /:templateId/apply` (Appliquer un Shift Template)**
        *   **Méthode HTTP & Chemin :** `POST /api/users/me/establishments/:establishmentId/shift-templates/:templateId/apply`
        *   **Description :** Permet à un administrateur d'appliquer un modèle de shift à un ou plusieurs membres pour une période donnée, générant leurs `StaffAvailability`.
        *   **Middlewares (spécifiques à la route) :** `loadShiftTemplateAndVerifyOwnership('templateId')`, `verifyCsrfToken`.
        *   **Paramètres d'URL :** `:establishmentId`, `:templateId`.
        *   **Corps de Requête :** `ApplyShiftTemplateDto` (validé par `ApplyShiftTemplateDtoSchema`).
        *   **Réponse Succès :**
            *   Statut HTTP: `200 OK`.
            *   Corps: `{ generatedAvailabilitiesCount: number; errors: ApplyTemplateErrorDetail[] }` - Indique le succès et les erreurs partielles.
        *   **Réponses Erreur Typiques :** `400 Bad Request` (validation DTO), `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`ShiftTemplateNotFoundError`, `EstablishmentNotFoundError` si timezone manque, `MembershipNotFoundError` pour un membre cible), `500 Internal Server Error` (`ApplyTemplateError` pour des échecs généraux d'application).

---

**5. DTOs (Data Transfer Objects) et Validation (Zod) (`src/dtos/shift-template.validation.ts`)**

Cette section détaille les Data Transfer Objects (DTOs) et leurs schémas de validation Zod utilisés pour les opérations sur les `ShiftTemplate`. Le code complet de ces DTOs se trouve dans `src/dtos/shift-template.validation.ts`.

*   **5.1. `ShiftTemplateRuleInputDtoSchema` et `ShiftTemplateRuleInputDto`**
    *   **Objectif :** Valider les données d'entrée pour une règle individuelle au sein d'un `ShiftTemplate` lors de la création ou de la mise à jour d'un template.
    *   **Schéma Zod et Type :**
        ```typescript
        // Extrait de src/dtos/shift-template.validation.ts
        export const ShiftTemplateRuleInputDtoSchema = z.object({
            rruleString: z.string().min(10, "RRule string must be a valid iCalendar RRule.")
                .refine( (val) => val.includes('FREQ='),
                    { message: "RRule string must contain FREQ component if provided." }
                ),
            durationMinutes: z.number().int().positive("Duration must be a positive integer of minutes."),
            isWorking: z.boolean({ required_error: "isWorking field is required." }),
            ruleDescription: z.string().max(255, "Rule description cannot exceed 255 characters.").optional().nullable(),
        });
        export type ShiftTemplateRuleInputDto = z.infer<typeof ShiftTemplateRuleInputDtoSchema>;
        ```
    *   **Champs Clés et Validations :**
        *   `rruleString`: (`string`) Chaîne `rrule` (RFC 5545). Doit avoir une longueur minimale et contenir `FREQ=`. Une validation sémantique plus poussée de la chaîne `rrule` est effectuée par le service via la bibliothèque `rrule.js`. Obligatoire.
        *   `durationMinutes`: (`number`) Durée du bloc en minutes. Doit être un entier positif. Obligatoire.
        *   `isWorking`: (`boolean`) Indique si la règle définit une période de travail (`true`) ou d'indisponibilité (`false`). Obligatoire.
        *   `ruleDescription`: (`string | null`) Description optionnelle de la règle. Max 255 caractères.

*   **5.2. `CreateShiftTemplateDtoSchema` et `CreateShiftTemplateDto`**
    *   **Objectif :** Valider les données d'entrée pour la création d'un nouveau `ShiftTemplate`.
    *   **Schéma Zod et Type :**
        ```typescript
        // Extrait de src/dtos/shift-template.validation.ts
        export const CreateShiftTemplateDtoSchema = z.object({
            name: z.string()
                .min(3, "Template name must be at least 3 characters long.")
                .max(100, "Template name cannot exceed 100 characters."),
            description: z.string()
                .max(1000, "Description cannot exceed 1000 characters.")
                .optional()
                .nullable(),
            rules: z.array(ShiftTemplateRuleInputDtoSchema)
                .min(1, "A shift template must have at least one rule."),
        });
        export type CreateShiftTemplateDto = z.infer<typeof CreateShiftTemplateDtoSchema>;
        ```
    *   **Champs Clés et Validations :**
        *   `name`: (`string`) Nom du template. Min 3, max 100 caractères. Obligatoire.
        *   `description`: (`string | null`) Description optionnelle du template. Max 1000 caractères.
        *   `rules`: (`Array<ShiftTemplateRuleInputDto>`) Tableau contenant au moins une définition de règle. Obligatoire.

*   **5.3. `UpdateShiftTemplateDtoSchema` et `UpdateShiftTemplateDto`**
    *   **Objectif :** Valider les données d'entrée pour la mise à jour d'un `ShiftTemplate` existant.
    *   **Schéma Zod et Type :**
        ```typescript
        // Extrait de src/dtos/shift-template.validation.ts
        export const UpdateShiftTemplateDtoSchema = z.object({
            name: z.string()
                .min(3, "Template name must be at least 3 characters long.")
                .max(100, "Template name cannot exceed 100 characters.")
                .optional(),
            description: z.string()
                .max(1000, "Description cannot exceed 1000 characters.")
                .optional()
                .nullable(),
            rules: z.array(ShiftTemplateRuleInputDtoSchema)
                .min(1, "If rules are provided, at least one rule is required.")
                .optional(),
        }).refine(data => data.name !== undefined || data.description !== undefined || data.rules !== undefined, {
            message: "At least one field (name, description, or rules) must be provided for update.",
        });
        export type UpdateShiftTemplateDto = z.infer<typeof UpdateShiftTemplateDtoSchema>;
        ```
    *   **Champs Clés et Validations :**
        *   `name`: (`string`) Nouveau nom optionnel du template.
        *   `description`: (`string | null`) Nouvelle description optionnelle.
        *   `rules`: (`Array<ShiftTemplateRuleInputDto>`) Nouveau tableau optionnel de règles. Si fourni, il remplace *entièrement* les règles existantes du template.
        *   Validation `.refine` : S'assure qu'au moins un des champs (`name`, `description`, `rules`) est fourni pour la mise à jour.

*   **5.4. `ShiftTemplateRuleOutputDtoSchema` et `ShiftTemplateRuleOutputDto`**
    *   **Objectif :** Définir la structure de sortie pour une règle de `ShiftTemplate`.
    *   **Schéma Zod et Type :**
        ```typescript
        // Extrait de src/dtos/shift-template.validation.ts
        export const ShiftTemplateRuleOutputDtoSchema = ShiftTemplateRuleInputDtoSchema.extend({
            id: z.number().int().positive(),
            // On pourrait ajouter createdAt et updatedAt si nécessaire pour l'affichage
        });
        export type ShiftTemplateRuleOutputDto = z.infer<typeof ShiftTemplateRuleOutputDtoSchema>;
        ```
    *   **Champs Clés :** Hérite de `ShiftTemplateRuleInputDtoSchema` et ajoute :
        *   `id`: (`number`) L'ID unique de la règle.

*   **5.5. `ShiftTemplateOutputDtoSchema` et `ShiftTemplateOutputDto`**
    *   **Objectif :** Définir la structure de sortie standard pour un `ShiftTemplate`, incluant ses règles et des informations sur son créateur.
    *   **Schéma Zod et Type (incluant les sous-DTOs pour la clarté) :**
        ```typescript
        // Extrait de src/dtos/shift-template.validation.ts
        const ShortUserForShiftSchema = z.object({
            id: z.number().int().positive(),
            username: z.string(),
        });
        const ShortMembershipOutputForShiftCreatorSchema = z.object({ // Renommé pour éviter conflit potentiel
            id: z.number().int().positive(),
            user: ShortUserForShiftSchema.nullable(),
        });

        export const ShiftTemplateOutputDtoSchema = z.object({
            id: z.number().int().positive(),
            establishmentId: z.number().int().positive(),
            name: z.string(),
            description: z.string().nullable(),
            createdByMembershipId: z.number().int().positive(),
            creator: ShortMembershipOutputForShiftCreatorSchema.nullable(),
            rules: z.array(ShiftTemplateRuleOutputDtoSchema),
            createdAt: z.coerce.date(),
            updatedAt: z.coerce.date(),
        });
        export type ShiftTemplateOutputDto = z.infer<typeof ShiftTemplateOutputDtoSchema>;
        ```
    *   **Champs Clés :**
        *   Tous les champs de `ShiftTemplateAttributes` (ID, nom, description, IDs de liaison).
        *   `creator`: (`ShortMembershipOutputForShiftCreatorSchema | null`) Informations simplifiées sur le `Membership` de l'admin créateur (ID, username de l'utilisateur).
        *   `rules`: (`Array<ShiftTemplateRuleOutputDto>`) Tableau des règles associées au template.
        *   `createdAt`, `updatedAt`: (`Date`) Timestamps convertis en objets Date JavaScript.

*   **5.6. `ApplyShiftTemplateDtoSchema`, `ApplyShiftTemplateDto` et Enum `OverwriteMode`**
    *   **Objectif :** Valider les données d'entrée pour l'application d'un `ShiftTemplate` à des membres.
    *   **Enum `OverwriteMode` :**
        ```typescript
        // Extrait de src/dtos/shift-template.validation.ts
        export enum OverwriteMode {
            REPLACE_ALL_IN_PERIOD = 'REPLACE_ALL_IN_PERIOD',
            REPLACE_TEMPLATE_GENERATED_IN_PERIOD = 'REPLACE_TEMPLATE_GENERATED_IN_PERIOD',
        }
        ```
    *   **Schéma Zod et Type :**
        ```typescript
        // Extrait de src/dtos/shift-template.validation.ts
        export const ApplyShiftTemplateDtoSchema = z.object({
            targetMembershipIds: z.array(z.number().int().positive())
                .min(1, "At least one target membership ID is required."),
            applicationStartDate: z.string({ required_error: "Application start date is required." })
                .regex(/^\d{4}-\d{2}-\d{2}$/, "Application start date must be in YYYY-MM-DD format."),
            applicationEndDate: z.string()
                .regex(/^\d{4}-\d{2}-\d{2}$/, "Application end date must be in YYYY-MM-DD format.")
                .nullable()
                .optional(),
            overwriteMode: z.nativeEnum(OverwriteMode)
                .optional()
                .default(OverwriteMode.REPLACE_ALL_IN_PERIOD),
        }).refine(data => {
            if (data.applicationEndDate && moment(data.applicationEndDate).isBefore(moment(data.applicationStartDate))) {
                return false;
            }
            return true;
        }, {
            message: "Application end date cannot be before application start date.",
            path: ["applicationEndDate"],
        });
        export type ApplyShiftTemplateDto = z.infer<typeof ApplyShiftTemplateDtoSchema>;
        ```
    *   **Champs Clés et Validations :**
        *   `targetMembershipIds`: (`Array<number>`) Tableau d'IDs de `Membership` des membres cibles. Doit contenir au moins un ID.
        *   `applicationStartDate`: (`string`) Date de début d'application du template (format `YYYY-MM-DD`). Obligatoire.
        *   `applicationEndDate`: (`string | null`) Date de fin optionnelle d'application (format `YYYY-MM-DD`). Si fournie, doit être >= `applicationStartDate`.
        *   `overwriteMode`: (`OverwriteMode`) Mode de gestion des `StaffAvailability` existantes (défaut: `REPLACE_ALL_IN_PERIOD`).

*   **5.7. `ListShiftTemplatesQueryDtoSchema` et `ListShiftTemplatesQueryDto`**
    *   **Objectif :** Valider les paramètres de requête pour la liste des `ShiftTemplate`.
    *   **Schéma Zod et Type :**
        ```typescript
        // Extrait de src/dtos/shift-template.validation.ts
        export const ListShiftTemplatesQueryDtoSchema = z.object({
            page: z.coerce.number().int().positive().optional().default(1),
            limit: z.coerce.number().int().positive().max(100).optional().default(10),
            sortBy: z.enum(['name', 'createdAt', 'updatedAt'] as const)
                .optional()
                .default('name'),
            sortOrder: z.enum(['asc', 'desc'] as const)
                .optional()
                .default('asc'),
            search: z.string()
                .trim()
                .min(1, "Search term, if provided, cannot be empty.")
                .optional(),
        });
        export type ListShiftTemplatesQueryDto = z.infer<typeof ListShiftTemplatesQueryDtoSchema>;
        ```
    *   **Champs Clés et Validations :**
        *   `page`, `limit`: Pagination (défauts et contraintes standards).
        *   `sortBy`: Champ de tri (défaut: `name`).
        *   `sortOrder`: Ordre de tri (défaut: `asc`).
        *   `search`: Terme de recherche optionnel (sur le nom du template).

*   **5.8. Interface `ApplyTemplateErrorDetail`**
    *   **Objectif :** Définir la structure d'un objet d'erreur retourné par le service `applyShiftTemplateToMemberships` pour indiquer un problème lors de l'application à un membre ou une règle spécifique.
    *   **Définition TypeScript :**
        ```typescript
        // Extrait de src/dtos/shift-template.validation.ts
        export interface ApplyTemplateErrorDetail {
            membershipId: number;    // ID du membre pour lequel l'erreur s'est produite
            ruleId?: number;         // ID optionnel de la ShiftTemplateRule si l'erreur est spécifique à une règle
            error: string;           // Message d'erreur descriptif
        }
        ```

---

**6. Middlewares d'Autorisation Spécifiques (utilisés pour cette fonctionnalité)**

Les routes de gestion des `ShiftTemplate` sont sécurisées par une combinaison de middlewares d'authentification et d'autorisation pour s'assurer que seul un administrateur authentifié de l'établissement concerné peut y accéder.

*   **6.1. `requireAuth` (dans `src/middlewares/auth.middleware.ts`)**
    *   **Rôle :** Middleware fondamental appliqué à toutes les routes nécessitant une authentification.
    *   **Fonctionnement :** Vérifie la présence et la validité d'un `accessToken` JWT dans l'en-tête `Authorization`. Si valide, décode le token, récupère l'utilisateur depuis la base de données (avec ses rôles globaux) et attache les informations utilisateur (dont `id`, `username`, `email`, `roles`) à `req.user`. Renvoie une `AuthenticationError` (401) si le token est manquant, invalide ou expiré, ou si l'utilisateur n'est pas trouvé/inactif.
    *   **Utilisation :** Appliqué en amont de `ensureMembership` sur le routeur parent qui gère `/api/users/me/establishments/:establishmentId`.

*   **6.2. `ensureMembership([MembershipRole.ADMIN])` (dans `src/middlewares/auth.middleware.ts`)**
    *   **Rôle :** Vérifie que l'utilisateur authentifié (`req.user`) est un membre actif de l'établissement spécifié par le paramètre d'URL `:establishmentId` ET qu'il possède le rôle `ADMIN` au sein de ce `Membership`.
    *   **Fonctionnement :**
        1.  S'appuie sur `req.user` (attaché par `requireAuth`).
        2.  Extrait `establishmentId` de `req.params`.
        3.  Recherche un `Membership` actif pour `req.user.id` et `establishmentId`.
        4.  Si aucun `Membership` actif n'est trouvé, ou si le rôle n'est pas `ADMIN` (et que l'utilisateur n'est pas `SUPER_ADMIN`), renvoie une `AuthorizationError` (403) ou `EstablishmentNotFoundError` (404).
        5.  Si la vérification réussit, attache l'instance `Membership` de l'administrateur à `req.membership`. Cette instance contient `id`, `userId`, `establishmentId`, `role`, `status`.
    *   **Utilisation :** Appliqué sur le routeur parent qui gère le chemin `/api/users/me/establishments/:establishmentId`. Toutes les routes de gestion des `ShiftTemplate` (montées sous ce parent) héritent donc de cette vérification et ont accès à `req.membership`.

*   **6.3. `verifyCsrfToken` (dans `src/middlewares/csrf.middleware.ts`)**
    *   **Rôle :** Protège contre les attaques Cross-Site Request Forgery.
    *   **Fonctionnement :** Compare le token CSRF fourni dans l'en-tête `X-CSRF-Token` de la requête avec le secret stocké dans le cookie signé `csrfSecret`.
    *   **Utilisation :** Appliqué à toutes les routes de `ShiftTemplateController` qui modifient l'état (POST, PUT, DELETE).

*   **6.4. `loadShiftTemplateAndVerifyOwnership(templateIdParamName: string)` (dans `src/middlewares/planning.middleware.ts`)**
    *   **Rôle :** Middleware spécifique pour les routes qui ciblent un `ShiftTemplate` individuel (ex: GET by ID, PUT, DELETE, POST /apply). Il charge le `ShiftTemplate` et vérifie qu'il appartient bien à l'établissement de l'administrateur actuellement authentifié.
    *   **Fonctionnement :**
        1.  S'appuie sur `req.membership` (le `Membership` de l'admin, attaché par `ensureMembership`).
        2.  Extrait l'ID du `ShiftTemplate` (`templateId`) du paramètre d'URL spécifié par `templateIdParamName`.
        3.  Récupère l'instance `ShiftTemplate` depuis la base de données.
        4.  Si le template n'est pas trouvé, renvoie `ShiftTemplateNotFoundError` (404).
        5.  Compare `loadedShiftTemplate.establishmentId` avec `req.membership.establishmentId`. Si différents, cela signifie que l'admin essaie d'accéder à un template d'un autre établissement. Renvoie `ShiftTemplateNotFoundError` (ou une 403) pour masquer l'existence du template dans un autre contexte.
        6.  Si la vérification réussit, attache l'instance `ShiftTemplate` (en plain object) à `req.targetShiftTemplate`.
    *   **Utilisation :** Appliqué directement sur les routes `/shift-templates/:templateId` et `/shift-templates/:templateId/apply`.

---

**7. Workflows Clés**

*   **7.1. Workflow de Création d'un Shift Template par un Admin**

    ```text
    Admin (UI)                Frontend App                API Backend (Controller)  ShiftTemplateService      Database
    ----------                ------------                ------------------------  --------------------      --------
        |                           |                               |                         |                   |
    1. Navigue vers création ----> Affiche formulaire         |                         |                   |
        | (Nom, Desc, Règles)     | (pour template)               |                         |                   |
        |                           |                               |                         |                   |
    2. Remplit & Soumet   ------> POST /establishments/:eid/shift-templates (CreateShiftTemplateDto) |                   |
        |                           |                               |                         |                   |
        |                           |  <-------------------------- Valide Auth (requireAuth, ensureMembership([ADMIN]), CSRF)
        |                           |                               |                         |                   |
        |                           |                               |--- ShiftTemplateController.create(req) -> |
        |                           |                               |                         |                   |
        |                           |                               |   Valide DTO (Zod)      |                   |
        |                           |                               |                         |                   |
        |                           |                               |   Appelle service.createShiftTemplate(dto, req.membership) -> |
        |                           |                               |                         |                   |
        |                           |                               |                         | Vérifie unicité Nom -> Requête BDD
        |                           |                               |                         | <- (Nom OK)         |
        |                           |                               |                         |                   |
        |                           |                               |                         | Démarre Transaction |
        |                           |                               |                         | Crée ShiftTemplate -> INSERT ShiftTemplate
        |                           |                               |                         | Crée ShiftTemplateRules (boucle) -> INSERT ShiftTemplateRule(s)
        |                           |                               |                         | Commit Transaction  |
        |                           |                               |                         | <- ShiftTemplate (objet avec rules)
        |                           |                               |                               |
        |                           |<------------------------------ ShiftTemplateOutputDto    |
        |                           |                               |                               |
    3. Reçoit Confirmation <------ 201 Created (ShiftTemplateOutputDto) |                               |
        | (Template créé)         |                               |                               |
    ```

*   **7.2. Workflow d'Application d'un Shift Template à des Membres par un Admin**

    ```text
    Admin (UI)                Frontend App                API Backend (Controller)  ShiftTemplateService      Database / StaffAvailability
    ----------                ------------                ------------------------  --------------------      ----------------------------
        |                           |                               |                         |                           |
    1. Choisit Template   ----> Sélectionne Membres,        |                         |                           |
        | (depuis liste)          | Dates application (Start, End?), OverwriteMode |                         |                           |
        |                           |                               |                         |                           |
    2. Applique Template  ------> POST /establishments/:eid/shift-templates/:tid/apply (ApplyShiftTemplateDto) |                           |
        |                           |                               |                         |                           |
        |                           |  <-------------------------- Valide Auth (requireAuth, ensureMembership, loadShiftTemplate, CSRF)
        |                           |                               |                         |                           |
        |                           |                               |--- ShiftTemplateController.applyToMemberships(req) -> |
        |                           |                               |                         |                           |
        |                           |                               |   Valide DTO (Zod)      |                           |
        |                           |                               |                         |                           |
        |                           |                               |   Appelle service.applyShiftTemplateToMemberships(tid, dto, eid, adminMid) -> |
        |                           |                               |                         |                           |
        |                           |                               |                         | Récupère Template & Rules -> Requête BDD (ShiftTemplate, ShiftTemplateRule)
        |                           |                               |                         | Récupère Estab. Timezone -> Requête BDD (Establishment)
        |                           |                               |                         | Démarre Transaction |
        |                           |                               |                         | Pour chaque targetMembershipId: |
        |                           |                               |                         |   Vérifie Membre   -> Requête BDD (Membership)
        |                           |                               |                         |   (Si overwrite) Supprime anciennes StaffAvailability -> DELETE StaffAvailability
        |                           |                               |                         |   Pour chaque règle du template: |
        |                           |                               |                         |     Génère rrule UTC, dates effectives |
        |                           |                               |                         |     Crée StaffAvailability -> INSERT StaffAvailability
        |                           |                               |                         | Commit Transaction  |
        |                           |                               |                         | <- { generatedCount, errors[] }
        |                           |                               |                               |
        |                           |<------------------------------ { generatedCount, errors[] } |
        |                           |                               |                               |
    3. Reçoit Résultat   <-------- 200 OK ({ generatedAvailabilitiesCount, errors }) |                               |
        | (Dispos générées/erreurs) |                               |                               |
    ```

---

**8. Gestion des Erreurs Spécifiques**

Cette section détaille les erreurs personnalisées spécifiques à la fonctionnalité de "Gestion des Shift Templates". Ces erreurs héritent de `AppError` et sont conçues pour fournir des informations claires au client API en cas de problème. Elles sont typiquement levées par le `ShiftTemplateService` ou les middlewares associés.

*   **8.1. `ShiftTemplateNotFoundError`**
    *   **Fichier de Définition :** `src/errors/planning.errors.ts`
    *   **Code HTTP Associé :** `404 Not Found`
    *   **Description de la Cause :** Cette erreur est levée lorsqu'un `ShiftTemplate` spécifié par son ID ne peut pas être trouvé en base de données, ou lorsqu'un administrateur tente d'accéder à un `ShiftTemplate` qui n'appartient pas à son établissement (le middleware `loadShiftTemplateAndVerifyOwnership` lèvera cette erreur pour masquer l'existence du template dans un autre contexte).
    *   **Exemples de Contexte :**
        *   Appel à `GET /api/users/me/establishments/:establishmentId/shift-templates/:templateId` avec un `:templateId` inexistant.
        *   Appel à `PUT /api/users/me/establishments/:establishmentId/shift-templates/:templateId` où `:templateId` appartient à un autre établissement que celui de l'admin authentifié.
        *   Dans `ShiftTemplateService.getShiftTemplateById`, `updateShiftTemplate`, `deleteShiftTemplate`, ou `applyShiftTemplateToMemberships` si le `templateId` fourni ne correspond à aucun enregistrement pour l'établissement concerné.

*   **8.2. `ShiftTemplateCreationError`**
    *   **Fichier de Définition :** `src/errors/planning.errors.ts`
    *   **Code HTTP Associé :** `400 Bad Request` (pour des erreurs de validation métier) ou `409 Conflict` (si l'erreur est due à un conflit de nom). Le code actuel utilise `400`.
    *   **Description de la Cause :** Levée principalement lors de la création (`ShiftTemplateService.createShiftTemplate`) ou de la mise à jour (`ShiftTemplateService.updateShiftTemplate`) d'un `ShiftTemplate` si une contrainte métier est violée.
    *   **Exemples de Contexte :**
        *   Tentative de créer un `ShiftTemplate` avec un `name` qui existe déjà pour le même `establishmentId`.
        *   Si des validations métier supplémentaires échouent lors de la création/mise à jour (non couvertes par Zod mais par la logique du service). Par exemple, si une `rruleString` dans une règle est sémantiquement invalide de manière non détectable par la validation de format basique.

*   **8.3. `ApplyTemplateError`**
    *   **Fichier de Définition :** `src/errors/planning.errors.ts`
    *   **Code HTTP Associé :** `500 Internal Server Error` (pour les erreurs générales inattendues durant le processus d'application) ou `400 Bad Request` / `404 Not Found` si l'erreur est due à des données d'entrée incorrectes (ex: `EstablishmentNotFoundError` si le timezone manque, ce qui empêcherait l'application). La méthode `applyShiftTemplateToMemberships` retourne aussi un tableau `errors: ApplyTemplateErrorDetail[]` pour les échecs partiels sur des membres spécifiques, qui seraient dans une réponse 200 OK. `ApplyTemplateError` est plutôt pour un échec global du processus.
    *   **Description de la Cause :** Levée par `ShiftTemplateService.applyShiftTemplateToMemberships` en cas d'échec global et inattendu durant le processus complexe d'application d'un template (ex: échec de transaction, problème de configuration majeur comme un `Establishment` sans `timezone`).
    *   **Exemples de Contexte :**
        *   Une erreur inattendue se produit lors de la transaction de base de données pendant la suppression des anciennes `StaffAvailability` ou la création des nouvelles.
        *   L'établissement cible n'a pas de fuseau horaire configuré, rendant l'interprétation des `DTSTART` des règles impossible.
    *   **Note :** Les erreurs spécifiques à un membre (ex: membre cible non trouvé) lors de l'application sont gérées en les ajoutant au tableau `errors` retourné dans la réponse HTTP 200, plutôt qu'en levant une `ApplyTemplateError` qui stopperait tout le processus.

*   **Autres Erreurs Standard Pertinentes (non spécifiques au planning mais utilisées) :**
    *   **`AppError('InvalidInput', 400, message)` :** Levée par les contrôleurs si la validation Zod des DTOs (`req.body` ou `req.query`) échoue, ou si les paramètres d'URL sont mal formés (ex: ID non numérique).
    *   **`AuthenticationError` (401) et `AuthorizationError` (403) :** Levées par les middlewares (`requireAuth`, `ensureMembership`, `loadShiftTemplateAndVerifyOwnership`) si l'authentification ou les permissions sont insuffisantes.
    *   **`MembershipNotFoundError` (404) :** Peut être levée par `ShiftTemplateService.applyShiftTemplateToMemberships` si un `targetMembershipId` est invalide (et ajoutée au tableau `errors` du retour).
    *   **`EstablishmentNotFoundError` (404) :** Peut être levée par `ShiftTemplateService.applyShiftTemplateToMemberships` si l'établissement n'est pas trouvé ou n'a pas de timezone.

---

**9. Annexe**

*   **9.1. Exemples de Payloads JSON pour les Requêtes API Clés**

    *   **Création d'un `ShiftTemplate` (`POST /api/users/me/establishments/{establishmentId}/shift-templates`)**
        Illustre un template pour un shift de matinée en semaine avec une pause déjeuner.
        ```json
        {
          "name": "Shift Matin Semaine avec Pause",
          "description": "Shift de 8h00 à 16h30 en semaine, incluant une pause déjeuner de 30 minutes à 12h00.",
          "rules": [
            {
              "rruleString": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=T080000",
              "durationMinutes": 240, // 4 heures (8h00 - 12h00)
              "isWorking": true,
              "ruleDescription": "Bloc travail matin"
            },
            {
              "rruleString": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=T120000",
              "durationMinutes": 30, // 30 minutes
              "isWorking": false, // Indisponibilité pour pause
              "ruleDescription": "Pause déjeuner"
            },
            {
              "rruleString": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=T123000",
              "durationMinutes": 240, // 4 heures (12h30 - 16h30)
              "isWorking": true,
              "ruleDescription": "Bloc travail après-midi"
            }
          ]
        }
        ```

    *   **Application d'un `ShiftTemplate` à des membres (`POST /api/users/me/establishments/{establishmentId}/shift-templates/{templateId}/apply`)**
        Applique le template d'ID `{templateId}` aux membres ayant les IDs 15 et 22, pour tout le mois de janvier 2025, en remplaçant toutes leurs disponibilités existantes sur cette période.
        ```json
        {
          "targetMembershipIds": [15, 22],
          "applicationStartDate": "2025-01-01",
          "applicationEndDate": "2025-01-31",
          "overwriteMode": "REPLACE_ALL_IN_PERIOD"
        }
        ```
        Application sans date de fin (s'applique indéfiniment ou jusqu'à la fin de la récurrence des règles) :
        ```json
        {
          "targetMembershipIds": [15],
          "applicationStartDate": "2025-02-01",
          "applicationEndDate": null, 
          "overwriteMode": "REPLACE_TEMPLATE_GENERATED_IN_PERIOD"
        }
        ```

    *   **Mise à jour d'un `ShiftTemplate` (`PUT /api/users/me/establishments/{establishmentId}/shift-templates/{templateId}`)**
        Change le nom et remplace toutes les règles du template.
        ```json
        {
          "name": "Nouveau Nom Shift Matin Extrême",
          "rules": [
            {
              "rruleString": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=T070000",
              "durationMinutes": 300, 
              "isWorking": true,
              "ruleDescription": "Bloc travail unique intensif"
            }
          ]
        }
        ```
        Met à jour uniquement la description :
        ```json
        {
          "description": "Description mise à jour pour ce template."
        }
        ```

---