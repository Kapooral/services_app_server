---

**Documentation Complète du Backend**

**Version:** (1.0.0)

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

Ce document détaille l'architecture, les composants, les concepts et les fonctionnalités du backend de l'application "Calendrier Événementiel" (ci-après dénommée APP_NAME). L'objectif principal de ce backend est de fournir une API RESTful sécurisée, robuste et scalable pour la gestion des comptes utilisateurs, l'authentification multi-facteurs, la gestion des établissements, des services proposés, des disponibilités et des réservations.

**2. Architecture & Technologies**

L'application est construite sur Node.js avec le framework Express.js (v5), en utilisant TypeScript pour un typage statique robuste. Elle suit une architecture en couches clairement définie pour une meilleure maintenabilité et testabilité :

*   **Couche Route (`src/routes/`) :** Définit les endpoints HTTP et les middlewares spécifiques à chaque route ou groupe de routes. Utilise `express.Router` de manière modulaire (un fichier par ressource principale, plus des routeurs imbriqués pour les actions spécifiques à l'utilisateur/établissement).
*   **Couche Contrôleur (`src/controllers/`) :** Gère la logique de requête/réponse HTTP. Valide les données d'entrée (DTOs via Zod), orchestre les appels aux services appropriés, et formate les réponses ou transmet les erreurs au middleware suivant.
*   **Couche Service (`src/services/`) :** Contient la logique métier principale, découplée du framework Express. Interagit avec les modèles de données (Sequelize), d'autres services (via injection de dépendances manuelle), et gère les opérations complexes.
*   **Couche Modèle/Données (`src/models/`) :** Utilise l'ORM Sequelize (v6) pour interagir avec une base de données relationnelle (actuellement MySQL via `mysql2`). Définit la structure des tables (modèles), leurs attributs, contraintes, et associations. Gère également l'initialisation de la connexion et l'exécution des migrations/seeders via `sequelize-cli`.
*   **Middlewares (`src/middlewares/`) :** Fonctions interceptant les requêtes/réponses pour des tâches transversales : authentification (`requireAuth`), autorisation (`requireRole`, `ensureSelf`, `ensureOwnsEstablishment`, etc.), protection CSRF (`verifyCsrfToken`), gestion des erreurs (`errorMiddleware`), limitation de débit (`apiLimiter`), parsing des cookies (`cookie-parser`), CORS (`cors`), sécurité des headers (`helmet`), parsing du corps de requête (`express.json`, `express.urlencoded`), gestion des uploads (`multer`).
*   **DTOs & Validation (`src/dtos/`) :** Définit les structures de données pour les transferts entre le client et le serveur (Data Transfer Objects). Utilise la bibliothèque Zod pour déclarer des schémas de validation robustes pour les données d'entrée (req.body, req.query, req.params) et pour typer les DTOs de sortie. Contient également des fonctions de mapping (ex: `mapToPublicEstablishmentDto`) pour transformer les objets modèle en DTOs propres avant l'envoi au client.
*   **Erreurs Personnalisées (`src/errors/`) :** Définit des classes d'erreurs spécifiques (ex: `UserNotFoundError`, `BookingConflictError`) héritant d'une classe `AppError` de base. Permet une gestion centralisée et sémantique des erreurs opérationnelles avec des codes de statut HTTP appropriés.
*   **Utilitaires (`src/utils/`) :** Fonctions d'aide réutilisables (ex: génération d'URL absolues).
*   **Configuration (`src/config/`) :** Chargement des variables d'environnement (`dotenv`), configuration spécifique (ex: CORS, potentiellement BDD bien que gérée par Sequelize CLI).

**Technologies Principales :**

