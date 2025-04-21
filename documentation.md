---

**Documentation Complète du Backend - Application Calendrier Événementiel (APP_NAME)**

**Version:** 1.2 (Date: 2024-08-16) - *Post-Tests & Finalisation*

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

Ce document détaille l'architecture, les composants, les concepts et les fonctionnalités du backend de l'application "Calendrier Événementiel" (ci-après dénommée APP_NAME). L'objectif principal de ce backend est de fournir une API RESTful sécurisée, robuste et scalable pour la gestion des comptes utilisateurs, l'authentification multi-facteurs, la gestion des établissements, des services proposés, des disponibilités et des réservations. Cette documentation reflète l'état actuel après une refonte des routes et l'ajout de fonctionnalités et validations basées sur les retours et les tests.

**2. Architecture & Technologies**

L'application est construite sur Node.js avec Express.js (v5) et TypeScript. Elle suit une architecture en couches :

*   **Route (`src/routes/`) :** Définit les endpoints HTTP et middlewares spécifiques via `express.Router`. Structure modulaire par ressource, avec routeurs imbriqués pour `/api/users/me/establishments/...`.
*   **Contrôleur (`src/controllers/`) :** Gère la logique requête/réponse, valide les DTOs (Zod), orchestre les services, formate les réponses (DTO mappers).
*   **Service (`src/services/`) :** Logique métier principale, découplée d'Express. Interagit avec modèles (Sequelize) et autres services (injection de dépendances).
*   **Modèle/Données (`src/models/`) :** Modèles Sequelize (v6) pour MySQL (`mysql2`). Définition des tables, attributs, contraintes, associations. Initialisation connexion et migrations/seeders (`sequelize-cli`).
*   **Middlewares (`src/middlewares/`) :** Fonctions transversales : Auth (`requireAuth`, `requireRole`, `ensureSelf`, ownership checks), CSRF (`verifyCsrfToken`), Erreurs (`errorMiddleware`), Rate Limiting, Cookies, CORS, Helmet, Parsing, Uploads (`multer`).
*   **DTOs & Validation (`src/dtos/`) :** Schémas Zod (`*Schema`) pour validation entrées, types TypeScript (`*Dto`), mappers (`mapTo*Dto`) pour sorties.
*   **Erreurs Personnalisées (`src/errors/`) :** Classes d'erreurs spécifiques (`AppError`, `UserNotFoundError`, etc.).
*   **Utilitaires (`src/utils/`) :** Fonctions d'aide réutilisables.
*   **Configuration (`src/config/`) :** Chargement `.env`, configuration spécifique.

**Technologies Principales :**
Node.js, Express.js (v5), TypeScript, Sequelize (v6), MySQL (`mysql2`), Zod, JWT (`jsonwebtoken`), Bcrypt, otplib, qrcode, cookie-parser, cors, helmet, express-rate-limit, nodemailer, multer, crypto, axios, Jest, Supertest.

**3. Concepts Fondamentaux**

*   **Authentification JWT :**
    *   **Access Token:** Courte durée (15 min), `userId`, `username`, `type='access'`. Header `Authorization: Bearer ...`. Stockage mémoire frontend.
    *   **Refresh Token:** Longue durée (7 jours), `userId`, `type='refresh'`, `jti`. Cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Rotation implémentée (token utilisé -> révoqué en BDD via hash SHA256 -> nouveau couple émis).
    *   **Pre-2FA Token:** Très courte durée (10 min), `userId`, `type='pre-2fa'`. Généré après `/login/initiate` succès. Envoyé en réponse et header `X-Pre-2FA-Token`. Requis header pour `/login/send-code`, `/login/verify-code`.

*   **Hachage :**
    *   **Mots de passe :** `bcrypt` (sel intégré au hash). Colonne `salt` BDD supprimée.
    *   **Refresh Tokens :** SHA256 du token JWT (`token_hash`).
    *   **Reset/Activation Tokens :** SHA256 du token clair.
    *   **Codes OTP (Email/SMS) :** bcrypt du code clair (`two_factor_code_hash`).
    *   **Codes de Récupération 2FA :** bcrypt des codes clairs (`recovery_codes_hashes`).

*   **Protection CSRF (Double Submit Cookie) :**
    *   Login/Refresh -> Cookie `csrfSecret` (signé, HttpOnly) + Cookie `XSRF-TOKEN` (non signé, lisible JS) avec même secret.
    *   Requête modifiante -> Header `X-CSRF-Token` (lu depuis cookie `XSRF-TOKEN`).
    *   `verifyCsrfToken` compare header et secret du cookie signé.
    *   Logout efface cookies.

