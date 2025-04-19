# Backend API - Application Réservation de Services

API RESTful sécurisée pour la gestion des utilisateurs, l'authentification, les établissements, les services, les disponibilités et les réservations. Construite avec Node.js, Express, TypeScript et Sequelize.

## Fonctionnalités Principales

*   **Gestion Complète des Utilisateurs :** Inscription avec activation email, connexion, mise à jour profil (username, email, photo), changement mot de passe, réinitialisation mot de passe, suppression de compte.
*   **Authentification Robuste :** Système basé sur JWT (Access + Refresh Token via cookie HttpOnly), 2FA obligatoire (Email/SMS(simulé)/TOTP), gestion des codes de récupération.
*   **Sécurité :** Hachage de mots de passe (bcrypt), protection CSRF (Double Submit Cookie), validation d'entrée (Zod), headers de sécurité (Helmet), limitation de débit.
*   **Gestion d'Établissements:** Création, mise à jour, récupération (pour l'admin), récupération publique (liste & détail), validation SIRET (simulée ou réelle), gestion photo de profil établissement.
*   **Gestion des Services:** CRUD des services liés à un établissement.
*   **Gestion des Disponibilités:** Règles récurrentes par jour, exceptions/heures spéciales (overrides), calcul des créneaux disponibles pour un service/date donné.
*   **Système de Réservation:** Création par le client, consultation (client & admin), annulation (client & admin), mise à jour de statut par l'admin.
*   **Notifications par Email:** Activation, bienvenue, vérification email (pour changement), réinitialisation mot de passe, confirmation suppression, (potentiellement notifications de réservation/annulation).

## Architecture & Technologies

*   **Langage :** TypeScript
*   **Framework :** Express.js
*   **ORM :** Sequelize
*   **Base de Données :** SQL (ex: PostgreSQL)
*   **Validation :** Zod
*   **Authentification :** JWT (`jsonwebtoken`), Cookies (`cookie-parser`), Bcrypt
*   **Sécurité :** Helmet, CSRF (Double Submit Cookie), `crypto` (natif)
*   **Emails :** Nodemailer
*   **Uploads :** Multer (stockage local)
*   **Autres :** dotenv, cors, express-rate-limit, otplib, qrcode

