Absolument. C'est une étape essentielle pour consolider le travail accompli et faciliter la reprise. Je vais m'appliquer à rédiger cette note descriptive avec le plus grand soin et la plus grande clarté possible.

---

**Note Descriptive de la Refonte du Système de Planification (Backend)**

**Document Version:** 1.0
**Date:** [Date Actuelle]
**Auteur:** CodeArchitect-TS

**Table des Matières**

1.  Introduction et Objectifs de la Refonte
2.  Architecture Générale des Nouveaux Composants
3.  Modèles de Données (Sequelize)
4.  DTOs de Validation et de Sortie (Zod)
5.  Services Applicatifs
6.  Gestion des Erreurs Custom
7.  Stratégie de Caching
8.  API Endpoints et Routage
9.  Points Importants et Prochaines Étapes

---

## 1. Introduction et Objectifs de la Refonte

Ce document décrit la refonte majeure du système de planification au sein de l'application backend. L'ancien système, basé sur les entités `ShiftTemplate`, `ShiftTemplateRule`, et `StaffAvailability` (pour les définitions manuelles), a été remplacé par une nouvelle architecture visant à offrir une plus grande flexibilité, une meilleure intégration et des fonctionnalités étendues.

Les **objectifs principaux** de cette refonte étaient de :

*   **Centraliser la définition des plannings récurrents** en fusionnant les concepts de `ShiftTemplate` et `ShiftTemplateRule` en une entité unique et plus détaillée, le `RecurringPlanningModel` (RPM).
*   **Intégrer nativement la gestion des pauses** au sein des modèles de planning récurrents.
*   Permettre des **ajustements journaliers fins et personnalisés** pour chaque membre via les `DailyAdjustmentSlot` (DAS), qui peuvent surcharger ou compléter le planning récurrent.
*   Fournir un **calcul dynamique et précis de l'emploi du temps effectif** d'un membre pour un jour donné, en prenant en compte toutes ces couches de planification.
*   Maintenir une **haute performance** et **scalabilité** grâce à des optimisations et une stratégie de caching.

## 2. Architecture Générale des Nouveaux Composants

La nouvelle architecture s'articule autour de trois nouvelles entités principales et d'un ensemble de services dédiés.

**Nouvelles Entités Principales :**

| Entité                               | Responsabilité Principale                                                                                                     | Remplace/Complète                                   |
| :----------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| `RecurringPlanningModel` (RPM)       | Modèle de planning réutilisable définissant une enveloppe de travail/indisponibilité journalière, sa récurrence, et ses pauses. | `ShiftTemplate` et `ShiftTemplateRule`              |
| `RPMBreak` (dans RPM)                | Définit une pause spécifique (heures, type, description) au sein d'un `RecurringPlanningModel`.                               | Nouvelle fonctionnalité intégrée                    |
| `RecurringPlanningModelMemberAssignment` (RPMMA) | Lie un membre à un `RecurringPlanningModel` pour une période d'application donnée (début/fin).                          | Logique d'application de template (plus structurée) |
| `DailyAdjustmentSlot` (DAS)        | Permet des exceptions, modifications manuelles, ou des événements spécifiques (absences, travail effectif) au planning journalier d'un membre. | `StaffAvailability` (pour les définitions manuelles et les exceptions), et les `TimeOffRequest` (pour la partie "absence" des DAS) |

**Enums Communs :**
Des énumérations ont été définies pour standardiser les types :
*   `DefaultBlockType`: (`WORK`, `UNAVAILABILITY`) pour l'enveloppe par défaut d'un RPM.
*   `BreakType`: (`MEAL`, `SHORT_REST`, etc.) pour qualifier les pauses dans un RPM.
*   `SlotType`: (Ex: `EFFECTIVE_WORK`, `ABSENCE_UNJUSTIFIED`, `SICK_LEAVE_CERTIFIED`, `MANUAL_BREAK`, etc.) pour qualifier la nature d'un `DailyAdjustmentSlot`.

## 3. Modèles de Données (Sequelize)

Les modèles Sequelize suivants ont été définis pour persister les données de la nouvelle architecture de planification.

### 3.1. `RecurringPlanningModel`

