---

**Partie 1 : Plan d'Implémentation Technique Détaillé - Fonctionnalité 2 : Définition de Modèles d'Horaires/Shifts Réutilisables (par Admin)**

**1. Nouveaux Modèles de Données (Sequelize)**

*   **Modèle Principal : `ShiftTemplate`**
    *   **Rôle :** Représente un modèle d'horaire ou de shift réutilisable défini par un administrateur pour un établissement spécifique.
    *   **Colonnes Clés :**
        *   `id`: `INTEGER.UNSIGNED`, PK, AutoIncrement
        *   `establishmentId`: `INTEGER.UNSIGNED`, FK vers `Establishments.id`, NOT NULL (indique à quel établissement appartient ce template).
        *   `name`: `STRING(100)`, NOT NULL (nom descriptif du template, ex: "Shift Matin Semaine", "Service Week-end Après-midi"). Doit être unique par `establishmentId`.
        *   `description`: `TEXT`, NULLABLE (description plus détaillée du template).
        *   `createdByMembershipId`: `INTEGER.UNSIGNED`, FK vers `Memberships.id`, NOT NULL (identifie le `Membership` de l'admin qui a créé ou est propriétaire de ce template).
        *   `createdAt`, `updatedAt`: `DATE`
    *   **Associations :**
        *   `ShiftTemplate.belongsTo(Establishment, { as: 'establishment', foreignKey: 'establishmentId' })`
        *   `ShiftTemplate.belongsTo(Membership, { as: 'creator', foreignKey: 'createdByMembershipId' })`
        *   `ShiftTemplate.hasMany(ShiftTemplateRule, { as: 'rules', foreignKey: 'shiftTemplateId', onDelete: 'CASCADE' })` (La suppression d'un template entraîne la suppression de ses règles).

*   **Modèle Associé : `ShiftTemplateRule`**
    *   **Rôle :** Définit une règle spécifique de disponibilité (ou d'indisponibilité) au sein d'un `ShiftTemplate`. Un template peut contenir plusieurs règles pour modéliser des horaires complexes (ex: un bloc de travail le matin, une pause, un autre bloc l'après-midi).
    *   **Colonnes Clés :**
        *   `id`: `INTEGER.UNSIGNED`, PK, AutoIncrement
        *   `shiftTemplateId`: `INTEGER.UNSIGNED`, FK vers `ShiftTemplates.id`, NOT NULL.
        *   `rruleString`: `TEXT`, NOT NULL. Stocke la règle de récurrence au format `rrule` (RFC 5545).
            *   **Important :** Le `DTSTART` dans cette `rruleString` sera typiquement une heure locale de l'établissement (ex: `T090000` pour 9h du matin) ou une date/heure de référence sans fuseau horaire spécifique. Le `ShiftTemplateService` se chargera de l'interpréter correctement avec le fuseau horaire de l'établissement et la date de début d'application du template lors de la génération des `StaffAvailability`.
        *   `durationMinutes`: `INTEGER.UNSIGNED`, NOT NULL (durée du bloc de temps généré par cette règle).
        *   `isWorking`: `BOOLEAN`, NOT NULL, Default: `true` (`true` pour disponibilité/travail, `false` pour indisponibilité/pause planifiée au sein du shift).
        *   `ruleDescription`: `STRING(255)`, NULLABLE (description spécifique pour cette règle, ex: "Bloc matin", "Pause déjeuner").
        *   `createdAt`, `updatedAt`: `DATE`
    *   **Associations :**
        *   `ShiftTemplateRule.belongsTo(ShiftTemplate, { as: 'shiftTemplate', foreignKey: 'shiftTemplateId' })`

*   **Modèle Existant impacté (Optionnel mais Recommandé) : `StaffAvailability`**
    *   **Nouvelle Colonne (Optionnelle) :** `appliedShiftTemplateRuleId`: `INTEGER.UNSIGNED`, FK vers `ShiftTemplateRules.id`, NULLABLE, `ON DELETE SET NULL`.
    *   **Justification :** Permet de tracer si une `StaffAvailability` a été générée à partir d'une règle de template. Utile pour :
        1.  Identifier les disponibilités gérées par template vs celles entrées manuellement.
        2.  Faciliter une logique de "réapplication" ou de "mise à jour" d'un template en ciblant les `StaffAvailability` précédemment générées par ce même template (ou une règle spécifique de ce template).
        3.  Afficher une indication dans l'UI.

**2. Logique Métier : Nouveaux Services ou Modifications**

*   **Nouveau Service : `ShiftTemplateService.ts`**
    *   **Rôle et Responsabilités :** Gérer le cycle de vie des `ShiftTemplate` et de leurs `ShiftTemplateRule`, et orchestrer l'application de ces templates aux `Membership`s pour générer les `StaffAvailability`.
    *   **Méthodes Clés :**
        *   `createShiftTemplate(dto: CreateShiftTemplateDto, actorMembership: MembershipAttributes): Promise<ShiftTemplateOutputDto>`
            *   Valide le DTO.
            *   S'assure que le `name` du template est unique pour l'`establishmentId` de l'acteur.
            *   Crée l'instance `ShiftTemplate` et ses `ShiftTemplateRule` associées dans une transaction.
            *   Retourne le DTO du template créé.
        *   `getShiftTemplateById(templateId: number, establishmentId: number): Promise<ShiftTemplateOutputDto | null>`
            *   Récupère le `ShiftTemplate` par son ID, incluant ses `rules`.
            *   Vérifie que `ShiftTemplate.establishmentId` correspond à l'`establishmentId` fourni (celui de l'admin).
        *   `listShiftTemplatesForEstablishment(establishmentId: number, queryDto: ListShiftTemplatesQueryDto): Promise<PaginationDto<ShiftTemplateOutputDto>>`
            *   Liste les `ShiftTemplate` pour un `establishmentId` donné, avec pagination et potentiellement filtrage/tri. Ne retourne pas les `rules` dans la liste pour alléger, sauf si explicitement demandé via un paramètre `includeRules`.
        *   `updateShiftTemplate(templateId: number, dto: UpdateShiftTemplateDto, establishmentId: number): Promise<ShiftTemplateOutputDto>`
            *   Récupère le `ShiftTemplate`. Vérifie l'appartenance à `establishmentId`.
            *   Met à jour les attributs du `ShiftTemplate`.
            *   Si `dto.rules` est fourni, supprime toutes les `ShiftTemplateRule` existantes pour ce template et crée les nouvelles. (Logique de remplacement simple pour commencer).
            *   Opération dans une transaction.
        *   `deleteShiftTemplate(templateId: number, establishmentId: number): Promise<void>`
            *   Récupère le `ShiftTemplate`. Vérifie l'appartenance.
            *   Supprime le `ShiftTemplate`. Les `ShiftTemplateRule` associées seront supprimées par `ON DELETE CASCADE`.
            *   Les `StaffAvailability` générées via ce template auront leur `appliedShiftTemplateRuleId` mis à `NULL` (si la colonne et la contrainte `ON DELETE SET NULL` existent).
        *   `applyShiftTemplateToMemberships(templateId: number, dto: ApplyShiftTemplateDto, establishmentId: number, actorAdminMembershipId: number): Promise<{ generatedAvailabilitiesCount: number, errors: ApplyTemplateErrorDetail[] }>`
            *   **Logique Principale (dans une transaction) :**
                1.  Récupère le `ShiftTemplate` par `templateId` et ses `rules`. Vérifie qu'il appartient à `establishmentId`.
                2.  Récupère l'objet `Establishment` pour obtenir son `timezone`.
                3.  Pour chaque `targetMembershipId` dans `dto.targetMembershipIds`:
                    a.  Vérifie que le `Membership` cible existe et appartient à `establishmentId`.
                    b.  **Gestion des `StaffAvailability` existantes (selon `dto.overwriteMode`) :**
                    *   `REPLACE_ALL_IN_PERIOD` (Défaut) : Supprime toutes les `StaffAvailability` du `targetMembershipId` dont la période effective (`effectiveStartDate` à `effectiveEndDate`) chevauche la période d'application (`dto.applicationStartDate` à `dto.applicationEndDate`).
                    *   `REPLACE_TEMPLATE_GENERATED_IN_PERIOD` : Si `StaffAvailability.appliedShiftTemplateRuleId` existe, supprime les `StaffAvailability` du `targetMembershipId` ayant un `appliedShiftTemplateRuleId` non nul et qui chevauchent la période d'application.
                    *   `ADD_ONLY_IF_NO_CONFLICT` : Mode plus complexe, non prioritaire. Pourrait nécessiter de vérifier chaque slot généré par le template contre les slots déjà occupés par des `StaffAvailability` existantes.
                    c.  Pour chaque `rule` dans `ShiftTemplate.rules`:
                    i.  Construire la `rruleString` finale pour la `StaffAvailability` :
                    *   Analyser `rule.rruleString` pour extraire `FREQ`, `BYDAY`, etc., et l'heure de `DTSTART` (ex: `T090000`).
                    *   Créer une date `DTSTART` absolue en UTC : prendre `dto.applicationStartDate`, y appliquer l'heure extraite, interpréter cette date/heure dans le `Establishment.timezone`, puis convertir en UTC. Cette date UTC sera le `dtstart` de la nouvelle `RRule` pour `StaffAvailability`.
                    *   La `rruleString` stockée dans `StaffAvailability` utilisera cette date UTC absolue.
                    ii. Créer une nouvelle instance de `StaffAvailability` :
                    *   `membershipId`: `targetMembershipId`.
                    *   `rruleString`: La `rruleString` générée avec `DTSTART` absolu en UTC.
                    *   `durationMinutes`: `rule.durationMinutes`.
                    *   `isWorking`: `rule.isWorking`.
                    *   `effectiveStartDate`: `dto.applicationStartDate`.
                    *   `effectiveEndDate`: `dto.applicationEndDate` (ou la date `UNTIL` de la `rruleString` si elle est antérieure et définie).
                    *   `description`: `rule.ruleDescription` ou un texte généré (ex: "Généré par template: {template.name} - Règle: {rule.description}").
                    *   `appliedShiftTemplateRuleId`: `rule.id` (si la colonne est implémentée).
                    *   `createdByMembershipId`: `actorAdminMembershipId` (l'admin qui applique).
                    iii. Sauvegarder la nouvelle `StaffAvailability`.
                4.  Retourner le nombre de disponibilités générées et une liste d'erreurs éventuelles (ex: membre non trouvé).

*   **Modification Service Existant : `AvailabilityService.ts`**
    *   Aucune modification directe n'est *requise* pour que ce service fonctionne avec les `StaffAvailability` générées par les templates, car il lit simplement toutes les `StaffAvailability` existantes. Cependant, si la logique de `getMemberNetWorkingPeriodsUTC` devient trop complexe, des optimisations ou une meilleure structuration pourraient être envisagées.

**3. API : Nouveaux Contrôleurs et Endpoints**

*   **Nouveau Contrôleur : `ShiftTemplateController.ts`**
    *   Injectera `ShiftTemplateService`.
*   **Routes API (toutes sous `/api/users/me/establishments/:establishmentId/shift-templates` car un template est lié à un établissement et géré par son admin) :**
    *   `POST /`
        *   Contrôleur: `ShiftTemplateController.create`
        *   Description: Crée un nouveau modèle de shift pour l'établissement.
    *   `GET /`
        *   Contrôleur: `ShiftTemplateController.listForEstablishment`
        *   Description: Liste tous les modèles de shift pour l'établissement.
    *   `GET /:templateId`
        *   Contrôleur: `ShiftTemplateController.getById`
        *   Description: Récupère les détails d'un modèle de shift spécifique.
    *   `PUT /:templateId`
        *   Contrôleur: `ShiftTemplateController.update`
        *   Description: Met à jour un modèle de shift existant.
    *   `DELETE /:templateId`
        *   Contrôleur: `ShiftTemplateController.delete`
        *   Description: Supprime un modèle de shift.
    *   `POST /:templateId/apply`
        *   Contrôleur: `ShiftTemplateController.applyToMemberships`
        *   Description: Applique un modèle de shift à un ou plusieurs membres pour une période donnée.

**4. DTOs (Data Transfer Objects) et Validation (Zod)**

*   **`ShiftTemplateRuleInputDtoSchema`** (Pour la création/màj des règles dans un template) :
    *   `rruleString: z.string().min(1, "RRule string cannot be empty.")`
    *   `durationMinutes: z.number().int().positive("Duration must be a positive integer.")`
    *   `isWorking: z.boolean()`
    *   `ruleDescription: z.string().max(255).optional().nullable()`
*   **`CreateShiftTemplateDtoSchema` :**
    *   `name: z.string().min(1, "Template name is required.").max(100)`
    *   `description: z.string().max(1000).optional().nullable()`
    *   `rules: z.array(ShiftTemplateRuleInputDtoSchema).min(1, "At least one rule is required for a template.")`
*   **`UpdateShiftTemplateDtoSchema` :**
    *   `name: z.string().min(1).max(100).optional()`
    *   `description: z.string().max(1000).optional().nullable()`
    *   `rules: z.array(ShiftTemplateRuleInputDtoSchema).min(1).optional()` (Si fourni, remplace toutes les règles existantes du template)
*   **`ShiftTemplateRuleOutputDtoSchema`** (Utilisé dans `ShiftTemplateOutputDto`) :
    *   `id: z.number()`
    *   `rruleString: z.string()`
    *   `durationMinutes: z.number()`
    *   `isWorking: z.boolean()`
    *   `ruleDescription: z.string().nullable()`
*   **`ShiftTemplateOutputDtoSchema` :**
    *   `id: z.number()`
    *   `establishmentId: z.number()`
    *   `name: z.string()`
    *   `description: z.string().nullable()`
    *   `createdByMembershipId: z.number()`
    *   `creator: ShortMembershipOutputDtoSchema.nullable()` (ref `timeoff-request.validation.ts`)
    *   `rules: z.array(ShiftTemplateRuleOutputDtoSchema)`
    *   `createdAt: z.date()`
    *   `updatedAt: z.date()`
*   **`ApplyShiftTemplateDtoSchema` :**
    *   `targetMembershipIds: z.array(z.number().int().positive()).min(1, "At least one target member ID is required.")`
    *   `applicationStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format.")`
    *   `applicationEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format.").nullable().optional()`
    *   `overwriteMode: z.enum(['REPLACE_ALL_IN_PERIOD', 'REPLACE_TEMPLATE_GENERATED_IN_PERIOD', 'ADD_ONLY_IF_NO_CONFLICT']).optional().default('REPLACE_ALL_IN_PERIOD')`
*   **`ListShiftTemplatesQueryDtoSchema` :**
    *   `page: z.coerce.number().int().positive().optional().default(1)`
    *   `limit: z.coerce.number().int().positive().max(100).optional().default(10)`
    *   `sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional().default('name')`
    *   `sortOrder: z.enum(['asc', 'desc']).optional().default('asc')`
    *   `search: z.string().optional()` (pour chercher par nom de template)

**5. Middlewares d'Autorisation**

*   Toutes les routes du `ShiftTemplateController` seront montées sous un préfixe qui inclut `:establishmentId` (ex: `/api/users/me/establishments/:establishmentId/shift-templates`).
*   **`ensureMembership([MembershipRole.ADMIN])` :** (Existant) Appliqué au routeur parent (`/api/users/me/establishments/:establishmentId`). Cela garantit que `req.membership` est défini et que l'utilisateur est un Admin de l'établissement concerné avant d'atteindre le `ShiftTemplateController`.
*   **Nouveau Middleware : `loadShiftTemplateAndVerifyOwnership(templateIdParamName: string)`**
    *   **Rôle :** Utilisé pour les routes qui ciblent un `ShiftTemplate` spécifique (GET by ID, PUT, DELETE, POST /apply).
    *   **Fonctionnement :**
        1.  Vérifie que `req.membership` (l'admin) est défini.
        2.  Récupère le `ShiftTemplate` par l'ID fourni dans `req.params[templateIdParamName]`. Si non trouvé, 404.
        3.  Vérifie que `loadedShiftTemplate.establishmentId` est égal à `req.membership.establishmentId`. Si non, 403 (l'admin essaie d'accéder à un template d'un autre établissement).
        4.  Attache le `loadedShiftTemplate` à `req.targetShiftTemplate`.
        5.  Passe au `next()` handler.

**6. Impacts et Points d'Attention**

*   **Interaction avec `StaffAvailability` :** Les `StaffAvailability` seront créées par le `ShiftTemplateService` lors de l'application d'un template. Si la colonne `appliedShiftTemplateRuleId` est ajoutée à `StaffAvailability`, elle devra être renseignée.
*   **`AvailabilityService` :** Ce service continuera de fonctionner comme avant, en lisant toutes les `StaffAvailability` pour un membre afin de calculer ses périodes de travail nettes. L'origine (manuelle ou template) des `StaffAvailability` est transparente pour lui.
*   **Complexité de la génération/application des `rrule` :** C'est le point le plus délicat.
    *   **Interprétation des `DTSTART` :** Les `rruleString` dans `ShiftTemplateRule` (ex: `FREQ=WEEKLY;BYDAY=MO;DTSTART=T090000`) doivent avoir leur `DTSTART` (heure locale) correctement combiné avec `applicationStartDate` et le `Establishment.timezone` pour générer des `StaffAvailability.rruleString` avec des `DTSTART` absolus en UTC. La bibliothèque `moment-timezone` sera essentielle.
    *   **Gestion de `UNTIL` vs `applicationEndDate` :** Lors de la génération d'une `StaffAvailability`, la fin de sa récurrence sera le minimum entre la date `UNTIL` spécifiée dans la `rruleString` du `ShiftTemplateRule` (si elle existe) et `applicationEndDate` (si elle est fournie).
*   **Performance :** L'application d'un template à de nombreux membres et/ou sur une longue période peut être gourmande en ressources (multiples créations en BDD).
    *   Utilisation impérative de transactions Sequelize pour l'ensemble de l'opération "apply".
    *   Pour des volumes très importants, une exécution asynchrone (via une file d'attente de tâches) pourrait être envisagée dans une V2.
*   **Gestion des fuseaux horaires :** Tout doit être pensé avec les fuseaux horaires. L'admin définit les heures du template dans le contexte de son établissement. Ces heures sont converties en UTC pour le stockage des `rruleString` dans `StaffAvailability` (car `rrule.js` fonctionne mieux avec des dates UTC pour `between()`).
*   **Interface Utilisateur (UI) :** Permettre aux admins de créer des `rruleString` valides via une UI est un défi. Des composants spécialisés ou des sélecteurs simplifiés (ex: choisir jours, heures, fréquence) seraient nécessaires.
*   **Modification/Suppression de `ShiftTemplate` :**
    *   Modifier un template n'affecte pas les `StaffAvailability` déjà générées. L'admin doit réappliquer.
    *   Supprimer un template ne supprime pas les `StaffAvailability` générées. Si `appliedShiftTemplateRuleId` est utilisé, il sera mis à `NULL` via la contrainte `ON DELETE SET NULL` de la clé étrangère.

---