**(Voir la [Documentation Technique Complète](LIEN_VERS_DOC_PLUS_DETAILLEE.md) pour plus de détails sur l'architecture interne.)**

## Mise en Route

### Prérequis

*   Node.js (Version LTS recommandée)
*   npm, yarn ou pnpm
*   Serveur de Base de Données SQL fonctionnel et accessible.
*   Serveur SMTP ou service d'envoi d'emails (ou accepter logs console).

### Installation & Configuration

1.  **Cloner le dépôt.**
2.  **Installer les dépendances :** `npm install` (ou équivalent).
3.  **Configuration Base de Données (`config/config.js`):** Renseigner les accès DB pour les environnements.
4.  **Variables d'Environnement (`.env`):** Créer `.env` à partir de `.env.example` et remplir **toutes** les variables (DB, JWT_SECRET, COOKIE_SECRET, MAILERL_*, APP_NAME, FRONTEND_URL, APP_BASE_URL, expirations, etc.).
5.  **Migrations Base de Données :** `npx sequelize-cli db:migrate`.
6.  **(Optionnel) Seeders :** `npx sequelize-cli db:seed:all`.

### Lancement

*   **Développement :** `npm run dev`
*   **Production :** `npm run build` puis `npm start` (avec `NODE_ENV=production`).

## Structure des Dossiers Principaux

### src/
######├── config/ # Config Sequelize-CLI
######├── controllers/ # Contrôleurs (Auth, User, Establishment, Service, Booking, etc.)
######├── dtos/ # Zod Schemas & Mappers (Validation/Output DTOs)
######├── errors/ # Classes d'erreurs personnalisées (AppError, specific errors)
######├── middlewares/ # Middlewares Express (requireAuth, ensureSelf, verifyCsrf, error, etc.)
######├── migrations/ # Migrations Sequelize
######├── models/ # Modèles Sequelize (User, Establishment, Service, Booking, etc.)
######├── routes/ # Routeurs Express (auth, users, establishments, services, etc.)
######├── seeders/ # Seeders Sequelize
######├── services/ # Logique métier (Auth, User, Establishment, Booking, File, Notification, etc.)
######├── types/ # Définitions de types .d.ts globales
######└── server.ts # Point d'entrée Express
######.env # Variables d'environnement
######.env.example
######.sequelizerc
######tsconfig.json


## Endpoints API Détaillés

*(Il est fortement recommandé de générer une documentation Swagger/OpenAPI à partir du code pour une référence exhaustive et interactive)*

### A) Authentification & Utilisateurs (`/api/auth`, `/api/users`)

*   `GET /api/auth/csrf-cookie`: Obtient/Rafraîchit les cookies CSRF. (Public)
*   `POST /api/auth/login/initiate`: Démarre le login, renvoie challenge 2FA ou tokens (rare). (Public)
*   `POST /api/auth/login/send-code`: Envoie le code OTP email/sms (nécessite header `X-Pre-2FA-Token`). (Semi-Protégé)
*   `POST /api/auth/login/verify-code`: Vérifie le code 2FA (OTP/TOTP/Recovery), finalise le login, définit les cookies, renvoie Access Token. (Semi-Protégé via `X-Pre-2FA-Token`)
*   `POST /api/auth/refresh`: Rafraîchit l'Access Token via le cookie `refreshToken`. (Protégé via Cookie)
*   `POST /api/auth/logout`: Déconnecte (révoque refresh token, efface cookies). (Protégé via Cookie)
*   `GET /api/auth/mfa/totp/setup`: Génère secret/QR pour TOTP. (Authentifié)
*   `POST /api/auth/mfa/totp/enable`: Active TOTP (nécessite mdp + code + secret). (Authentifié + CSRF)
*   `DELETE /api/auth/mfa/totp/disable`: Désactive TOTP (nécessite mdp). (Authentifié + CSRF)
*   `POST /api/users`: Crée un utilisateur (inactif). (Public)
*   `POST /api/users/activate-account`: Active un compte via token email. (Public)
*   `POST /api/users/request-password-reset`: Demande reset mdp par email. (Public)
*   `POST /api/users/validate-reset-token`: Valide un token de reset. (Public)
*   `POST /api/users/perform-password-reset`: Effectue le reset avec token et nouveau mdp. (Public)
*   `GET /api/users/me`: Infos utilisateur connecté. (Authentifié)
*   `PATCH /api/users/:id/profile`: Met à jour username. (Authentifié + `ensureSelf` + CSRF)
*   `PATCH /api/users/:id/password`: Change le mot de passe (nécessite mdp actuel). (Authentifié + `ensureSelf` + CSRF)
*   `PATCH /api/users/:id/email`: Change l'email (nécessite mdp actuel, déclenche re-vérification). (Authentifié + `ensureSelf` + CSRF)
*   `PATCH /api/users/:id/profile-picture`: Upload photo profil (multipart/form-data). (Authentifié + `ensureSelf` + CSRF)
*   `DELETE /api/users/:id/profile-picture`: Supprime photo profil. (Authentifié + `ensureSelf` + CSRF)
*   `DELETE /api/users/:id`: Supprime le compte (nécessite mdp). (Authentifié + `ensureSelf` + CSRF)
*   `POST /api/users/:id/request-email-verification`: (Ré)envoie code vérification email. (Authentifié + `ensureSelf` + CSRF)

### B) Établissements (`/api/establishments`)

*   `POST /api/establishments`: Crée un établissement (non validé) pour l'admin connecté. (Authentifié Admin + CSRF)
*   `GET /api/establishments/my`: Récupère l'établissement de l'admin connecté. (Authentifié Admin)
*   `PUT /api/establishments/my`: Met à jour l'établissement de l'admin. (Authentifié Admin + CSRF)
*   `PATCH /api/establishments/my/profile-picture`: Upload/MàJ photo établissement. (Authentifié Admin + CSRF)
*   `DELETE /api/establishments/my/profile-picture`: Supprime photo établissement. (Authentifié Admin + CSRF)
*   `POST /api/establishments/my/request-validation`: Tente la validation SIRET. (Authentifié Admin + CSRF)
*   `GET /api/establishments`: Liste les établissements publics validés (pagination). (Public)
*   `GET /api/establishments/:id`: Détails publics d'un établissement validé. (Public)

### C) Services (`/api/establishments`, `/api/services`)

*   `POST /api/establishments/my/services`: Crée un service pour l'établissement de l'admin. (Authentifié Admin + CSRF)
*   `GET /api/establishments/my/services`: Liste les services de l'admin (pagination). (Authentifié Admin)
*   `GET /api/establishments/:id/services`: Liste les services actifs publics d'un établissement. (Public)
*   `PUT /api/services/:serviceId`: Met à jour un service. (Authentifié + Propriétaire Service + CSRF)
*   `DELETE /api/services/:serviceId`: Supprime un service. (Authentifié + Propriétaire Service + CSRF)

### D) Disponibilité (`/api/establishments`, `/api/availability`, `/api/services`)

*   `POST /api/establishments/my/availability/rules`: Crée une règle de dispo récurrente. (Authentifié Admin + CSRF)
*   `GET /api/establishments/my/availability/rules`: Liste les règles de l'admin. (Authentifié Admin)
*   `DELETE /api/availability/rules/:ruleId`: Supprime une règle. (Authentifié + Propriétaire Règle + CSRF)
*   `POST /api/establishments/my/availability/overrides`: Crée une exception de dispo. (Authentifié Admin + CSRF)
*   `GET /api/establishments/my/availability/overrides`: Liste les exceptions de l'admin. (Authentifié Admin)
*   `PUT /api/availability/overrides/:overrideId`: Met à jour une exception. (Authentifié + Propriétaire Override + CSRF)
*   `DELETE /api/availability/overrides/:overrideId`: Supprime une exception. (Authentifié + Propriétaire Override + CSRF)
*   `GET /api/services/:serviceId/availability`: **(Clé)** Récupère les créneaux disponibles pour un service/date. (Public)

### E) Réservations (`/api/bookings`, `/api/users`, `/api/establishments`)

*   `POST /api/bookings`: Crée une réservation pour le client connecté. (Authentifié + CSRF)
*   `GET /api/users/me/bookings`: Liste les réservations du client connecté (pagination). (Authentifié)
*   `GET /api/establishments/my/bookings`: Liste les réservations reçues par l'admin (pagination, filtres). (Authentifié Admin)
*   `GET /api/bookings/:bookingId`: Détails d'une réservation. (Authentifié + Propriétaire Booking/Admin)
*   `PATCH /api/bookings/:bookingId/cancel`: Annule une réservation (client). (Authentifié + Propriétaire Booking + CSRF)
*   `PATCH /api/bookings/:bookingId`: Met à jour statut réservation (admin). (Authentifié Admin + CSRF)

## Tests

```bash
npm test
```

## Contribution
#### (Guidelines de contribution)
## Licence
#### (Licence du projet)