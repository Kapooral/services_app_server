---
**Scénarios de Tests Unitaires Affinés pour `StaffAvailabilityService.ts`**

**Méthode : `createStaffAvailability(dto: CreateStaffAvailabilityDto, actorAdminMembership: MembershipAttributes, targetMembershipId: number)`**

*   **Functional / "Happy Path" :**
    1.  **Func - Création Réussie Standard :** `dto` avec tous les champs obligatoires (`rruleString`, `durationMinutes`, `isWorking`, `effectiveStartDate`) et `description`, `effectiveEndDate` valides.
        *   *Assertions :* `validateRRuleString` et `validateCommonFields` appelés et ne lèvent pas d'erreur. `membershipModel.findOne` appelé avec `targetMembershipId` et `actorAdminMembership.establishmentId`, retourne un membre valide. `staffAvailabilityModel.create` appelé avec `{ ...dto, membershipId: targetMembershipId, createdByMembershipId: actorAdminMembership.id, appliedShiftTemplateRuleId: null }`. Retourne l'objet `StaffAvailabilityAttributes` créé.
    2.  **Func - Création sans `description` et `effectiveEndDate` :**
        *   *Assertions :* `staffAvailabilityModel.create` appelé avec `description: null` (ou non défini selon le DTO) et `effectiveEndDate: null`.
    3.  **Func - Création avec `isWorking = false` :**
        *   *Assertions :* `staffAvailabilityModel.create` appelé avec `isWorking: false`.
    4.  **Func - Création avec `effectiveEndDate` identique à `effectiveStartDate` :**
        *   *Assertions :* `validateCommonFields` passe. Création réussie.
    5.  **Func - `rruleString` complexe mais valide (ex: avec `BYSETPOS`, `BYMONTHDAY`, `UNTIL`) :**
        *   *Assertions :* `validateRRuleString` passe. Création réussie.
    
*   **Edge Cases :**
    1.  **Edge - `rruleString` pour un événement unique (ex: `FREQ=DAILY;COUNT=1;DTSTART=...`) :**
        *   *Assertions :* Création réussie.
    2.  **Edge - `durationMinutes` à la valeur 1 (minimum positif) :**
        *   *Assertions :* `validateCommonFields` passe. Création réussie.
    3.  **Edge - `description` à la longueur maximale (255 caractères) :**
        *   *Assertions :* Création réussie.
    4.  **Edge - `effectiveStartDate` est aujourd'hui :**
        *   *Assertions :* Création réussie.
    5.  **Edge - `effectiveEndDate` est loin dans le futur :**
        *   *Assertions :* Création réussie.
    6.  **[CHEV] Edge - Création d'une règle se terminant EXACTEMENT quand une autre commence (Pas de Chevauchement) :**
        *   *Input :* Nouvelle règle `effectiveEndDate` + `duration` (de sa dernière occurrence) = `effectiveStartDate` d'une règle existante.
        *   *Assertions :* **Aucun conflit détecté.** Création réussie.
    7.  **[CHEV] Edge - Création d'une règle commençant EXACTEMENT quand une autre se termine (Pas de Chevauchement) :**
        *   *Input :* Nouvelle règle `effectiveStartDate` (de sa première occurrence) = `effectiveEndDate` + `duration` d'une règle existante.
        *   *Assertions :* **Aucun conflit détecté.** Création réussie.