*   **Node.js:** Environnement d'exécution JavaScript côté serveur.
*   **Express.js (v5):** Framework web minimaliste et flexible.
*   **TypeScript:** Superset de JavaScript ajoutant le typage statique.
*   **Sequelize (v6):** ORM pour Node.js, utilisé avec `mysql2` pour MySQL.
*   **MySQL:** Système de gestion de base de données relationnelle.
*   **Zod:** Bibliothèque de déclaration et validation de schémas basée sur TypeScript.
*   **JSON Web Tokens (JWT):** Utilisé pour les Access Tokens, Refresh Tokens et Pre-2FA Tokens via `jsonwebtoken`.
*   **Bcrypt:** Bibliothèque pour le hachage sécurisé des mots de passe.
*   **otplib:** Bibliothèque pour générer et vérifier les mots de passe TOTP (Time-based One-Time Password) pour la 2FA.
*   **qrcode:** Bibliothèque pour générer des QR Codes (utilisée pour l'URI TOTP).
*   **cookie-parser:** Middleware pour parser les cookies HTTP (utilisé avec un secret pour les cookies signés CSRF).
*   **cors:** Middleware pour gérer le Cross-Origin Resource Sharing.
*   **helmet:** Middleware pour sécuriser l'application Express via divers headers HTTP.
*   **express-rate-limit:** Middleware pour limiter le débit des requêtes API.
*   **nodemailer:** Bibliothèque pour l'envoi d'e-mails.
*   **multer:** Middleware pour gérer les uploads de fichiers (multipart/form-data), utilisé pour les images de profil.
*   **crypto (natif Node.js):** Utilisé pour générer des tokens aléatoires (activation, reset), des JWT IDs (jti), et pour le hachage SHA256 des tokens stockés en BDD et le chiffrement AES-GCM des secrets TOTP.
*   **axios:** Client HTTP basé sur les promesses (potentiellement utilisé pour des appels API externes comme la validation SIRET).
*   **moment:** Bibliothèque de manipulation de dates/heures (potentiellement utilisée par les services de disponibilité/réservation).
*   **ejs:** Moteur de template (potentiellement utilisé pour générer le HTML des emails).
*   **slugify:** Bibliothèque pour générer des slugs (potentiellement pour établissements/services, bien que non visible explicitement dans le code fourni).
*   **Jest & Supertest:** Framework et bibliothèque pour les tests d'intégration/unitaires.

**3. Concepts Fondamentaux**

*   **Authentification JWT :**
    *   **Access Token:** JWT de courte durée (ex: 15 min via `JWT_ACCESS_EXPIRATION_SECONDS`), signé avec `JWT_SECRET`. Contient des informations minimales sur l'utilisateur (`userId`, `username`, `type='access'`). Envoyé par le frontend dans le header `Authorization: Bearer ...` pour accéder aux ressources protégées. Vérifié par le middleware `requireAuth`. Stocké en mémoire côté frontend.
    *   **Refresh Token:** JWT de longue durée (ex: 7 jours via `JWT_REFRESH_EXPIRATION_SECONDS`), signé avec `JWT_SECRET`. Contient `userId`, `type='refresh'`, et un identifiant unique (`jti`). **Stocké côté client dans un cookie `HttpOnly`, `Secure` (en production), `SameSite=Lax`, `Path=/`**. Non accessible par JavaScript. Utilisé par l'endpoint `/api/auth/refresh` (qui lit le cookie) pour obtenir un nouveau couple Access/Refresh Token. Implémente la **Rotation des Refresh Tokens** : chaque refresh token utilisé est révoqué (`is_revoked: true`) dans la table `refresh_tokens` (où son hash SHA256 est stocké), et un nouveau token est émis. L'IP et l'User-Agent sont aussi stockés pour audit.
    *   **Pre-2FA Token:** JWT de très courte durée (ex: 10 min via `JWT_PRE_2FA_EXPIRATION_SECONDS`), signé avec `JWT_SECRET`. Contient `userId`, `type='pre-2fa'`. Généré après la validation réussie du mot de passe lors du login (`/login/initiate`) si la 2FA est applicable. Envoyé au frontend dans le corps de la réponse ET dans le header `X-Pre-2FA-Token`. Le frontend doit renvoyer ce token dans le header `X-Pre-2FA-Token` lors des appels suivants (`/login/send-code`, `/login/verify-code`) pour lier ces étapes à la tentative de connexion initiale.

*   **Hachage :**
    *   **Mots de passe :** `bcrypt` est utilisé. Un sel unique est généré et **intégré au hash** par `bcrypt.hash`. La colonne `salt` de la table `users` est **obsolète et non utilisée**. La vérification se fait via `bcrypt.compare`.
    *   **Refresh Tokens :** Les refresh tokens stockés en BDD sont **hashés (SHA256)** via `crypto.createHash('sha256')` pour éviter de stocker les JWT bruts (`token_hash` dans `refresh_tokens`).
    *   **Reset/Activation Tokens :** Les tokens longs et aléatoires (`crypto.randomBytes`) générés pour l'activation et la réinitialisation sont **hashés (SHA256)** avant d'être stockés en BDD (`email_activation_token`, `password_reset_token`). Seul le token brut (en clair) est envoyé à l'utilisateur par email.
    *   **Codes OTP (Email/SMS) :** Les codes OTP générés sont **hashés (bcrypt)** avant d'être stockés temporairement en BDD (`two_factor_code_hash`).
    *   **Codes de Récupération 2FA :** Les codes de récupération générés sont **hashés (bcrypt)** avant d'être stockés dans le champ JSON `recovery_codes_hashes` en BDD.

*   **Protection CSRF (Double Submit Cookie) :**
    *   Après une connexion (`/login/verify-code`) ou un refresh (`/refresh`) réussi, le backend génère un secret CSRF aléatoire (`crypto.randomBytes`).
    *   Ce secret est stocké dans un cookie **signé** `HttpOnly` (nom par défaut: `csrfSecret`, configuré via `COOKIE_SECRET`).
    *   Le **même secret (non signé)** est stocké dans un cookie standard lisible par JavaScript (nom par défaut: `XSRF-TOKEN`).
    *   Pour les requêtes modifiantes (POST, PUT, PATCH, DELETE) protégées, le frontend lit la valeur du cookie `XSRF-TOKEN` et l'envoie dans le header HTTP `X-CSRF-Token` (nom configurable).
    *   Le middleware `verifyCsrfToken` compare la valeur du header `X-CSRF-Token` avec la valeur dé-signée du cookie `csrfSecret`. S'ils correspondent, la requête est valide. Les cookies sont effacés au logout (`clearCsrfCookies`).
    *   Un endpoint public `GET /api/auth/csrf-cookie` (non vu dans les routes fournies, mais conceptuellement utile) pourrait être utilisé pour initialiser les cookies CSRF au démarrage de l'application frontend si nécessaire.

*   **Activation de Compte :**
    *   Les nouveaux comptes (`POST /api/users`) sont créés avec `is_active: false`, `is_email_active: false`.
    *   Un token d'activation unique et limité dans le temps est généré (`crypto.randomBytes`), hashé (SHA256), et stocké en BDD (`email_activation_token`, `email_activation_token_expires_at`).
    *   Un email est envoyé à l'utilisateur contenant un lien vers le frontend avec le token *en clair* (ex: `FRONTEND_URL/activate-account?token=TOKEN_CLAIR`).
    *   Le frontend appelle `POST /api/users/activate-account` avec le token en clair.
    *   Le backend hashe le token reçu, cherche une correspondance en BDD, vérifie l'expiration, met `is_active: true`, `is_email_active: true`, et supprime le token de la BDD.

*   **Réinitialisation de Mot de Passe :**
    *   L'utilisateur demande une réinitialisation via `POST /api/users/request-password-reset` avec son email.
    *   Si l'email existe et l'utilisateur est actif, un token unique et limité dans le temps est généré (`crypto.randomBytes`), hashé (SHA256), et stocké en BDD (`password_reset_token`, `password_reset_expires_at`), et `is_recovering` est mis à `true`.
    *   Un email est envoyé avec un lien vers le frontend contenant le token *en clair* (ex: `FRONTEND_URL/reset-password?token=TOKEN_CLAIR`).
    *   Le frontend peut (optionnellement) valider le token via `POST /api/users/validate-reset-token` (le backend vérifie hash, expiration, `is_active`, `is_recovering`).
    *   L'utilisateur soumet le nouveau mot de passe et le token *en clair* via `POST /api/users/perform-password-reset`.
    *   Le backend re-valide le token (hash, expiration, `is_active`, `is_recovering`), met à jour le mot de passe (nouveau hash bcrypt), supprime le token de reset, et met `is_recovering` à `false`. L'opération révoque également tous les refresh tokens actifs de l'utilisateur.

*   **Authentification à Deux Facteurs (2FA - Obligatoire Post-Login) :**
    *   Le système force la 2FA après une validation réussie du mot de passe (`POST /api/auth/login/initiate`).
    *   Les méthodes supportées sont Email (OTP), SMS (OTP - simulé), et TOTP (Authenticator App). Les codes de récupération sont aussi une méthode de secours.
    *   `initiateLogin` renvoie les méthodes disponibles (`['email', 'totp', ... ]`) et un `pre2faToken`.
    *   Si Email/SMS est choisi, le frontend appelle `POST /api/auth/login/send-code` (avec `pre2faToken` et `method`). Le backend génère un OTP, le hashe (bcrypt), le stocke temporairement (`two_factor_code_hash`, `expires_at`, `method`) et envoie l'OTP clair via Email/SMS (simulé).
    *   L'utilisateur soumet le code (OTP, TOTP ou Récupération) via `POST /api/auth/login/verify-code` (avec `pre2faToken` et `code`).
    *   Le backend (`AuthService.verifyTwoFactorCode`) essaie de vérifier le code soumis :
        1.  Contre le secret TOTP (si existant, déchiffré, via `otplib.verify`).
        2.  Contre le hash OTP stocké (si existant, via `bcrypt.compare`) et son expiration.
        3.  Contre les hashes des codes de récupération stockés (si existants, via `bcrypt.compare`), et consomme le code si valide (le supprime du tableau JSON en BDD).
    *   Si la vérification réussit, les tokens Access/Refresh sont générés, les cookies définis, et l'accès est accordé. Les champs OTP temporaires sont nettoyés.

*   **Chiffrement des Données Sensibles (Secrets TOTP) :**
    *   Le secret TOTP généré pour un utilisateur est considéré comme sensible.
    *   Avant d'être stocké dans la colonne `two_factor_secret` de la table `users`, il est chiffré via `EncryptionService.encryptForStorage`.
    *   Ce service utilise l'algorithme **AES-256-GCM** (chiffrement symétrique authentifié) avec une clé secrète (`ENCRYPTION_KEY` de 32 octets définie dans les variables d'environnement) et un IV (vecteur d'initialisation) aléatoire.
    *   La valeur stockée en BDD contient l'IV, le texte chiffré et le tag d'authentification (séparés par `:`).
    *   Lors de la vérification TOTP, le secret est récupéré, déchiffré via `EncryptionService.decryptFromStorage` avant d'être utilisé par `otplib`.

*   **Gestion des Fichiers Uploadés (Stockage Local) :**
    *   Les fichiers uploadés (images de profil pour User et Establishment) sont gérés par le middleware `multer`.
    *   Le `FileService` configure `multer` (filtres de type `image/*`, limite de taille) et gère la sauvegarde et la suppression des fichiers.
    *   Les fichiers sont stockés localement sur le serveur dans un dossier public (ex: `public/uploads/profile-pictures`).
    *   Lors de la sauvegarde, un nom de fichier unique est généré (`crypto.randomBytes`). L'ancien fichier (si existant) est supprimé.
    *   L'URL publique relative (ex: `/uploads/profile-pictures/xxxxx.png`) est stockée en BDD (`profile_picture`, `profile_picture_url`).
    *   Le serveur Express est configuré (`express.static`) pour servir ces fichiers statiques. Une fonction utilitaire (`getAbsoluteProfilePictureURL`) construit l'URL absolue pour l'API si nécessaire.

*   **Rôles et Permissions :**
    *   Le système utilise des rôles définis dans l'enum `ROLES` (`CLIENT`, `ESTABLISHMENT_ADMIN`, `SUPER_ADMIN`) stockés dans la table `roles` et liés aux utilisateurs via `user_roles`.
    *   Le middleware `requireAuth` attache les rôles de l'utilisateur à `req.user.roles`.
    *   Le middleware `requireRole('ROLE_NAME')` vérifie si l'utilisateur possède le rôle requis (ou `SUPER_ADMIN`).
    *   Pour les ressources liées aux établissements (services, disponibilités, réservations admin), des middlewares spécifiques vérifient la **propriété** :
        *   `ensureOwnsEstablishment`: Vérifie si `req.user.id` est l'`owner_id` de l'établissement spécifié dans `req.params`. Utilisé pour protéger les routes `/api/users/me/establishments/:establishmentId/...`. Renvoie 404 si l'établissement n'appartient pas à l'utilisateur (ou n'existe pas).
        *   `requireServiceOwner`, `requireRuleOwner`, `requireOverrideOwner`: Vérifient si l'utilisateur connecté est le propriétaire de l'établissement auquel appartient le service/règle/override ciblé par `req.params`. Utilisé pour protéger les routes `/api/services/:serviceId`, `/api/availability/rules/:ruleId`, etc. Renvoie 403 ou 404.
        *   `ensureBookingOwnerOrAdmin`: Vérifie si l'utilisateur est soit le client (`user_id`) soit l'admin propriétaire de l'établissement associé à la réservation. Utilisé pour `GET /api/bookings/:bookingId`.
    *   `ensureSelf`: Vérifie si `req.user.id` correspond à `:id` dans l'URL pour les actions sur le profil utilisateur.

