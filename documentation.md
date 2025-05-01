---

**Documentation Complète du Backend - Application Calendrier Événementiel (APP_NAME)**

**Version:** 1.3 (Date: 2024-08-16) - *Documentation Finale Post-Tests & Ajustements*

**Table des Matières**

1.  Introduction
2.  Architecture & Technologies
3.  Concepts Fondamentaux
    *   Authentification JWT (Access, Refresh, Pre-2FA)
    *   Hachage (Mots de passe, Tokens)
    *   Protection CSRF (Double Submit Cookie)
    *   Activation de Compte
    *   Réinitialisation de Mot de Passe
    *   Authentification à Deux Facteurs (2FA - Obligatoire Post-Login)
    *   Chiffrement des Données Sensibles (Secrets TOTP)
    *   Gestion des Fichiers Uploadés (Stockage Local)
    *   Rôles et Permissions (Basés sur les Rôles et la Propriété)
    *   **Logique des Statuts de Réservation (Mise à jour)**
4.  Composants Principaux
    *   Point d'Entrée (`server.ts`)
    *   Modèles (`src/models/`)
    *   Services (`src/services/`)
    *   Contrôleurs (`src/controllers/`)
    *   Routes (`src/routes/`)
    *   Middlewares (`src/middlewares/`)
    *   DTOs & Validation (`src/dtos/`)
    *   Erreurs Personnalisées (`src/errors/`)
    *   Utilitaires (`src/utils/`)
    *   Configuration (`src/config/`)
5.  Détail des Fonctionnalités et Endpoints API (`/api/...`)
    *   Authentification (`/api/auth`)
    *   Utilisateurs (`/api/users`)
    *   Établissements (`/api/establishments` et `/api/users/me/establishments`)
    *   Services (`/api/services` et routes imbriquées) **(Mise à jour)**
    *   Disponibilité (`/api/availability` et routes imbriquées) **(Mise à jour)**
    *   Réservations (`/api/bookings` et routes imbriquées) **(Mise à jour)**
6.  Configuration Essentielle (`.env`)
7.  Exécution du Projet
8.  Gestion des Erreurs **(Mise à jour)**
9.  Considérations Futures / TODOs **(Mise à jour)**

---

**1. Introduction**