*   **Activation de Compte :** `POST /users` -> User inactif + token (hashé BDD) -> Email (token clair) -> `POST /activate-account` -> Validation & Activation.

*   **Réinitialisation de Mot de Passe :** `POST /request-password-reset` -> Token (hashé BDD) + `is_recovering=true` -> Email (token clair) -> (Optionnel `POST /validate-reset-token`) -> `POST /perform-password-reset` -> Validation & Update & `is_recovering=false` & Révocation tokens.

*   **Authentification à Deux Facteurs (2FA - Obligatoire Post-Login) :**
    *   Flux : `/login/initiate` (check mdp) -> 200 avec `challenge` & `pre2faToken` -> `/login/send-code` (si Email/SMS) -> `/login/verify-code` (OTP/TOTP/Recovery).
    *   Méthodes : Email (OTP bcrypt), SMS (OTP simulé), TOTP (`otplib`, secret chiffré AES-256-GCM), Codes Récupération (bcrypt, consommés).
    *   `AuthService.verifyTwoFactorCode` gère la vérification.

*   **Chiffrement des Données Sensibles (Secrets TOTP) :** `EncryptionService` (AES-256-GCM + `ENCRYPTION_KEY`) chiffre/déchiffre `two_factor_secret`. Valeur stockée = `iv:encryptedData:authTag`.

*   **Gestion des Fichiers Uploadés (Stockage Local) :** `multer` + `FileService`. Stockage dans `public/uploads/...` avec nom unique. URL relative en BDD. `express.static` sert les fichiers.

*   **Rôles et Permissions :** Rôles (`CLIENT`, `ESTABLISHMENT_ADMIN`, `SUPER_ADMIN`). Middlewares `requireAuth`, `requireRole`, `ensureSelf`. Ownership vérifié par `ensureOwnsEstablishment` (peut renvoyer 404 si non trouvé/possédé), `requireServiceOwner`, `requireRuleOwner`, `requireOverrideOwner` (renvoient 403 si trouvé mais non possédé), `ensureBookingOwnerOrAdmin`.

**4. Composants Principaux**

*   **`server.ts`:** Point d'entrée, initialisation, injection dépendances, middlewares globaux, montage routeurs, démarrage serveur.
*   **`src/models/index.ts`:** Init Sequelize, import modèles, associations.
*   **`src/models/*.ts`:** Modèles (`User`, `Establishment`, `Service`, `AvailabilityRule`, `AvailabilityOverride`, `Booking`, `Role`, `RefreshToken`, `Country`).
*   **`src/services/*.service.ts`:** Logique métier (Auth, User, Establishment, Service, Availability, Booking, Notification, Encryption, File).
*   **`src/controllers/*.controller.ts`:** Gestion requête/réponse, validation DTO, appels services.
*   **`src/routes/*.routes.ts`:** Définition endpoints, middlewares spécifiques, structure imbriquée.
*   **`src/middlewares/*.middleware.ts`:** Implémentation middlewares (Auth, CSRF, Erreur, etc.).
*   **`src/dtos/*.validation.ts`:** Schémas Zod (`*Schema`), types (`*Dto`), mappers (`mapTo*Dto`).
*   **`src/errors/*.errors.ts`:** Classes d'erreurs (`AppError`, `UserNotFoundError`, etc.).
*   **`src/utils/*.utils.ts`:** Fonctions utilitaires.
*   **`src/config/*`:** Configuration.

**5. Détail des Fonctionnalités et Endpoints API (`/api/...`)**

*(Légende : Auth = Authentification (Bearer Token), CSRF = Protection CSRF active, Admin = Rôle `ESTABLISHMENT_ADMIN` requis, Ownership = Middleware de vérification de propriété spécifique)*