**4. Composants Principaux**

*   **`server.ts`:** Point d'entrée principal. Charge `.env`, initialise la connexion DB (via `models/index.ts`), instancie les services (Auth, User, Establishment, Service, Availability, Booking, Notification, Encryption), injecte les dépendances, applique les middlewares globaux (`cors`, `helmet`, `cookieParser`, `json`, `urlencoded`, `apiLimiter`), sert les fichiers statiques (`/uploads`), monte les différents routeurs (`/api/users`, `/api/auth`, etc.), applique le middleware d'erreur final (`errorMiddleware`), et démarre le serveur HTTP.
*   **`src/models/index.ts`:** Fichier généré/géré par `sequelize-cli`. Charge la configuration de la BDD (`config/config.js` + `.env`), initialise l'instance Sequelize, importe tous les modèles (`.ts`), établit les associations entre eux (`associate`), et exporte l'objet `db` contenant l'instance `sequelize` et les modèles.
*   **`src/models/*.ts`:** Chaque fichier définit un modèle Sequelize correspondant à une table de la BDD (ex: `User`, `Establishment`, `Service`, `AvailabilityRule`, `AvailabilityOverride`, `Booking`, `Role`, `RefreshToken`, `Country`). Définit les attributs, types, contraintes, indexes et contient la méthode `associate` pour lier les modèles.
*   **`src/services/*.service.ts`:**
    *   `auth.service.ts`: Logique pour `initiateLogin`, envoi/vérification codes 2FA (OTP, TOTP, Recovery), génération/validation JWT (Access, Refresh, Pre-2FA), gestion (hash/stockage/révocation) des Refresh Tokens, gestion TOTP (secret, QR code, enable/disable), gestion Recovery Codes. Utilise `UserService`, `NotificationService`, `EncryptionService`.
    *   `user.service.ts`: Logique CRUD pour User, activation compte, reset/update mot de passe (avec hash/compare), changement/vérification email, gestion tokens activation/reset (hash/compare), suppression compte (avec check mdp et révocation tokens), gestion image profil (via `fileService`). Utilise `NotificationService`, `AuthService` (pour révocation/recovery codes).
    *   `establishment.service.ts`: Logique CRUD pour Establishment, assignation rôle admin, validation SIRET (simulée), gestion image profil (via `fileService`), récupération publique/privée. Gère aussi le CRUD pour `AvailabilityRule` et `AvailabilityOverride` liés. Utilise `UserService`, `RoleModel`, `CountryModel`, `FileService`.
    *   `service.service.ts`: Logique CRUD pour Service. Vérifie ownership via `EstablishmentService`. Vérifie réservations futures avant suppression. Récupération publique/privée.
    *   `availability.service.ts`: Logique complexe pour calculer les créneaux disponibles (`getAvailableSlots`) en combinant règles, overrides et réservations existantes. Utilise `EstablishmentService`, `Service`, `Booking` models.
    *   `booking.service.ts`: Logique CRUD pour Booking. Gère la création avec vérification de disponibilité dans une transaction, annulation par client (avec check délai), mise à jour statut par admin (avec check transition). Utilise `EstablishmentService`, `AvailabilityService`, `NotificationService`, `sequelize` instance.
    *   `notification.service.ts`: Interface `INotificationService` et implémentation `ConsoleNotificationService`. Utilise `nodemailer` pour envoyer les emails (activation, bienvenue, reset, confirmation/alerte/annulation/update réservation) ou logue dans la console si non configuré. Simule l'envoi SMS.
    *   `encryption.service.ts`: Service pour chiffrer/déchiffrer (AES-256-GCM) les secrets TOTP. Utilise `crypto` et `ENCRYPTION_KEY`.
    *   `file.service.ts`: Service pour gérer la sauvegarde/suppression des fichiers locaux (images profil). Fournit configuration et filtre pour `multer`. Utilise `fs/promises`, `path`, `crypto`.
