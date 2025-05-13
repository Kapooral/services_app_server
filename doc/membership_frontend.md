---

**Synthèse de la Documentation Backend pour l'Équipe Frontend : Module "Gestion des Membres"**

Ce document fournit une vue d'ensemble des points d'API, des structures de données et des flux utilisateurs clés pour le module backend "Gestion des Membres". Pour des détails exhaustifs, veuillez vous référer à la documentation technique complète du backend.

**1. Points d'API (Endpoints) du Module "Gestion des Membres"**

**1.1. Invitation et Acceptation**

*   **Endpoint :** `POST /api/users/me/establishments/:establishmentId/memberships/invite`
    *   **Description Brève :** Permet à un administrateur d'inviter un nouvel utilisateur à rejoindre son établissement en tant que membre 'STAFF'.
    *   **Authentification/Autorisation :** Authentification requise (Admin de l'établissement `:establishmentId`).
    *   **DTO d'Entrée (Request Body) :** `InviteMemberDto` (Section 6.1)
        *   `email` (string, requis) : Email de la personne à inviter.
        *   `role` (enum: `'STAFF'`, requis) : Rôle à assigner.
    *   **DTO de Sortie (Succès `201 Created`) :** `{ message: string, membership: MembershipDto }`
        *   `membership`: Objet `MembershipDto` (Section 6.5) avec `status: 'PENDING'`.
    *   **Codes Statut Courants :**
        *   `201 Created`
        *   `400 Bad Request` (ex: données invalides, `UserAlreadyMemberError` si l'email est déjà membre/invité)
        *   `401 Unauthorized`
        *   `403 Forbidden`
        *   `404 Not Found` (établissement non trouvé)
        *   `409 Conflict` (erreur `UserAlreadyMemberError`)

*   **Endpoint :** `GET /api/memberships/invitation-details/:token`
    *   **Description Brève :** Valide un token d'invitation et retourne l'email associé.
    *   **Authentification/Autorisation :** Aucune (Endpoint public).
    *   **Paramètres d'URL :**
        *   `token` (string, requis) : Token d'invitation brut.
    *   **DTO de Sortie (Succès `200 OK`) :** `InvitationDetailsDto` (Section 6.2)
        *   `invitedEmail` (string) : Email associé au token.
    *   **Codes Statut Courants :**
        *   `200 OK`
        *   `400 Bad Request` (token mal formé)
        *   `404 Not Found` (token invalide, expiré ou utilisé - `InvitationTokenInvalidError`)

*   **Endpoint :** `POST /api/auth/register-via-invitation`
    *   **Description Brève :** Permet à un nouvel utilisateur de s'inscrire et d'accepter une invitation simultanément.
    *   **Authentification/Autorisation :** Aucune (Endpoint public).
    *   **DTO d'Entrée (Request Body) :** `RegisterViaInvitationDto` (Section 6.3)
        *   `username` (string, requis)
        *   `password` (string, requis)
        *   `token` (string, requis) : Token d'invitation brut.
    *   **DTO de Sortie (Succès `201 Created`) :** `{ message: string, accessToken: string, membership: MembershipDto }`
        *   `accessToken`: JWT pour la session.
        *   `membership`: Objet `MembershipDto` (Section 6.5) avec `status: 'ACTIVE'`.
        *   Des cookies de session (`refreshToken`, CSRF) sont également positionnés.
    *   **Codes Statut Courants :**
        *   `201 Created`
        *   `400 Bad Request` (données invalides, token invalide/expiré - `InvitationTokenInvalidError`)
        *   `409 Conflict` (username/email déjà utilisé - ex: `DuplicateUsernameError`, `DuplicateEmailError`)

*   **Endpoint :** `POST /api/memberships/activate-after-login`
    *   **Description Brève :** Permet à un utilisateur déjà connecté de lier une invitation en attente à son compte.
    *   **Authentification/Autorisation :** Authentification requise.
    *   **DTO d'Entrée (Request Body) :** `ActivateMembershipDto` (Section 6.4)
        *   `token` (string, requis) : Token d'invitation brut.
    *   **DTO de Sortie (Succès `200 OK`) :** `{ message: string, membership: MembershipDto }`
        *   `membership`: Objet `MembershipDto` (Section 6.5) avec `status: 'ACTIVE'`.
    *   **Codes Statut Courants :**
        *   `200 OK`
        *   `400 Bad Request` (token invalide/expiré, email de l'utilisateur connecté ne correspond pas à l'email de l'invitation - `InvitationTokenInvalidError`)
        *   `401 Unauthorized`

**1.2. Gestion des Membres (par un Admin)**

*   **Endpoint :** `GET /api/users/me/establishments/:establishmentId/memberships`
    *   **Description Brève :** Liste tous les membres (et invitations PENDING) d'un établissement.
    *   **Authentification/Autorisation :** Authentification requise (Admin de l'établissement `:establishmentId`).
    *   **DTO de Sortie (Succès `200 OK`) :** `MembershipDto[]` (tableau d'objets `MembershipDto`, Section 6.5).
    *   **Codes Statut Courants :**
        *   `200 OK`
        *   `401 Unauthorized`
        *   `403 Forbidden`
        *   `404 Not Found` (établissement non trouvé)

*   **Endpoint :** `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId`
    *   **Description Brève :** Récupère les détails d'un membre spécifique.
    *   **Authentification/Autorisation :** Authentification requise (Admin de l'établissement OU le membre lui-même).
    *   **DTO de Sortie (Succès `200 OK`) :** `MembershipDto` (Section 6.5).
    *   **Codes Statut Courants :**
        *   `200 OK`
        *   `401 Unauthorized`
        *   `403 Forbidden`
        *   `404 Not Found` (membership ou établissement non trouvé - `MembershipNotFoundError`)

*   **Endpoint :** `PATCH /api/memberships/:membershipId`
    *   **Description Brève :** Modifie le statut ou le rôle d'un membre.
    *   **Authentification/Autorisation :** Authentification requise (Admin de l'établissement auquel le `:membershipId` appartient).
    *   **Paramètres d'URL :**
        *   `membershipId` (number, requis)
    *   **DTO d'Entrée (Request Body) :** `UpdateMembershipDto` (Section 6.6)
        *   `status?` (enum: `'ACTIVE'`, `'INACTIVE'`)
        *   `role?` (enum: `'ADMIN'`, `'STAFF'`) (Au moins un des deux requis)
    *   **DTO de Sortie (Succès `200 OK`) :** `MembershipDto` (Section 6.5, mis à jour).
    *   **Codes Statut Courants :**
        *   `200 OK`
        *   `400 Bad Request` (données invalides, tentative de modifier un membre `PENDING`, violation des protections "dernier admin" - ex: `CannotUpdateLastAdminError`)
        *   `401 Unauthorized`
        *   `403 Forbidden`
        *   `404 Not Found` (membership non trouvé - `MembershipNotFoundError`)

*   **Endpoint :** `DELETE /api/memberships/:membershipId`
    *   **Description Brève :** Supprime un membre (ou révoque une invitation PENDING).
    *   **Authentification/Autorisation :** Authentification requise (Admin de l'établissement auquel le `:membershipId` appartient).
    *   **Paramètres d'URL :**
        *   `membershipId` (number, requis)
    *   **DTO de Sortie (Succès `204 No Content`) :** Aucun.
    *   **Codes Statut Courants :**
        *   `204 No Content`
        *   `400 Bad Request` (violation de la protection "dernier admin" - ex: `CannotDeleteLastAdminError`)
        *   `401 Unauthorized`
        *   `403 Forbidden`
        *   `404 Not Found` (membership non trouvé - `MembershipNotFoundError`)

**1.3. Gestion des Disponibilités d'un Membre Staff**
*(Accessible par l'Admin de l'établissement ou le membre Staff lui-même pour ses propres disponibilités)*

*   **Endpoint :** `POST /api/memberships/:membershipId/availabilities`
    *   **Description Brève :** Crée une nouvelle règle de disponibilité pour un membre.
    *   **Authentification/Autorisation :** Authentification requise (Admin de l'établissement du `:membershipId` OU le membre lui-même).
    *   **DTO d'Entrée (Request Body) :** `CreateStaffAvailabilityDto` (Section 6.8)
        *   `rruleString` (string, requis)
        *   `durationMinutes` (number, requis, >0)
        *   `effectiveStartDate` (string `YYYY-MM-DD`, requis)
        *   `effectiveEndDate?` (string `YYYY-MM-DD` | null)
        *   `isWorking` (boolean, requis)
        *   `description?` (string | null)
    *   **DTO de Sortie (Succès `201 Created`) :** `StaffAvailabilityDto` (Section 6.7).
    *   **Codes Statut Courants :** `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

*   **Endpoint :** `GET /api/memberships/:membershipId/availabilities`
    *   **Description Brève :** Liste toutes les règles de disponibilité d'un membre.
    *   **Authentification/Autorisation :** Authentification requise (Admin de l'établissement du `:membershipId` OU le membre lui-même).
    *   **DTO de Sortie (Succès `200 OK`) :** `StaffAvailabilityDto[]` (Section 6.7).
    *   **Codes Statut Courants :** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

*   **Endpoint :** `PUT /api/memberships/:membershipId/availabilities/:availabilityId`
    *   **Description Brève :** Met à jour une règle de disponibilité existante.
    *   **Authentification/Autorisation :** Authentification requise (Admin de l'établissement du `:membershipId` OU le membre lui-même).
    *   **DTO d'Entrée (Request Body) :** `CreateStaffAvailabilityDto` (remplacement complet, Section 6.8).
    *   **DTO de Sortie (Succès `200 OK`) :** `StaffAvailabilityDto` (Section 6.7, mis à jour).
    *   **Codes Statut Courants :** `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

*   **Endpoint :** `DELETE /api/memberships/:membershipId/availabilities/:availabilityId`
    *   **Description Brève :** Supprime une règle de disponibilité.
    *   **Authentification/Autorisation :** Authentification requise (Admin de l'établissement du `:membershipId` OU le membre lui-même).
    *   **DTO de Sortie (Succès `204 No Content`) :** Aucun.
    *   **Codes Statut Courants :** `204 No Content`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

**2. Principaux Flux Utilisateurs et Interactions API**

*   **Flux : Inviter un nouveau membre (par un Admin)**
    1.  Frontend (Admin) : Saisit l'email et le rôle ('STAFF') du futur membre.
    2.  Frontend : Envoie `POST /api/users/me/establishments/:establishmentId/memberships/invite` avec `InviteMemberDto { email, role }`.
    3.  Backend : Valide, crée un `Membership` PENDING, génère un token, envoie un email d'invitation via `NotificationService`.
    4.  Frontend : Reçoit une réponse `201 Created` avec le `MembershipDto` PENDING. Affiche une confirmation.

*   **Flux : Accepter une invitation et s'inscrire (nouvel utilisateur)**
    1.  Utilisateur : Clique sur le lien d'invitation dans l'email (ex: `FRONTEND_URL/accept-invitation/:token`).
    2.  Frontend (page `accept-invitation`) : Extrait le `token` de l'URL.
    3.  Frontend : Appelle `GET /api/memberships/invitation-details/:token` pour valider le token et récupérer l'`invitedEmail`.
    4.  Frontend : Si token valide (200 OK), affiche un formulaire d'inscription (`username`, `password`) avec l'email pré-rempli (non modifiable). Le `token` est conservé.
    5.  Utilisateur : Remplit le formulaire et soumet.
    6.  Frontend : Envoie `POST /api/auth/register-via-invitation` avec `RegisterViaInvitationDto { username, password, token }`.
    7.  Backend (`AuthService`) : Valide le token, appelle `UserService.createUser` (en indiquant que c'est via invitation pour activation directe), puis appelle `MembershipService.activateByToken`. Génère des tokens JWT. Notifie les admins.
    8.  Frontend : Reçoit `201 Created` avec `accessToken` et `MembershipDto` activé. Stocke l'`accessToken`, positionne les cookies de session, connecte l'utilisateur et le redirige.

*   **Flux : Accepter une invitation en étant déjà connecté ou en se connectant (utilisateur existant)**
    1.  Utilisateur : Clique sur le lien d'invitation.
    2.  Frontend (page `accept-invitation`) : Valide le token via `GET /api/memberships/invitation-details/:token`.
    3.  Frontend : Affiche l'option de se connecter. Stocke le `token` d'invitation (ex: Local Storage).
    4.  Utilisateur : Se connecte via le flux de connexion standard.
    5.  Frontend (après connexion réussie) : Détecte le `token` stocké.
    6.  Frontend : Envoie `POST /api/memberships/activate-after-login` avec `ActivateMembershipDto { token }` (requête authentifiée).
    7.  Backend (`MembershipService`) : Valide le token, vérifie que l'email de l'utilisateur connecté correspond à l'`invitedEmail`, active le `Membership`. Notifie les admins.
    8.  Frontend : Reçoit `200 OK` avec le `MembershipDto` activé. Affiche une confirmation. Nettoie le token stocké.

*   **Flux : Lister les membres d'un établissement (par un Admin)**
    1.  Frontend (Admin) : Navigue vers la page de gestion des membres.
    2.  Frontend : Envoie `GET /api/users/me/establishments/:establishmentId/memberships`.
    3.  Backend : Valide l'autorisation de l'admin, récupère et retourne la liste des `MembershipDto`.
    4.  Frontend : Affiche la liste des membres.

*   **Flux : Modifier le statut/rôle d'un membre (par un Admin)**
    1.  Frontend (Admin) : Sélectionne un membre et les nouveaux statut/rôle.
    2.  Frontend : Envoie `PATCH /api/memberships/:membershipId` avec `UpdateMembershipDto { status?, role? }`.
    3.  Backend : Valide l'autorisation, les protections (dernier admin), met à jour le `Membership`.
    4.  Frontend : Reçoit `200 OK` avec le `MembershipDto` mis à jour. Rafraîchit l'affichage.

*   **Flux : Supprimer un membre / Révoquer une invitation (par un Admin)**
    1.  Frontend (Admin) : Sélectionne un membre à supprimer/révoquer.
    2.  Frontend : Envoie `DELETE /api/memberships/:membershipId`.
    3.  Backend : Valide l'autorisation, les protections (dernier admin), supprime le `Membership`.
    4.  Frontend : Reçoit `204 No Content`. Met à jour l'affichage.

**3. Structures de Données Clés (Référence)**

Le frontend interagira principalement avec les structures de données suivantes (DTOs) :

*   **`MembershipDto` (Section 6.5) :** Objet principal représentant un membre ou une invitation. Contient `id`, `establishmentId`, `role`, `status`, `joinedAt`, `createdAt`, `updatedAt`, et un objet `user` imbriqué (avec `id`, `username`, `email`, `profile_picture`) ou `invitedEmail` si PENDING.
*   **`StaffAvailabilityDto` (Section 6.7) :** Objet représentant une règle de disponibilité pour un membre Staff. Contient `id`, `membershipId`, `rruleString`, `durationMinutes`, `effectiveStartDate`, `effectiveEndDate`, `isWorking`, `description`.
*   **DTOs d'entrée spécifiques aux requêtes** (voir Section 1 de cette synthèse et Section 6 de la documentation complète) : `InviteMemberDto`, `RegisterViaInvitationDto`, `ActivateMembershipDto`, `UpdateMembershipDto`, `CreateStaffAvailabilityDto`.

Pour une description exhaustive de tous les champs et types de ces DTOs, ainsi que des modèles de données sous-jacents (ex: `UserAttributes`, `EstablishmentAttributes`), veuillez consulter les **Sections 3 et 6 de la documentation backend complète.**

---