*   **Finalité :** Stocke les modèles de planning récurrents.
*   **Attributs Clés :**

    | Attribut           | Type (Sequelize)             | Description/Rôle                                                                 | Contraintes                 |
        | :----------------- | :--------------------------- | :------------------------------------------------------------------------------- | :-------------------------- |
    | `id`               | `INTEGER.UNSIGNED` (PK, AI)  | Identifiant unique                                                               | PK                          |
    | `name`             | `STRING(150)`                | Nom du modèle de planning                                                        | NOT NULL, Unique par `establishment_id` |
    | `description`      | `TEXT`                       | Description détaillée                                                            | NULLABLE                    |
    | `referenceDate`    | `DATEONLY` ("YYYY-MM-DD")    | Date de base pour le `DTSTART` de la `rruleString` (partie date)                 | NOT NULL                    |
    | `globalStartTime`  | `TIME` ("HH:MM:SS")          | Début de l'enveloppe de travail/indisponibilité journalière                     | NOT NULL                    |
    | `globalEndTime`    | `TIME` ("HH:MM:SS")          | Fin de l'enveloppe journalière                                                   | NOT NULL                    |
    | `rruleString`      | `TEXT`                       | Chaîne RRULE (RFC 5545) pour la récurrence de l'enveloppe                        | NOT NULL                    |
    | `defaultBlockType` | `ENUM(WORK, UNAVAILABILITY)` | Type par défaut du bloc défini par l'enveloppe                                   | NOT NULL, Défaut: `WORK`    |
    | `breaks`           | `JSONB` / `JSON`             | Tableau d'objets `RPMBreak` `[{id, startTime, endTime, description?, breakType}]` | NULLABLE                    |
    | `establishmentId`  | `INTEGER.UNSIGNED` (FK)      | Lie au `Establishment`                                                           | NOT NULL                    |