*   **`src/controllers/*.controller.ts`:** Chaque contrôleur mappe les requêtes HTTP aux méthodes des services correspondants. Valide les DTOs, gère `req`/`res`, définit/efface cookies, appelle les services, gère les réponses de succès et passe les erreurs à `next()`. (ex: `AuthController`, `UserController`, `EstablishmentController`, etc.)
*   **`src/routes/*.routes.ts`:** Chaque fichier utilise `express.Router()` pour définir les endpoints pour une ressource ou une fonctionnalité. Applique les middlewares requis (auth, csrf, validation, multer, ownership) et lie les routes aux méthodes des contrôleurs. Structure imbriquée pour `/users/me/establishments`.
*   **`src/middlewares/*.middleware.ts`:**
    *   `auth.middleware.ts`: Contient `requireAuth`, `ensureSelf`, `requireRole`, `ensureOwnsEstablishment`, `requireServiceOwner`, `requireRuleOwner`, `requireOverrideOwner`, `ensureBookingOwnerOrAdmin`. Gère l'authentification (vérification Access Token, `req.user`) et l'autorisation (rôles, propriété).
    *   `csrf.middleware.ts`: Contient `setCsrfCookies`, `clearCsrfCookies`, et `verifyCsrfToken` (qui compare header et cookie signé).
    *   `error.middleware.ts`: Middleware global final. Logue les erreurs, détermine le `statusCode` et le message/format de réponse JSON basé sur `AppError`, `ZodError`, ou erreur 500 générique.
    *   `rateLimiter.middleware.ts`: Configure `express-rate-limit` (`apiLimiter`).
*   **`src/dtos/*.validation.ts`:** Contient les schémas Zod (`...Schema`) pour la validation des données d'entrée, les types TypeScript inférés (`...Dto`), et les fonctions de mapping (`mapTo...Dto`) pour formater les données de sortie.
*   **`src/errors/*.errors.ts`:** Définit la classe `AppError` de base et les classes d'erreurs spécifiques (`UserNotFoundError`, `InvalidCredentialsError`, `BookingConflictError`, etc.) avec leur `statusCode` et message par défaut.
*   **`src/utils/*.utils.ts`:** Fonctions utilitaires diverses (ex: `url.utils.ts`).
*   **`src/config/*`:** Fichiers de configuration (ex: chargement `.env`).

**5. Détail des Fonctionnalités et Endpoints API (`/api/...`)**

*(Note : Auth = Authentification Requise via `requireAuth`. CSRF = Protection CSRF via `verifyCsrfToken`)*