*   **Adversarial / Error Handling / "Sad Path" :**
    *   *(Validations Zod normalement en amont, mais test du service pour robustesse ou si le service a sa propre logique)*
    1.  **Adv - `rruleString` syntaxiquement incorrecte :** (ex: `FREQ=WEEKLY;BYDAY=MOO`)
        *   *Assertions :* `validateRRuleString` (interne au service) lève `StaffAvailabilityCreationError` ("Invalid RRule string format..."). `staffAvailabilityModel.create` non appelé.
    2.  **Adv - `rruleString` sans `FREQ` (non conforme au `refine` du Zod DTO) :**
        *   *Assertions :* Si `validateRRuleString` ne le détecte pas mais que `RRule.fromString` échoue pour cela, `StaffAvailabilityCreationError` levée.
    3.  **Adv - `durationMinutes` = 0 (non conforme à la validation Sequelize et DTO) :**
        *   *Assertions :* `validateCommonFields` lève `StaffAvailabilityCreationError` ("Duration must be a positive integer.").
    4.  **Adv - `durationMinutes` négative :**
        *   *Assertions :* `validateCommonFields` lève `StaffAvailabilityCreationError`.
    5.  **Adv - `effectiveEndDate` antérieure à `effectiveStartDate` (non conforme au `refine` du Zod DTO) :**
        *   *Assertions :* `validateCommonFields` lève `StaffAvailabilityCreationError` ("Effective end date cannot be before effective start date.").
    6.  **Adv - `effectiveStartDate` dans un format invalide (ex: `DD-MM-YYYY`) (Zod gère) :**
        *   *Assertions :* Si le DTO passe (improbable), le service pourrait échouer à cause de `moment()`. Test de robustesse.
    7.  **Adv - `targetMembershipId` Inexistant :**
        *   *Assertions :* `membershipModel.findOne` retourne `null`. `MembershipNotFoundError` levée.
    8.  **Adv - `targetMembershipId` n'appartient pas à `actorAdminMembership.establishmentId` :**
        *   *Assertions :* `membershipModel.findOne` retourne `null` (à cause de la clause `where`). `MembershipNotFoundError` levée.
    9.  **Adv - `actorAdminMembership` est celui d'un rôle non-ADMIN (si une telle vérification existait dans le service, sinon hors scope pour test unitaire du service) :** N/A ici car le service ne vérifie pas le rôle de `actorAdminMembership`.
    10. **Adv - Échec de `staffAvailabilityModel.create` (simulé, ex: contrainte de base de données unique violée, erreur DB générique) :**
        *   *Assertions :* `StaffAvailabilityCreationError` ("Failed to create staff availability...") levée.
    11. **Adv - Validation Sequelize sur `durationMinutes` échoue (si la validation du service était contournée) :** Simuler l'échec de la validation `isPositive` du modèle.
        *   *Assertions :* Erreur Sequelize propagée ou wrappée en `StaffAvailabilityCreationError`.
    12.  **Adv - Échec de `staffAvailabilityModel.create` (simulé, après toutes les validations, y compris chevauchement) :**
        *   *Assertions :* `StaffAvailabilityCreationError` ("Failed to create staff availability...").
    13.  **[CHEV] Adv - Conflit de Chevauchement : Nouvelle règle commence pendant une règle existante :**
        *   *Input :* Règle existante: Lun 9h-12h. Nouvelle règle: Lun 10h-11h.
        *   *Assertions :* Le service détecte le chevauchement. `StaffAvailabilityConflictError` (ou `StaffAvailabilityCreationError` avec message de conflit) levée. `staffAvailabilityModel.create` non appelé.
    14.  **[CHEV] Adv - Conflit de Chevauchement : Nouvelle règle se termine pendant une règle existante :**
        *   *Input :* Règle existante: Lun 9h-12h. Nouvelle règle: Lun 8h-10h.
        *   *Assertions :* `StaffAvailabilityConflictError` levée.
    15.  **[CHEV] Adv - Conflit de Chevauchement : Nouvelle règle englobe une règle existante :**
        *   *Input :* Règle existante: Lun 10h-11h. Nouvelle règle: Lun 9h-12h.
        *   *Assertions :* `StaffAvailabilityConflictError` levée.
    16. **[CHEV] Adv - Conflit de Chevauchement : Nouvelle règle est englobée par une règle existante :**
        *   *Input :* Règle existante: Lun 9h-12h. Nouvelle règle: Lun 10h-11h (déjà couvert par 7, mais bon à tester explicitement).
        *   *Assertions :* `StaffAvailabilityConflictError` levée.
    17. **[CHEV] Adv - Conflit de Chevauchement : Partage heure de début (chevauchement partiel) :**
        *   *Input :* Règle existante: Lun 9h-12h. Nouvelle règle: Lun 9h-10h.
        *   *Assertions :* `StaffAvailabilityConflictError` levée.
    18. **[CHEV] Adv - Conflit de Chevauchement : Partage heure de fin (chevauchement partiel) :**
        *   *Input :* Règle existante: Lun 9h-12h. Nouvelle règle: Lun 11h-12h.
        *   *Assertions :* `StaffAvailabilityConflictError` levée.
    19. **[CHEV] Adv - Conflit de Chevauchement avec une règle récurrente :** Une nouvelle règle unique/récurrente chevauche une occurrence future d'une règle existante récurrente.
        *   *Assertions :* `StaffAvailabilityConflictError` levée.
    20. **[CHEV] Adv - Conflit de Chevauchement : Peu importe `isWorking` (ex: existante `isWorking=true`, nouvelle `isWorking=false` mais même créneau horaire) :**
        *   *Assertions :* `StaffAvailabilityConflictError` levée.
    21. **[CHEV] Adv - Conflit de Chevauchement : Fenêtre de détection. Nouvelle règle très longue chevauchant une petite règle existante.**
        *   *Assertions :* Le service doit correctement calculer les occurrences sur la période de la nouvelle règle. `StaffAvailabilityConflictError` levée.
    22. **[CHEV] Adv - Échec de la récupération des disponibilités existantes lors de la vérification de chevauchement (simulé) :**
        *   *Assertions :* Une erreur appropriée est levée (ex: `AppError` ou `StaffAvailabilityCreationError` indiquant un échec de validation).
    