Ce document détaille l'architecture, les composants, les concepts et les fonctionnalités du backend de l'application "Calendrier Événementiel" (ci-après dénommée APP_NAME). L'objectif principal de ce backend est de fournir une API RESTful sécurisée, robuste et scalable pour la gestion des comptes utilisateurs, l'authentification multi-facteurs, la gestion des établissements, des services proposés, des disponibilités et des réservations. **Cette version intègre une logique affinée pour la gestion des réservations (statut initial configurable, délai d'annulation par service, verrouillage des statuts finaux) et des validations plus robustes pour les exceptions de disponibilité.**

**2. Architecture & Technologies**

L'application est construite sur Node.js avec Express.js (v5) et TypeScript. Elle suit une architecture en couches :

*   **Route (`src/routes/`) :** Définit les endpoints HTTP et middlewares spécifiques via `express.Router`. Structure modulaire par ressource, avec routeurs imbriqués pour `/api/users/me/establishments/...`.
*   **Contrôleur (`src/controllers/`) :** Gère la logique requête/réponse, valide les DTOs (Zod), orchestre les services, formate les réponses (DTO mappers).
*   **Service (`src/services/`) :** Logique métier principale, découplée d'Express. Interagit avec modèles (Sequelize) et autres services.
*   **Modèle/Données (`src/models/`) :** Modèles Sequelize (v6) pour MySQL (`mysql2`). Définition tables, attributs, contraintes, associations. Gestion connexion et migrations/seeders.
*   **Middlewares (`src/middlewares/`) :** Fonctions transversales : Auth, Autorisation (rôle, ownership), CSRF, Erreurs, Rate Limiting, Cookies, CORS, Helmet, Parsing, Uploads (`multer`).
*   **DTOs & Validation (`src/dtos/`) :** Schémas Zod (`*Schema`) et types (`*Dto`) pour validation et transfert. Mappers (`mapTo*Dto`) pour sorties structurées.
*   **Erreurs Personnalisées (`src/errors/`) :** Classes d'erreurs spécifiques (`AppError`, etc.).
*   **Utilitaires (`src/utils/`) :** Fonctions d'aide.
*   **Configuration (`src/config/`) :** Chargement `.env`, configurations spécifiques.

**Technologies Principales :**
Node.js, Express.js (v5), TypeScript, Sequelize (v6), MySQL (`mysql2`), Zod, JWT (`jsonwebtoken`), Bcrypt, otplib, qrcode, cookie-parser, cors, helmet, express-rate-limit, nodemailer, multer, crypto, axios, Jest, Supertest, `@faker-js/faker` (pour seeders).

**3. Concepts Fondamentaux**

*   **Authentification JWT :**
    *   **Access Token:** Courte durée (15 min), `userId`, `username`, `type='access'`. Header `Authorization: Bearer ...`.
    *   **Refresh Token:** Longue durée (7 jours), `userId`, `type='refresh'`, `jti`. Cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Rotation implémentée (token utilisé -> révoqué via hash SHA256 en BDD -> nouveau couple émis).
    *   **Pre-2FA Token:** Très courte durée (10 min), `userId`, `type='pre-2fa'`. Émis après `/login/initiate`. Requis header `X-Pre-2FA-Token` pour étapes 2FA.

*   **Hachage :**
    *   **Mots de passe :** `bcrypt` (sel intégré). Colonne `salt` BDD supprimée.
    *   **Refresh Tokens :** SHA256 (`token_hash`).
    *   **Reset/Activation Tokens :** SHA256.
    *   **Codes OTP (Email/SMS) :** bcrypt (`two_factor_code_hash`).
    *   **Codes de Récupération 2FA :** bcrypt (`recovery_codes_hashes`).

*   **Protection CSRF (Double Submit Cookie) :**
    *   Login/Refresh -> Cookies `csrfSecret` (signé, HttpOnly) + `XSRF-TOKEN` (lisible JS) avec même secret.
    *   Requête modifiante -> Header `X-CSRF-Token` (valeur de `XSRF-TOKEN`).
    *   `verifyCsrfToken` compare header et cookie signé.
    *   Logout efface cookies.

*   **Activation de Compte :** `POST /users` -> User inactif + token (hashé BDD) -> Email (token clair) -> `POST /activate-account` -> Validation & Activation.

*   **Réinitialisation de Mot de Passe :** `POST /request...` -> Token (hashé BDD) + `is_recovering=true` -> Email (token clair) -> `POST /validate...` (optionnel) -> `POST /perform...` -> Validation & Update & `is_recovering=false` & Révocation tokens.

*   **Authentification à Deux Facteurs (2FA - Obligatoire Post-Login) :**
    *   Flux : `/login/initiate` (check mdp) -> 200 avec `challenge` & `pre2faToken` -> `/login/send-code` -> `/login/verify-code`.
    *   Méthodes : Email (OTP bcrypt), SMS (OTP simulé), TOTP (`otplib`, secret chiffré AES), Codes Récupération (bcrypt, consommés).

*   **Chiffrement des Données Sensibles (Secrets TOTP) :** `EncryptionService` (AES-256-GCM + `ENCRYPTION_KEY`) chiffre/déchiffre `two_factor_secret`.

*   **Gestion des Fichiers Uploadés (Stockage Local) :** `multer` + `FileService`. Stockage dans `public/uploads/...`. URL relative en BDD. `express.static`.

*   **Rôles et Permissions :** Rôles (`CLIENT`, `ESTABLISHMENT_ADMIN`, `SUPER_ADMIN`). Middlewares `requireAuth`, `requireRole`, `ensureSelf`. Ownership vérifié par `ensureOwnsEstablishment` (renvoie 404), `requireServiceOwner`/`requireRuleOwner`/`requireOverrideOwner` (renvoient 403), `ensureBookingOwnerOrAdmin`.

*   **Logique des Statuts de Réservation (Mise à jour) :**
    *   **Statut Initial :** Lors de la création (`POST /api/bookings`), le statut initial de la réservation est déterminé par le champ `auto_confirm_bookings` (boolean, défaut `true`) du `Service` associé :
        *   `true` -> Statut initial `CONFIRMED`.
        *   `false` -> Statut initial `PENDING_CONFIRMATION`.
    *   **Annulation Client (`PATCH /api/bookings/:id/cancel`) :**
        *   Possible uniquement si le statut actuel est `CONFIRMED` ou `PENDING_CONFIRMATION`.
        *   Vérifie le délai défini dans `Service.cancellation_deadline_minutes` (entier, nullable, en minutes). Si `null` ou si le délai n'est pas dépassé, l'annulation est permise. Si le délai est dépassé, une erreur `403 Forbidden` (`CancellationNotAllowedError`) est retournée.
        *   Passe le statut à `CANCELLED_BY_USER`.
    *   **Mise à Jour par Admin Établissement (`PATCH /api/bookings/:id`) :**
        *   Permet de mettre à jour le `status` et/ou `establishmentNotes`. Le champ `status` est optionnel dans le payload pour permettre la mise à jour des notes seules.
        *   **Transitions Autorisées (par Admin Étab.) :**
            *   `PENDING_CONFIRMATION` -> `CONFIRMED` ou `CANCELLED_BY_ESTABLISHMENT`.
            *   `CONFIRMED` -> `COMPLETED`, `NO_SHOW`, ou `CANCELLED_BY_ESTABLISHMENT`.
            *   `NO_SHOW` -> `COMPLETED` (correction possible).
        *   Toute autre tentative de transition de statut par l'admin renvoie une erreur `400 Bad Request` (`InvalidStatusTransitionError`).
    *   **Verrouillage des Statuts Finaux :** Les statuts suivants sont considérés comme finaux et ne peuvent plus être modifiés (ni par client, ni par admin via changement de statut) une fois atteints :
        *   `CANCELLED_BY_USER`
        *   `CANCELLED_BY_ESTABLISHMENT`
        *   `CANCELLED_BY_ADMIN`
        *   `COMPLETED`
        *   `NO_SHOW` (sauf pour la transition spécifique vers `COMPLETED` par l'admin).
        *   Toute tentative de modification du *statut* d'une réservation dans un état final (sauf `NO_SHOW` -> `COMPLETED`) renvoie une erreur `400 Bad Request` (`InvalidBookingOperationError`).
    *   **Mise à Jour des Notes Admin :** L'admin peut mettre à jour `establishmentNotes` via `PATCH /api/bookings/:id` quel que soit le statut actuel de la réservation (y compris les statuts finaux), en envoyant uniquement le champ `establishmentNotes`.

**4. Composants Principaux**

*   **`server.ts`:** Point d'entrée, init, injection dépendances, middlewares globaux, montage routeurs, démarrage.
*   **`src/models/index.ts`:** Init Sequelize, import modèles, associations.
*   **`src/models/*.ts`:** Modèles Sequelize (`User`, `Establishment`, `Service`, `AvailabilityRule`, `AvailabilityOverride`, `Booking`, `Role`, `RefreshToken`, `Country`).
*   **`src/services/*.service.ts`:** Logique métier (Auth, User, Establishment, Service, Availability, Booking, Notification, Encryption, File).
*   **`src/controllers/*.controller.ts`:** Gestion requête/réponse, validation DTO, appels services.
*   **`src/routes/*.routes.ts`:** Définition endpoints, middlewares spécifiques, structure imbriquée.
*   **`src/middlewares/*.middleware.ts`:** Implémentation middlewares (Auth, CSRF, Error, RateLimiter, Ownership).
*   **`src/dtos/*.validation.ts`:** Schémas Zod (`*Schema`), types (`*Dto`), mappers (`mapTo*Dto`).
*   **`src/errors/*.errors.ts`:** Classes d'erreurs (`AppError`, `UserNotFoundError`, etc.).
*   **`src/utils/*.utils.ts`:** Fonctions utilitaires.
*   **`src/config/*`:** Configuration.

**5. Détail des Fonctionnalités et Endpoints API (`/api/...`)**

*(Légende : Auth = Authentification (Bearer Token), CSRF = Protection CSRF active, Admin = Rôle `ESTABLISHMENT_ADMIN` requis, Ownership = Middleware de vérification de propriété spécifique)*

*   **Authentification (`/api/auth`)**
    *   `POST /login/initiate`: (Public) Body: `{ usernameOrEmail, password }`. Réponse 200: `{ type: '2fa_challenge', ... }` ou 401 (inactif)/400 (mdp invalide, no method).
    *   `POST /login/send-code`: (Semi-Protégé Header `X-Pre-2FA-Token`) Body: `{ method }`. Réponse 200 ou 401/400.
    *   `POST /login/verify-code`: (Semi-Protégé Header `X-Pre-2FA-Token`) Body: `{ code }`. Réponse 200: `{ accessToken }` + Cookies ou 401/400.
    *   `POST /refresh`: (Protégé Cookie `refreshToken`) Réponse 200: `{ accessToken }` + Cookies ou 401.
    *   `POST /logout`: (Protégé Cookie `refreshToken`) Réponse 200. Efface cookies.
    *   `GET /mfa/totp/setup`: (Auth) Réponse 200: `{ secret, qrCodeUri }`.
    *   `POST /mfa/totp/enable`: (Auth + CSRF) Body: `{ password, secret, token }`. Réponse 200: `{ message, recoveryCodes: [...] }` ou 401/400.
    *   `DELETE /mfa/totp/disable`: (Auth + CSRF) Body: `{ password }`. Réponse 200 ou 401.

*   **Utilisateurs (`/api/users`)**
    *   `POST /`: (Public) Body: `CreateUserDto`. Réponse 201: `MeOutputDto`. Erreurs 409, 400.
    *   `POST /activate-account`: (Public) Body: `{ token }`. Réponse 200: `{ message, user: UserOutputDto }`. Erreur 400.
    *   `POST /request-password-reset`: (Public) Body: `{ email }`. Réponse 202.
    *   `POST /validate-reset-token`: (Public) Body: `{ token }`. Réponse 200. Erreur 400.
    *   `POST /perform-password-reset`: (Public) Body: `{ token, newPassword }`. Réponse 200. Erreur 400.
    *   `GET /me`: (Auth) Réponse 200: `MeOutputDto`.
    *   `GET /:id`: (Auth + `ensureSelf`) Réponse 200: `UserOutputDto`. Erreurs 403, 404.
    *   `PATCH /:id/profile`: (Auth + `ensureSelf` + CSRF) Body: `UpdateUserDto`. Réponse 200: `UserOutputDto`. Erreurs 409, 400.
    *   `PATCH /:id/password`: (Auth + `ensureSelf` + CSRF) Body: `{ currentPassword, newPassword }`. Réponse 200: `{ message }`. Erreurs 401, 400. *(Bug connu)*.
    *   `PATCH /:id/email`: (Auth + `ensureSelf` + CSRF) Body: `{ newEmail, currentPassword }`. Réponse 200: `{ message, user: MeOutputDto }`. Erreurs 401, 409, 400. *(Bug connu)*.
    *   `PATCH /:id/profile-picture`: (Auth + `ensureSelf` + CSRF + `multer`) Form-data: `profilePicture`. Réponse 200: `{ message, user: MeOutputDto }`. Erreur 400.
    *   `DELETE /:id/profile-picture`: (Auth + `ensureSelf` + CSRF) Réponse 200: `{ message, user: MeOutputDto }`. Erreur 404.
    *   `DELETE /:id`: (Auth + `ensureSelf` + CSRF) Body: `{ password }`. Réponse 204. Erreur 401.
    *   `POST /:id/request-email-verification`: (Auth + `ensureSelf` + CSRF) Réponse 202.

*   **Établissements (`/api/establishments` et `/api/users/me/establishments`)**
    *   `POST /api/establishments`: (Auth + CSRF) Body: `CreateEstablishmentDto`. Réponse 201: `AdminEstablishmentDto`. Erreurs 409, 400, 403.
    *   `GET /api/establishments`: (Public) Query: `?page`, `?limit`. Réponse 200: `{ data: [PublicEstablishmentOutputDto], pagination: {...} }`.
    *   `GET /api/establishments/:id`: (Public) Réponse 200: `PublicEstablishmentOutputDto`. Erreur 404.
    *   `GET /api/users/me/establishments`: (Auth + Admin) Réponse 200: `[AdminEstablishmentDto]`.
    *   `GET /api/users/me/establishments/:establishmentId`: (Auth + Admin + Ownership) Réponse 200: `AdminEstablishmentDto`. Erreur 404.
    *   `PUT /api/users/me/establishments/:establishmentId`: (Auth + Admin + Ownership + CSRF) Body: `UpdateEstablishmentDto`. Réponse 200: `AdminEstablishmentDto`. Erreurs 404, 400.
    *   `POST /api/users/me/establishments/:establishmentId/request-validation`: (Auth + Admin + Ownership + CSRF) Réponse 200: `{ message, establishment: AdminEstablishmentDto }`. Erreur 404.
    *   `PATCH /api/users/me/establishments/:establishmentId/profile-picture`: (Auth + Admin + Ownership + CSRF + `multer`) Form-data: `profilePicture`. Réponse 200: `{ message, establishment: AdminEstablishmentDto }`. Erreurs 404, 400.
    *   `DELETE /api/users/me/establishments/:establishmentId/profile-picture`: (Auth + Admin + Ownership + CSRF) Réponse 200: `{ message, establishment: AdminEstablishmentDto }`. Erreur 404.

*   **Services (`/api/services` et routes imbriquées) (Mise à jour)**
    *   `POST /api/users/me/establishments/:establishmentId/services`: (Auth + Admin + Ownership + CSRF) Body: `CreateServiceDto` **(inclut `cancellationDeadlineMinutes?: number | null`, `autoConfirmBookings?: boolean (défaut true)`)**. Réponse 201: `AdminServiceDto`. Erreurs 404, 400.
    *   `GET /api/users/me/establishments/:establishmentId/services`: (Auth + Admin + Ownership) Query: `?page`, `?limit`. Réponse 200: `{ data: [AdminServiceDto], pagination: {...} }`. Erreur 404.
    *   `GET /api/users/me/establishments/:establishmentId/services/:serviceId`: (Auth + Admin + Ownership) Réponse 200: `AdminServiceDto`. Erreur 404.
    *   `PUT /api/services/:serviceId`: (Auth + `requireServiceOwner` + CSRF) Body: `UpdateServiceDto` **(peut inclure `cancellationDeadlineMinutes?: number | null`, `autoConfirmBookings?: boolean`)**. Réponse 200: `AdminServiceDto`. Erreurs 403, 404, 400.
    *   `DELETE /api/services/:serviceId`: (Auth + `requireServiceOwner` + CSRF) Réponse 204. Erreurs 403, 404, 409.
    *   `GET /api/establishments/:id/services`: (Public) Réponse 200: `[PublicServiceOutputDto]`. Erreur 404.
    *   `GET /api/services/:serviceId/availability`: (Public) Query: `?date=YYYY-MM-DD`. Réponse 200: `{ availableSlots: [ISOString] }`. Erreurs 404, 400. **Logique de calcul affinée.**

*   **Disponibilité (`/api/availability` et routes imbriquées) (Mise à jour)**
    *   `POST /api/users/me/establishments/:establishmentId/availability/rules`: (Auth + Admin + Ownership + CSRF) Body: `CreateAvailabilityRuleDto`. Réponse 201: `AvailabilityRule`. Erreurs 404, 400, 409.
    *   `GET /api/users/me/establishments/:establishmentId/availability/rules`: (Auth + Admin + Ownership) Réponse 200: `[AvailabilityRule]`. Erreur 404.
    *   `PUT /api/availability/rules/:ruleId`: (Auth + `requireRuleOwner` + CSRF) Body: `UpdateAvailabilityRuleDto`. Réponse 200: `AvailabilityRule`. Erreurs 403, 404, 400, 409.
    *   `DELETE /api/availability/rules/:ruleId`: (Auth + `requireRuleOwner` + CSRF) Réponse 204. Erreurs 403, 404.
    *   `POST /api/users/me/establishments/:establishmentId/availability/overrides`: (Auth + Admin + Ownership + CSRF) Body: `CreateAvailabilityOverrideDto`. **Validation DTO renforcée (date passée, durée max, start < end)**. Réponse 201: `AvailabilityOverride`. Erreurs 404, 400.
    *   `GET /api/users/me/establishments/:establishmentId/availability/overrides`: (Auth + Admin + Ownership) Réponse 200: `[AvailabilityOverride]`. Erreur 404.
    *   `PUT /api/availability/overrides/:overrideId`: (Auth + `requireOverrideOwner` + CSRF) Body: `UpdateAvailabilityOverrideDto`. **Validation métier (date passée, durée max, start < end) effectuée dans le service**. Réponse 200: `AvailabilityOverride`. Erreurs 403, 404, 400.
    *   `DELETE /api/availability/overrides/:overrideId`: (Auth + `requireOverrideOwner` + CSRF) Réponse 204. Erreurs 403, 404.

*   **Réservations (`/api/bookings` et routes imbriquées) (Mise à jour)**
    *   `POST /api/bookings`: (Auth + CSRF) Body: `CreateBookingDto`. **Statut initial (`CONFIRMED` ou `PENDING_CONFIRMATION`) dépend de `Service.autoConfirmBookings`**. Réponse 201: `AdminBookingOutputDto`. Erreurs 404, 409 (conflit de slot), 400.
    *   `GET /api/users/me/bookings`: (Auth) Query: `?page`, `?limit`. Réponse 200: `{ data: [Booking], pagination: {...} }`.
    *   `GET /api/users/me/establishments/:establishmentId/bookings`: (Auth + Admin + Ownership) Query: `?page`, `?limit`. Réponse 200: `{ data: [AdminBookingOutputDto], pagination: {...} }`. Erreur 404.
    *   `GET /api/bookings/:bookingId`: (Auth + `ensureBookingOwnerOrAdmin`) Réponse 200: `AdminBookingOutputDto`. Erreur 404.
    *   `PATCH /api/bookings/:bookingId/cancel`: (Auth + CSRF) Annulation par client. **Vérifie `Service.cancellationDeadlineMinutes` et si statut actuel n'est pas final.** Réponse 200: `AdminBookingOutputDto`. Erreurs : `400 Bad Request` (statut final), `403 Forbidden` (délai dépassé ou non propriétaire), `404 Not Found`.
    *   `PATCH /api/bookings/:bookingId`: (Auth + Admin + CSRF) Body: `UpdateBookingStatusDto` **(`status` optionnel)**. Mise à jour statut et/ou notes admin. **Valide transitions de statut autorisées et non-modification des statuts finaux (sauf NO_SHOW -> COMPLETED). Permet mise à jour `establishmentNotes` seule.** Réponse 200: `AdminBookingOutputDto`. Erreurs: `400 Bad Request` (statut final, transition invalide, payload vide), `403 Forbidden` (permission), `404 Not Found`.

**6. Configuration Essentielle (`.env`)**

(Liste détaillée fournie précédemment.)

**7. Exécution du Projet**

(Instructions `npm install`, `migrate`, `seed`, `dev`, `build`, `start`, `test` fournies précédemment.)

**8. Gestion des Erreurs**

*   (Description du `errorMiddleware`, `AppError`, `ZodError` et format de réponse JSON fournie précédemment.)
*   **Nouvelles Erreurs/Comportements Spécifiques :**
    *   `BookingService` lève `CancellationNotAllowedError` (-> 403) si délai dépassé.
    *   `BookingService` lève `InvalidBookingOperationError` (-> 400) si opération sur statut final.
    *   `BookingService` lève `InvalidStatusTransitionError` (-> 400) si transition admin invalide.
    *   `BookingService` lève `BookingConflictError` (-> 409) si la vérification de disponibilité échoue lors de la création.
    *   `EstablishmentService` lève `AppError('InvalidInput', 400, ...)` pour les validations métier (date passée, start<end) sur la mise à jour des overrides.
    *   `CreateAvailabilityOverrideSchema` (Zod) valide la date de début non passée.
    

**9. Considérations Futures / TODOs**

*   **Bug Connu :** Échec validation mot de passe actuel sur `PATCH /users/:id/password` et `PATCH /users/:id/email`. Nécessite investigation.
*   **Tests :** Ajouter des tests unitaires/intégration pour la logique de validation métier dans `EstablishmentService.updateAvailabilityOverrideById`.
*   **Implémentation SMS Réelle.**
*   **Validation SIRET Réelle.** (via `SireneService`?)
*   **Stockage Fichiers Cloud.**
*   **Intégration Paiements.**
*   **Gestion Fine Permissions** (ex: Rôle `SUPER_ADMIN` pour certaines actions?).
*   **Logging Avancé.**
*   **Tâches Asynchrones** (ex: pour notifications).
*   **Documentation API Auto-générée** (Swagger/OpenAPI).
*   **Sécurité Avancée** (Revue OWASP complète, etc.).
*   **(Optionnel) Configuration Établissement/Service :** Permettre de choisir le statut initial des réservations (`CONFIRMED` vs `PENDING_CONFIRMATION`).
*   **Amélioration Middleware Erreur :** Formater plus spécifiquement les messages d'erreur Zod (notamment pour `.refine()` sur objets).

---