*   **Authentification (`/api/auth`)**
    *   `POST /login/initiate`: (Public) Prend `usernameOrEmail`, `password`. Valide les identifiants. Si OK, renvoie `{ type: '2fa_challenge', challenge: { methods: [...] }, pre2faToken: '...' }` (avec token aussi dans header `X-Pre-2FA-Token`). Renvoie 401 si identifiants invalides/compte inactif, 400 si aucune méthode 2FA dispo.
    *   `POST /login/send-code`: (Semi-Protégé via `X-Pre-2FA-Token`) Prend `{ method: 'email' | 'sms' }`. Valide `pre2faToken`. Génère et envoie OTP via Email/SMS (simulé). Stocke hash OTP en BDD. Renvoie 200 ou 401 (token invalide), 400 (méthode non dispo).
    *   `POST /login/verify-code`: (Semi-Protégé via `X-Pre-2FA-Token`) Prend `{ code: string }`. Valide `pre2faToken`. Vérifie le `code` (TOTP, OTP Email/SMS, Recovery). Si OK, génère Access/Refresh tokens, définit les cookies `refreshToken` (HttpOnly) et CSRF (`csrfSecret`, `XSRF-TOKEN`), renvoie `{ accessToken }`. Renvoie 401 (token invalide), 400 (code invalide/expiré).
    *   `POST /refresh`: (Protégé via Cookie `refreshToken` HttpOnly) Lit le cookie, valide le token (JWT, BDD, non révoqué, non expiré). Si OK, révoque l'ancien token en BDD, génère nouveau couple Access/Refresh, définit nouveau cookie `refreshToken`, met à jour cookies CSRF, renvoie `{ accessToken }`. Renvoie 401 si token invalide/manquant.
    *   `POST /logout`: (Protégé via Cookie `refreshToken` HttpOnly) Lit le cookie, révoque le token correspondant en BDD, efface les cookies `refreshToken` et CSRF côté client. Renvoie 200.
    *   `GET /mfa/totp/setup`: (Auth) Génère un nouveau secret TOTP et l'URI QR Code (Data URI). Renvoie `{ secret, qrCodeUri }`.
    *   `POST /mfa/totp/enable`: (Auth + CSRF) Prend `{ password, secret, token }`. Valide le mot de passe user, valide le token TOTP initial vs `secret`. Si OK, stocke le `secret` chiffré, active TOTP (`two_factor_method='totp'`), génère et stocke les hashs des codes de récupération, renvoie les codes de récupération en clair `{ message, recoveryCodes: [...] }`. Renvoie 401 (mauvais mdp), 400 (token TOTP invalide).
    *   `DELETE /mfa/totp/disable`: (Auth + CSRF) Prend `{ password }`. Valide le mot de passe. Supprime le secret TOTP, met `two_factor_method` à `null` (si c'était 'totp'), supprime les codes de récupération. Renvoie 200. Renvoie 401 (mauvais mdp).

*   **Utilisateurs (`/api/users`)**
    *   `POST /`: (Public) Création de compte. Prend `CreateUserDto`. Crée user inactif, génère token activation, envoie email activation. Renvoie `MeOutputDto` (201). Renvoie 409 si email/username existe, 400 si validation échoue.
    *   `POST /activate-account`: (Public) Prend `{ token: string }`. Valide token (hash, expiration), active user (`is_active`, `is_email_active`), supprime token. Renvoie `{ message, user: UserOutputDto }` (200). Renvoie 400 si token invalide/expiré.
    *   `POST /request-password-reset`: (Public) Prend `{ email: string }`. Génère/stocke token reset (hash), met `is_recovering=true`, envoie email avec token clair. Renvoie toujours 202.
    *   `POST /validate-reset-token`: (Public) Prend `{ token: string }`. Valide token (hash, expiration, `is_active`, `is_recovering`). Renvoie `{ message }` (200). Renvoie 400 si invalide.
    *   `POST /perform-password-reset`: (Public) Prend `{ token: string, newPassword: string }`. Valide token, met à jour mot de passe (hash), supprime token reset, met `is_recovering=false`, révoque refresh tokens. Renvoie `{ message }` (200). Renvoie 400 si token invalide ou mdp invalide.
    *   `GET /me`: (Auth) Récupère l'utilisateur connecté via `req.user`. Renvoie `MeOutputDto` (200).
    *   `GET /:id`: (Auth + `ensureSelf`) Récupère l'utilisateur par ID (uniquement soi-même). Renvoie `UserOutputDto` (200). Renvoie 403 si ID différent, 404 si user non trouvé.
    *   `PATCH /:id/profile`: (Auth + `ensureSelf` + CSRF) Prend `UpdateUserDto` (uniquement `username` actuellement). Met à jour le username. Renvoie `UserOutputDto` (200). Renvoie 409 si username pris, 400 si validation échoue.
    *   `PATCH /:id/password`: (Auth + `ensureSelf` + CSRF) Prend `{ currentPassword, newPassword }`. Valide `currentPassword`, met à jour mdp (hash), révoque refresh tokens. Renvoie `{ message }` (200). Renvoie 401 si `currentPassword` incorrect, 400 si validation `newPassword` échoue. *(Note: Bug connu, renvoie actuellement 401 même avec mdp correct)*.
    *   `PATCH /:id/email`: (Auth + `ensureSelf` + CSRF) Prend `{ newEmail, currentPassword }`. Valide `currentPassword`, vérifie unicité `newEmail`, met à jour email, met `is_email_active=false`, génère/stocke code vérification, envoie email vérification. Renvoie `{ message, user: MeOutputDto }` (200). Renvoie 401 si `currentPassword` incorrect, 409 si `newEmail` pris, 400 si validation `newEmail` échoue. *(Note: Bug connu, renvoie actuellement 401 même avec mdp correct)*.
    *   `PATCH /:id/profile-picture`: (Auth + `ensureSelf` + CSRF + `multer`) Prend fichier image dans champ `profilePicture`. Sauvegarde image via `FileService`, supprime ancienne, met à jour `profile_picture` en BDD. Renvoie `{ message, user: MeOutputDto }` (200). Renvoie 400 si pas de fichier ou type invalide.
    *   `DELETE /:id/profile-picture`: (Auth + `ensureSelf` + CSRF) Supprime fichier image via `FileService`, met `profile_picture` à `null`. Renvoie `{ message, user: MeOutputDto }` (200). Renvoie 404 si pas d'image à supprimer.
    *   `DELETE /:id`: (Auth + `ensureSelf` + CSRF) Prend `{ password }`. Valide `password`, révoque refresh tokens, supprime l'utilisateur (`destroy()`), envoie email confirmation. Renvoie 204 No Content. Renvoie 401 si `password` incorrect.
    *   `POST /:id/request-email-verification`: (Auth + `ensureSelf` + CSRF) Si email non actif, (ré)envoie code de vérification à l'email actuel. Renvoie `{ message }` (202).

*   **Établissements (`/api/establishments` et routes imbriquées)**
    *   `POST /api/establishments`: (Auth + CSRF) Prend `CreateEstablishmentDto`. Crée un nouvel établissement lié à `req.user.id`. Assigne rôle `ESTABLISHMENT_ADMIN`. Renvoie `AdminEstablishmentDto` (201). Renvoie 409 (SIRET), 400 (validation, pays invalide), 403 (si déjà propriétaire - logique à confirmer).
    *   `GET /api/establishments`: (Public) Liste les établissements **validés** (paginée). Prend `?page`, `?limit` en query params. Renvoie `{ data: [PublicEstablishmentOutputDto], pagination: {...} }` (200).
    *   `GET /api/establishments/:id`: (Public) Récupère détails d'un établissement **validé** par ID. Renvoie `PublicEstablishmentOutputDto` (200). Renvoie 404 si non trouvé ou non validé.
    *   `GET /api/establishments/:id/services`: (Public) Liste les services **actifs** d'un établissement **validé**. Renvoie `[PublicServiceOutputDto]` (200). Renvoie 404 si établissement non trouvé/validé.
    *   `GET /api/users/me/establishments`: (Auth + `requireRole('ESTABLISHMENT_ADMIN')`) Liste les établissements appartenant à l'utilisateur. Renvoie `[AdminEstablishmentDto]` (200).
    *   `GET /api/users/me/establishments/:establishmentId`: (Auth + `requireRole('ESTABLISHMENT_ADMIN')` + `ensureOwnsEstablishment`) Récupère les détails complets d'un établissement possédé. Renvoie `AdminEstablishmentDto` (200). Renvoie 404 si non trouvé/possédé.
    *   `PUT /api/users/me/establishments/:establishmentId`: (Auth + Admin + `ensureOwnsEstablishment` + CSRF) Prend `UpdateEstablishmentDto`. Met à jour l'établissement possédé. Renvoie `AdminEstablishmentDto` (200). Renvoie 404, 400.
    *   `POST /api/users/me/establishments/:establishmentId/request-validation`: (Auth + Admin + `ensureOwnsEstablishment` + CSRF) Déclenche (simule) la validation SIRET. Met `is_validated=true`. Renvoie `{ message, establishment: AdminEstablishmentDto }` (200). Renvoie 404.
    *   `PATCH /api/users/me/establishments/:establishmentId/profile-picture`: (Auth + Admin + `ensureOwnsEstablishment` + CSRF + `multer`) Prend fichier image `profilePicture`. Met à jour l'image. Renvoie `{ message, establishment: AdminEstablishmentDto }` (200). Renvoie 404, 400.
    *   `DELETE /api/users/me/establishments/:establishmentId/profile-picture`: (Auth + Admin + `ensureOwnsEstablishment` + CSRF) Supprime l'image. Renvoie `{ message, establishment: AdminEstablishmentDto }` (200). Renvoie 404.
    *   Routes imbriquées sous `/api/users/me/establishments/:establishmentId/` pour gérer les `services`, `availability/rules`, `availability/overrides`, `bookings` de cet établissement spécifique (voir sections suivantes). Protégées par Auth+Admin+`ensureOwnsEstablishment`.

*   **Services (`/api/services` et routes imbriquées)**
    *   `POST /api/users/me/establishments/:establishmentId/services`: (Auth + Admin + `ensureOwnsEstablishment` + CSRF) Prend `CreateServiceDto`. Crée un service pour l'établissement spécifié. Renvoie `AdminServiceDto` (201). Renvoie 404, 400.
    *   `GET /api/users/me/establishments/:establishmentId/services`: (Auth + Admin + `ensureOwnsEstablishment`) Liste les services (actifs et inactifs) de l'établissement spécifié (paginé). Prend `?page`, `?limit`. Renvoie `{ data: [AdminServiceDto], pagination: {...} }` (200). Renvoie 404.
    *   `PUT /api/services/:serviceId`: (Auth + `requireServiceOwner` + CSRF) Prend `UpdateServiceDto`. Met à jour le service spécifié. Renvoie `AdminServiceDto` (200). Renvoie 403 (pas propriétaire), 404 (non trouvé), 400.
    *   `DELETE /api/services/:serviceId`: (Auth + `requireServiceOwner` + CSRF) Supprime le service spécifié. Renvoie 204. Renvoie 403, 404, 409 (réservations futures).
    *   `GET /api/services/:serviceId/availability`: (Public) Prend `?date=YYYY-MM-DD` en query param. Calcule et renvoie les créneaux disponibles `{ availableSlots: [ISOString] }` (200). Renvoie 404 (service non trouvé/inactif/établissement non validé), 400 (date invalide).

*   **Disponibilité (`/api/availability` et routes imbriquées)**
    *   `POST /api/users/me/establishments/:establishmentId/availability/rules`: (Auth + Admin + `ensureOwnsEstablishment` + CSRF) Prend `CreateAvailabilityRuleDto`. Crée une règle. Renvoie `AvailabilityRule` (201). Renvoie 404, 400, 409 (règle existe déjà pour ce jour).
    *   `GET /api/users/me/establishments/:establishmentId/availability/rules`: (Auth + Admin + `ensureOwnsEstablishment`) Liste les règles de l'établissement. Renvoie `[AvailabilityRule]` (200). Renvoie 404.
    *   `DELETE /api/availability/rules/:ruleId`: (Auth + `requireRuleOwner` + CSRF) Supprime la règle spécifiée. Renvoie 204. Renvoie 403, 404.
    *   `POST /api/users/me/establishments/:establishmentId/availability/overrides`: (Auth + Admin + `ensureOwnsEstablishment` + CSRF) Prend `CreateAvailabilityOverrideDto`. Crée un override. Renvoie `AvailabilityOverride` (201). Renvoie 404, 400.
    *   `GET /api/users/me/establishments/:establishmentId/availability/overrides`: (Auth + Admin + `ensureOwnsEstablishment`) Liste les overrides de l'établissement. Renvoie `[AvailabilityOverride]` (200). Renvoie 404.
    *   `PUT /api/availability/overrides/:overrideId`: (Auth + `requireOverrideOwner` + CSRF) Prend `UpdateAvailabilityOverrideDto`. Met à jour l'override. Renvoie `AvailabilityOverride` (200). Renvoie 403, 404, 400.
    *   `DELETE /api/availability/overrides/:overrideId`: (Auth + `requireOverrideOwner` + CSRF) Supprime l'override. Renvoie 204. Renvoie 403, 404.

*   **Réservations (`/api/bookings` et routes imbriquées)**
    *   `POST /api/bookings`: (Auth + CSRF) Prend `CreateBookingDto` (`serviceId`, `startDatetime`, `userNotes`). Vérifie disponibilité (transaction), crée la réservation (statut `CONFIRMED`). Renvoie `Booking` (201). Renvoie 404 (service), 409 (conflit), 400 (validation, date passée).
    *   `GET /api/users/me/bookings`: (Auth) Liste les réservations du client connecté (paginée). Prend `?page`, `?limit`, filtres potentiels. Renvoie `{ data: [Booking], pagination: {...} }` (200).
    *   `GET /api/users/me/establishments/:establishmentId/bookings`: (Auth + Admin + `ensureOwnsEstablishment`) Liste les réservations de l'établissement spécifié (paginée). Prend `?page`, `?limit`, filtres potentiels. Renvoie `{ data: [Booking], pagination: {...} }` (200). Renvoie 404.
    *   `GET /api/bookings/:bookingId`: (Auth + `ensureBookingOwnerOrAdmin`) Récupère les détails d'une réservation spécifique. Renvoie `Booking` (200). Renvoie 404 (non trouvé ou permission refusée).
    *   `PATCH /api/bookings/:bookingId/cancel`: (Auth + CSRF) Annule la réservation si l'utilisateur connecté est le client et si la fenêtre d'annulation est respectée. Met statut à `CANCELLED_BY_USER`. Renvoie `Booking` (200). Renvoie 403 (pas propriétaire, délai dépassé), 404, 400 (statut invalide).
    *   `PATCH /api/bookings/:bookingId`: (Auth + `requireRole('ESTABLISHMENT_ADMIN')` + CSRF) Prend `UpdateBookingStatusDto` (`status`, `establishmentNotes`). Met à jour le statut de la réservation par l'admin propriétaire de l'établissement (vérifie transition valide). Renvoie `Booking` (200). Renvoie 403 (pas admin ou pas propriétaire), 404, 400 (validation, transition invalide).

**6. Configuration Essentielle (`.env`)**

Un fichier `.env` à la racine du projet backend est nécessaire. Il doit contenir les variables suivantes (liste non exhaustive, vérifier le code pour d'autres usages) :

*   **Base de Données (Sequelize/MySQL):**
    *   `DB_HOST`: Hôte de la base de données (ex: `localhost`)
    *   `DB_PORT`: Port (ex: `3306`)
    *   `DB_USERNAME`: Nom d'utilisateur BDD
    *   `DB_PASSWORD`: Mot de passe BDD
    *   `DB_NAME`: Nom de la base de données
    *   `DB_DIALECT`: Dialecte Sequelize (ex: `mysql`)
*   **Secrets JWT/Cookie:**
    *   `JWT_SECRET`: Chaîne longue et aléatoire pour signer les JWT Access/Refresh/Pre2FA.
    *   `COOKIE_SECRET`: Chaîne longue et aléatoire pour signer les cookies (`csrfSecret`).
    *   `ENCRYPTION_KEY`: **Clé hexadécimale de 32 octets (64 caractères hex)** pour chiffrer/déchiffrer les secrets TOTP (AES-256-GCM). **TRÈS IMPORTANT.**
*   **Expiration JWT/Tokens:**
    *   `JWT_ACCESS_EXPIRATION_SECONDS`: (ex: `900` pour 15 min)
    *   `JWT_REFRESH_EXPIRATION_SECONDS`: (ex: `604800` pour 7 jours)
    *   `JWT_PRE_2FA_EXPIRATION_SECONDS`: (ex: `600` pour 10 min)
    *   `ACTIVATION_TOKEN_EXPIRATION_HOURS`: (ex: `24`)
    *   `RESET_TOKEN_EXPIRATION_MINUTES`: (ex: `60`)
    *   `OTP_EXPIRATION_MINUTES`: (ex: `10`)
*   **Configuration Email (Nodemailer):**
    *   `MAILER_HOST`: Hôte SMTP (ex: `smtp.example.com`)
    *   `MAILER_PORT`: Port SMTP (ex: `587` ou `465`)
    *   `MAILER_USER`: Utilisateur SMTP
    *   `MAILER_PASSWORD`: Mot de passe SMTP
    *   `MAILER_DEFAULT_FROM`: Adresse email expéditeur (ex: `noreply@myapp.com`)
*   **URLs Application:**
    *   `FRONTEND_URL`: URL de base de l'application frontend (pour les liens dans les emails).
    *   `APP_BASE_URL`: URL de base du backend (utilisée pour construire les URL absolues des images si nécessaire).
*   **Configuration Application:**
    *   `APP_NAME`: Nom de l'application (utilisé dans les emails, issuer TOTP).
    *   `NODE_ENV`: Environnement (`development`, `production`, `test`).
    *   `PORT`: Port d'écoute du serveur backend (ex: `3001`).
    *   `CORS_ALLOWED_ORIGINS`: Liste d'origines autorisées par CORS, séparées par des virgules (ex: `http://localhost:3000,https://myapp.com`).
*   **Autres (Optionnel):**
    *   `SALT_ROUNDS`: (Utilisé par bcrypt, défaut 10 si non défini).
    *   `SUPER_ADMIN_NAME`: (Nom du rôle Super Admin, défaut `SUPER_ADMIN` si non défini).
    *   `CSRF_SECRET_COOKIE_NAME`, `CSRF_TOKEN_COOKIE_NAME`, `CSRF_HEADER_NAME`: (Noms pour cookies/header CSRF, valeurs par défaut si non définis).
    *   `CANCELLATION_WINDOW_HOURS`: (Délai annulation réservation, défaut 24 si non défini).

**7. Exécution du Projet**

1.  **Installation :** `npm install` (ou `yarn`, `pnpm`)
2.  **Configuration :** Créer un fichier `.env` à la racine basé sur `.env.example` (s'il existe) et remplir les variables requises.
3.  **Base de Données :** S'assurer que le serveur MySQL est démarré et accessible. Créer la base de données si elle n'existe pas.
4.  **Migrations :** Exécuter `npm run migrate` (ou `npx sequelize-cli db:migrate`).
5.  **(Optionnel) Seeders :** Exécuter `npm run seed:all` (ou `npx sequelize-cli db:seed:all`) pour peupler la BDD avec des données initiales (rôles, pays, etc.).
6.  **Lancement (Développement) :** `npm run dev` (utilise `nodemon` pour redémarrer sur modification).
7.  **Build (Production) :** `npm run build` (utilise `tsc` pour compiler en JS dans `dist/`).
8.  **Lancement (Production) :** `npm start` (exécute `node dist/server.js`).
9.  **Tests :** `npm test` (exécute Jest).

**8. Gestion des Erreurs**

*   Les erreurs opérationnelles attendues (ex: Ressource non trouvée, Données invalides, Conflit, Permission refusée) sont gérées en lançant des instances de classes d'erreurs personnalisées héritant de `AppError` (définies dans `src/errors/`). Ces erreurs contiennent un message clair et un `statusCode` HTTP approprié.
*   Les erreurs de validation des DTOs sont automatiquement gérées via les schémas Zod et interceptées.
*   Le middleware `errorMiddleware` (placé en dernier dans `server.ts`) intercepte toutes les erreurs passées via `next(error)`.
*   Il **logue l'erreur** (surtout les erreurs serveur 500 ou inattendues).
*   Il détermine le `statusCode` et le message de réponse :
    *   Si `instanceof AppError`, utilise `error.statusCode` et `error.message`.
    *   Si `instanceof ZodError`, renvoie 400 avec un message générique et un tableau `errors` détaillé.
    *   Sinon, renvoie 500 avec un message générique 'Internal Server Error'.
*   Il envoie une **réponse JSON standardisée** au client, typiquement :
    ```json
    {
        "status": "error",
        "name": "ErrorName", // Nom de l'erreur (ex: UserNotFoundError)
        "message": "Error description.",
        "errors": [] // Tableau détaillé pour ZodErrors
    }
    ```

**9. Considérations Futures / TODOs**

*   **Bug Connu :** La validation du mot de passe actuel (`currentPassword`) échoue systématiquement sur les routes `PATCH /api/users/:id/password` et `PATCH /api/users/:id/email`, renvoyant 401 au lieu de permettre l'opération. Nécessite une investigation plus poussée (potentiellement liée au hashage/comparaison dans ce contexte spécifique).
*   **Couverture des Tests :** Le fichier `tests/routes/user.routes.test.ts` a plusieurs tests marqués `TODO` pour des fonctionnalités importantes (profil, suppression, image, vérif email post-change). Il faudrait les implémenter. Le fichier `auth.routes.test.ts` a des tests marqués `pending` qui devraient être décommentés une fois le bug `validatePassword` résolu.
*   **Implémentation SMS Réelle :** Remplacer le `console.log` simulé par une intégration avec un vrai service SMS (Twilio, Vonage, etc.) si la 2FA par SMS est souhaitée.
*   **Validation SIRET Réelle :** Implémenter l'appel à une API SIRENE pour la validation automatique des établissements.
*   **Stockage Fichiers Cloud :** Remplacer le stockage local des images par un service Cloud (AWS S3, Google Cloud Storage, Cloudinary) pour la scalabilité, la persistance et la redondance en production.
*   **Paiements :** Implémenter l'intégration avec une passerelle de paiement (Stripe, etc.) pour gérer le `PaymentStatus` des réservations.
*   **Gestion Fine des Permissions :** Affiner la logique de permission au-delà des rôles de base et de l'ownership simple si nécessaire (ex: permissions spécifiques par action).
*   **Logging Avancé :** Utiliser une bibliothèque de logging dédiée (Winston, Pino) pour structurer les logs, gérer différents niveaux (debug, info, warn, error) et potentiellement les envoyer vers des systèmes externes (ELK, Datadog...).
*   **Tâches Asynchrones :** Pour les opérations potentiellement longues (envoi massif d'emails/SMS), utiliser une file d'attente (BullMQ, RabbitMQ) pour ne pas bloquer la réponse API.
*   **Documentation API :** Générer automatiquement une documentation OpenAPI (Swagger) à partir du code (via des commentaires JSDoc/TSDoc ou des outils dédiés) pour faciliter l'utilisation par le frontend ou des tiers.
*   **Sécurité Avancée :** Audit de sécurité régulier, configuration plus stricte de `helmet` (HSTS, CSP), validation plus poussée des entrées, protection contre les attaques XSS et NoSQL/SQL Injection (Sequelize aide déjà pour SQLi).

---