---

**Méthode : `getStaffAvailabilityById(staffAvailabilityId: number, establishmentId: number)`**

*   **Functional / "Happy Path" :**
    1.  **Func - Récupération Réussie d'une Règle Appartenant à l'Établissement :**
        *   *Assertions :* `staffAvailabilityModel.findByPk` appelé avec l'ID et l'`include` correct. `staffAvailability.membership.establishmentId` correspond. Retourne l'objet `StaffAvailabilityAttributes`.
    2.  **Func - Règle récupérée a `appliedShiftTemplateRuleId` non `null` :**
        *   *Assertions :* L'objet retourné contient la valeur correcte pour `appliedShiftTemplateRuleId`.
    3.  **Func - Règle récupérée a `createdByMembershipId` non `null` :**
        *   *Assertions :* L'objet retourné contient la valeur correcte pour `createdByMembershipId`.

*   **Edge Cases :**
    1.  **Edge - `staffAvailabilityId` correspond à une règle avec `description = null` et `effectiveEndDate = null` :**
        *   *Assertions :* Retourne l'objet avec ces valeurs `null`.

*   **Adversarial / Error Handling / "Sad Path" :**
    1.  **Adv - `staffAvailabilityId` Inexistant :**
        *   *Assertions :* `staffAvailabilityModel.findByPk` retourne `null`. La méthode du service retourne `null`.
    2.  **Adv - `staffAvailabilityId` Existe mais `staffAvailability.membership.establishmentId` ne correspond pas à `establishmentId` fourni :**
        *   *Assertions :* `staffAvailabilityModel.findByPk` retourne l'instance, mais la vérification `staffAvailability.membership?.establishmentId !== establishmentId` est vraie. Retourne `null`.
    3.  **Adv - `staffAvailabilityId` Existe mais `staffAvailability.membership` est `null` (données incohérentes, `required: true` dans l'include devrait empêcher cela et retourner `null` de `findByPk`) :**
        *   *Assertions :* `staffAvailabilityModel.findByPk` retourne `null`. La méthode retourne `null`.

---

**Méthode : `listStaffAvailabilitiesForMember(targetMembershipId: number, establishmentId: number, queryDto: ListStaffAvailabilitiesQueryDto)`**

*   **Functional / "Happy Path" :**
    1.  **Func - Liste Réussie pour un Membre Ayant Plusieurs Disponibilités :** `queryDto` vide ou avec valeurs par défaut.
        *   *Assertions :* `membershipModel.findOne` valide le membre. `staffAvailabilityModel.findAndCountAll` appelé avec `membershipId` et pagination/tri par défaut. `createPaginationResult` appelé avec les bonnes données. Retourne `PaginationDto<StaffAvailabilityAttributes>`.
    2.  **Func - Liste avec Filtre `isWorking = true` :**
        *   *Assertions :* `staffAvailabilityModel.findAndCountAll` appelé avec `where: { membershipId: targetMembershipId, isWorking: true }`.
    3.  **Func - Liste avec Filtre `isWorking = false` :**
        *   *Assertions :* `staffAvailabilityModel.findAndCountAll` appelé avec `where: { membershipId: targetMembershipId, isWorking: false }`.
    4.  **Func - Liste avec Pagination spécifique (ex: page 2, limit 3) :**
        *   *Assertions :* `offset` et `limit` corrects passés à `findAndCountAll`.
    5.  **Func - Liste avec Tri par `createdAt` en ordre `DESC` :**
        *   *Assertions :* `order: [['createdAt', 'DESC']]` passé à `findAndCountAll`.
    6.  **Func - `queryDto` contient `filterRangeStart` et `filterRangeEnd` valides (non implémenté dans le service actuel, mais si ajouté) :**
        *   *Assertions :* `whereConditions` inclurait les conditions de date appropriées.

*   **Edge Cases :**
    1.  **Edge - Liste pour un Membre sans Aucune Disponibilité :**
        *   *Assertions :* `staffAvailabilityModel.findAndCountAll` retourne `{ count: 0, rows: [] }`. `PaginationDto.data` est vide, `meta.totalItems` est 0.
    2.  **Edge - Liste avec `limit = 1` et plusieurs disponibilités existantes :**
        *   *Assertions :* `PaginationDto.data` a 1 élément, `meta` reflète la pagination correcte.
    3.  **Edge - `queryDto` avec tous les champs optionnels absents (valeurs par défaut utilisées) :**
        *   *Assertions :* Vérifie que les valeurs par défaut (`page: 1`, `limit: 10`, `sortBy: 'effectiveStartDate'`, `sortOrder: 'asc'`) sont utilisées dans l'appel à `findAndCountAll`.

*   **Adversarial / Error Handling / "Sad Path" :**
    1.  **Adv - `targetMembershipId` Inexistant :**
        *   *Assertions :* `membershipModel.findOne` retourne `null`. `MembershipNotFoundError` levée.
    2.  **Adv - `targetMembershipId` n'appartient pas à `establishmentId` :**
        *   *Assertions :* `membershipModel.findOne` retourne `null`. `MembershipNotFoundError` levée.
    3.  **Adv - `queryDto` avec `page` ou `limit` invalides (ex: 'abc', 0, négatif) (Zod gère en amont) :**
        *   *Assertions :* Le service utiliserait les valeurs par défaut si Zod a transformé/coercé, ou si le type est incorrect, une erreur JS pourrait survenir si TypeScript n'est pas strict.
    4.  **Adv - `queryDto.sortBy` avec une valeur non autorisée (Zod gère en amont) :**
        *   *Assertions :* Le service utiliserait la valeur par défaut.
    5.  **Adv - Échec de `staffAvailabilityModel.findAndCountAll` (simulé) :**
        *   *Assertions :* Erreur propagée ou wrappée dans `AppError`.

---

**Méthode : `updateStaffAvailability(staffAvailabilityId: number, dto: UpdateStaffAvailabilityDto, establishmentId: number, actorAdminMembershipId: number)`**

*   **Functional / "Happy Path" :**
    1.  **Func - Mise à Jour Réussie de `description` Seule :**
        *   *Assertions :* `staffAvailabilityModel.findByPk` récupère la règle. Validations passent. `staffAvailabilityModel.update` appelé avec `{ description: newDesc, createdByMembershipId: actorAdminMembershipId }` (et `appliedShiftTemplateRuleId: null` si applicable). Retourne l'entité mise à jour.
    2.  **Func - Mise à Jour de `rruleString`, `durationMinutes`, `isWorking`, `effectiveStartDate`, `effectiveEndDate` :**
        *   *Assertions :* Validations passent (incluant `validateRRuleString`). `staffAvailabilityModel.update` appelé avec les nouvelles valeurs.
    3.  **Func - Mise à Jour d'une règle initialement générée par un template (`appliedShiftTemplateRuleId` non nul) :**
        *   *Assertions :* `updateData` inclut `appliedShiftTemplateRuleId: null`. `description` est mise à jour (potentiellement avec préfixe "(Manually override)").
    4.  **Func - Mise à Jour pour enlever `effectiveEndDate` (passant `null` dans DTO) :**
        *   *Assertions :* `staffAvailabilityModel.update` appelé avec `effectiveEndDate: null`.
    5.  **Func - Mise à Jour de `effectiveEndDate` vers une date valide :**
        *   *Assertions :* `staffAvailabilityModel.update` appelé.
    6.  **Func - Mise à Jour où DTO ne contient que `isWorking` :**
        *   *Assertions :* Seul `isWorking` (et `createdByMembershipId`, et potentiellement `appliedShiftTemplateRuleId`) est mis à jour.

*   **Edge Cases :**
    1.  **Edge - DTO de mise à jour vide (`{}`) (Non conforme au `refine` du Zod DTO, mais test de la logique service) :**
        *   *Assertions :* Si `existingStaffAvailability.appliedShiftTemplateRuleId` est non nul, `appliedShiftTemplateRuleId` devient `null`. `createdByMembershipId` est mis à jour.
    2.  **Edge - DTO contient des champs avec `undefined` (conformes au DTO Zod après `transform`) :**
        *   *Assertions :* Seuls les champs définis dans le DTO (non `undefined`) sont mis à jour.
    3.  **Edge - Mise à Jour de `description` vers `null` alors qu'elle avait une valeur :**
        *   *Assertions :* `description` devient `null` dans la base.
    4.  **Edge - Mise à Jour de `description` vers chaîne vide (`""`) :**
        *   *Assertions :* `description` devient `""` dans la base.
    5.  **[CHEV] Edge - Mise à jour d'une règle pour qu'elle se termine EXACTEMENT quand une autre commence (Pas de Chevauchement) :**
        *   *Assertions :* **Aucun conflit détecté.** Mise à jour réussie.
    6.  **[CHEV] Edge - Mise à jour d'une règle pour qu'elle commence EXACTEMENT quand une autre se termine (Pas de Chevauchement) :**
        *   *Assertions :* **Aucun conflit détecté.** Mise à jour réussie.
    7.  **[CHEV] Edge - Réduction de la durée/période d'une règle, éliminant un chevauchement qui aurait existé avec l'ancienne version :**
        *   *Assertions :* Mise à jour réussie.


*   **Adversarial / Error Handling / "Sad Path" :**
    1.  **Adv - `staffAvailabilityId` Inexistant :**
        *   *Assertions :* `staffAvailabilityModel.findByPk` retourne `null`. `StaffAvailabilityNotFoundError` levée.
    2.  **Adv - `staffAvailabilityId` n'appartient pas à `establishmentId` :**
        *   *Assertions :* `staffAvailabilityModel.findByPk` (avec l'include) ne trouve rien. `StaffAvailabilityNotFoundError` levée.
    3.  **Adv - DTO avec `rruleString` syntaxiquement incorrecte :**
        *   *Assertions :* `validateRRuleString` lève `StaffAvailabilityCreationError`.
    4.  **Adv - DTO avec `durationMinutes = 0` ou négatif :**
        *   *Assertions :* `validateCommonFields` lève `StaffAvailabilityCreationError`.
    5.  **Adv - DTO avec `effectiveEndDate` antérieure à `effectiveStartDate` (en considérant les valeurs existantes si non fournies dans DTO) :**
        *   *Assertions :* `validateCommonFields` lève `StaffAvailabilityCreationError`.
    6.  **Adv - Échec de `staffAvailabilityModel.update` (simulé) :**
        *   *Assertions :* `StaffAvailabilityUpdateError` levée.
    7.  **Adv - Conflit de version (si `staffAvailabilityModel.update` retourne `updateCount = 0` et que la stratégie de re-fetch est utilisée) :**
        *   *Assertions :* `StaffAvailabilityNotFoundError` levée après le re-fetch.
    8.  **[CHEV] Adv - Conflit de Chevauchement : Mise à jour étend la période et chevauche une autre règle existante :**
        *   *Input :* Règle A: Lun 9h-10h. Règle B: Lun 11h-12h. On met à jour A pour être Lun 9h-11h30.
        *   *Assertions :* Le service détecte le chevauchement avec la règle B. `StaffAvailabilityConflictError` (ou `StaffAvailabilityUpdateError` avec message de conflit) levée. `staffAvailabilityModel.update` non appelé.
    9.  **[CHEV] Adv - Conflit de Chevauchement : Mise à jour déplace la période et chevauche une autre règle existante :**
        *   *Input :* Règle A: Lun 9h-10h. Règle B: Lun 11h-12h. On met à jour A pour être Lun 10h30-11h30.
        *   *Assertions :* `StaffAvailabilityConflictError` levée.
    10.  **[CHEV] Adv - Conflit de Chevauchement avec une règle récurrente (similaire à la création) :**
        *   *Assertions :* `StaffAvailabilityConflictError` levée.
    11. **[CHEV] Adv - La mise à jour ne change pas les aspects temporels, mais une autre règle a été créée entre-temps qui cause maintenant un conflit (cas concurrentiel peu probable en tests unitaires, mais bon à garder à l'esprit pour la logique de détection) :** Ce scénario est plus pour les tests d'intégration. Pour les tests unitaires, on mocke les "autres règles existantes".
    12. **[CHEV] Adv - Échec de la récupération des disponibilités existantes lors de la vérification de chevauchement pour la mise à jour (simulé) :**
        *   *Assertions :* Une erreur appropriée est levée (ex: `AppError` ou `StaffAvailabilityUpdateError`).

---

**Méthode : `deleteStaffAvailability(staffAvailabilityId: number, establishmentId: number)`**

*   **Functional / "Happy Path" :**
    1.  **Func - Suppression Réussie d'une Règle Existante et Appartenant à l'Établissement :**
        *   *Assertions :* `staffAvailabilityModel.findOne` (ou `findByPk` avec include) est appelé et trouve la règle. `staffAvailability.destroy()` est appelé sur l'instance.

*   **Edge Cases :**
    *   (Peu de cas limites pour une suppression directe par ID si la logique est simple).

*   **Adversarial / Error Handling / "Sad Path" :**
    1.  **Adv - `staffAvailabilityId` Inexistant :**
        *   *Assertions :* `staffAvailabilityModel.findOne` retourne `null`. `StaffAvailabilityNotFoundError` levée.
    2.  **Adv - `staffAvailabilityId` Existe mais n'appartient pas à `establishmentId` :**
        *   *Assertions :* `staffAvailabilityModel.findOne` (avec son `include` et `where`) ne trouve rien. `StaffAvailabilityNotFoundError` levée.
    3.  **Adv - Échec de `staffAvailability.destroy()` (simulé, ex: erreur DB, hook de suppression qui échoue) :**
        *   *Assertions :* Erreur propagée ou wrappée dans une `AppError` (ex: `StaffAvailabilityUpdateError` ou une erreur de suppression générique).

---