*   **Relations Principales :**
    *   `belongsTo(Establishment)`
    *   `hasMany(RecurringPlanningModelMemberAssignment)`
    *   `hasMany(DailyAdjustmentSlot, { foreignKey: 'sourceRpmId' })` (pour tracer les DAS issus d'un RPM, bien que non utilisé en V1 pour création auto)

### 3.2. `RecurringPlanningModelMemberAssignment` (RPMMA)

*   **Finalité :** Lie un `Membership` (membre) à un `RecurringPlanningModel` pour une période donnée.
*   **Attributs Clés :**

    | Attribut                   | Type (Sequelize)            | Description/Rôle                                    | Contraintes |
        | :------------------------- | :-------------------------- | :-------------------------------------------------- | :---------- |
    | `id`                       | `INTEGER.UNSIGNED` (PK, AI) | Identifiant unique                                  | PK          |
    | `membershipId`             | `INTEGER.UNSIGNED` (FK)     | ID du membre affecté                                | NOT NULL    |
    | `recurringPlanningModelId` | `INTEGER.UNSIGNED` (FK)     | ID du RPM affecté                                   | NOT NULL    |
    | `assignmentStartDate`      | `DATEONLY` ("YYYY-MM-DD")   | Début de validité de l'affectation                  | NOT NULL    |
    | `assignmentEndDate`        | `DATEONLY` ("YYYY-MM-DD")   | Fin de validité de l'affectation (peut être `NULL`) | NULLABLE    |

*   **Relations Principales :**
    *   `belongsTo(Membership)`
    *   `belongsTo(RecurringPlanningModel)`

### 3.3. `DailyAdjustmentSlot` (DAS)

*   **Finalité :** Stocke les ajustements spécifiques, exceptions, ou événements pour le planning journalier d'un membre.
*   **Attributs Clés :**

    | Attribut                       | Type (Sequelize)            | Description/Rôle                                                                 | Contraintes              |
        | :----------------------------- | :-------------------------- | :------------------------------------------------------------------------------- | :----------------------- |
    | `id`                           | `INTEGER.UNSIGNED` (PK, AI) | Identifiant unique                                                               | PK                       |
    | `membershipId`                 | `INTEGER.UNSIGNED` (FK)     | ID du membre concerné                                                            | NOT NULL                 |
    | `slotDate`                     | `DATEONLY` ("YYYY-MM-DD")   | Jour concerné par cet ajustement                                                 | NOT NULL                 |
    | `startTime`                    | `TIME` ("HH:MM:SS")         | Heure de début du slot                                                           | NOT NULL                 |
    | `endTime`                      | `TIME` ("HH:MM:SS")         | Heure de fin du slot                                                             | NOT NULL                 |
    | `slotType`                     | `ENUM(SlotType values)`     | Type de l'ajustement (ex: `EFFECTIVE_WORK`, `ABSENCE_UNJUSTIFIED`)                   | NOT NULL                 |
    | `description`                  | `TEXT`                      | Description de l'ajustement                                                      | NULLABLE                 |
    | `sourceRpmId` (field: `source_rpm_id`) | `INTEGER.UNSIGNED` (FK)     | ID du RPM source si cet ajustement en dérive (ex: copie d'une pause du modèle) | NULLABLE, `ON DELETE SET NULL` |
    | `isManualOverride`             | `BOOLEAN`                   | `true` si créé/modifié manuellement (prioritaire)                                | NOT NULL, Défaut: `true` |
    | `tasks`                        | `JSONB` / `JSON`            | Tableau d'objets `DASTask` si `slotType` est `EFFECTIVE_WORK`                    | NULLABLE                 |
    | `establishmentId`              | `INTEGER.UNSIGNED` (FK)     | Lie à l'`Establishment` (pour contexte et droits)                                | NOT NULL                 |

*   **Relations Principales :**
    *   `belongsTo(Membership)`
    *   `belongsTo(Establishment)`
    *   `belongsTo(RecurringPlanningModel, { foreignKey: 'sourceRpmId' })`

## 4. DTOs de Validation et de Sortie (Zod)

Des schémas Zod ont été définis pour chaque nouvelle entité afin de valider rigoureusement les données d'entrée des API et de structurer les données de sortie.

*   **Pour `RecurringPlanningModel` :**
    *   `RPMBreakSchema`: Valide la structure d'une pause (ID UUID, heures valides, type).
    *   `CreateRecurringPlanningModelSchema`: Valide le nom, les dates/heures de l'enveloppe, la `rruleString` (format de base), le `defaultBlockType`, et la structure des `breaks` (cohérence interne, non-chevauchement, contenues dans l'enveloppe).
    *   `UpdateRecurringPlanningModelSchema`: Version partielle du schéma de création.
    *   `RecurringPlanningModelOutputSchema`: Structure de réponse pour un RPM.
    *   `ListRecurringPlanningModelsQuerySchema`: Pour la pagination, le tri, et la recherche des RPMs.
*   **Pour `RecurringPlanningModelMemberAssignment` :**
    *   `CreateRpmMemberAssignmentSchema`: Valide `membershipId` et les dates d'affectation (cohérence).
    *   `BulkAssignMembersToRpmSchema` et `BulkUnassignMembersFromRpmSchema`: Pour les opérations en masse d'affectation/désaffectation.
    *   `UpdateRpmMemberAssignmentSchema`: Pour la mise à jour des dates d'une affectation.
    *   `RpmMemberAssignmentOutputSchema`: Structure de réponse pour une affectation.
    *   `ListRpmMemberAssignmentsQuerySchema`: Pour le listage et filtrage des affectations.
*   **Pour `DailyAdjustmentSlot` :**
    *   `DASTaskSchema`: Valide la structure d'une tâche au sein d'un slot (ID UUID, nom, heures valides).
    *   `CreateDailyAdjustmentSlotSchema`: Valide tous les champs d'un DAS, y compris les `tasks` (cohérence interne, non-chevauchement, contenues dans le slot).
    *   `BulkUpdateDasSchema` (avec `BulkUpdateDasItemSchema`) et `BulkDeleteDasDtoSchema`: Pour les opérations en masse sur les DAS.
    *   `UpdateDailyAdjustmentSlotSchema`: Version partielle pour la mise à jour.
    *   `DailyAdjustmentSlotOutputSchema`: Structure de réponse pour un DAS.
    *   `ListDailyAdjustmentSlotsQuerySchema`: Pour le listage et filtrage des DAS.

L'utilisation de Zod garantit que les données traitées par les services sont conformes aux attentes.

## 5. Services Applicatifs

Quatre services principaux ont été implémentés pour gérer la logique métier :

| Service                               | Responsabilité Principale                                                                                                                                                              |
| :------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RecurringPlanningModelService`       | CRUD des `RecurringPlanningModel` (RPM), validation de leur structure (pauses, RRULE).                                                                                                 |
| `RpmMemberAssignmentService`          | Gestion des affectations des membres aux RPMs, incluant la validation cruciale de non-chevauchement des périodes d'affectation pour un même membre. Opérations en masse d'affectation. |
| `DailyAdjustmentSlotService`          | CRUD des `DailyAdjustmentSlot` (DAS), validation de non-chevauchement des slots pour un même membre à une même date. Opérations en masse de mise à jour/suppression.                     |
| `DailyScheduleService`                | **Service central de calcul :** Détermine l'emploi du temps effectif d'un membre pour un jour donné en combinant le RPM actif, ses pauses, et les DAS.                                    |

### Focus sur les Méthodes Clés :

*   **`RecurringPlanningModelService` :**
    *   `createRpm`, `updateRpm`: Valident l'unicité du nom, la structure des pauses (y compris l'assignation d'ID UUID si absents), et le format de base de la `rruleString`. Utilisent des transactions.
*   **`RpmMemberAssignmentService` :**
    *   `createAssignment`, `updateAssignment`, `bulkAssignMembersToRpm`: Implémentent la logique stricte pour empêcher le chevauchement des périodes d'affectation d'un RPM à un même membre. Utilisent des transactions.
*   **`DailyAdjustmentSlotService` :**
    *   `createDas`, `updateDas`, `bulkUpdateDas`: Implémentent la logique stricte pour empêcher le chevauchement des DAS pour un même membre à une même date. Valident la cohérence des tâches internes. Utilisent des transactions.
*   **`DailyScheduleService` :**
    *   **`getDailyScheduleForMember(membershipId, targetDate)` :**
        1.  Récupère le membre et le fuseau horaire de son établissement.
        2.  Identifie le `RecurringPlanningModelMemberAssignment` actif pour le membre à la `targetDate`, et charge le `RecurringPlanningModel` associé (avec ses `breaks`).
        3.  Si un RPM est applicable :
            *   Calcule si une occurrence de l'enveloppe globale du RPM (définie par `globalStartTime`, `globalEndTime`, et la `rruleString` dont le `DTSTART` est dynamiquement construit avec `referenceDate` + `globalStartTime`) tombe sur `targetDate`.
            *   Si oui, initialise une liste de blocs (`TimeBlock[]`) avec cette enveloppe (type `RPM.defaultBlockType`).
            *   Appelle une méthode privée `subtractAndInsertIntervals` pour "découper" l'enveloppe avec les `RPM.breaks`, insérant les pauses comme des blocs distincts.
        4.  Récupère tous les `DailyAdjustmentSlot` pour le membre et la `targetDate`.
        5.  Appelle une méthode privée `mergeAndOverrideIntervals` pour appliquer les DAS sur les blocs issus du RPM. Les DAS ont la priorité et "percent" ou remplacent les blocs RPM. Cette méthode est simplifiée car les DAS sont garantis non chevauchants entre eux.
        6.  Retourne un tableau de `CalculatedSlot`, qui sont des objets formatés avec `startTime`, `endTime` (HH:MM:SS), `slotDate`, `type`, `description`, et des informations de source (`source`, `sourceRpmId`, `sourceRpmBreakId`, `sourceDasId`, `isManualOverride`).
    *   **Erreurs Possibles :** `MembershipNotFoundError`, `EstablishmentConfigurationError`.

## 6. Gestion des Erreurs Custom

Une hiérarchie d'erreurs personnalisées a été mise en place dans `src/errors/planning.errors.ts` pour fournir un feedback clair et spécifique au client API.
*   **Base :** `AppError` (erreur applicative générique avec `statusCode`, `message`, `errorCode`, `details`).
*   **Spécifique au Module :** `PlanningModuleError` (hérite d'`AppError`) sert de base pour toutes les erreurs du module de planification.
*   **Erreurs Détaillées :** Des classes comme `RpmCreationError`, `RpmNameConflictError`, `RpmNotFoundError`, `RpmAssignmentError` (avec un `errorCode` spécifique comme `ASSIGNMENT_PERIOD_OVERLAP`), `DasConflictError`, `DasNotFoundError`, etc., héritent de `PlanningModuleError`.
    *   Elles transportent un `statusCode` HTTP approprié (400, 404, 409).
    *   Elles ont un `errorCode` machine-lisible (ex: `RPM_NAME_CONFLICT`) pour faciliter le traitement par le frontend.
    *   Elles peuvent contenir des `details` contextuels sur l'erreur.

## 7. Stratégie de Caching

Pour optimiser les performances, une stratégie de caching a été conçue :
*   **Candidats au Caching :** Principalement les résultats de `DailyScheduleService.getDailyScheduleForMember`, les listes de RPMs, et les détails d'un RPM. Les listes de DAS et d'affectations peuvent aussi être mises en cache avec des TTL plus courts.
*   **Technologie :** `ICacheService` comme interface, avec une implémentation `MemoryCacheService` (utilisant `node-cache`) pour la V1/développement. Redis est la cible pour la production pour sa scalabilité et ses fonctionnalités.
*   **Clés de Cache :** Structurées pour être uniques et descriptives (ex: `schedule:estId<EID>:membId<MID>:date<YYYY-MM-DD>`, `rpm:estId<EID>:id<RID>`).
*   **Invalidation (V1) :**
    *   **TTL :** Des durées de vie (Time To Live) sont définies pour chaque type d'entrée en cache (ex: 5-15 min pour les schedules, plus long pour les RPMs).
    *   **Invalidation Explicite :**
        *   Les opérations d'écriture (CREATE, UPDATE, DELETE) sur les entités invalident les caches directement liés (ex: la modification d'un RPM invalide son cache `rpm:id:...` et les listes `rpms:list:...`).
        *   La modification/suppression d'un DAS invalide le cache `schedule:...` du jour/membre concerné.
        *   La modification/suppression d'une affectation RPM invalide le cache `schedule:...` du membre concerné pour toutes les dates (via un pattern `schedule:estId<EID>:membId<MID>:date*`).
        *   La modification d'un RPM invalide également les caches `schedule:...` des membres activement affectés (via un pattern `schedule:estId<EID>:membId<MID_affecté>:date*`).
*   **Intégration :** Le `CacheService` est injecté dans les services applicatifs. La logique de "cache-aside" (vérifier cache, si miss -> calculer/récupérer -> set cache) est implémentée dans les méthodes de lecture des services. Les méthodes d'écriture appellent `cacheService.delete()` ou `cacheService.deleteByPattern()`.

## 8. API Endpoints et Routage

Les nouvelles fonctionnalités sont exposées via des endpoints API RESTful, montés sous le préfixe global de l'établissement géré par l'administrateur : `api/users/me/establishments/:establishmentId/`. Un sous-préfixe `/planning` est utilisé pour regrouper ces nouvelles routes.

**Tableau Récapitulatif des Principaux Nouveaux Endpoints (sous `/planning`) :**

| Méthode HTTP | URL Relative à `/planning`                                | Contrôleur et Méthode                                       | DTO Entrée Principal                       |
| :----------- | :-------------------------------------------------------- | :---------------------------------------------------------- | :----------------------------------------- |
| `POST`       | `/recurring-planning-models`                              | `RPMController.create`                                      | `CreateRecurringPlanningModelDto`            |
| `GET`        | `/recurring-planning-models`                              | `RPMController.listForEstablishment`                        | `ListRecurringPlanningModelsQueryDto` (Query)|
| `GET`        | `/recurring-planning-models/{rpmId}`                      | `RPMController.getById`                                     | -                                          |
| `PUT`        | `/recurring-planning-models/{rpmId}`                      | `RPMController.update`                                      | `UpdateRecurringPlanningModelDto`            |
| `DELETE`     | `/recurring-planning-models/{rpmId}`                      | `RPMController.delete`                                      | -                                          |
| `POST`       | `/recurring-planning-models/{rpmId}/member-assignments`   | `RPMMAController.createAssignment`                          | `CreateRpmMemberAssignmentDto`             |
| `GET`        | `/recurring-planning-models/{rpmId}/member-assignments`   | `RPMMAController.listAssignmentsForRpm`                     | `ListRpmMemberAssignmentsQueryDto` (Query) |
| `PUT`        | `/recurring-planning-models/{rpmId}/member-assignments/{assignmentId}` | `RPMMAController.updateAssignment`                     | `UpdateRpmMemberAssignmentDto`             |
| `DELETE`     | `/recurring-planning-models/{rpmId}/member-assignments/{assignmentId}` | `RPMMAController.deleteAssignment`                     | -                                          |
| `POST`       | `/recurring-planning-models/{rpmId}/member-assignments/bulk-assign` | `RPMMAController.bulkAssign`                           | `BulkAssignMembersToRpmDto`                |
| `POST`       | `/recurring-planning-models/{rpmId}/member-assignments/bulk-unassign`| `RPMMAController.bulkUnassign`                         | `BulkUnassignMembersFromRpmDto`            |
| `POST`       | `/daily-adjustment-slots`                                 | `DASController.create`                                      | `CreateDailyAdjustmentSlotDto`             |
| `GET`        | `/daily-adjustment-slots`                                 | `DASController.listForEstablishment`                        | `ListDailyAdjustmentSlotsQueryDto` (Query) |
| `GET`        | `/daily-adjustment-slots/{dasId}`                         | `DASController.getById`                                     | -                                          |
| `PATCH`      | `/daily-adjustment-slots/{dasId}`                         | `DASController.update`                                      | `UpdateDailyAdjustmentSlotDto`             |
| `DELETE`     | `/daily-adjustment-slots/{dasId}`                         | `DASController.delete`                                      | -                                          |
| `PATCH`      | `/daily-adjustment-slots/bulk-update`                     | `DASController.bulkUpdate`                                  | `BulkUpdateDasDto`                         |
| `POST`       | `/daily-adjustment-slots/bulk-delete`                     | `DASController.bulkDelete`                                  | `BulkDeleteDasDto`                         |
| `GET`        | `/memberships/{membershipId}/daily-schedule`              | `DailyScheduleController.getMemberSchedule`                 | `date` (Query Param "YYYY-MM-DD")          |

**Middlewares :**
Toutes ces routes sont protégées par les middlewares `authenticateToken` (qui attache `req.user`) et `authorizeMembership([MembershipRole.ADMIN])` (qui attache `req.membership` et vérifie le rôle ADMIN pour l'établissement concerné), appliqués au niveau du routeur parent `my-establishment.routes.ts`.

## 9. Points Importants et Prochaines Étapes (Rappel)

*   **ABSENCE DE TESTS : L'implémentation actuelle (modèles, DTOs, services, contrôleurs) N'A PAS ENCORE FAIT L'OBJET DE TESTS (ni unitaires, ni d'intégration, ni E2E).** C'est la prochaine étape critique.
*   **DÉMARRAGE SERVEUR NON EFFECTUÉ : Le serveur backend N'A PAS ENCORE ÉTÉ DÉMARRÉ avec l'intégralité de ces nouvelles fonctionnalités et refactorisations intégrées.** Des erreurs de compilation mineures, de "plomberie" ou d'exécution sont possibles et devront être adressées.
*   **Prochaines Étapes Logiques :**
    1.  Finalisation des ajustements mineurs (commentaires, etc.).
    2.  Revue de code approfondie de l'ensemble des modifications.
    3.  Tentative de démarrage du serveur et résolution des erreurs de compilation/runtime initiales.
    4.  Définition d'une stratégie de test détaillée et écriture des tests :
        *   Tests unitaires pour les DTOs Zod.
        *   Tests unitaires pour les méthodes des services (en mockant les dépendances, y compris le `CacheService`). Focus particulier sur `DailyScheduleService` et les logiques de validation de non-chevauchement.
        *   Tests d'intégration pour les services interagissant avec la base de données (sur une BDD de test).
        *   Tests d'intégration/E2E pour les contrôleurs et les endpoints API (avec `supertest`).
    5.  Débogage et itération basés sur les résultats des tests.
    6.  Préparation d'un script de migration des données depuis l'ancien système (`ShiftTemplate`, `StaffAvailability`) vers les nouvelles structures (`RecurringPlanningModel`, `DailyAdjustmentSlot`).

---

Cette note vise à fournir un aperçu complet et structuré de la refonte. Elle devrait servir de point de référence solide pour la suite du développement et des tests.