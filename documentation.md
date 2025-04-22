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
    *   Services (`/api/services` et routes imbriquées)
    *   Disponibilité (`/api/availability` et routes imbriquées)
    *   Réservations (`/api/bookings` et routes imbriquées)
6.  Configuration Essentielle (`.env`)
7.  Exécution du Projet
8.  Gestion des Erreurs
9.  Considérations Futures / TODOs

---

**1. Introduction**

Ce document détaille l'architecture, les composants, les concepts et les fonctionnalités du backend de l'application "Calendrier Événementiel" (ci-après dénommée APP_NAME). L'objectif principal de ce backend est de fournir une API RESTful sécurisée, robuste et scalable pour la gestion des comptes utilisateurs, l'authentification multi-facteurs, la gestion des établissements, des services proposés, des disponibilités et des réservations. Cette documentation reflète l'état actuel après une refonte des routes, l'implémentation de nouvelles fonctionnalités et validations, et une phase de correction basée sur des tests d'intégration.

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

*   **Services (`/api/services` et routes imbriquées)**
    *   `POST /api/users/me/establishments/:establishmentId/services`: (Auth + Admin + Ownership + CSRF) Body: `CreateServiceDto`. Réponse 201: `AdminServiceDto`. Erreurs 404, 400.
    *   `GET /api/users/me/establishments/:establishmentId/services`: (Auth + Admin + Ownership) Query: `?page`, `?limit`. Réponse 200: `{ data: [AdminServiceDto], pagination: {...} }`. Erreur 404.
    *   `GET /api/users/me/establishments/:establishmentId/services/:serviceId`: (Auth + Admin + Ownership) Réponse 200: `AdminServiceDto`. Erreur 404.
    *   `PUT /api/services/:serviceId`: (Auth + `requireServiceOwner` + CSRF) Body: `UpdateServiceDto`. Réponse 200: `AdminServiceDto`. Erreurs 403, 404, 400.
    *   `DELETE /api/services/:serviceId`: (Auth + `requireServiceOwner` + CSRF) Réponse 204. Erreurs 403, 404, 409.
    *   `GET /api/establishments/:id/services`: (Public) Réponse 200: `[PublicServiceOutputDto]`. Erreur 404.
    *   `GET /api/services/:serviceId/availability`: (Public) Query: `?date=YYYY-MM-DD`. Réponse 200: `{ availableSlots: [ISOString] }`. Erreurs 404, 400.

*   **Disponibilité (`/api/availability` et routes imbriquées)**
    *   `POST /api/users/me/establishments/:establishmentId/availability/rules`: (Auth + Admin + Ownership + CSRF) Body: `CreateAvailabilityRuleDto`. Réponse 201: `AvailabilityRule`. Erreurs 404, 400, 409.
    *   `GET /api/users/me/establishments/:establishmentId/availability/rules`: (Auth + Admin + Ownership) Réponse 200: `[AvailabilityRule]`. Erreur 404.
    *   `PUT /api/availability/rules/:ruleId`: (Auth + `requireRuleOwner` + CSRF) Body: `UpdateAvailabilityRuleDto`. Réponse 200: `AvailabilityRule`. Erreurs 403, 404, 400, 409.
    *   `DELETE /api/availability/rules/:ruleId`: (Auth + `requireRuleOwner` + CSRF) Réponse 204. Erreurs 403, 404.
    *   `POST /api/users/me/establishments/:establishmentId/availability/overrides`: (Auth + Admin + Ownership + CSRF) Body: `CreateAvailabilityOverrideDto`. Réponse 201: `AvailabilityOverride`. Erreurs 404, 400.
    *   `GET /api/users/me/establishments/:establishmentId/availability/overrides`: (Auth + Admin + Ownership) Réponse 200: `[AvailabilityOverride]`. Erreur 404.
    *   `PUT /api/availability/overrides/:overrideId`: (Auth + `requireOverrideOwner` + CSRF) Body: `UpdateAvailabilityOverrideDto`. Réponse 200: `AvailabilityOverride`. Erreurs 403, 404, 400.
    *   `DELETE /api/availability/overrides/:overrideId`: (Auth + `requireOverrideOwner` + CSRF) Réponse 204. Erreurs 403, 404.

*   **Réservations (`/api/bookings` et routes imbriquées)**
    *   `POST /api/bookings`: (Auth + CSRF) Body: `CreateBookingDto`. Réponse 201: `AdminBookingOutputDto`. Erreurs 404, 409, 400.
    *   `GET /api/users/me/bookings`: (Auth) Query: `?page`, `?limit`. Réponse 200: `{ data: [Booking], pagination: {...} }` (format de sortie simple).
    *   `GET /api/users/me/establishments/:establishmentId/bookings`: (Auth + Admin + Ownership) Query: `?page`, `?limit`. Réponse 200: `{ data: [AdminBookingOutputDto], pagination: {...} }`. Erreur 404.
    *   `GET /api/bookings/:bookingId`: (Auth + `ensureBookingOwnerOrAdmin`) Réponse 200: `AdminBookingOutputDto`. Erreur 404.
    *   `PATCH /api/bookings/:bookingId/cancel`: (Auth + CSRF) Annulation par client. Réponse 200: `AdminBookingOutputDto`. Erreurs 403, 404, 400.
    *   `PATCH /api/bookings/:bookingId`: (Auth + Admin + CSRF) Body: `UpdateBookingStatusDto`. Mise à jour statut par admin. Réponse 200: `AdminBookingOutputDto`. Erreurs 403, 404, 400.

**6. Configuration Essentielle (`.env`)**

(Liste détaillée fournie précédemment.)

**7. Exécution du Projet**

(Instructions `npm install`, `migrate`, `seed`, `dev`, `build`, `start`, `test` fournies précédemment.)

**8. Gestion des Erreurs**

(Description du `errorMiddleware`, `AppError`, `ZodError` et format de réponse JSON fournie précédemment.)

**9. Considérations Futures / TODOs**

*   **Bug Connu :** Échec validation mot de passe actuel sur `PATCH /users/:id/password` et `PATCH /users/:id/email`. Nécessite investigation.
*   **Couverture des Tests :** Compléter les tests `TODO` dans `user.routes.test.ts` (profil, suppression, image, vérif email). Ajouter tests pour les nouvelles validations Override.
*   **Implémentation SMS Réelle.**
*   **Validation SIRET Réelle.**
*   **Stockage Fichiers Cloud.**
*   **Intégration Paiements.**
*   **Gestion Fine Permissions.**
*   **Logging Avancé.**
*   **Tâches Asynchrones.**
*   **Documentation API Auto-générée (Swagger/OpenAPI).**
*   **Sécurité Avancée.**

---