*   **Authentification (`/api/auth`)**
    *   `POST /login/initiate`: (Public) Body: `{ usernameOrEmail, password }`. Réponse 200: `{ type: '2fa_challenge', ... }` ou 401/400.
    *   `POST /login/send-code`: (Semi-Protégé via Header `X-Pre-2FA-Token`) Body: `{ method: 'email' | 'sms' }`. Réponse 200 ou 401/400.
    *   `POST /login/verify-code`: (Semi-Protégé via Header `X-Pre-2FA-Token`) Body: `{ code }`. Réponse 200: `{ accessToken }` + Cookies ou 401/400.
    *   `POST /refresh`: (Protégé via Cookie `refreshToken`) Réponse 200: `{ accessToken }` + Cookies ou 401.
    *   `POST /logout`: (Protégé via Cookie `refreshToken`) Réponse 200. Efface cookies.
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
    *   `PATCH /:id/password`: (Auth + `ensureSelf` + CSRF) Body: `{ currentPassword, newPassword }`. Réponse 200: `{ message }`. Erreurs 401, 400. *(Bug connu: renvoie 401 même si mdp correct)*.
    *   `PATCH /:id/email`: (Auth + `ensureSelf` + CSRF) Body: `{ newEmail, currentPassword }`. Réponse 200: `{ message, user: MeOutputDto }`. Erreurs 401, 409, 400. *(Bug connu: renvoie 401 même si mdp correct)*.
    *   `PATCH /:id/profile-picture`: (Auth + `ensureSelf` + CSRF + `multer`) Form-data: `profilePicture`. Réponse 200: `{ message, user: MeOutputDto }`. Erreur 400.
    *   `DELETE /:id/profile-picture`: (Auth + `ensureSelf` + CSRF) Réponse 200: `{ message, user: MeOutputDto }`. Erreur 404.
    *   `DELETE /:id`: (Auth + `ensureSelf` + CSRF) Body: `{ password }`. Réponse 204. Erreur 401.
    *   `POST /:id/request-email-verification`: (Auth + `ensureSelf` + CSRF) Réponse 202.

*   **Établissements (`/api/establishments` et `/api/users/me/establishments`)**
    *   `POST /api/establishments`: (Auth + CSRF) Body: `CreateEstablishmentDto`. Réponse 201: `AdminEstablishmentDto`. Erreurs 409, 400, 403 (si logique 1 par user active).
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
    *   `POST /api/bookings`: (Auth + CSRF) Body: `CreateBookingDto`. Réponse 201: `Booking`. Erreurs 404, 409, 400.
    *   `GET /api/users/me/bookings`: (Auth) Query: `?page`, `?limit`. Réponse 200: `{ data: [Booking], pagination: {...} }`.
    *   `GET /api/users/me/establishments/:establishmentId/bookings`: (Auth + Admin + Ownership) Query: `?page`, `?limit`. Réponse 200: `{ data: [Booking], pagination: {...} }`. Erreur 404.
    *   `GET /api/bookings/:bookingId`: (Auth + `ensureBookingOwnerOrAdmin`) Réponse 200: `Booking`. Erreur 404.
    *   `PATCH /api/bookings/:bookingId/cancel`: (Auth + CSRF) Annulation par client. Réponse 200: `Booking`. Erreurs 403, 404, 400.
    *   `PATCH /api/bookings/:bookingId`: (Auth + Admin + CSRF) Body: `UpdateBookingStatusDto`. Mise à jour statut par admin. Réponse 200: `Booking`. Erreurs 403, 404, 400.

**6. Configuration Essentielle (`.env`)**

(Liste détaillée fournie précédemment, incluant DB\_\*, JWT\_\*, COOKIE\_\*, ENCRYPTION\_KEY, MAILER\_\*, URLS, APP\_\*, CORS\_\*, etc.)

**7. Exécution du Projet**

(Instructions `npm install`, `migrate`, `seed`, `dev`, `build`, `start` fournies précédemment.)

**8. Gestion des Erreurs**

(Description du `errorMiddleware`, `AppError`, `ZodError` et format de réponse JSON fournie précédemment.)

**9. Considérations Futures / TODOs**

*   **Bug Connu :** Échec validation mot de passe actuel sur `PATCH /users/:id/password` et `PATCH /users/:id/email` (renvoie 401 au lieu de 200/409). Nécessite investigation du `userService.validatePassword` ou du hashage/état utilisateur dans ce contexte.
*   **Couverture des Tests :** Compléter les tests `TODO` dans `user.routes.test.ts` (profil, suppression, image, vérif email).
*   **Implémentation SMS Réelle.**
*   **Validation SIRET Réelle.**
*   **Stockage Fichiers Cloud.**
*   **Intégration Paiements.**
*   **Gestion Fine Permissions.**
*   **Logging Avancé.**
*   **Tâches Asynchrones (Emails/SMS).**
*   **Documentation API Auto-générée (Swagger/OpenAPI).**
*   **Sécurité Avancée.**

---