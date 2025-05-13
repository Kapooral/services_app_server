## 1. Introduction et Objectifs du Module "Gestion des Membres"

### 1.1. Vue d'Ensemble de la Fonctionnalité

Le module "Gestion des Membres" est une composante essentielle de l'application d'administration "APP_NAME". Il offre aux propriétaires et administrateurs d'établissements les outils nécessaires pour construire, organiser et gérer leurs équipes directement au sein de la plateforme. Cette fonctionnalité permet d'étendre les capacités de l'application au-delà du simple utilisateur administrateur unique, en intégrant des collaborateurs (Staff) qui peuvent participer activement à la gestion des opérations de l'établissement.

#### 1.1.1. Positionnement dans l'Application Globale

Au sein de l'écosystème "APP_NAME", la gestion des membres s'articule de manière transversale avec plusieurs autres modules clés :

*   **Gestion des Services :** Les membres du personnel peuvent être assignés à des services spécifiques, ce qui influence qui peut réaliser une prestation donnée.
*   **Gestion des Réservations :** Les réservations peuvent être assignées à des membres spécifiques du Staff. Les permissions des membres Staff sont également définies pour qu'ils ne puissent consulter et potentiellement modifier que les réservations qui leur sont attribuées, ou celles de l'établissement selon leur rôle précis (non encore pleinement implémenté mais prévu).
*   **Gestion du Planning et des Disponibilités :** La disponibilité individuelle de chaque membre du Staff (modélisée via des règles `rrule`) est un facteur déterminant dans le calcul des créneaux de réservation disponibles pour les services auxquels ils sont assignés. Ce module est donc fondamental pour une gestion précise du planning.
*   **Authentification et Autorisation :** La gestion des membres introduit de nouveaux rôles (ex: `STAFF`) avec des permissions spécifiques, nécessitant une extension du système d'autorisation pour contrôler l'accès aux différentes fonctionnalités et données de l'application.

En résumé, ce module transforme l'application d'un outil de gestion individuelle en une plateforme collaborative pour les équipes des établissements.

#### 1.1.2. Bénéfices pour les Utilisateurs

L'introduction de la gestion des membres apporte une valeur ajoutée significative aux différents utilisateurs de la plateforme :

*   **Pour l'Administrateur de l'Établissement (Propriétaire/Gérant) :**
    *   **Délégation des Tâches :** Permet de répartir la charge de travail en assignant des responsabilités spécifiques aux membres du personnel (ex: gestion de leurs propres réservations, mise à jour de leurs disponibilités).
    *   **Contrôle d'Accès Affiné :** Offre la possibilité de définir des permissions précises pour chaque membre, assurant que seul le personnel autorisé accède à certaines informations ou fonctionnalités.
    *   **Meilleure Organisation :** Facilite la structuration de l'équipe au sein de la plateforme, avec une vue claire de qui fait quoi.
    *   **Optimisation du Planning :** En intégrant les disponibilités individuelles des membres, l'administrateur peut optimiser l'utilisation des ressources et la planification des services.
    *   **Collaboration Simplifiée :** Centralise la gestion de l'équipe et des opérations associées au sein d'un unique outil.

*   **Pour le Membre de l'Établissement (Staff) :**
    *   **Accès Personnalisé :** Fournit un accès à la plateforme avec une vue et des fonctionnalités adaptées à son rôle (ex: voir ses réservations assignées, gérer son planning).
    *   **Autonomie :** Permet (selon la configuration) de gérer de manière autonome certains aspects de son travail, comme ses propres disponibilités, réduisant la dépendance envers l'administrateur.
    *   **Clarté des Tâches :** Offre une vision claire des réservations ou tâches qui lui sont attribuées.
    *   **Intégration Facilitée :** Le processus d'invitation et d'acceptation simplifie l'intégration de nouveaux collaborateurs à la plateforme de l'établissement.

### 1.2. Buts et Cas d'Usage Principaux

Cette section détaille les objectifs et les actions clés que les différents types d'utilisateurs peuvent accomplir grâce au module de gestion des membres. Elle met en lumière la valeur apportée par ces fonctionnalités dans le contexte de l'administration d'un établissement.

#### 1.2.1. Pour l'Administrateur de l'Établissement (Propriétaire/Gérant)

L'administrateur dispose d'un contrôle complet sur la composition et les droits de son équipe au sein de la plateforme.

##### 1.2.1.1. Inviter des collaborateurs (Staff)
*   **Objectif :** Intégrer de nouveaux membres du personnel à la plateforme de l'établissement pour leur donner accès aux outils de gestion.
*   **Actions Principales :**
    *   Envoyer une invitation par e-mail à un futur membre.
    *   Spécifier le rôle initial du membre (actuellement, 'STAFF').
*   **Valeur Ajoutée :** Permet d'étendre l'équipe de manière sécurisée (vérification par e-mail) et contrôlée, initiant le processus d'intégration du collaborateur.

##### 1.2.1.2. Gérer les rôles et statuts des membres
*   **Objectif :** Définir et ajuster les niveaux d'accès et l'état d'activité des membres au sein de l'établissement.
*   **Actions Principales :**
    *   Consulter la liste des membres de l'établissement avec leur rôle et statut actuels.
    *   Modifier le rôle d'un membre (ex: promouvoir un 'STAFF' en 'ADMIN' ou inversement, sous conditions de sécurité).
    *   Modifier le statut d'un membre (ex: passer un membre de 'ACTIVE' à 'INACTIVE' s'il est temporairement absent, ou le réactiver).
*   **Valeur Ajoutée :** Offre la flexibilité nécessaire pour adapter les permissions et l'activité des membres en fonction de l'évolution de l'équipe et des besoins opérationnels, tout en protégeant l'intégrité de l'administration (ex: ne pas pouvoir supprimer le dernier admin).

##### 1.2.1.3. Retirer des membres de l'établissement
*   **Objectif :** Révoquer l'accès d'un collaborateur à la plateforme de l'établissement lorsqu'il ne fait plus partie de l'équipe.
*   **Actions Principales :**
    *   Supprimer un membership existant (qu'il soit 'ACTIVE', 'INACTIVE').
    *   Révoquer une invitation 'PENDING' qui n'a pas encore été acceptée.
*   **Valeur Ajoutée :** Assure la sécurité en retirant les accès aux anciens collaborateurs et maintient une liste de membres à jour. Des protections empêchent la suppression accidentelle du dernier administrateur.

##### 1.2.1.4. Assigner des membres à des services
*   **Objectif :** Spécifier quels membres du personnel sont qualifiés ou désignés pour réaliser certains services proposés par l'établissement.
*   **Actions Principales (dans le contexte de la gestion des membres) :**
    *   Ce module "Gestion des Membres" crée les entités `Membership` qui sont les prérequis pour l'assignation.
    *   L'action d'assigner un `Membership` spécifique à un `Service` est typiquement gérée dans le module de "Gestion des Services".
*   **Valeur Ajoutée :** La création de membres est une étape indispensable pour pouvoir ensuite les lier aux services, ce qui permet un calcul de disponibilité plus précis et une meilleure organisation des prestations.

##### 1.2.1.5. Gérer les disponibilités spécifiques des membres
*   **Objectif :** Définir les plages horaires de travail ou d'absence pour chaque membre du personnel, permettant un calcul précis des créneaux de réservation.
*   **Actions Principales (dans le contexte de la gestion des membres) :**
    *   L'administrateur peut accéder à l'interface de gestion des disponibilités pour n'importe quel membre de son établissement.
    *   Créer, modifier ou supprimer des règles de disponibilité (basées sur `rrule` pour la flexibilité) pour un membre spécifique.
*   **Valeur Ajoutée :** Permet une gestion fine et centralisée des emplois du temps de l'équipe, essentielle pour le bon fonctionnement du système de réservation, en particulier si des services sont assignés à des membres spécifiques.

#### 1.2.2. Pour le Membre (Staff)

Les membres du personnel (Staff) bénéficient d'un accès personnalisé à la plateforme pour les aider dans leurs tâches quotidiennes.

##### 1.2.2.1. Accepter une invitation
*   **Objectif :** Rejoindre officiellement l'établissement sur la plateforme après avoir été invité.
*   **Actions Principales :**
    *   Cliquer sur le lien d'invitation reçu par e-mail.
    *   S'inscrire sur la plateforme (si nouvel utilisateur) ou se connecter (si compte existant).
    *   Confirmer l'acceptation de l'invitation pour lier son compte au membership de l'établissement.
*   **Valeur Ajoutée :** Processus d'intégration simple et sécurisé, donnant au membre le contrôle sur la création/liaison de son compte.

##### 1.2.2.2. Accéder aux informations et fonctionnalités autorisées de l'établissement
*   **Objectif :** Visualiser et interagir avec les parties de l'application pertinentes pour son rôle.
*   **Actions Principales :**
    *   Consulter son propre profil de membership au sein de l'établissement.
    *   Voir les réservations qui lui sont assignées (selon les permissions futures).
    *   Accéder à son planning et à ses disponibilités.
    *   Consulter les informations générales de l'établissement et des services.
*   **Valeur Ajoutée :** Fournit au Staff les outils nécessaires pour son travail sans lui donner accès à des informations ou fonctionnalités sensibles réservées aux administrateurs.

##### 1.2.2.3. Gérer ses propres disponibilités (si la fonctionnalité est activée)
*   **Objectif :** Permettre au membre de mettre à jour ses propres plages de travail ou d'absence, offrant plus d'autonomie.
*   **Actions Principales (dans le contexte de la gestion des membres) :**
    *   Accéder à une interface dédiée pour gérer ses règles de disponibilité personnelles (`StaffAvailability`).
    *   Créer, modifier ou supprimer ses propres règles `rrule`.
*   **Valeur Ajoutée :** Augmente la flexibilité et la réactivité pour la gestion du planning, en permettant aux membres de refléter rapidement leurs changements de disponibilité, sous réserve de la validation ou des politiques de l'établissement.

#### 1.2.3. Pour l'Utilisateur Invité (avant acceptation)

L'utilisateur qui reçoit une invitation a un rôle transitoire avant de devenir un membre actif.

##### 1.2.3.1. S'inscrire ou se connecter pour accepter une invitation
*   **Objectif :** Répondre à une invitation pour rejoindre un établissement.
*   **Actions Principales :**
    *   Suivre le lien d'invitation.
    *   Si l'utilisateur n'a pas de compte sur "APP_NAME", il peut en créer un via un formulaire d'inscription simplifié (email pré-rempli).
    *   Si l'utilisateur a déjà un compte "APP_NAME" (avec le même email que l'invitation ou un autre), il peut se connecter à son compte existant pour ensuite lier l'invitation.
*   **Valeur Ajoutée :** Offre un chemin clair et sécurisé pour les nouveaux utilisateurs et les utilisateurs existants pour rejoindre un établissement, en s'assurant que le bon compte utilisateur est lié à l'invitation.

## 2. Architecture Générale et Flux Utilisateurs Clés

Cette section décrit les principaux éléments techniques qui constituent le module "Gestion des Membres". Elle offre une vue d'ensemble des modèles de données, des services backend, des endpoints API et des middlewares qui collaborent pour fournir les fonctionnalités décrites.

### 2.1. Composants Techniques Majeurs Impliqués

#### 2.1.1. Modèles de Données (Référence Section 3)

La persistance des données relatives aux membres et à leurs interactions est assurée par plusieurs modèles Sequelize. Le tableau suivant liste les modèles clés et leur rôle principal dans ce module.

| Modèle                     | Rôle Principal dans la Gestion des Membres                                                                    | Référence Section |
|----------------------------|---------------------------------------------------------------------------------------------------------------|-------------------|
| `User`                     | Représente l'utilisateur global, authentifiable, qui peut devenir un membre.                                    | 3.1               |
| `Establishment`            | Représente l'entité à laquelle les membres sont rattachés.                                                     | 3.2               |
| `Membership`               | Table pivot centrale liant `User` et `Establishment`, définissant le rôle, le statut et gérant les invitations. | 3.3               |
| `ServiceMemberAssignment`  | Table de jonction pour l'association Many-to-Many entre `Membership` (Staff) et `Service`.                    | 3.4               |
| `StaffAvailability`        | Stocke les règles de disponibilité (`rrule`) spécifiques à chaque `Membership` (Staff).                       | 3.5               |
| `Service`                  | Représente les prestations offertes, auxquelles des membres peuvent être assignés.                              | 3.6               |
| `Booking`                  | Représente les réservations, qui peuvent être assignées à un `Membership` (Staff).                            | 3.7               |
| `Role` / `UserRole`        | Utilisés par le modèle `User` pour la gestion globale des rôles (ex: `ESTABLISHMENT_ADMIN`).                    | (Contexte)        |

#### 2.1.2. Services Backend (Référence Section 4)

La logique métier, les validations complexes et les interactions entre les modèles sont encapsulées dans des services dédiés.

| Service                    | Rôle Principal dans la Gestion des Membres                                                                                                | Référence Section |
|----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|-------------------|
| `MembershipService.ts`     | Gère la logique CRUD complète pour les `Membership` (invitations, activations, mises à jour de statut/rôle, suppression, listage).        | 4.1               |
| `AuthService.ts`           | Gère le flux d'inscription spécifique via une invitation (`registerViaInvitation`) et la création de session utilisateur.                    | 4.2               |
| `UserService.ts`           | Invoqué pour la création de l'entité `User` lors d'une inscription via invitation.                                                       | 4.3               |
| `NotificationService.ts`   | Responsable de l'envoi des emails transactionnels (invitation, confirmation de membre rejoint).                                            | 4.4               |
| `AvailabilityService.ts`   | Modifié pour prendre en compte les `StaffAvailability` (règles `rrule`) lors du calcul des créneaux disponibles pour un membre spécifique. | 4.5               |

#### 2.1.3. Endpoints API (Référence Section 5)

L'interface de programmation applicative (API) expose les fonctionnalités de gestion des membres via plusieurs groupes de routes RESTful.

| Préfixe de Route                                              | Fonction Globale                                                                 | Référence Section |
|---------------------------------------------------------------|----------------------------------------------------------------------------------|-------------------|
| `POST /api/users/me/establishments/:establishmentId/memberships/invite` | Initiation de l'invitation d'un membre par un admin.                           | 5.4.1.1           |
| `GET /api/memberships/invitation-details/:token`              | Validation publique d'un token d'invitation.                                     | 5.4.1.2           |
| `POST /api/auth/register-via-invitation`                      | Inscription d'un nouvel utilisateur et acceptation d'une invitation.             | 5.4.1.3           |
| `POST /api/memberships/activate-after-login`                  | Liaison d'une invitation à un utilisateur existant après sa connexion.           | 5.4.1.4           |
| `GET /api/users/me/establishments/:establishmentId/memberships` | Listage des membres d'un établissement par un admin.                             | 5.4.2.1           |
| `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId` | Consultation des détails d'un membership spécifique.                           | 5.4.2.2           |
| `PATCH /api/memberships/:membershipId`                        | Modification du statut ou du rôle d'un membership par un admin.                  | 5.4.2.3           |
| `DELETE /api/memberships/:membershipId`                       | Suppression d'un membership (retrait d'un membre) par un admin.                  | 5.4.2.4           |
| `/api/memberships/:membershipId/availabilities/...`           | Endpoints CRUD pour la gestion des disponibilités spécifiques d'un membre Staff. | 5.4.3             |

#### 2.1.4. Middlewares d'Authentification et d'Autorisation

La sécurité et le contrôle d'accès aux fonctionnalités de gestion des membres sont assurés par un ensemble de middlewares.

| Middleware                        | Rôle Principal dans la Sécurisation de la Gestion des Membres                                                                    |
|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| `requireAuth`                     | Assure que l'utilisateur effectuant la requête est authentifié (possession d'un JWT valide).                                   |
| `verifyCsrfToken`                 | Protège contre les attaques CSRF pour les requêtes modifiant l'état (POST, PATCH, DELETE).                                      |
| `ensureMembership(requiredRoles)` | Vérifie que l'utilisateur authentifié est un membre actif de l'établissement spécifié dans l'URL et possède l'un des rôles requis. |
| `ensureAdminOrSelfForMembership`  | Autorise l'accès si l'utilisateur est un Admin de l'établissement du membership cible OU s'il est le propriétaire de ce membership. |
| `ensureAdminOfTargetMembership`   | Autorise l'accès si l'utilisateur est un Admin de l'établissement auquel appartient le membership cible.                         |
| `ensureMembershipAccess`          | (Pour les disponibilités Staff) Autorise l'accès si l'utilisateur est Admin de l'établissement OU le membre Staff concerné lui-même. |


### 2.2. Flux d'Invitation et d'Acceptation d'un Membre

Ce flux décrit le processus complet par lequel un administrateur d'établissement invite un nouvel utilisateur à rejoindre son équipe en tant que membre (Staff), et comment cet utilisateur invité accepte l'invitation, que ce soit en créant un nouveau compte sur la plateforme ou en utilisant un compte existant.

#### 2.2.1. Diagramme de Séquence Détaillé (Admin invite -> Email -> Utilisateur accepte/s'inscrit -> Activation)

```mermaid
sequenceDiagram
    actor AdminUI
    participant APIBackend as API Backend (Contrôleurs)
    participant MembershipServ as MembershipService
    participant AuthServ as AuthService
    participant UserServ as UserService
    participant NotifServ as NotificationService
    participant Database as Base de Données
    actor UserInvitedUI as Utilisateur Invité (UI)
    participant EmailService as Service Email

    AdminUI->>+APIBackend: POST /establishments/:id/memberships/invite (InviteMemberDto)
    APIBackend->>+MembershipServ: inviteMember(actor, estabId, dto)
    MembershipServ->>+Database: Vérifier existance User/Membership
    Database-->>-MembershipServ: Résultat vérification
    alt Email déjà membre/invité
        MembershipServ-->>APIBackend: Erreur 409 (UserAlreadyMemberError)
        APIBackend-->>-AdminUI: Réponse 409
    else Email disponible
        MembershipServ->>MembershipServ: Générer token & hash
        MembershipServ->>+Database: Créer Membership (PENDING, tokenHash, expiresAt)
        Database-->>-MembershipServ: Membership PENDING créé
        MembershipServ->>+NotifServ: sendInvitationEmail(email, plainToken, estabName, inviterName)
        NotifServ->>+EmailService: Envoyer email d'invitation
        EmailService-->>-NotifServ: Email envoyé (ou échec loggué)
        NotifServ-->>-MembershipServ: (Retour silencieux ou log)
        MembershipServ-->>APIBackend: Membership PENDING (avec plainToken en test)
        APIBackend-->>-AdminUI: Réponse 201 (Invitation envoyée)
    end

    UserInvitedUI->>+EmailService: Ouvre email, clique sur lien (token)
    EmailService-->>-UserInvitedUI: Redirige vers /accept-invitation/:token

    UserInvitedUI->>+APIBackend: GET /memberships/invitation-details/:token
    APIBackend->>+MembershipServ: getInvitationDetails(plainToken)
    MembershipServ->>+Database: Vérifier token (hash, PENDING, non expiré)
    Database-->>-MembershipServ: Résultat (invitedEmail ou null)
    alt Token valide
        MembershipServ-->>APIBackend: { invitedEmail }
        APIBackend-->>-UserInvitedUI: Réponse 200 (invitedEmail)
        UserInvitedUI->>UserInvitedUI: Affiche formulaire (email pré-rempli) ou lien connexion
    else Token invalide/expiré
        MembershipServ-->>APIBackend: Erreur 404 (InvitationTokenInvalidError)
        APIBackend-->>-UserInvitedUI: Réponse 404
    end

    opt Cas 1: Inscription Nouvel Utilisateur
        UserInvitedUI->>+APIBackend: POST /auth/register-via-invitation (RegisterViaInvitationDto avec token)
        APIBackend->>+AuthServ: registerViaInvitation(dto)
        AuthServ->>+MembershipServ: getInvitationDetails(plainToken)
        MembershipServ-->>-AuthServ: { invitedEmail } (Validation interne du token)
        AuthServ->>+UserServ: createUser(username, password, invitedEmail)
        UserServ->>+Database: Créer User
        Database-->>-UserServ: User créé
        UserServ-->>-AuthServ: Nouveau User
        AuthServ->>+MembershipServ: activateByToken(plainToken, newUserId)
        MembershipServ->>+Database: Update Membership (status=ACTIVE, userId, nettoie token)
        Database-->>-MembershipServ: Membership activé
        MembershipServ-->>-AuthServ: Membership activé
        AuthServ->>AuthServ: Générer tokens JWT (session)
        AuthServ->>+MembershipServ: notifyAdminsMemberJoined(activatedMembership)
        MembershipServ-->>NotifServ: (Appel interne)
        NotifServ-->>EmailService: (Envoi email admin)
        AuthServ-->>APIBackend: { tokens, membership }
        APIBackend-->>-UserInvitedUI: Réponse 201 (Session créée, cookies)
    end

    opt Cas 2: Connexion Utilisateur Existant
        UserInvitedUI->>UserInvitedUI: Stocke token, va vers /login
        UserInvitedUI->>+APIBackend: POST /auth/login/initiate ... /verify-code
        APIBackend-->>-UserInvitedUI: Réponse 200 (Session créée, cookies)
        UserInvitedUI->>+APIBackend: POST /memberships/activate-after-login (ActivateMembershipDto avec token)
        APIBackend->>+MembershipServ: activateByToken(plainToken, loggedInUserId)
        MembershipServ->>+Database: Vérifier token, email user vs invitedEmail
        MembershipServ->>+Database: Update Membership (status=ACTIVE, userId, nettoie token)
        Database-->>-MembershipServ: Membership activé
        MembershipServ->>+MembershipServ: notifyAdminsMemberJoined(activatedMembership)
        MembershipServ-->>NotifServ: (Appel interne)
        NotifServ-->>EmailService: (Envoi email admin)
        MembershipServ-->>APIBackend: Membership activé
        APIBackend-->>-UserInvitedUI: Réponse 200 (Invitation liée)
    end
```

#### 2.2.2. Étapes Clés et Interactions Techniques

Le processus d'invitation et d'acceptation se décompose en plusieurs étapes distinctes, impliquant des interactions entre l'interface utilisateur de l'administrateur, l'API backend, les services métier, la base de données, et l'interface de l'utilisateur invité.

##### 2.2.2.1. Initiation de l'Invitation par l'Admin

| Action de l'Admin (UI)                               | Composant Backend Principal (Contrôleur -> Service)                     | Données Transmises / Résultat Intermédiaire                                                                                                                               |
|------------------------------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Saisit l'email de l'invité et sélectionne le rôle 'STAFF'. Soumet le formulaire d'invitation. | `EstablishmentController.inviteMember` -> `MembershipService.inviteMember` | Requête `POST /api/users/me/establishments/:establishmentId/memberships/invite` avec `InviteMemberDto { email, role }`. Middleware `ensureMembership(['ADMIN'])` vérifie l'autorisation. |
|                                                      | `MembershipService.inviteMember`                                          | Vérifie si l'email est déjà membre/invité. Si non, génère un token d'invitation unique et son hash. Calcule une date d'expiration (ex: 7 jours).                       |
|                                                      | `MembershipService.inviteMember` -> `db.Membership.create`                | Crée un nouvel enregistrement `Membership` avec `status='PENDING'`, `role='STAFF'`, `invitedEmail`, `invitationTokenHash`, `invitationTokenExpiresAt`. `userId` est `null`. |
|                                                      | `MembershipService.inviteMember` -> `NotificationService.sendInvitationEmail` | Le token *en clair* est passé au service de notification avec l'email de l'invité, le nom de l'établissement et le nom de l'invitant.                                |
| Réception de la confirmation dans l'UI (ou erreur).    | `EstablishmentController`                                               | Réponse API 201 Created avec `{ message, membership: MembershipDto }` (le `MembershipDto` a le statut PENDING).                                                        |

##### 2.2.2.2. Génération et Envoi de l'Email d'Invitation (avec Token)

| Action Système (Backend)                               | Composant Backend Principal                                           | Données Transmises / Résultat Intermédiaire                                                                                                                                  |
|--------------------------------------------------------|-----------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Un token unique est généré.                            | `MembershipService` (utilisant `crypto.randomBytes`)                  | Un token cryptographiquement sécurisé en clair (ex: 64 caractères hexadécimaux).                                                                                               |
| Le token est hashé.                                    | `MembershipService` (utilisant `crypto.createHash('sha256')...`)      | Un hash du token (ex: SHA256) est produit.                                                                                                                                     |
| Le hash et l'expiration sont stockés.                  | `db.Membership.create`                                                | `invitationTokenHash` et `invitationTokenExpiresAt` sont persistés en base de données avec le `Membership` en statut `PENDING`.                                                   |
| L'email est construit et envoyé.                       | `NotificationService.sendInvitationEmail`                             | Un email est envoyé à `invitedEmail` contenant un lien unique vers le frontend : `FRONTEND_URL/accept-invitation/:plainToken`. Le token *en clair* est utilisé dans le lien. |

##### 2.2.2.3. Gestion de la Page d'Acceptation Frontend

| Action de l'Utilisateur Invité (UI)                     | Composant Frontend                                                     | Composant Backend Principal (si appel API) / Données                                                                                                  |
|---------------------------------------------------------|------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| Reçoit l'email, clique sur le lien d'acceptation.        | Navigateur                                                             | Redirection vers `FRONTEND_URL/accept-invitation/:plainToken`.                                                                                        |
| La page charge.                                         | Page React `/accept-invitation/[token].tsx`                          | Extrait `plainToken` de l'URL.                                                                                                                        |
|                                                         |                                                                        | Appelle `GET /api/memberships/invitation-details/:plainToken` pour valider le token et récupérer l'email associé.                                       |
|                                                         | Page React                                                             | Si token valide (réponse 200 avec `InvitationDetailsDto { invitedEmail }`) : affiche un formulaire d'inscription avec l'email pré-rempli (non modifiable) et un lien vers `/login`. |
|                                                         |                                                                        | Si token invalide (réponse 404/400) : affiche un message d'erreur.                                                                                    |

##### 2.2.2.4. Scénario d'Inscription via Invitation

| Action de l'Utilisateur Invité (UI) / Backend           | Composant Principal Impliqué (Frontend/Backend)                        | Données Transmises / Résultat Intermédiaire                                                                                                                                                               |
|---------------------------------------------------------|------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Remplit le formulaire d'inscription (username, password), le `plainToken` est dans un champ caché. Soumet le formulaire. | Page React                                                             | Envoie `POST /api/auth/register-via-invitation` avec `RegisterViaInvitationDto { username, password, token }`.                                                                          |
| Le backend reçoit la requête.                           | `AuthController.registerViaInvitation` -> `AuthService.registerViaInvitation` |                                                                                                                                                                                                           |
| Validation du token et récupération de l'email invité.  | `AuthService` -> `MembershipService.getInvitationDetails`              | Vérifie le `plainToken`. Récupère `invitedEmail` associé.                                                                                                                                                   |
| Vérification d'unicité et création de l'utilisateur.    | `AuthService` -> `UserService.createUser`                              | Crée un nouvel enregistrement `User` avec `username`, `password` (hashé), et `invitedEmail`. L'utilisateur est marqué comme actif, et son email comme vérifié (car issu d'une invitation).            |
| Activation du Membership.                               | `AuthService` -> `MembershipService.activateByToken`                   | Met à jour l'enregistrement `Membership` correspondant : lie `userId` au nouveau `User`, change `status` à `ACTIVE`, met `joinedAt` à `NOW()`, nettoie les champs `invitationTokenHash`, `invitedEmail`. |
| Création de la session utilisateur.                     | `AuthService._generateAuthTokens`                                      | Génère `accessToken` et `refreshToken` JWT. Le `refreshToken` est stocké en base de données.                                                                                                           |
| Notification aux Admins.                                | `AuthService` -> `MembershipService.notifyAdminsMemberJoined`          | Le `MembershipService` trouve les admins de l'établissement et appelle `NotificationService` pour envoyer un email.                                                                                      |
| L'utilisateur est connecté et redirigé.                 | `AuthController` -> Frontend                                           | Réponse API 201 Created avec `{ accessToken, membership: MembershipDto }`. Des cookies (session, CSRF) sont positionnés. Le frontend gère la redirection (ex: tableau de bord).                      |

##### 2.2.2.5. Scénario d'Activation après Connexion d'un Utilisateur Existant

| Action de l'Utilisateur Invité (UI) / Backend           | Composant Principal Impliqué (Frontend/Backend)                        | Données Transmises / Résultat Intermédiaire                                                                                                                                                             |
|---------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Sur la page d'acceptation, clique sur "Se Connecter".   | Page React                                                             | Stocke le `plainToken` original (ex: dans Local Storage). Redirige vers `/login`.                                                                                                                         |
| Se connecte avec ses identifiants existants.            | Page Login -> `AuthController` (flux de connexion normal)              | L'utilisateur est authentifié, reçoit ses tokens JWT, et des cookies sont positionnés.                                                                                                                   |
| Le frontend détecte l'invitation en attente.            | Logique Frontend (ex: dans `AuthContext` ou au chargement de l'app)  | Récupère le `plainToken` depuis Local Storage. Si trouvé, envoie une requête.                                                                                                                             |
|                                                         | Frontend                                                               | Envoie `POST /api/memberships/activate-after-login` avec `ActivateMembershipDto { token }`. La requête est authentifiée (JWT).                                                                        |
| Le backend reçoit la requête.                           | `MembershipController.activateAfterLogin` -> `MembershipService.activateByToken` |                                                                                                                                                                                                         |
| Validation du token et de l'utilisateur connecté.       | `MembershipService.activateByToken`                                    | Valide le `plainToken`. Récupère l'ID et l'email de l'utilisateur connecté (via JWT). Vérifie que l'email de l'utilisateur connecté correspond à `invitedEmail` du `Membership` PENDING.                  |
| Activation du Membership.                               | `MembershipService.activateByToken`                                    | Met à jour l'enregistrement `Membership` : lie `userId` à l'utilisateur connecté, change `status` à `ACTIVE`, met `joinedAt` à `NOW()`, nettoie les champs token/email.                                |
| Notification aux Admins.                                | `MembershipService.notifyAdminsMemberJoined`                           | Le `MembershipService` trouve les admins et appelle `NotificationService`.                                                                                                                               |
| Confirmation à l'utilisateur.                           | `MembershipController` -> Frontend                                     | Réponse API 200 OK avec `{ message, membership: MembershipDto }`. Le frontend nettoie le token du Local Storage et peut afficher une confirmation ou rediriger.                                      |

##### 2.2.2.6. Notification de l'Admin post-acceptation

| Action Système (Backend)                               | Composant Backend Principal                                  | Logique / Résultat                                                                                                                                                           |
|--------------------------------------------------------|--------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Un membership est activé (via inscription ou post-login). | `AuthService.registerViaInvitation` ou `MembershipService.activateByToken` | Appelle `MembershipService.notifyAdminsMemberJoined` avec les détails du `Membership` activé.                                                                              |
| Récupération des informations nécessaires.             | `MembershipService.notifyAdminsMemberJoined`                 | Trouve le `User` (nouveau membre) et l'`Establishment` associés au membership. Trouve tous les `Membership` `ADMIN` et `ACTIVE` pour cet établissement.                   |
| Envoi de l'email de notification.                      | `NotificationService.sendMemberJoinedNotification`           | Pour chaque admin trouvé, envoie un email l'informant que `newMemberUsername` a rejoint `establishmentName`.                                                                 |

### 2.3. Flux des Opérations CRUD sur un Membre par l'Administrateur

Cette section détaille les interactions et les processus techniques pour chaque opération de création, lecture, mise à jour et suppression (CRUD) qu'un administrateur d'établissement peut effectuer sur les memberships au sein de son établissement. Le flux d'invitation (Création) a été détaillé précédemment (Section 2.2).

#### 2.3.1. Lister les Membres

Ce flux permet à un administrateur d'obtenir la liste complète des membres associés à son établissement.

| Étape / Interaction               | Acteur Principal | Action Effectuée (UI/API)                                                  | Composant Backend Sollicité (Contrôleur -> Service)             | Données Clés Échangées                  | Résultat / Changement d'État                                        |
|-----------------------------------|------------------|----------------------------------------------------------------------------|-----------------------------------------------------------------|-----------------------------------------|---------------------------------------------------------------------|
| 1. Demande de la liste des membres | Admin (UI)       | Navigue vers la section de gestion des membres de l'établissement.           | -                                                               | `establishmentId` (implicite/URL)       | Le frontend prépare l'appel API.                                      |
| 2. Requête API                    | Frontend         | Envoie `GET /api/users/me/establishments/:establishmentId/memberships`       | `EstablishmentController.getMemberships` -> `MembershipService.getMembershipsByEstablishment` | Token JWT (AuthN/AuthZ)                 | Le backend vérifie que l'appelant est ADMIN de l'établissement (`ensureMembership(['ADMIN'])`). |
| 3. Récupération des données       | `MembershipService` | Interroge la base de données pour tous les `Membership` de l'`establishmentId`. | `db.Membership.findAll`                                         | `establishmentId`                       | Liste des instances `Membership` (avec `User` associés) récupérée.    |
| 4. Formatage et Réponse API       | Backend (Controller) | Mappe les instances `Membership` en `MembershipDto[]`.                     | `mapToMembershipDto` (helper/fonction)                          | `MembershipDto[]`                       | Le backend retourne une réponse HTTP 200 OK avec la liste des DTOs. |
| 5. Affichage dans l'UI            | Frontend         | Reçoit la liste et l'affiche (ex: dans un tableau).                        | -                                                               | -                                       | L'administrateur voit la liste des membres avec leurs détails.      |

#### 2.3.2. Consulter les Détails d'un Membre

Ce flux permet à un administrateur de voir les détails d'un membre spécifique de son établissement, ou à un membre de voir ses propres détails de membership.

| Étape / Interaction            | Acteur Principal | Action Effectuée (UI/API)                                                              | Composant Backend Sollicité (Contrôleur -> Service)                | Données Clés Échangées                                 | Résultat / Changement d'État                                      |
|--------------------------------|------------------|----------------------------------------------------------------------------------------|--------------------------------------------------------------------|--------------------------------------------------------|-------------------------------------------------------------------|
| 1. Demande des détails du membre | Admin/Membre (UI) | Clique sur un membre dans une liste ou accède à une page de profil de membership.    | -                                                                  | `establishmentId`, `membershipId` (URL)            | Le frontend prépare l'appel API.                                      |
| 2. Requête API                 | Frontend         | Envoie `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId` | `EstablishmentController.getMembershipById` -> `MembershipService.getMembershipById` | Token JWT (AuthN/AuthZ)                                | Le backend vérifie la permission via `ensureAdminOrSelfForMembership`. |
| 3. Récupération des données    | `MembershipService` | Interroge la base de données pour le `Membership` spécifié.                            | `db.Membership.findOne`                                            | `membershipId`, `establishmentId`                      | Instance `Membership` (avec `User` associé) récupérée ou erreur 404. |
| 4. Formatage et Réponse API    | Backend (Controller) | Mappe l'instance `Membership` en `MembershipDto`.                                      | `mapToMembershipDto`                                               | `MembershipDto`                                        | Le backend retourne une réponse HTTP 200 OK avec le DTO.          |
| 5. Affichage dans l'UI         | Frontend         | Reçoit les détails et les affiche.                                                       | -                                                                  | -                                                      | L'utilisateur voit les détails du membership.                     |

#### 2.3.3. Modifier le Rôle ou le Statut d'un Membre

Ce flux permet à un administrateur de changer le rôle (ex: STAFF <-> ADMIN) ou le statut (ex: ACTIVE <-> INACTIVE) d'un membre de son établissement.

| Étape / Interaction              | Acteur Principal | Action Effectuée (UI/API)                                                              | Composant Backend Sollicité (Contrôleur -> Service)             | Données Clés Échangées                                 | Résultat / Changement d'État                                                                                                |
|----------------------------------|------------------|----------------------------------------------------------------------------------------|-----------------------------------------------------------------|--------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| 1. Demande de modification       | Admin (UI)       | Sélectionne un membre, choisit un nouveau rôle/statut et soumet les modifications.     | -                                                               | `membershipId` (URL), `UpdateMembershipDto` (corps) | Le frontend prépare l'appel API.                                                                                              |
| 2. Requête API                   | Frontend         | Envoie `PATCH /api/memberships/:membershipId` avec `UpdateMembershipDto`.                | `MembershipController.updateMembership` -> `MembershipService.updateMembership` | Token JWT (AuthN/AuthZ), CSRF Token                     | Le backend vérifie la permission via `ensureAdminOfTargetMembership`.                                                            |
| 3. Logique de validation/protection | `MembershipService` | Récupère le `Membership` cible. Valide la tentative de modification (ex: pas le dernier admin, pas le propriétaire). | `db.Membership.findByPk`, `db.Membership.count`                   | `membershipId`, `updateDto`, `actorMembership`         | Si protection violée, une `AppError` (ex: `CannotUpdateLastAdminError`) est levée (-> 400).                                   |
| 4. Mise à jour en base de données | `MembershipService` | Si valide, met à jour les champs `role` et/ou `status` du `Membership`.                | `targetMembership.update()`                                     | Données à mettre à jour                                | L'enregistrement `Membership` est modifié en BDD.                                                                           |
| 5. Formatage et Réponse API      | Backend (Controller) | Mappe l'instance `Membership` mise à jour en `MembershipDto`.                            | `mapToMembershipDto`                                            | `MembershipDto` (mis à jour)                           | Le backend retourne une réponse HTTP 200 OK avec le DTO mis à jour.                                                          |
| 6. Mise à jour de l'UI           | Frontend         | Reçoit le membre mis à jour et rafraîchit l'affichage.                                   | -                                                               | -                                                      | L'administrateur voit le rôle/statut du membre actualisé.                                                                   |

#### 2.3.4. Supprimer un Membre de l'Établissement

Ce flux permet à un administrateur de retirer un membre (ou de révoquer une invitation PENDING) de son établissement.

| Étape / Interaction            | Acteur Principal | Action Effectuée (UI/API)                                                        | Composant Backend Sollicité (Contrôleur -> Service)          | Données Clés Échangées           | Résultat / Changement d'État                                                                                              |
|--------------------------------|------------------|----------------------------------------------------------------------------------|--------------------------------------------------------------|----------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| 1. Demande de suppression      | Admin (UI)       | Sélectionne un membre et clique sur "Supprimer" ou "Révoquer Invitation".         | -                                                            | `membershipId` (URL)             | Une confirmation peut être demandée à l'UI.                                                                               |
| 2. Requête API                 | Frontend         | Envoie `DELETE /api/memberships/:membershipId`.                                    | `MembershipController.deleteMembership` -> `MembershipService.deleteMembership` | Token JWT (AuthN/AuthZ), CSRF Token | Le backend vérifie la permission via `ensureAdminOfTargetMembership`.                                                      |
| 3. Logique de validation/protection | `MembershipService` | Récupère le `Membership` cible. Valide la tentative de suppression (ex: pas le dernier admin). | `db.Membership.findByPk`, `db.Membership.count`                | `membershipId`, `actorMembership`  | Si protection violée, une `AppError` (ex: `CannotDeleteLastAdminError`) est levée (-> 400).                               |
| 4. Suppression en base de données | `MembershipService` | Si valide, supprime l'enregistrement `Membership`.                                 | `targetMembership.destroy()`                                 | -                                | L'enregistrement `Membership` est supprimé de la BDD. Les dépendances (ex: `ServiceMemberAssignment`) sont supprimées par CASCADE. |
| 5. Réponse API                 | Backend (Controller) | -                                                                                | -                                                            | Aucun contenu                    | Le backend retourne une réponse HTTP 204 No Content.                                                                      |
| 6. Mise à jour de l'UI         | Frontend         | Reçoit la confirmation et retire le membre de la liste affichée.                   | -                                                            | -                                | L'administrateur voit que le membre a été retiré.                                                                         |

## 3. Modèles de Données et Relations (Schéma de Base de Données)

Cette section décrit en détail les modèles de données Sequelize (et par extension, les tables de la base de données) qui sont centraux ou pertinents pour le fonctionnement du module "Gestion des Membres". Comprendre ces structures est essentiel pour appréhender la logique métier et les flux de données.

### 3.1. Modèle `User`

Le modèle `User` représente l'entité utilisateur globale au sein de l'application "APP_NAME". Chaque personne interagissant avec la plateforme, qu'elle soit administrateur d'établissement, membre du personnel (Staff), ou simple client (dans d'autres contextes), possède un enregistrement `User`. C'est ce modèle qui gère l'authentification et les informations de profil de base.

#### 3.1.1. Colonnes Pertinentes

| Nom de la Colonne (BDD: `snake_case`) | Type de Données (Sequelize)        | Contraintes Clés                                  | Description / Rôle pour la Gestion des Membres                                                                 |
|---------------------------------------|------------------------------------|---------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| `id`                                  | `DataTypes.INTEGER.UNSIGNED`       | PK, AutoIncrement, NOT NULL                       | Identifiant unique de l'utilisateur. Référencé par `Membership.userId`.                                         |
| `username`                            | `DataTypes.STRING(50)`             | UNIQUE, NOT NULL                                  | Nom d'utilisateur unique, utilisé pour la connexion et affiché (ex: nom du membre).                             |
| `email`                               | `DataTypes.STRING(100)`            | UNIQUE, NOT NULL                                  | Adresse e-mail unique, utilisée pour la connexion, les invitations, les notifications et l'identification de l'invité. |
| `password`                            | `DataTypes.STRING`                 | NOT NULL                                          | Hash du mot de passe de l'utilisateur, utilisé pour l'authentification.                                        |
| `is_active`                           | `DataTypes.BOOLEAN`                | NOT NULL, Default: `true` (ou `false` si activation requise) | Indique si le compte utilisateur global est actif. Un utilisateur inactif ne peut pas se connecter ni accepter une invitation. |
| `is_email_active`                     | `DataTypes.BOOLEAN`                | NOT NULL, Default: `false`                        | Indique si l'adresse email de l'utilisateur a été vérifiée. Pertinent pour la fiabilité des notifications.     |
| `profile_picture`                     | `DataTypes.STRING`                 | Nullable                                          | URL de l'image de profil de l'utilisateur, potentiellement affichée dans la liste des membres.                  |
| `created_at`                          | `DataTypes.DATE`                   | NOT NULL                                          | Date et heure de création de l'enregistrement utilisateur.                                                       |
| `updated_at`                          | `DataTypes.DATE`                   | NOT NULL                                          | Date et heure de la dernière modification de l'enregistrement utilisateur.                                     |

#### 3.1.2. Relations avec `Membership` (One-to-Many)

Un utilisateur (`User`) peut être associé à plusieurs enregistrements `Membership`, ce qui signifie qu'un même compte utilisateur peut être membre (avec des rôles et statuts potentiellement différents) de plusieurs établissements distincts sur la plateforme.

*   **Définition Sequelize :**
    ```typescript
    // Dans User.ts (ou models/index.ts)
    User.hasMany(models.Membership, {
        foreignKey: 'userId', // Clé étrangère dans la table Memberships
        as: 'memberships'     // Alias pour accéder aux memberships d'un utilisateur
    });
    ```
*   **Clé Étrangère :** `Memberships.user_id` référence `Users.id`.
*   **Type :** Relation Un-à-Plusieurs (un `User` peut avoir plusieurs `Memberships`).
*   **Signification :** Permet de retrouver tous les établissements auxquels un utilisateur appartient et ses rôles/statuts dans chacun.

### 3.2. Modèle `Establishment`

Le modèle `Establishment` représente une entité commerciale ou une organisation qui utilise l'application "APP_NAME" pour gérer ses services, ses réservations et, crucialement ici, son équipe de membres.

#### 3.2.1. Colonnes Pertinentes

| Nom de la Colonne (BDD: `snake_case`) | Type de Données (Sequelize)        | Contraintes Clés                                  | Description / Rôle pour la Gestion des Membres                                                                      |
|---------------------------------------|------------------------------------|---------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `id`                                  | `DataTypes.INTEGER.UNSIGNED`       | PK, AutoIncrement, NOT NULL                       | Identifiant unique de l'établissement. Référencé par `Membership.establishmentId`.                                  |
| `name`                                | `DataTypes.STRING(150)`            | NOT NULL                                          | Nom de l'établissement, affiché et utilisé dans les notifications (ex: "Vous êtes invité à rejoindre [Nom Étab.]"). |
| `owner_id`                            | `DataTypes.INTEGER.UNSIGNED`       | NOT NULL, FK vers `Users.id`                      | Identifiant de l'utilisateur qui est le propriétaire principal de l'établissement. Cet utilisateur a initialement le rôle `ADMIN` via un `Membership`. |
| `is_validated`                        | `DataTypes.BOOLEAN`                | NOT NULL, Default: `false`                        | Indique si l'établissement a été validé (ex: SIRET). Peut influencer si des membres peuvent être activement gérés.    |
| `created_at`                          | `DataTypes.DATE`                   | NOT NULL                                          | Date et heure de création de l'enregistrement de l'établissement.                                                  |
| `updated_at`                          | `DataTypes.DATE`                   | NOT NULL                                          | Date et heure de la dernière modification de l'enregistrement de l'établissement.                                  |

#### 3.2.2. Relations avec `Membership` (One-to-Many)

Un établissement (`Establishment`) peut avoir plusieurs enregistrements `Membership` associés, représentant tous les utilisateurs qui sont membres (Administrateurs ou Staff) de cet établissement.

*   **Définition Sequelize :**
    ```typescript
    // Dans Establishment.ts (ou models/index.ts)
    Establishment.hasMany(models.Membership, {
        foreignKey: 'establishmentId', // Clé étrangère dans la table Memberships
        as: 'memberships'              // Alias pour accéder à la liste des membres d'un établissement
    });
    ```
*   **Clé Étrangère :** `Memberships.establishment_id` référence `Establishments.id`.
*   **Type :** Relation Un-à-Plusieurs (un `Establishment` peut avoir plusieurs `Memberships`).
*   **Signification :** Permet de lister et de gérer tous les membres (et leurs rôles/statuts) associés à un établissement spécifique.

### 3.3. Modèle `Membership` (Pivot Central)

Le modèle `Membership` est l'entité centrale du module "Gestion des Membres". Il agit comme une table pivot qui établit le lien entre un `User` (utilisateur) et un `Establishment` (établissement), définissant le rôle de l'utilisateur au sein de cet établissement, son statut d'activité, et gérant le processus d'invitation. Chaque enregistrement dans cette table représente l'appartenance (ou une invitation en attente) d'un utilisateur à un établissement spécifique.

#### 3.3.1. Définition Complète des Colonnes

| Nom de la Colonne (BDD: `snake_case`) | Type de Données (Sequelize/SQL)                 | Contraintes/Options                                                                          | Description Détaillée du Rôle                                                                                                                                                             |
|---------------------------------------|-------------------------------------------------|----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`                                  | `DataTypes.INTEGER.UNSIGNED`                    | PK, AutoIncrement, NOT NULL                                                                  | Identifiant unique de l'enregistrement de membership.                                                                                                                                      |
| `user_id`                             | `DataTypes.INTEGER.UNSIGNED`                    | FK vers `users.id`, `NULLABLE`                                                                 | Référence l'utilisateur associé à ce membership. Est `NULL` lorsqu'une invitation est en statut `PENDING` et que l'utilisateur n'a pas encore créé de compte ou lié un compte existant. |
| `establishment_id`                    | `DataTypes.INTEGER.UNSIGNED`                    | FK vers `establishments.id`, `NOT NULL`                                                        | Référence l'établissement auquel ce membership (ou cette invitation) est rattaché.                                                                                                          |
| `role`                                | `DataTypes.ENUM('ADMIN', 'STAFF')`              | `NOT NULL`, `Default: 'STAFF'`                                                               | Définit le niveau de permission du membre au sein de l'établissement : `ADMIN` (accès complet à la gestion de l'établissement et des membres) ou `STAFF` (accès limité défini par l'application). |
| `status`                              | `DataTypes.ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'REVOKED')` | `NOT NULL`, `Default: 'PENDING'`                                                             | Statut du membership : `PENDING` (invitation envoyée, non acceptée), `ACTIVE` (membre actif), `INACTIVE` (membre temporairement désactivé par un admin), `REVOKED` (invitation annulée avant acceptation). |
| `invited_email`                       | `DataTypes.STRING(255)`                         | `NULLABLE`                                                                                   | Stocke l'adresse e-mail à laquelle l'invitation a été envoyée. Nullifié une fois l'invitation acceptée et le `userId` renseigné.                                                            |
| `invitation_token_hash`               | `DataTypes.STRING(255)`                         | `UNIQUE`, `NULLABLE`                                                                         | Stocke le hash sécurisé (ex: SHA256) du token d'invitation. Nullifié après acceptation ou expiration pour empêcher la réutilisation.                                                            |
| `invitation_token_expires_at`         | `DataTypes.DATE` (TIMESTAMPTZ)                  | `NULLABLE`                                                                                   | Date et heure d'expiration du token d'invitation. Après cette date, le token n'est plus valide pour l'acceptation. Nullifié après acceptation.                                          |
| `joined_at`                           | `DataTypes.DATE` (TIMESTAMPTZ)                  | `NULLABLE`                                                                                   | Date et heure à laquelle l'utilisateur a accepté l'invitation et est devenu un membre actif (ou a lié son compte).                                                                          |
| `created_at`                          | `DataTypes.DATE` (TIMESTAMPTZ)                  | `NOT NULL`                                                                                   | Date et heure de création de l'enregistrement de membership (ou de l'invitation).                                                                                                       |
| `updated_at`                          | `DataTypes.DATE` (TIMESTAMPTZ)                  | `NOT NULL`                                                                                   | Date et heure de la dernière modification de l'enregistrement de membership.                                                                                                              |

#### 3.3.2. Index et Contraintes (Unique, FK, Contraintes Partielles)

En plus des contraintes de colonne (PK, FK, UNIQUE sur `invitationTokenHash`), les index et contraintes suivants sont définis au niveau de la table `memberships` pour optimiser les performances et garantir l'intégrité des données.

| Type (Index/Contrainte) | Nom (si applicable)                | Colonnes Impliquées                             | Description / Objectif                                                                                                                                                 |
|-------------------------|------------------------------------|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Index                   | `idx_membership_user`              | `user_id`                                       | Accélère les recherches de memberships basées sur l'identifiant de l'utilisateur.                                                                                        |
| Index                   | `idx_membership_establishment`     | `establishment_id`                              | Accélère les recherches de memberships basées sur l'identifiant de l'établissement.                                                                                      |
| Index                   | `idx_membership_status`            | `status`                                        | Accélère les filtrages de memberships par statut.                                                                                                                        |
| Contrainte UNIQUE       | `unique_user_establishment`        | `user_id`, `establishment_id`                   | Assure qu'un utilisateur (`user_id`) ne peut avoir qu'un seul enregistrement `Membership` (et donc un seul rôle/statut) pour un établissement (`establishment_id`) donné. |
| Contrainte UNIQUE       | `unique_pending_invited_email`     | `invited_email`, `establishment_id`             | (Contrainte Partielle) Assure qu'une même adresse email ne peut avoir qu'une seule invitation en statut `PENDING` pour un établissement donné.                             |
| Clé Étrangère (FK)      | -                                  | `user_id` -> `users(id)`                        | Action `ON UPDATE`: CASCADE, Action `ON DELETE`: SET NULL. Si un utilisateur est supprimé, son `userId` dans `Memberships` devient `NULL` (l'invitation ou le membership orphelin reste pour audit, mais peut être nettoyé). |
| Clé Étrangère (FK)      | -                                  | `establishment_id` -> `establishments(id)`      | Action `ON UPDATE`: CASCADE, Action `ON DELETE`: CASCADE. Si un établissement est supprimé, tous ses memberships sont également supprimés.                                  |

#### 3.3.3. Relations Clés

Le modèle `Membership` établit plusieurs relations importantes avec d'autres modèles de l'application.

##### 3.3.3.1. BelongsTo `User` (as 'user')

| Modèle Cible | Type de Relation (Sequelize) | Alias ('as') | Clé Étrangère (`foreignKey`) | Description de la Relation                                                                                                                             |
|--------------|------------------------------|--------------|------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `User`       | `belongsTo`                  | `'user'`     | `userId`                     | Chaque enregistrement `Membership` est associé à un `User` (via `userId`). Cette association permet de récupérer les informations de l'utilisateur membre. L'association peut être nulle si le `status` est `PENDING` et que l'invitation n'a pas encore été liée à un `User`. |

##### 3.3.3.2. BelongsTo `Establishment` (as 'establishment')

| Modèle Cible    | Type de Relation (Sequelize) | Alias ('as')        | Clé Étrangère (`foreignKey`) | Description de la Relation                                                                              |
|-----------------|------------------------------|---------------------|------------------------------|---------------------------------------------------------------------------------------------------------|
| `Establishment` | `belongsTo`                  | `'establishment'`   | `establishmentId`            | Chaque `Membership` appartient à un (et un seul) `Establishment`, indiquant dans quel contexte ce membre opère. |

##### 3.3.3.3. HasMany `StaffAvailability` (as 'staffAvailabilities')

| Modèle Cible        | Type de Relation (Sequelize) | Alias ('as')              | Clé Étrangère (`foreignKey`) | Description de la Relation                                                                                                                      |
|---------------------|------------------------------|---------------------------|------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| `StaffAvailability` | `hasMany`                    | `'staffAvailabilities'` | `membershipId`               | Un `Membership` (représentant un membre Staff) peut avoir plusieurs règles de `StaffAvailability` définissant ses horaires de travail ou d'absence. |

##### 3.3.3.4. BelongsToMany `Service` via `ServiceMemberAssignment` (as 'assignedServices')

| Modèle Cible | Type de Relation (Sequelize) | Alias ('as')           | Clé Étrangère (`foreignKey`) | Autre Clé / Table Jonction                                       | Description de la Relation                                                                                                           |
|--------------|------------------------------|------------------------|------------------------------|------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `Service`    | `belongsToMany`              | `'assignedServices'`   | `membershipId`               | `otherKey: 'serviceId'`, `through: 'ServiceMemberAssignments'` | Un `Membership` (membre Staff) peut être assigné à plusieurs `Service`s, et un `Service` peut avoir plusieurs membres Staff assignés. |

##### 3.3.3.5. HasMany `Booking` (pour `assignedMembershipId`, as 'assignedBookings')

| Modèle Cible | Type de Relation (Sequelize) | Alias ('as')           | Clé Étrangère (`foreignKey`) | Description de la Relation                                                                                                                                  |
|--------------|------------------------------|------------------------|------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Booking`    | `hasMany`                    | `'assignedBookings'`   | `assignedMembershipId`       | Un `Membership` (représentant un membre Staff) peut être assigné à plusieurs `Booking`s, indiquant que ce membre est responsable de la réalisation de la prestation. |

### 3.4. Modèle `ServiceMemberAssignment` (Table de Jonction)

Le modèle `ServiceMemberAssignment` sert de table de jonction pour établir une relation Plusieurs-à-Plusieurs (Many-to-Many) entre les modèles `Service` et `Membership`. Il permet de spécifier quels membres du personnel (`Membership` de type `STAFF`) sont qualifiés, autorisés ou simplement associés à la réalisation d'un `Service` particulier proposé par l'établissement.

#### 3.4.1. Définition Complète des Colonnes

| Nom de la Colonne (BDD: `snake_case`) | Type de Données (Sequelize/SQL) | Contraintes/Options         | Description Détaillée du Rôle                                                                 |
|---------------------------------------|---------------------------------|-----------------------------|-----------------------------------------------------------------------------------------------|
| `id`                                  | `DataTypes.INTEGER.UNSIGNED`    | PK, AutoIncrement, NOT NULL | Identifiant unique de l'enregistrement d'assignation.                                         |
| `service_id`                          | `DataTypes.INTEGER.UNSIGNED`    | FK vers `services.id`, NOT NULL | Référence le service concerné par cette assignation.                                         |
| `membership_id`                       | `DataTypes.INTEGER.UNSIGNED`    | FK vers `memberships.id`, NOT NULL | Référence le membership (le membre du personnel) assigné à ce service.                           |
| `created_at`                          | `DataTypes.DATE` (TIMESTAMPTZ)  | `NOT NULL`                  | Date et heure de création de l'enregistrement d'assignation.                                    |
| `updated_at`                          | `DataTypes.DATE` (TIMESTAMPTZ)  | `NOT NULL`                  | Date et heure de la dernière modification de l'enregistrement d'assignation (peu pertinent ici). |

#### 3.4.2. Index et Contraintes

| Type (Index/Contrainte) | Nom (si applicable)                | Colonnes Impliquées          | Description / Objectif                                                                                       |
|-------------------------|------------------------------------|------------------------------|--------------------------------------------------------------------------------------------------------------|
| Index                   | `idx_assignment_service`           | `service_id`                 | Accélère les recherches d'assignations basées sur le service.                                                 |
| Index                   | `idx_assignment_membership`        | `membership_id`              | Accélère les recherches d'assignations basées sur le membre.                                                  |
| Contrainte UNIQUE       | `unique_service_member_assignment` | `service_id`, `membership_id` | Assure qu'un membre spécifique ne peut être assigné qu'une seule fois à un service donné (évite les doublons). |
| Clé Étrangère (FK)      | -                                  | `service_id` -> `services(id)` | Action `ON UPDATE`: CASCADE, Action `ON DELETE`: CASCADE. Si un service est supprimé, les assignations associées le sont aussi. |
| Clé Étrangère (FK)      | -                                  | `membership_id` -> `memberships(id)` | Action `ON UPDATE`: CASCADE, Action `ON DELETE`: CASCADE. Si un membership est supprimé, les assignations associées le sont aussi. |

#### 3.4.3. Relations avec `Service` et `Membership`

Ce modèle sert de table `through` pour la relation `belongsToMany` définie entre `Service` et `Membership` dans `src/models/index.ts`. Il n'a généralement pas besoin de définir ses propres méthodes `belongsTo` car il est principalement utilisé par Sequelize pour gérer la relation N:M.

*   **Relation Implicite :** Chaque enregistrement lie un `Service` à un `Membership`.
*   **Accès via les Modèles Principaux :**
    *   Depuis une instance de `Service`, on peut accéder aux membres assignés via l'alias `'assignedMembers'`.
    *   Depuis une instance de `Membership`, on peut accéder aux services assignés via l'alias `'assignedServices'`.

### 3.5. Modèle `StaffAvailability` (Basé sur `rrule`)

Le modèle `StaffAvailability` est crucial pour la gestion fine et flexible des horaires de travail et des périodes d'indisponibilité des membres du personnel (Staff). Plutôt que d'utiliser des règles fixes par jour de semaine ou des overrides ponctuels, il s'appuie sur le standard `rrule` (RFC 5545) pour définir des schémas de disponibilité récurrents ou complexes.

#### 3.5.1. Définition Complète des Colonnes

| Nom de la Colonne (BDD: `snake_case`) | Type de Données (Sequelize/SQL) | Contraintes/Options                          | Description Détaillée du Rôle                                                                                                                                                                                                                                                           |
|---------------------------------------|---------------------------------|----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`                                  | `DataTypes.INTEGER.UNSIGNED`    | PK, AutoIncrement, NOT NULL                  | Identifiant unique de la règle de disponibilité.                                                                                                                                                                                                                                         |
| `membership_id`                       | `DataTypes.INTEGER.UNSIGNED`    | FK vers `memberships.id`, NOT NULL           | Référence le `Membership` du membre Staff auquel cette règle de disponibilité s'applique.                                                                                                                                                                                                  |
| `rrule_string`                        | `DataTypes.TEXT`                | `NOT NULL`                                   | Stocke la règle de récurrence au format `rrule` (RFC 5545). Ex: `'FREQ=WEEKLY;BYDAY=MO,WE,FR;DTSTART=20240902T090000Z;INTERVAL=1'`. Cette chaîne définit quand les blocs de disponibilité/indisponibilité commencent. Le `DTSTART` est crucial pour l'alignement initial et la gestion du fuseau horaire (UTC recommandé : `Z`). |
| `duration_minutes`                    | `DataTypes.INTEGER.UNSIGNED`    | `NOT NULL`, `CHECK > 0`                      | Définit la durée, en minutes, de chaque bloc de temps généré par la règle `rrule`. Par exemple, si `rruleString` génère des débuts à 9h, 10h, 11h et `durationMinutes` est 60, cela crée des blocs 9h-10h, 10h-11h, 11h-12h.                                                              |
| `effective_start_date`                | `DataTypes.DATEONLY`            | `NOT NULL`                                   | Date (sans heure/timezone) à partir de laquelle cette règle commence à s'appliquer. Les occurrences générées par `rruleString` avant cette date sont ignorées.                                                                                                                              |
| `effective_end_date`                  | `DataTypes.DATEONLY`            | `NULLABLE`                                   | Date (sans heure/timezone) optionnelle à partir de laquelle cette règle cesse de s'appliquer. Les occurrences générées après cette date sont ignorées. Si `NULL`, la règle s'applique indéfiniment (ou jusqu'à la date `UNTIL` dans la `rruleString` si présente).                        |
| `is_working`                          | `DataTypes.BOOLEAN`             | `NOT NULL`, `Default: true`                  | Indique la nature des blocs générés : `true` signifie que le membre est DISPONIBLE (travail), `false` signifie que le membre est INDISPONIBLE (absence, congé, etc.) pendant ces blocs. Cela permet de définir des indisponibilités récurrentes.                                        |
| `description`                         | `DataTypes.STRING(255)`         | `NULLABLE`                                   | Une description textuelle optionnelle pour aider les utilisateurs (Admin/Staff) à identifier le but de cette règle dans l'interface graphique.                                                                                                                                        |
| `created_at`                          | `DataTypes.DATE` (TIMESTAMPTZ)  | `NOT NULL`                                   | Date et heure de création de la règle de disponibilité.                                                                                                                                                                                                                                  |
| `updated_at`                          | `DataTypes.DATE` (TIMESTAMPTZ)  | `NOT NULL`                                   | Date et heure de la dernière modification de la règle de disponibilité.                                                                                                                                                                                                                  |

#### 3.5.2. Index et Contraintes

| Type (Index/Contrainte) | Nom (si applicable)                   | Colonnes Impliquées                        | Description / Objectif                                                                                                             |
|-------------------------|---------------------------------------|--------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| Index                   | `idx_staff_avail_membership`          | `membership_id`                            | Accélère la récupération de toutes les règles de disponibilité pour un membre spécifique.                                             |
| Index                   | `idx_staff_avail_effective_dates`     | `effective_start_date`, `effective_end_date` | Accélère le filtrage des règles actives pour une période donnée (utilisé par `AvailabilityService` lors du calcul des créneaux). |
| Contrainte CHECK        | `chk_duration_positive`               | `duration_minutes`                         | Assure que la durée spécifiée pour un bloc est strictement positive.                                                                 |
| Clé Étrangère (FK)      | -                                     | `membership_id` -> `memberships(id)`       | Action `ON UPDATE`: CASCADE, Action `ON DELETE`: CASCADE. Si un membership est supprimé, toutes ses règles de disponibilité le sont aussi. |

#### 3.5.3. Relation avec `Membership`

Le modèle `StaffAvailability` a une relation directe avec le modèle `Membership`.

| Modèle Cible | Type de Relation (Sequelize) | Alias ('as')     | Clé Étrangère (`foreignKey`) | Description de la Relation                                                                                                |
|--------------|------------------------------|------------------|------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `Membership` | `belongsTo`                  | `'membership'`   | `membershipId`               | Chaque règle de `StaffAvailability` appartient à un (et un seul) `Membership`, liant cette disponibilité à un membre Staff spécifique. |

### 3.6. Modèle `Service` (Parties pertinentes)

Le modèle `Service` définit les prestations offertes par un établissement. Dans le contexte de la gestion des membres, il est important de comprendre comment un service peut être lié aux membres du personnel qui sont habilités ou désignés pour le réaliser.

#### 3.6.1. Relations avec `ServiceMemberAssignment`

La liaison entre un `Service` et les `Membership`s (membres Staff) qui lui sont assignés est gérée via une relation Plusieurs-à-Plusieurs (Many-to-Many), utilisant la table de jonction `ServiceMemberAssignment`.

| Modèle Cible        | Type de Relation (Sequelize) | Alias ('as')          | Clé Étrangère (`foreignKey`) | Autre Clé / Table Jonction                                        | Description de la Relation                                                                                                                                                             |
|---------------------|------------------------------|-----------------------|------------------------------|-------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Membership`        | `belongsToMany`              | `'assignedMembers'`   | `serviceId`                  | `otherKey: 'membershipId'`, `through: models.ServiceMemberAssignment` | Permet, à partir d'une instance de `Service`, de récupérer la liste de tous les `Membership`s (membres Staff) qui sont assignés à la réalisation de ce service spécifique.                 |
| `ServiceMemberAssignment` | `hasMany`                    | `'serviceAssignments'`| `serviceId`                  | -                                                                 | (Relation directe avec la table de jonction) Permet, à partir d'une instance de `Service`, de récupérer tous les enregistrements d'assignation bruts le concernant (utile pour certaines requêtes). |

### 3.7. Modèle `Booking` (Parties pertinentes)

Le modèle `Booking` représente une réservation effectuée par un client pour un service spécifique à une date et heure données. Il peut éventuellement être lié à un membre du personnel spécifique qui réalisera la prestation.

#### 3.7.1. Colonne `assignedMembershipId` (FK vers `Memberships`, nullable)

Cette colonne clé permet de lier une réservation à un membre spécifique.

| Nom de la Colonne (BDD: `snake_case`) | Type de Données (Sequelize/SQL) | Contraintes/Options                                        | Description Détaillée du Rôle                                                                                                                                |
|---------------------------------------|---------------------------------|------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `assigned_membership_id`              | `DataTypes.INTEGER.UNSIGNED`    | `NULLABLE`, FK vers `memberships.id`, `ON DELETE SET NULL` | Référence l'`id` de l'enregistrement `Membership` du membre Staff assigné à cette réservation. Si `NULL`, la réservation n'est pas assignée à un membre spécifique, ou le membre assigné a été supprimé de l'établissement. |

#### 3.7.2. Relation avec `Membership`

Une réservation (`Booking`) peut être liée à un (et un seul) `Membership`, représentant le membre du personnel assigné.

| Modèle Cible | Type de Relation (Sequelize) | Alias ('as')         | Clé Étrangère (`foreignKey`) | Description de la Relation                                                                                                      |
|--------------|------------------------------|----------------------|------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `Membership` | `belongsTo`                  | `'assignedMember'`   | `assignedMembershipId`       | Permet, à partir d'une instance de `Booking`, de récupérer facilement les informations du `Membership` (et de l'`User` associé) assigné. |

## 4. Logique Métier : Services Backend

Cette section décrit les services backend qui encapsulent la logique métier du module "Gestion des Membres". Les services sont responsables des interactions avec la base de données, des validations complexes, de l'orchestration des opérations et de l'application des règles métier.

### 4.1. `MembershipService.ts`

#### 4.1.1. Rôle et Responsabilités Globales du Service

Le `MembershipService` est le service principal responsable de toute la logique métier liée à la gestion des memberships (appartenances utilisateur-établissement). Ses responsabilités incluent :

*   La gestion du cycle de vie des invitations (création, validation de token).
*   L'activation des memberships suite à l'acceptation d'une invitation (par inscription ou liaison à un compte existant).
*   Les opérations CRUD (Lecture, Mise à jour, Suppression) sur les enregistrements `Membership` effectuées par les administrateurs.
*   L'application des règles de permission et de protection spécifiques aux memberships (ex: vérification du dernier administrateur).
*   L'orchestration des notifications liées aux événements de membership (via `NotificationService`).
*   L'interaction avec les modèles `Membership`, `User`, et `Establishment` pour lire et écrire les données nécessaires.

#### 4.1.2. Méthodes Publiques

##### 4.1.2.1. `inviteMember(inviterMembership, establishmentId, inviteDto)`
###### 4.1.2.1.1. Fonction
Initie le processus d'invitation en créant un enregistrement `Membership` en statut `PENDING` et en envoyant un email d'invitation contenant un token unique à l'adresse email spécifiée.
###### 4.1.2.1.2. Paramètres
| Nom du Paramètre    | Type TypeScript        | Description (et si optionnel)                                                                            |
|---------------------|------------------------|----------------------------------------------------------------------------------------------------------|
| `inviterMembership` | `MembershipAttributes` | Objet représentant le membership ADMIN de l'utilisateur qui effectue l'invitation. Utilisé pour la vérification de permission. |
| `establishmentId`   | `number`               | ID de l'établissement pour lequel l'invitation est créée.                                                  |
| `inviteDto`         | `InviteMemberDto`      | DTO contenant l'email (`invitedEmail`) et le rôle (`STAFF`) de la personne à inviter.                       |
###### 4.1.2.1.3. Retour
*   **Type:** `Promise<Membership>`
*   **Description:** Retourne l'instance du modèle `Membership` nouvellement créé avec le statut `PENDING`. En environnement de test, peut inclure une propriété non-standard `plainInvitationToken` pour faciliter les tests d'intégration.
###### 4.1.2.1.4. Logique Clé et Validations
*   Vérifie que l'`inviterMembership` correspond à l'`establishmentId` fourni ET que son rôle est `ADMIN`.
*   Vérifie si un utilisateur existe déjà avec l'`invitedEmail`.
*   Vérifie si un `Membership` `ACTIVE`, `INACTIVE`, ou une invitation `PENDING` existe déjà pour cet `invitedEmail` (ou `userId` si trouvé) dans cet `establishmentId`. Lève `UserAlreadyMemberError` (409) si c'est le cas.
*   Génère un token d'invitation cryptographiquement sécurisé (`crypto.randomBytes`).
*   Hashe le token (`sha256`) avant de le stocker (`invitationTokenHash`).
*   Calcule la date d'expiration du token (`invitationTokenExpiresAt`).
*   Crée l'enregistrement `Membership` en base de données avec le statut `PENDING`.
*   Appelle `NotificationService.sendInvitationEmail` avec le token *en clair* et les détails nécessaires.

##### 4.1.2.2. `getInvitationDetails(plainToken)`
###### 4.1.2.2.1. Fonction
Valide un token d'invitation fourni (en clair) et retourne l'adresse email à laquelle l'invitation a été envoyée.
###### 4.1.2.2.2. Paramètres
| Nom du Paramètre | Type TypeScript | Description (et si optionnel)          |
|------------------|-----------------|----------------------------------------|
| `plainToken`     | `string`        | Le token d'invitation brut (non hashé). |
###### 4.1.2.2.3. Retour
*   **Type:** `Promise<{ invitedEmail: string }>`
*   **Description:** Un objet contenant l'adresse email associée au token valide.
###### 4.1.2.2.4. Logique Clé et Validations
*   Hashe le `plainToken` reçu.
*   Recherche en base de données un `Membership` correspondant au `invitationTokenHash`, ayant le statut `PENDING`, et dont la date `invitationTokenExpiresAt` est future.
*   Si aucun enregistrement correspondant n'est trouvé, lève une `InvitationTokenInvalidError` (404).

##### 4.1.2.3. `activateByToken(plainToken, userId)`
###### 4.1.2.3.1. Fonction
Active un `Membership` qui était en statut `PENDING`. Cela lie le `Membership` à un `userId` spécifique, met à jour son statut en `ACTIVE`, enregistre la date d'acceptation (`joinedAt`), et nettoie les informations relatives au token d'invitation pour empêcher sa réutilisation.
###### 4.1.2.3.2. Paramètres
| Nom du Paramètre | Type TypeScript | Description (et si optionnel)                                      |
|------------------|-----------------|--------------------------------------------------------------------|
| `plainToken`     | `string`        | Le token d'invitation brut que l'utilisateur a utilisé.            |
| `userId`         | `number`        | L'ID de l'utilisateur (`User`) qui accepte l'invitation (soit nouvellement créé, soit connecté). |
###### 4.1.2.3.3. Retour
*   **Type:** `Promise<Membership>`
*   **Description:** Retourne l'instance du modèle `Membership` mise à jour (avec statut `ACTIVE`, `userId` renseigné, etc.).
###### 4.1.2.3.4. Logique Clé et Validations
*   Hashe le `plainToken` reçu.
*   Recherche en base de données le `Membership` `PENDING` correspondant au hash et non expiré. Lève `InvitationTokenInvalidError` (400) si non trouvé.
*   Récupère l'`User` correspondant au `userId` fourni. Lève `UserNotFoundError` si non trouvé.
*   **Vérification de Sécurité Cruciale :** Compare l'`email` de l'`User` trouvé avec l'`invitedEmail` stocké dans le `Membership` PENDING. Lève `InvitationTokenInvalidError` (400) si les emails ne correspondent pas.
*   Met à jour l'enregistrement `Membership` : définit `userId`, change `status` en `ACTIVE`, définit `joinedAt`, et met `invitationTokenHash`, `invitationTokenExpiresAt`, `invitedEmail` à `NULL`.

##### 4.1.2.4. `notifyAdminsMemberJoined(activatedMembership)`
###### 4.1.2.4.1. Fonction
Informe tous les administrateurs actifs d'un établissement qu'un nouveau membre a rejoint leur équipe via une invitation.
###### 4.1.2.4.2. Paramètres
| Nom du Paramètre        | Type TypeScript        | Description (et si optionnel)                                      |
|-------------------------|------------------------|--------------------------------------------------------------------|
| `activatedMembership` | `MembershipAttributes` | L'objet représentant le membership qui vient d'être activé (`status=ACTIVE`). |
###### 4.1.2.4.3. Retour
*   **Type:** `Promise<void>`
*   **Description:** La fonction ne retourne rien mais déclenche l'envoi d'emails.
###### 4.1.2.4.4. Logique Clé et Validations
*   Récupère le `userId` et `establishmentId` depuis `activatedMembership`.
*   Récupère le `username` du nouveau membre et le `name` de l'établissement.
*   Trouve tous les autres `Membership`s actifs (`status='ACTIVE'`) ayant le rôle `ADMIN` pour le même `establishmentId`.
*   Pour chaque admin trouvé, récupère son email et appelle `NotificationService.sendMemberJoinedNotification`.
*   Gère les erreurs potentielles (ex: admin non trouvé) sans bloquer.

##### 4.1.2.5. `getMembershipsByEstablishment(establishmentId, actorMembership)`
###### 4.1.2.5.1. Fonction
Récupère la liste de tous les memberships (quel que soit leur statut : PENDING, ACTIVE, INACTIVE) associés à un établissement spécifique.
###### 4.1.2.5.2. Paramètres
| Nom du Paramètre    | Type TypeScript        | Description (et si optionnel)                                                         |
|---------------------|------------------------|---------------------------------------------------------------------------------------|
| `establishmentId`   | `number`               | L'ID de l'établissement dont on veut lister les membres.                               |
| `actorMembership` | `MembershipAttributes` | Le membership de l'utilisateur effectuant la requête (utilisé implicitement par le middleware pour l'autorisation). |
###### 4.1.2.5.3. Retour
*   **Type:** `Promise<Membership[]>`
*   **Description:** Un tableau d'instances `Membership`, incluant les informations de l'`User` associé (si non PENDING).
###### 4.1.2.5.4. Logique Clé et Validations
*   L'autorisation (vérifier que l'acteur est ADMIN de l'établissement) est gérée par le middleware `ensureMembership(['ADMIN'])` en amont.
*   Effectue une requête `Membership.findAll` filtrée par `establishmentId`.
*   Inclut l'association `User` pour récupérer les détails de l'utilisateur lié (username, email, etc.), en excluant les données sensibles.
*   Trie les résultats (par exemple, par rôle puis par date d'ajout).

##### 4.1.2.6. `getMembershipById(membershipId, establishmentId, actorMembership)`
###### 4.1.2.6.1. Fonction
Récupère les détails d'un enregistrement `Membership` spécifique.
###### 4.1.2.6.2. Paramètres
| Nom du Paramètre    | Type TypeScript        | Description (et si optionnel)                                      |
|---------------------|------------------------|--------------------------------------------------------------------|
| `membershipId`    | `number`               | L'ID du membership à récupérer.                                      |
| `establishmentId`   | `number`               | L'ID de l'établissement auquel le membership doit appartenir.        |
| `actorMembership` | `MembershipAttributes` | Le membership de l'utilisateur effectuant la requête (pour l'autorisation). |
###### 4.1.2.6.3. Retour
*   **Type:** `Promise<Membership>`
*   **Description:** L'instance `Membership` trouvée, incluant les détails de l'`User` associé.
###### 4.1.2.6.4. Logique Clé et Validations
*   L'autorisation (vérifier que l'acteur est `ADMIN` de l'établissement OU le propriétaire du `membershipId` demandé) est principalement gérée par le middleware `ensureAdminOrSelfForMembership` en amont, mais une vérification est également effectuée dans le service.
*   Effectue une requête `Membership.findOne` basée sur `membershipId` ET `establishmentId` pour s'assurer que le membership appartient bien à l'établissement attendu.
*   Inclut l'association `User`.
*   Lève une `MembershipNotFoundError` (404) si non trouvé.

##### 4.1.2.7. `updateMembership(membershipId, updateDto, actorMembership)`
###### 4.1.2.7.1. Fonction
Met à jour le statut (`ACTIVE`/`INACTIVE`) et/ou le rôle (`ADMIN`/`STAFF`) d'un `Membership` existant.
###### 4.1.2.7.2. Paramètres
| Nom du Paramètre    | Type TypeScript        | Description (et si optionnel)                                                     |
|---------------------|------------------------|-----------------------------------------------------------------------------------|
| `membershipId`    | `number`               | L'ID du membership à mettre à jour.                                               |
| `updateDto`         | `UpdateMembershipDto`  | DTO contenant les champs optionnels `status` et/ou `role` à mettre à jour.        |
| `actorMembership` | `MembershipAttributes` | Le membership ADMIN de l'utilisateur effectuant la modification (pour l'autorisation et la logique de protection). |
###### 4.1.2.7.3. Retour
*   **Type:** `Promise<Membership>`
*   **Description:** L'instance `Membership` mise à jour.
###### 4.1.2.7.4. Logique Clé et Validations
*   L'autorisation (vérifier que l'acteur est ADMIN de l'établissement cible) est gérée par le middleware `ensureAdminOfTargetMembership`.
*   Récupère le `targetMembership`. Lève `MembershipNotFoundError` (404) si non trouvé.
*   **Interdit la modification d'un membership PENDING** (lève `AppError` 400).
*   **Logique "Dernier Admin Actif" :** Si l'acteur essaie de se modifier lui-même (`actorMembership.userId === targetMembership.userId`) et est ADMIN :
    *   Compte les *autres* admins actifs dans l'établissement.
    *   Si le compte est 0 ET que la modification vise à changer le rôle (`!= ADMIN`) OU le statut (`= INACTIVE`), lève `CannotUpdateLastAdminError` (400).
*   **Logique "Propriétaire Établissement" :** Si la cible est le propriétaire de l'établissement (`targetMembership.userId === establishment.owner_id`) et que la modification vise à changer le rôle (`!= ADMIN`), lève `CannotUpdateLastAdminError` (400).
*   Applique les mises à jour (`targetMembership.update()`) uniquement si des changements sont demandés et valides.

##### 4.1.2.8. `deleteMembership(membershipId, actorMembership)`
###### 4.1.2.8.1. Fonction
Supprime un enregistrement `Membership` (retire un membre d'un établissement) ou révoque une invitation `PENDING`.
###### 4.1.2.8.2. Paramètres
| Nom du Paramètre    | Type TypeScript        | Description (et si optionnel)                                               |
|---------------------|------------------------|-----------------------------------------------------------------------------|
| `membershipId`    | `number`               | L'ID du membership à supprimer/révoquer.                                      |
| `actorMembership` | `MembershipAttributes` | Le membership ADMIN de l'utilisateur effectuant la suppression (pour l'autorisation et la logique de protection). |
###### 4.1.2.8.3. Retour
*   **Type:** `Promise<void>`
*   **Description:** Ne retourne rien en cas de succès.
###### 4.1.2.8.4. Logique Clé et Validations
*   L'autorisation (vérifier que l'acteur est ADMIN de l'établissement cible) est gérée par le middleware `ensureAdminOfTargetMembership`.
*   Récupère le `targetMembership`. Lève `MembershipNotFoundError` (404) si non trouvé.
*   **Logique "Dernier Admin" :** Si l'acteur essaie de se supprimer lui-même (`actorMembership.userId === targetMembership.userId`) ET que la cible est ADMIN :
    *   Compte les *autres* admins (actifs ou inactifs) dans l'établissement.
    *   Si le compte est 0, lève `CannotDeleteLastAdminError` (400).
*   Supprime l'enregistrement `Membership` (`targetMembership.destroy()`). Les dépendances (`StaffAvailability`, `ServiceMemberAssignment`) sont gérées par les `ON DELETE CASCADE` de la base de données. Les `Booking`s assignés auront leur `assignedMembershipId` mis à `NULL`.

### 4.2. `AuthService.ts` (Fonctions liées à l'invitation)

#### 4.2.1. Rôle et Responsabilités (focus sur l'inscription via invitation)

Bien que `AuthService` gère l'ensemble de l'authentification et de la gestion de session, son rôle spécifique dans le module "Gestion des Membres" est de **finaliser le processus d'acceptation d'une invitation lorsqu'un *nouvel* utilisateur s'inscrit**. Il orchestre la création du compte utilisateur, l'activation du membership associé à l'invitation, la création d'une session authentifiée pour le nouvel utilisateur, et le déclenchement de la notification à l'administrateur.

#### 4.2.2. Méthodes Publiques

##### 4.2.2.1. `registerViaInvitation(registerDto, req?)`
###### 4.2.2.1.1. Fonction
Gère l'inscription complète d'un nouvel utilisateur qui a cliqué sur un lien d'invitation valide. Cette méthode valide le token d'invitation, crée le compte utilisateur, active le membership correspondant, établit une session authentifiée, et notifie les administrateurs.
###### 4.2.2.1.2. Paramètres
| Nom du Paramètre  | Type TypeScript                           | Description (et si optionnel)                                                                                    |
|-------------------|-------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `registerDto`     | `RegisterViaInvitationDto`                | DTO contenant le `username` et le `password` choisis par le nouvel utilisateur, ainsi que le `token` d'invitation brut. |
| `req`             | `Request` (Express, optionnel)            | Objet requête Express, utilisé pour générer les tokens de session (`_generateAuthTokens`) et récupérer IP/User-Agent. |
###### 4.2.2.1.3. Retour
*   **Type:** `Promise<{ tokens: AuthTokensDto, membership: MembershipAttributes }>`
*   **Description:** Retourne un objet contenant les tokens d'authentification (`accessToken`, `refreshToken`) pour la nouvelle session utilisateur, ainsi que les attributs du `Membership` qui vient d'être activé.
###### 4.2.2.1.4. Logique Clé et Validations
*   Valide le DTO d'entrée (`RegisterViaInvitationSchema`).
*   Appelle `MembershipService.getInvitationDetails` pour valider le `token` et récupérer l'`invitedEmail` associé. Lève `InvitationTokenInvalidError` si invalide.
*   Appelle `UserService.createUser` pour créer le nouvel utilisateur avec le `username` (fourni par le DTO), le `password` (fourni par le DTO), et l'`invitedEmail` (récupéré du token d'invitation). **L'appel à `UserService.createUser` inclut une option indiquant que l'utilisateur est créé via un flux d'invitation (ex: `is_email_invitation: true`). Par conséquent, l'utilisateur est créé comme actif, son email est considéré comme vérifié, et il reçoit un email de bienvenu standard.**
*   Appelle `MembershipService.activateByToken` pour lier le `Membership` PENDING au `newUser.id`, changer son statut en `ACTIVE` et nettoyer les données du token.
*   Appelle `_generateAuthTokens` (méthode interne de `AuthService`) pour créer les JWT `accessToken` et `refreshToken` et enregistrer le refresh token en base de données.
*   Appelle `MembershipService.notifyAdminsMemberJoined` (de manière asynchrone, sans attendre la fin) pour informer les administrateurs de l'établissement.
*   Retourne les tokens et les informations du membership activé.

### 4.3. `UserService.ts` (Fonctions liées à la création via invitation)

#### 4.3.1. Rôle et Responsabilités (focus sur `createUser` appelé par `AuthService`)

Le `UserService` est responsable de la gestion des entités `User`. Dans le contexte des invitations, sa responsabilité principale est la **création effective de l'enregistrement `User`** lorsqu'un utilisateur s'inscrit via le flux d'invitation (`AuthService.registerViaInvitation`). Il assure l'unicité de l'email et du username et le hashage sécurisé du mot de passe.

#### 4.3.2. Méthodes Publiques

##### 4.3.2.1. `createUser(userData)` (aspects pertinents si différents pour invite)
###### 4.3.2.1.1. Fonction
Crée un nouvel enregistrement utilisateur en base de données.
###### 4.3.2.1.2. Paramètres
| Nom du Paramètre       | Type TypeScript                               | Description (et si optionnel)                                                                                                                                                                                             |
|------------------------|-----------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `userData`             | `CreateUserDto`                               | Objet contenant les informations du nouvel utilisateur (`username`, `email`, `password`, etc.).                                                                                                                          |
| `is_email_invitation`| `boolean` (Optionnel, défaut: `false`)         |  Indicateur spécifiant si la création de l'utilisateur émane d'un flux d'invitation où l'email est considéré comme pré-vérifié. Si `true`, l'utilisateur est créé comme actif, son email est marqué comme vérifié, et un email de bienvenue est envoyé. |
###### 4.3.2.1.3. Retour
*   **Type:** `Promise<User>`
*   **Description:** Retourne l'instance du modèle `User` nouvellement créé.
###### 4.3.2.1.4. Logique Clé et Validations (spécifique à l'invite)
*   Vérifie l'unicité de l'`email` et du `username` avant l'insertion. Lève `DuplicateEmailError` ou `DuplicateUsernameError` si nécessaire.
*   Hashe le `password` fourni en utilisant `bcrypt`.
*   **Spécificité du flux d'invitation (si `is_email_invitation` est `true`) :**
    *   L'utilisateur est créé avec les attributs `is_active: true` et `is_email_active: true`.
    *   Les champs `email_activation_token` et `email_activation_token_expires_at` sont laissés à `NULL` (ou non renseignés).
    *   Un email de bienvenue est envoyé à l'utilisateur. Le service `NotificationService.sendWelcomeEmail` est appelé.
*   **Flux d'inscription standard (si `is_email_invitation` est `false` ou non fourni) :**
    *   L'utilisateur est créé avec `is_active: false` et `is_email_active: false`.
    *   Un `email_activation_token` unique et une date d'expiration sont générés et stockés.
    *   Le service `NotificationService.sendActivationEmail` est appelé pour envoyer l'email d'activation contenant le token à l'utilisateur.

### 4.4. `NotificationService.ts`

#### 4.4.1. Rôle et Responsabilités (envoi des emails transactionnels pour les membres)

Le `NotificationService` est responsable de l'abstraction de l'envoi de communications sortantes. Dans le module "Gestion des Membres", il est spécifiquement utilisé pour envoyer les **emails transactionnels critiques** liés au processus d'invitation et d'acceptation. Il s'assure que les bonnes informations sont envoyées aux bonnes adresses email.

#### 4.4.2. Méthodes Publiques

##### 4.4.2.1. `sendInvitationEmail(toEmail, token, establishmentName, inviterName)`
###### 4.4.2.1.1. Fonction
Envoie un email à un utilisateur potentiel pour l'inviter à rejoindre un établissement spécifique sur la plateforme.
###### 4.4.2.1.2. Paramètres
| Nom du Paramètre    | Type TypeScript | Description (et si optionnel)                                                              |
|---------------------|-----------------|--------------------------------------------------------------------------------------------|
| `toEmail`           | `string`        | Adresse email du destinataire de l'invitation.                                             |
| `token`             | `string`        | Le token d'invitation **en clair** (non hashé) à inclure dans le lien d'acceptation.       |
| `establishmentName` | `string`        | Le nom de l'établissement qui envoie l'invitation.                                           |
| `inviterName`       | `string`        | Le nom d'utilisateur de l'administrateur qui a envoyé l'invitation.                          |
###### 4.4.2.1.3. Retour
*   **Type:** `Promise<void>`
*   **Description:** La promesse se résout lorsque l'email a été envoyé (ou loggué en cas d'échec non bloquant).
###### 4.4.2.1.4. Logique Clé
*   Construit le contenu HTML de l'email, incluant un lien cliquable formaté avec `FRONTEND_URL/accept-invitation/:token`.
*   Appelle la méthode d'envoi interne (`this.send`) avec le destinataire, le sujet et le contenu HTML.

##### 4.4.2.2. `sendMemberJoinedNotification(adminEmail, newMemberUsername, establishmentName)`
###### 4.4.2.2.1. Fonction
Notifie un administrateur d'établissement qu'un utilisateur a accepté une invitation et rejoint son équipe.
###### 4.4.2.2.2. Paramètres
| Nom du Paramètre    | Type TypeScript | Description (et si optionnel)                                      |
|---------------------|-----------------|--------------------------------------------------------------------|
| `adminEmail`        | `string`        | Adresse email de l'administrateur à notifier.                    |
| `newMemberUsername` | `string`        | Nom d'utilisateur du nouveau membre qui a rejoint.                 |
| `establishmentName` | `string`        | Nom de l'établissement qui a été rejoint.                          |
###### 4.4.2.2.3. Retour
*   **Type:** `Promise<void>`
*   **Description:** La promesse se résout lorsque l'email a été envoyé.
###### 4.4.2.2.4. Logique Clé
*   Construit le contenu de l'email informant l'admin de l'arrivée du nouveau membre.
*   Appelle la méthode d'envoi interne (`this.send`) avec l'email de l'admin, le sujet et le contenu HTML.
### 4.5. `AvailabilityService.ts` (Impact sur `getAvailability` pour Staff)

#### 4.5.1. Rôle et Responsabilités (calcul des disponibilités)

L'`AvailabilityService` joue un rôle central dans le système de réservation. Sa responsabilité principale est de déterminer et de retourner les créneaux horaires précis pendant lesquels un service donné peut être réservé par un client. Pour ce faire, il doit agréger et analyser plusieurs sources d'informations :

*   Les horaires d'ouverture généraux de l'établissement (définis par `AvailabilityRule` et `AvailabilityOverride`).
*   Les caractéristiques du service demandé (durée, capacité - bien que la capacité > 1 ne soit pas encore gérée dans le calcul des slots uniques).
*   Les réservations déjà existantes (`Booking`) pour exclure les créneaux occupés.
*   **Crucialement pour le module "Gestion des Membres" :** Les disponibilités spécifiques des membres du personnel (`StaffAvailability` via des règles `rrule`), lorsque la réservation concerne un service assigné à un membre spécifique ou que le calcul doit prendre en compte la disponibilité d'au moins un membre assigné.

Ce service est donc essentiel pour garantir que les réservations proposées aux clients sont valides et réalisables compte tenu des contraintes de l'établissement et de son personnel.

#### 4.5.2. Méthodes Publiques

##### 4.5.2.1. `getAvailability(params: { establishmentId, serviceId, dateRange, membershipId? })`

###### 4.5.2.1.1. Fonction
Calcule et retourne la liste des créneaux horaires de début disponibles pour un service spécifique au sein d'un établissement, sur une période donnée. Peut optionnellement calculer la disponibilité en fonction des horaires spécifiques d'un membre du personnel (Staff) assigné, en plus des contraintes générales de l'établissement.

###### 4.5.2.1.2. Paramètres

| Propriété du Paramètre | Type TypeScript              | Description (et si optionnel)                                                                                                    |
|------------------------|------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `establishmentId`      | `number`                     | ID de l'établissement concerné.                                                                                                 |
| `serviceId`            | `number`                     | ID du service pour lequel les disponibilités sont calculées. Utilisé pour déterminer la durée des créneaux.                             |
| `dateRange`            | `{ start: Date; end: Date }` | Objet définissant la période de début et de fin (inclusive) sur laquelle rechercher les disponibilités.                            |
| `membershipId`         | `number` (Optionnel)         | Si fourni, le calcul prendra en compte les règles de disponibilité (`StaffAvailability`) de ce membre spécifique, en intersection avec l'ouverture de l'établissement. |

###### 4.5.2.1.3. Retour
*   **Type:** `Promise<string[]>`
*   **Description:** Une liste de chaînes de caractères au format ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`), représentant les **date-heures de début** des créneaux disponibles pour le service demandé pendant la `dateRange`. Chaque créneau a une durée implicite définie par le `Service.durationMinutes`.

###### 4.5.2.1.4. Logique Clé et Validations
1.  **Récupération des Données Initiales :** Obtient les détails du `Service` (notamment `durationMinutes`) et de l'`Establishment`.
2.  **Calcul Disponibilité Établissement :** Génère les plages horaires d'ouverture générales de l'établissement pour la `dateRange` demandée, en se basant sur les `AvailabilityRule`s (règles récurrentes) et en appliquant les `AvailabilityOverride`s (exceptions).
3.  **Calcul Disponibilité Membre (si `membershipId` fourni) :**
    *   Récupère tous les enregistrements `StaffAvailability` actifs pour le `membershipId` donné et chevauchant la `dateRange`.
    *   Utilise une bibliothèque de parsing **`rrule`** (ex: `rrule.js`) pour interpréter chaque `rruleString`.
    *   Pour chaque règle `StaffAvailability`, génère les occurrences de *début* de bloc à l'intérieur de `dateRange` et des dates effectives de la règle.
    *   Crée des intervalles `[debutOccurrence, debutOccurrence + durationMinutes]` pour chaque occurrence.
    *   Sépare les intervalles de travail (`isWorking = true`) des intervalles d'indisponibilité (`isWorking = false`).
    *   Calcule les créneaux potentiels du membre en prenant l'ensemble des intervalles de travail et en y **soustrayant** les intervalles d'indisponibilité.
    *   **Intersection :** Calcule l'intersection entre les créneaux d'ouverture de l'établissement (étape 2) et les créneaux potentiels du membre. Le résultat représente les moments où l'établissement est ouvert ET le membre est disponible.
4.  **Utilisation des Créneaux de Base (si `membershipId` non fourni) :**
    *   Les créneaux d'ouverture de l'établissement (étape 2) sont utilisés comme base pour les étapes suivantes.
5.  **Génération des Slots Potentiels :** Divise les plages de disponibilité calculées (étape 3 ou 4) en créneaux discrets de la durée du service (`durationMinutes`).
6.  **Exclusion des Réservations Existantes :** Récupère toutes les `Booking`s confirmées ou en attente pour l'`establishmentId` (et le `serviceId`, et potentiellement le `membershipId` si fourni) qui chevauchent la `dateRange`.
7.  Soustrait les intervalles de temps des réservations existantes des slots potentiels générés à l'étape 5.
8.  **Formatage Final :** Convertit les heures de début des créneaux restants en chaînes de caractères ISO 8601 UTC.
9.  Retourne la liste des créneaux disponibles.

## 5. API : Contrôleurs et Endpoints

Cette section détaille l'interface de programmation applicative (API) RESTful fournie par le backend pour interagir avec le module "Gestion des Membres". Elle commence par une présentation des contrôleurs principaux impliqués et des endpoints qu'ils gèrent, avant de détailler chaque route individuellement dans la section 5.4. Les contrôleurs agissent comme la couche d'entrée de l'API, recevant les requêtes HTTP, validant les entrées (souvent via des DTOs), orchestrant les appels aux services métier appropriés, et formatant les réponses HTTP.

### 5.1. `EstablishmentController.ts` (pour les routes imbriquées)

#### 5.1.1. Rôle
Ce contrôleur gère les requêtes relatives aux ressources qui sont directement imbriquées sous un établissement spécifique (`/api/users/me/establishments/:establishmentId/...`). Dans le contexte de la gestion des membres, il est principalement responsable des actions initiées par un administrateur *sur son propre établissement* pour visualiser ou inviter des membres.

#### 5.1.2. Méthodes de Contrôleur et Endpoints Associés

| Nom de la Méthode du Contrôleur | Endpoint API Géré                                                             | Brève Description de l'Action                                       |
|---------------------------------|-------------------------------------------------------------------------------|---------------------------------------------------------------------|
| `inviteMember`                  | `POST /api/users/me/establishments/:establishmentId/memberships/invite`       | Initie une invitation pour un nouvel utilisateur à rejoindre l'établissement spécifié. |
| `getMemberships`                | `GET /api/users/me/establishments/:establishmentId/memberships`                 | Liste tous les membres (et invitations) de l'établissement spécifié, avec support de pagination, filtrage et tri.   |
| `getMembershipById`             | `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId` | Récupère les détails d'un membre spécifique de cet établissement.    |

### 5.2. `MembershipController.ts` (pour les routes non imbriquées ou spécifiques à un membership)

#### 5.2.1. Rôle
Ce contrôleur est dédié aux opérations qui ciblent un `Membership` spécifique par son ID unique, ou qui concernent le processus d'invitation/activation qui n'est pas directement lié à un établissement *dans l'URL* (comme la validation d'un token). Il gère la modification et la suppression des memberships, ainsi que les étapes d'acceptation d'invitation.

#### 5.2.2. Méthodes de Contrôleur et Endpoints Associés

| Nom de la Méthode du Contrôleur | Endpoint API Géré                                      | Brève Description de l'Action                                                              |
|---------------------------------|--------------------------------------------------------|--------------------------------------------------------------------------------------------|
| `getInvitationDetails`          | `GET /api/memberships/invitation-details/:token`       | Valide un token d'invitation et retourne l'email associé (action publique).              |
| `activateAfterLogin`            | `POST /api/memberships/activate-after-login`           | Permet à un utilisateur connecté de lier une invitation en attente à son compte.             |
| `updateMembership`              | `PATCH /api/memberships/:membershipId`                 | Modifie le statut ou le rôle d'un membership existant (action réservée à l'admin).      |
| `deleteMembership`              | `DELETE /api/memberships/:membershipId`                | Supprime un membership (retire un membre) ou révoque une invitation (action réservée à l'admin). |

### 5.3. `AuthController.ts` (pour l'inscription via invitation)

#### 5.3.1. Rôle
Le `AuthController` est principalement responsable des flux d'authentification standard (connexion, rafraîchissement de token, déconnexion, gestion MFA). Dans le contexte spécifique de la gestion des membres, il gère également le cas particulier de l'**inscription d'un nouvel utilisateur** qui découle directement d'une acceptation d'invitation.

#### 5.3.2. Méthodes de Contrôleur et Endpoints Associés

| Nom de la Méthode du Contrôleur | Endpoint API Géré                         | Brève Description de l'Action                                                                                                     |
|---------------------------------|-------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `registerViaInvitation`         | `POST /api/auth/register-via-invitation`  | Gère l'inscription d'un nouvel utilisateur en utilisant un token d'invitation valide, active le membership et crée une session. |

#### 5.4.1. Routes d'Invitation et d'Acceptation

Ce groupe de routes gère le processus complet permettant à un administrateur d'inviter un membre et à ce dernier d'accepter l'invitation.

##### 5.4.1.1. `POST /api/users/me/establishments/:establishmentId/memberships/invite`

| Attribut             | Détails                                                                                                                                                                                                                                                           |
|----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `POST`                                                                                                                                                                                                                                                            |
| **Chemin URL**       | `/api/users/me/establishments/:establishmentId/memberships/invite`                                                                                                                                                                                                |
| **Description**      | Permet à un administrateur authentifié et autorisé d'envoyer une invitation par e-mail à un utilisateur pour qu'il rejoigne l'établissement spécifié (`establishmentId`) en tant que membre `STAFF`. Crée un enregistrement `Membership` avec le statut `PENDING`. |
| **Middlewares**      | - **`requireAuth`**: Assure que la requête provient d'un utilisateur authentifié (JWT valide).<br>- **`ensureMembership(['ADMIN'])`**: Vérifie que l'utilisateur authentifié est un membre actif de l'établissement (`:establishmentId`) et qu'il possède le rôle `ADMIN`.<br>- **`verifyCsrfToken`**: Protège contre les attaques Cross-Site Request Forgery. |
| **Paramètres d'URL** | - **`establishmentId`** (number): Identifiant unique de l'établissement cible pour l'invitation. Requis.                                                                                                                                                           |
| **Corps de Requête** | - **Type:** `InviteMemberDto` (Voir Section 6.1)<br>- **Champs:**<br>  - `email` (string): Adresse e-mail valide de la personne à inviter. Obligatoire.<br>  - `role` (enum): Rôle à assigner. Actuellement, seule la valeur `'STAFF'` (issue de `MembershipRole.STAFF`) est acceptée. Obligatoire.<br>- **Validation:** Assurée par `InviteMemberSchema` (Zod).<br>- **Exemple JSON:**<br>  ```json<br>  {<br>    "email": "nouveau.membre@example.com",<br>    "role": "STAFF"<br>  }<br>  ``` |
| **Réponse Succès**   | - **Statut HTTP:** `201 Created`<br>- **Corps:** `{ message: string, membership: MembershipDto }`<br>  - `message`: Message de confirmation (ex: `"Invitation sent successfully to nouveau.membre@example.com."`).<br>  - `membership`: Le `MembershipDto` (Voir Section 6.5) représentant l'invitation créée. Champs clés : `status: 'PENDING'`, `userId: null`, `invitedEmail` (l'email invité), `role: 'STAFF'`, les autres champs (`id`, `establishmentId`, `createdAt`, etc.) sont renseignés. Le hash et l'expiration du token ne sont **pas** inclus. *(Note: En environnement de test, `plainInvitationToken` peut être ajouté pour faciliter les tests)*. |
| **Réponses Erreur**  | - **`400 Bad Request`**: Données du corps de requête invalides (email incorrect, rôle invalide, champ manquant). La réponse contient des détails sur l'erreur de validation.<br>- **`401 Unauthorized`**: Aucun token JWT valide fourni ou token expiré (géré par `requireAuth`).<br>- **`403 Forbidden`**: L'utilisateur authentifié n'est pas un membre `ADMIN` actif de l'établissement cible (géré par `ensureMembership`), ou échec de la vérification CSRF.<br>- **`404 Not Found`**: L'établissement avec l'`establishmentId` fourni n'existe pas (peut être retourné par `ensureMembership`).<br>- **`409 Conflict`**: L'adresse e-mail fournie correspond déjà à un membre actif/inactif ou à une invitation en attente pour cet établissement (géré par `MembershipService`).<br>- **`500 Internal Server Error`**: Erreur interne inattendue (ex: échec de la génération du token, problème base de données non géré). |

##### 5.4.1.2. `GET /api/memberships/invitation-details/:token`

| Attribut             | Détails                                                                                                                                                                                          |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `GET`                                                                                                                                                                                            |
| **Chemin URL**       | `/api/memberships/invitation-details/:token`                                                                                                                                                       |
| **Description**      | Valide un token d'invitation fourni (en clair) et retourne l'adresse e-mail associée. Cet endpoint est public et est typiquement appelé par le frontend lorsqu'un utilisateur clique sur un lien d'invitation, avant d'afficher le formulaire d'inscription/lien de connexion. |
| **Middlewares**      | Aucun (Route Publique).                                                                                                                                                                          |
| **Paramètres d'URL** | - **`token`** (string): Le token d'invitation brut (en clair, généralement 64 caractères hexadécimaux) extrait du lien d'invitation. Requis.                                                     |
| **Corps de Requête** | Aucun.                                                                                                                                                                                           |
| **Réponse Succès**   | - **Statut HTTP:** `200 OK`<br>- **Corps:** `InvitationDetailsDto` (Voir Section 6.2)<br>  - `invitedEmail`: L'adresse e-mail associée au token valide.                                        |
| **Réponses Erreur**  | - **`400 Bad Request`**: Le `token` fourni dans l'URL n'a pas le format attendu (ex: longueur incorrecte).<br>- **`404 Not Found`**: Le `token` fourni est invalide, a expiré, ou a déjà été utilisé (ne correspond à aucun `Membership` en statut `PENDING` valide). |

##### 5.4.1.3. `POST /api/auth/register-via-invitation`

| Attribut             | Détails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `POST`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Chemin URL**       | `/api/auth/register-via-invitation`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Description**      | Permet à un utilisateur non authentifié disposant d'un token d'invitation valide de créer un nouveau compte utilisateur sur la plateforme **et** d'accepter simultanément l'invitation correspondante. Cette route combine l'inscription standard et l'activation du membership en une seule étape atomique (via `AuthService.registerViaInvitation`).                                                                                                                                                                       |
| **Middlewares**      | Aucun (Route Publique).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Paramètres d'URL** | Aucun.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Corps de Requête** | - **Type:** `RegisterViaInvitationDto` (Voir Section 6.3)<br>- **Champs:**<br>  - `username` (string): Nom d'utilisateur choisi. Obligatoire. Doit être unique.<br>  - `password` (string): Mot de passe choisi. Obligatoire. Doit respecter les contraintes de sécurité (ex: longueur min).<br>  - `token` (string): Le token d'invitation brut (non hashé) reçu dans l'email. Obligatoire.<br>- **Validation:** Assurée par `RegisterViaInvitationSchema` (Zod).<br>- **Exemple JSON:**<br>  ```json<br>  {<br>    "username": "nouveau_staff_membre",<br>    "password": "MotDePasseSecurise123!",<br>    "token": "a1b2c3d4e5f6...token_brut_ici...7890"<br>  }<br>  ``` |
| **Réponse Succès**   | - **Statut HTTP:** `201 Created`<br>- **Corps:** `{ message: string, accessToken: string, membership: MembershipDto }`<br>  - `message`: Message de confirmation (ex: `"Account created and invitation accepted successfully."`).<br>  - `accessToken`: Un nouveau JSON Web Token d'accès pour la session de l'utilisateur nouvellement créé.<br>  - `membership`: Le `MembershipDto` (Voir Section 6.5) mis à jour, représentant le membre nouvellement activé (`status: 'ACTIVE'`, `userId` correspondant au nouvel utilisateur, champs d'invitation nettoyés).<br>- **Cookies:** La réponse positionne également les cookies nécessaires à la session :<br>  - `refreshToken`: Cookie HttpOnly contenant le refresh token.<br>  - `csrfSecret` / `XSRF-TOKEN`: Cookies pour la protection CSRF. |
| **Réponses Erreur**  | - **`400 Bad Request`**: <br>    - Données du DTO invalides (username/password non conformes, token manquant ou mal formaté).<br>    - Le `token` fourni est invalide, a expiré, ou a déjà été utilisé (erreur levée par `MembershipService` appelé par `AuthService`).<br>- **`409 Conflict`**: <br>    - Le `username` fourni est déjà utilisé par un autre compte.<br>    - L'adresse `email` associée au `token` d'invitation est déjà utilisée par un autre compte existant (vérifié par `UserService` avant création).<br>- **`500 Internal Server Error`**: Erreur interne lors de la création de l'utilisateur, de l'activation du membership, de la génération des tokens, ou d'une autre étape critique. |

##### 5.4.1.4. `POST /api/memberships/activate-after-login`

| Attribut             | Détails                                                                                                                                                                                                                                                                                                                                   |
|----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `POST`                                                                                                                                                                                                                                                                                                                                    |
| **Chemin URL**       | `/api/memberships/activate-after-login`                                                                                                                                                                                                                                                                                                   |
| **Description**      | Permet à un utilisateur **déjà authentifié** (qui s'est connecté après avoir cliqué sur un lien d'invitation) de lier une invitation en attente (identifiée par le `token`) à son compte existant. Le backend vérifie que l'email de l'utilisateur connecté correspond à l'email de l'invitation avant d'activer le `Membership`. |
| **Middlewares**      | - **`requireAuth`**: Assure que la requête provient d'un utilisateur authentifié et attache `req.user`.                                                                                                                                                                                                                                   |
| **Paramètres d'URL** | Aucun.                                                                                                                                                                                                                                                                                                                                    |
| **Corps de Requête** | - **Type:** `ActivateMembershipDto` (Voir Section 6.4)<br>- **Champs:**<br>  - `token` (string): Le token d'invitation brut (non hashé) extrait du lien original. Obligatoire.<br>- **Validation:** Assurée par `ActivateMembershipSchema` (Zod).<br>- **Exemple JSON:**<br>  ```json<br>  {<br>    "token": "a1b2c3d4e5f6...token_brut_ici...7890"<br>  }<br>  ``` |
| **Réponse Succès**   | - **Statut HTTP:** `200 OK`<br>- **Corps:** `{ message: string, membership: MembershipDto }`<br>  - `message`: Message de confirmation (ex: `"Invitation accepted and linked to your account successfully."`).<br>  - `membership`: Le `MembershipDto` (Voir Section 6.5) mis à jour (`status: 'ACTIVE'`, `userId` correspondant à l'utilisateur connecté, champs d'invitation nettoyés). |
| **Réponses Erreur**  | - **`400 Bad Request`**: <br>    - Données du DTO invalides (token manquant ou mal formaté).<br>    - Le `token` fourni est invalide, a expiré, ou a déjà été utilisé.<br>    - L'email de l'utilisateur connecté (`req.user.email`) ne correspond pas à l'`invitedEmail` associé au `token`.<br>- **`401 Unauthorized`**: Utilisateur non authentifié (échec du middleware `requireAuth`).<br>- **`500 Internal Server Error`**: Erreur interne lors de la validation du token, de la récupération de l'utilisateur ou de la mise à jour du membership. |

#### 5.4.2. Routes CRUD de Gestion des Membres (par Admin)

Ce groupe de routes permet aux administrateurs d'établissements de gérer les membres de leur équipe : lister, consulter, modifier leur statut/rôle, et les supprimer.

##### 5.4.2.1. `GET /api/users/me/establishments/:establishmentId/memberships`

| Attribut             | Détails                                                                                                                                                                                                                                                           |
|----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `GET`                                                                                                                                                                                                                                                             |
| **Chemin URL**       | `/api/users/me/establishments/:establishmentId/memberships`                                                                                                                                                                                                         |
| **Description**      | Récupère une liste paginée, filtrable et triable des enregistrements `Membership` (incluant les invitations en attente et les membres actifs/inactifs) pour un établissement spécifique. Réservé aux administrateurs de cet établissement.                   |
| **Middlewares**      | - **`requireAuth`**: Assure que l'utilisateur est authentifié.<br>- **`ensureMembership(['ADMIN'])`**: Vérifie que l'utilisateur authentifié est un membre actif de l'établissement (`:establishmentId`) et qu'il possède le rôle `ADMIN`.                       |
| **Paramètres d'URL** | - **`establishmentId`** (number): Identifiant unique de l'établissement dont les membres doivent être listés. Requis.                                                                                                                                             |
| **Paramètres de Requête (Query Params)** | Voir la sous-section détaillée ci-dessous.                                                                                                                                                                                                                |
| **Corps de Requête** | Aucun.                                                                                                                                                                                                                                                            |
| **Réponse Succès**   | - **Statut HTTP:** `200 OK`<br>- **Corps:**<br>  ```json<br>  {<br>    "data": [ /* Array de MembershipDto (Voir Section 6.5) */ ],<br>    "pagination": {<br>      "totalItems": Number,  /* Nombre total d'éléments correspondant aux filtres */ <br>      "totalPages": Number,  /* Nombre total de pages */ <br>      "currentPage": Number, /* Page actuellement retournée */ <br>      "itemsPerPage": Number /* Nombre d'éléments par page (limite effective) */ <br>    }<br>  }<br>  ```<br>  - Le tableau `data` contient les `MembershipDto`. Pour les invitations `PENDING`, le champ `user` sera `null` et `invitedEmail` sera renseigné. Pour les autres, `user` sera renseigné et `invitedEmail` sera `null`. |
| **Réponses Erreur**  | - **`400 Bad Request`**: L'`establishmentId` ou les paramètres de requête (pagination, filtre, tri) sont invalides. La réponse contient des détails sur l'erreur de validation.<br>- **`401 Unauthorized`**: Utilisateur non authentifié.<br>- **`403 Forbidden`**: L'utilisateur authentifié n'est pas un membre `ADMIN` actif de cet établissement.<br>- **`404 Not Found`**: L'établissement avec l'`establishmentId` fourni n'existe pas (peut être retourné par `ensureMembership`). |

###### 5.4.2.1.1. Paramètres de Requête (Query Parameters) pour `GET /.../memberships`

| Paramètre   | Type (Validation Zod)          | Optionnel / Défaut                            | Description                                                                                                                            | Valeurs Possibles (Enum)                                                                 |
|-------------|--------------------------------|-----------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| `page`      | `number`                       | Optionnel, Défaut: `1`                        | Numéro de la page souhaitée pour la pagination.                                                                                        | Entier positif.                                                                          |
| `limit`     | `number`                       | Optionnel, Défaut: `10`                       | Nombre d'éléments par page. Maximum autorisé : `100`.                                                                                  | Entier positif, max `100`.                                                               |
| `status`    | `string`                       | Optionnel                                     | Filtre les membres par leur statut.                                                                                                    | `PENDING`, `ACTIVE`, `INACTIVE`, `REVOKED` (issus de `MembershipStatus`)                   |
| `role`      | `string`                       | Optionnel                                     | Filtre les membres par leur rôle.                                                                                                      | `ADMIN`, `STAFF` (issus de `MembershipRole`)                                             |
| `search`    | `string`                       | Optionnel                                     | Terme de recherche. Recherche une sous-chaîne partielle (insensible à la casse) dans `User.username`, `User.email`, et `Membership.invitedEmail`. Longueur minimale : 1 caractère. | Texte libre.                                                                             |
| `sortBy`    | `string`                       | Optionnel, Défaut: `createdAt`                | Champ sur lequel trier les résultats.                                                                                                    | `createdAt`, `joinedAt`, `username`, `email`, `role`, `status`                           |
| `sortOrder` | `string`                       | Optionnel, Défaut: (variable)                 | Ordre de tri. Le défaut est `DESC` pour les dates (`createdAt`, `joinedAt`) et `ASC` pour les autres champs (`username`, `email`, `role`, `status`). | `ASC` (ascendant), `DESC` (descendant)                                                   |

**Note sur la Recherche (`search`) :**
*   La recherche est conçue pour être une recherche globale simple.
*   Sur de très grands volumes de données, les recherches de type "contient" (`%term%`) peuvent impacter la performance. Des optimisations (ex: recherche full-text) pourraient être nécessaires à l'avenir.

**Note sur le Tri (`sortBy`) :**
*   `username` et `email` trient sur les champs du modèle `User` associé.
*   Les valeurs `NULL` (ex: `joinedAt` pour les membres `PENDING`) sont triées selon le comportement par défaut du SGBD (`NULLS FIRST` ou `NULLS LAST`).
*   Un tri secondaire par `Membership.id` (ASC) est appliqué pour assurer une pagination stable.

##### 5.4.2.2. `GET /api/users/me/establishments/:establishmentId/memberships/:membershipId`

| Attribut             | Détails                                                                                                                                                                                                                                                                         |
|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `GET`                                                                                                                                                                                                                                                                           |
| **Chemin URL**       | `/api/users/me/establishments/:establishmentId/memberships/:membershipId`                                                                                                                                                                                                         |
| **Description**      | Récupère les détails complets d'un enregistrement `Membership` spécifique au sein d'un établissement donné. Accessible par les administrateurs de l'établissement (pour voir n'importe quel membre) et par le membre lui-même (pour voir ses propres informations de membership). |
| **Middlewares**      | - **`requireAuth`**: Assure que l'utilisateur est authentifié.<br>- **`ensureAdminOrSelfForMembership`**: Vérifie que l'utilisateur authentifié est soit un `ADMIN` actif de l'établissement (`:establishmentId`), soit l'utilisateur (`userId`) associé au `Membership` (`:membershipId`) demandé. |
| **Paramètres d'URL** | - **`establishmentId`** (number): Identifiant unique de l'établissement. Requis.<br>- **`membershipId`** (number): Identifiant unique du membership à récupérer. Requis.                                                                                                             |
| **Corps de Requête** | Aucun.                                                                                                                                                                                                                                                                          |
| **Réponse Succès**   | - **Statut HTTP:** `200 OK`<br>- **Corps:** `MembershipDto` (Voir Section 6.5)<br>  - L'objet `MembershipDto` complet pour le membre demandé, incluant les informations de l'utilisateur associé (si non PENDING).                                                              |
| **Réponses Erreur**  | - **`400 Bad Request`**: L'`establishmentId` ou le `membershipId` fourni n'est pas un nombre valide.<br>- **`401 Unauthorized`**: Utilisateur non authentifié.<br>- **`403 Forbidden`**: L'utilisateur authentifié n'est ni un `ADMIN` actif de cet établissement, ni le propriétaire du `Membership` demandé.<br>- **`404 Not Found`**: Le `membershipId` n'existe pas ou n'appartient pas à l'`establishmentId` spécifié. |

##### 5.4.2.3. `PATCH /api/memberships/:membershipId`

| Attribut             | Détails                                                                                                                                                                                                                                                                                                                                                                                     |
|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `PATCH`                                                                                                                                                                                                                                                                                                                                                                                     |
| **Chemin URL**       | `/api/memberships/:membershipId`                                                                                                                                                                                                                                                                                                                                                            |
| **Description**      | Permet à un administrateur authentifié de modifier le statut (`ACTIVE` <-> `INACTIVE`) et/ou le rôle (`STAFF` <-> `ADMIN`) d'un membre existant (non-PENDING) au sein de son établissement. Inclut des protections pour empêcher de bloquer l'accès administrateur (dernier admin, propriétaire).                                                                                               |
| **Middlewares**      | - **`requireAuth`**: Assure que l'utilisateur est authentifié.<br>- **`ensureAdminOfTargetMembership`**: Vérifie que l'utilisateur authentifié est un membre `ADMIN` actif de l'établissement auquel appartient le `Membership` cible (`:membershipId`).<br>- **`verifyCsrfToken`**: Protection contre les attaques CSRF.                                                                       |
| **Paramètres d'URL** | - **`membershipId`** (number): Identifiant unique du membership à modifier. Requis.                                                                                                                                                                                                                                                                                                       |
| **Corps de Requête** | - **Type:** `UpdateMembershipDto` (Voir Section 6.6)<br>- **Champs:**<br>  - `status` (enum `MembershipStatus`, optionnel): Nouveau statut souhaité (typiquement `ACTIVE` ou `INACTIVE`).<br>  - `role` (enum `MembershipRole`, optionnel): Nouveau rôle souhaité (`ADMIN` ou `STAFF`).<br>  *Au moins un des deux champs doit être fourni.*<br>- **Validation:** Assurée par `UpdateMembershipSchema` (Zod, avec `.refine`).<br>- **Exemple JSON (changer statut):**<br>  ```json<br>  { "status": "INACTIVE" }<br>  ```<br>- **Exemple JSON (changer rôle):**<br>  ```json<br>  { "role": "ADMIN" }<br>  ``` |
| **Réponse Succès**   | - **Statut HTTP:** `200 OK`<br>- **Corps:** `MembershipDto` (Voir Section 6.5)<br>  - L'objet `MembershipDto` complet représentant l'état du membre *après* la mise à jour.                                                                                                                                                                                                        |
| **Réponses Erreur**  | - **`400 Bad Request`**: <br>    - Données du DTO invalides (statut/rôle inconnu, aucun champ fourni).<br>    - Tentative de modifier un `Membership` avec statut `PENDING`.<br>    - Violation de la logique de protection "dernier admin" (tentative de désactivation ou de changement de rôle du dernier admin/owner).<br>- **`401 Unauthorized`**: Utilisateur non authentifié.<br>- **`403 Forbidden`**: L'utilisateur authentifié n'est pas un `ADMIN` actif de l'établissement du membre cible, ou échec CSRF.<br>- **`404 Not Found`**: Le `membershipId` fourni n'existe pas. |

##### 5.4.2.4. `DELETE /api/memberships/:membershipId`

| Attribut             | Détails                                                                                                                                                                                                                                                                                                                                                                            |
|----------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `DELETE`                                                                                                                                                                                                                                                                                                                                                                           |
| **Chemin URL**       | `/api/memberships/:membershipId`                                                                                                                                                                                                                                                                                                                                                   |
| **Description**      | Permet à un administrateur authentifié de supprimer définitivement un enregistrement `Membership`. Si le `Membership` était `PENDING`, cela révoque l'invitation. Si le `Membership` était `ACTIVE` ou `INACTIVE`, cela retire le membre de l'établissement. Inclut une protection pour empêcher un admin de se supprimer s'il est le dernier de l'établissement.                  |
| **Middlewares**      | - **`requireAuth`**: Assure que l'utilisateur est authentifié.<br>- **`ensureAdminOfTargetMembership`**: Vérifie que l'utilisateur authentifié est un membre `ADMIN` actif de l'établissement auquel appartient le `Membership` cible (`:membershipId`).<br>- **`verifyCsrfToken`**: Protection contre les attaques CSRF.                                                              |
| **Paramètres d'URL** | - **`membershipId`** (number): Identifiant unique du membership à supprimer/révoquer. Requis.                                                                                                                                                                                                                                                                                     |
| **Corps de Requête** | Aucun.                                                                                                                                                                                                                                                                                                                                                                             |
| **Réponse Succès**   | - **Statut HTTP:** `204 No Content`<br>- **Corps:** Aucun.                                                                                                                                                                                                                                                                                                                         |
| **Réponses Erreur**  | - **`400 Bad Request`**: Violation de la logique de protection "dernier admin" (tentative de suppression du dernier admin par lui-même).<br>- **`401 Unauthorized`**: Utilisateur non authentifié.<br>- **`403 Forbidden`**: L'utilisateur authentifié n'est pas un `ADMIN` actif de l'établissement du membre cible, ou échec CSRF.<br>- **`404 Not Found`**: Le `membershipId` fourni n'existe pas. |

#### 5.4.3. Routes CRUD de Gestion des Disponibilités Staff

Ce groupe de routes permet aux administrateurs ou aux membres Staff eux-mêmes de définir et de gérer les règles de disponibilité (`rrule`) qui déterminent les plages horaires de travail ou d'absence pour un membre spécifique.

##### 5.4.3.1. `POST /api/memberships/:membershipId/availabilities`

| Attribut             | Détails                                                                                                                                                                                                                                                                                                                                                                |
|----------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `POST`                                                                                                                                                                                                                                                                                                                                                                 |
| **Chemin URL**       | `/api/memberships/:membershipId/availabilities`                                                                                                                                                                                                                                                                                                                        |
| **Description**      | Crée une nouvelle règle de disponibilité (ou d'indisponibilité) basée sur `rrule` pour un membre Staff spécifique (`membershipId`). Permet de définir des horaires récurrents ou ponctuels. Accessible par l'admin de l'établissement ou le membre Staff lui-même.                                                                                                           |
| **Middlewares**      | - **`requireAuth`**: Assure que l'utilisateur est authentifié.<br>- **`ensureMembershipAccess`**: Vérifie que l'utilisateur authentifié est soit un `ADMIN` de l'établissement auquel appartient le `membershipId` cible, soit l'utilisateur associé à ce `membershipId`.<br>- **`verifyCsrfToken`**: Protection contre les attaques CSRF.                               |
| **Paramètres d'URL** | - **`membershipId`** (number): Identifiant unique du `Membership` pour lequel créer la règle de disponibilité. Requis.                                                                                                                                                                                                                                             |
| **Corps de Requête** | - **Type:** `CreateStaffAvailabilityDto` (Voir Section 6.8)<br>- **Champs:**<br>  - `rruleString` (string): La règle de récurrence au format RFC 5545 (ex: `'FREQ=WEEKLY;BYDAY=MO,TU;DTSTART=20240902T090000Z'`). Obligatoire.<br>  - `durationMinutes` (number): Durée en minutes de chaque bloc généré. Obligatoire, doit être > 0.<br>  - `effectiveStartDate` (string): Date de début d'application (`YYYY-MM-DD`). Obligatoire.<br>  - `effectiveEndDate` (string \| null): Date de fin d'application (`YYYY-MM-DD`). Optionnel.<br>  - `isWorking` (boolean): `true` pour disponibilité, `false` pour indisponibilité. Obligatoire.<br>  - `description` (string \| null): Description optionnelle. Optionnel.<br>- **Validation:** Assurée par Zod (format `rrule` non validé syntaxiquement ici, mais les types et la présence sont vérifiés). La validation métier (ex: validité de la `rruleString`) se fait dans le service.<br>- **Exemple JSON:**<br>  ```json<br>  {<br>    "rruleString": "FREQ=WEEKLY;BYDAY=TU,TH;DTSTART=20240903T140000Z;INTERVAL=1",<br>    "durationMinutes": 120,<br>    "effectiveStartDate": "2024-09-01",<br>    "isWorking": true,<br>    "description": "Après-midis fixes"<br>  }<br>  ``` |
| **Réponse Succès**   | - **Statut HTTP:** `201 Created`<br>- **Corps:** `StaffAvailabilityDto` (Voir Section 6.7)<br>  - L'objet représentant la règle de disponibilité nouvellement créée, incluant son `id` généré et les timestamps.                                                                                                                                              |
| **Réponses Erreur**  | - **`400 Bad Request`**: Données du DTO invalides (champ manquant, type incorrect, `durationMinutes` <= 0). Peut aussi indiquer une `rruleString` invalide si le service la valide.<br>- **`401 Unauthorized`**: Utilisateur non authentifié.<br>- **`403 Forbidden`**: L'utilisateur n'est ni Admin de l'établissement, ni le membre concerné (`ensureMembershipAccess`), ou échec CSRF.<br>- **`404 Not Found`**: Le `membershipId` fourni n'existe pas. |

##### 5.4.3.2. `GET /api/memberships/:membershipId/availabilities`

| Attribut             | Détails                                                                                                                                                                                          |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `GET`                                                                                                                                                                                            |
| **Chemin URL**       | `/api/memberships/:membershipId/availabilities`                                                                                                                                                    |
| **Description**      | Récupère la liste de toutes les règles de disponibilité (`StaffAvailability`) définies pour un membre Staff spécifique (`membershipId`). Accessible par l'admin de l'établissement ou le membre lui-même. |
| **Middlewares**      | - **`requireAuth`**: Assure que l'utilisateur est authentifié.<br>- **`ensureMembershipAccess`**: Vérifie que l'utilisateur est soit `ADMIN` de l'établissement, soit le membre (`membershipId`) lui-même.   |
| **Paramètres d'URL** | - **`membershipId`** (number): Identifiant unique du `Membership` dont les disponibilités doivent être listées. Requis.                                                                          |
| **Corps de Requête** | Aucun.                                                                                                                                                                                           |
| **Réponse Succès**   | - **Statut HTTP:** `200 OK`<br>- **Corps:** `StaffAvailabilityDto[]` (Voir Section 6.7)<br>  - Un tableau contenant tous les objets `StaffAvailabilityDto` pour le membre spécifié. Le tableau peut être vide. |
| **Réponses Erreur**  | - **`400 Bad Request`**: Le `membershipId` fourni n'est pas un nombre valide.<br>- **`401 Unauthorized`**: Utilisateur non authentifié.<br>- **`403 Forbidden`**: L'utilisateur n'est ni Admin de l'établissement, ni le membre concerné (`ensureMembershipAccess`).<br>- **`404 Not Found`**: Le `membershipId` fourni n'existe pas. |

##### 5.4.3.3. `PUT /api/memberships/:membershipId/availabilities/:availabilityId`

| Attribut             | Détails                                                                                                                                                                                                                                                                                          |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `PUT`                                                                                                                                                                                                                                                                                            |
| **Chemin URL**       | `/api/memberships/:membershipId/availabilities/:availabilityId`                                                                                                                                                                                                                                  |
| **Description**      | Met à jour une règle de disponibilité `StaffAvailability` existante (identifiée par `availabilityId`) pour un membre Staff spécifique (`membershipId`). Remplace toutes les propriétés de la règle par celles fournies. Accessible par l'admin de l'établissement ou le membre Staff lui-même. |
| **Middlewares**      | - **`requireAuth`**: Assure que l'utilisateur est authentifié.<br>- **`ensureMembershipAccess`**: Vérifie que l'utilisateur est soit `ADMIN` de l'établissement, soit le membre (`membershipId`) lui-même.<br>- **`verifyCsrfToken`**: Protection contre les attaques CSRF.                      |
| **Paramètres d'URL** | - **`membershipId`** (number): Identifiant du `Membership` concerné. Requis.<br>- **`availabilityId`** (number): Identifiant de la règle `StaffAvailability` spécifique à mettre à jour. Requis.                                                                                                     |
| **Corps de Requête** | - **Type:** `CreateStaffAvailabilityDto` (Utilisation de `Create...` car PUT remplace l'entité, tous les champs sont requis) (Voir Section 6.8)<br>- **Champs:** `rruleString`, `durationMinutes`, `effectiveStartDate`, `effectiveEndDate` (nullable), `isWorking`, `description` (nullable).<br>- **Validation:** Assurée par Zod.<br>- **Exemple JSON:**<br>  ```json<br>  {<br>    "rruleString": "FREQ=WEEKLY;BYDAY=WE;DTSTART=20240904T090000Z;INTERVAL=2",<br>    "durationMinutes": 240,<br>    "effectiveStartDate": "2024-09-01",<br>    "effectiveEndDate": "2024-12-31",<br>    "isWorking": true,<br>    "description": "Mercredis Matins (Semaines paires)"<br>  }<br>  ``` |
| **Réponse Succès**   | - **Statut HTTP:** `200 OK`<br>- **Corps:** `StaffAvailabilityDto` (Voir Section 6.7)<br>  - L'objet représentant la règle de disponibilité *après* mise à jour complète.                                                                                                                            |
| **Réponses Erreur**  | - **`400 Bad Request`**: <br>    - IDs dans l'URL invalides.<br>    - Données du DTO invalides.<br>- **`401 Unauthorized`**: Utilisateur non authentifié.<br>- **`403 Forbidden`**: L'utilisateur n'est ni Admin, ni le membre concerné, ou échec CSRF.<br>- **`404 Not Found`**: Le `membershipId` ou l'`availabilityId` n'existe pas, ou l'availability ne correspond pas au membership. |

##### 5.4.3.4. `DELETE /api/memberships/:membershipId/availabilities/:availabilityId`

| Attribut             | Détails                                                                                                                                                                                                                                                  |
|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Méthode HTTP**     | `DELETE`                                                                                                                                                                                                                                                 |
| **Chemin URL**       | `/api/memberships/:membershipId/availabilities/:availabilityId`                                                                                                                                                                                            |
| **Description**      | Supprime une règle de disponibilité `StaffAvailability` spécifique (identifiée par `availabilityId`) pour un membre Staff (`membershipId`). Accessible par l'admin de l'établissement ou le membre Staff lui-même.                                           |
| **Middlewares**      | - **`requireAuth`**: Assure que l'utilisateur est authentifié.<br>- **`ensureMembershipAccess`**: Vérifie que l'utilisateur est soit `ADMIN` de l'établissement, soit le membre (`membershipId`) lui-même.<br>- **`verifyCsrfToken`**: Protection CSRF. |
| **Paramètres d'URL** | - **`membershipId`** (number): Identifiant du `Membership` concerné. Requis.<br>- **`availabilityId`** (number): Identifiant de la règle `StaffAvailability` spécifique à supprimer. Requis.                                                                |
| **Corps de Requête** | Aucun.                                                                                                                                                                                                                                                   |
| **Réponse Succès**   | - **Statut HTTP:** `204 No Content`<br>- **Corps:** Aucun.                                                                                                                                                                                               |
| **Réponses Erreur**  | - **`400 Bad Request`**: IDs dans l'URL invalides.<br>- **`401 Unauthorized`**: Utilisateur non authentifié.<br>- **`403 Forbidden`**: L'utilisateur n'est ni Admin, ni le membre concerné, ou échec CSRF.<br>- **`404 Not Found`**: Le `membershipId` ou l'`availabilityId` n'existe pas, ou l'availability ne correspond pas au membership. |

## 6. DTOs (Data Transfer Objects) Clés

Cette section fournit une définition détaillée de chaque Data Transfer Object (DTO) utilisé pour structurer les données échangées entre le client (frontend ou autre consommateur d'API) et le serveur backend pour les fonctionnalités de gestion des membres. Ces DTOs servent de contrat de données et sont validés (pour les requêtes) à l'aide de Zod.

### 6.1. `InviteMemberDto` (Requête)

Structure de données attendue dans le corps de la requête `POST /api/users/me/establishments/:establishmentId/memberships/invite` pour inviter un nouveau membre.

| Nom du Champ | Type TypeScript                    | Obligatoire / Optionnel | Validation (Zod / Règles Spécifiques)                 | Description                                                                 |
|--------------|------------------------------------|-------------------------|-------------------------------------------------------|-----------------------------------------------------------------------------|
| `email`      | `string`                           | Obligatoire             | `.email()`                                            | Adresse e-mail valide de la personne à inviter.                             |
| `role`       | `'STAFF'` (enum `MembershipRole`) | Obligatoire             | `.literal(MembershipRole.STAFF)` ou `.enum([MembershipRole.STAFF])` | Rôle initial à assigner. Actuellement, seule l'invitation de `STAFF` est supportée. |

### 6.2. `InvitationDetailsDto` (Réponse)

Structure de données retournée par `GET /api/memberships/invitation-details/:token` lorsque le token d'invitation est valide.

| Nom du Champ   | Type TypeScript | Obligatoire / Optionnel | Validation (Zod / Règles Spécifiques) | Description                                                 |
|----------------|-----------------|-------------------------|---------------------------------------|-------------------------------------------------------------|
| `invitedEmail` | `string`        | Obligatoire             | `.email()` (validé à la création de l'invitation) | Adresse e-mail associée au token d'invitation valide. |

### 6.3. `RegisterViaInvitationDto` (Requête)

Structure de données attendue dans le corps de la requête `POST /api/auth/register-via-invitation` lorsqu'un nouvel utilisateur s'inscrit en utilisant un token d'invitation.

| Nom du Champ | Type TypeScript | Obligatoire / Optionnel | Validation (Zod / Règles Spécifiques)                                                               | Description                                                                 |
|--------------|-----------------|-------------------------|-----------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| `username`   | `string`        | Obligatoire             | `.min(3)`, `.max(50)` (ou selon règles `User`)                                                        | Nom d'utilisateur choisi par le nouvel utilisateur. Doit être unique.       |
| `password`   | `string`        | Obligatoire             | `.min(8)` (ou selon règles de complexité `User`)                                                      | Mot de passe choisi par le nouvel utilisateur.                               |
| `token`      | `string`        | Obligatoire             | `.length(64)` (ou selon longueur token généré)                                                        | Le token d'invitation brut (non hashé) extrait du lien d'invitation cliqué. |

### 6.4. `ActivateMembershipDto` (Requête)

Structure de données attendue dans le corps de la requête `POST /api/memberships/activate-after-login` lorsqu'un utilisateur déjà connecté active une invitation en attente.

| Nom du Champ | Type TypeScript | Obligatoire / Optionnel | Validation (Zod / Règles Spécifiques)                 | Description                                                                 |
|--------------|-----------------|-------------------------|-------------------------------------------------------|-----------------------------------------------------------------------------|
| `token`      | `string`        | Obligatoire             | `.length(64)` (ou selon longueur token généré)        | Le token d'invitation brut (non hashé) extrait du lien d'invitation cliqué. |

### 6.5. `MembershipDto` (Réponse)

Structure de données standard retournée par l'API pour représenter un enregistrement de membership (invitation ou membre actif/inactif). Typiquement généré via la fonction `mapToMembershipDto`.

| Nom du Champ      | Type TypeScript                                                              | Obligatoire / Optionnel | Validation (Zod / Règles Spécifiques)                                    | Description                                                                                                                          |
|-------------------|------------------------------------------------------------------------------|-------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `id`              | `number`                                                                     | Obligatoire             | `.number().int().positive()`                                             | Identifiant unique du membership.                                                                                                      |
| `establishmentId` | `number`                                                                     | Obligatoire             | `.number().int().positive()`                                             | Identifiant de l'établissement auquel ce membership est rattaché.                                                                    |
| `role`            | `'ADMIN' \| 'STAFF'` (enum `MembershipRole`)                                | Obligatoire             | `.nativeEnum(MembershipRole)`                                            | Rôle du membre dans cet établissement.                                                                                              |
| `status`          | `'PENDING' \| 'ACTIVE' \| 'INACTIVE' \| 'REVOKED'` (enum `MembershipStatus`) | Obligatoire             | `.nativeEnum(MembershipStatus)`                                          | Statut actuel du membership ou de l'invitation.                                                                                       |
| `joinedAt`        | `Date \| null`                                                               | Optionnel (Nullable)    | `.coerce.date().nullable()`                                              | Date et heure (objet Date JS) à laquelle l'invitation a été acceptée. `null` si statut `PENDING`.                                     |
| `createdAt`       | `Date`                                                                       | Obligatoire             | `.coerce.date()`                                                         | Date et heure (objet Date JS) de création de l'enregistrement.                                                                       |
| `updatedAt`       | `Date`                                                                       | Obligatoire             | `.coerce.date()`                                                         | Date et heure (objet Date JS) de la dernière mise à jour.                                                                             |
| `user`            | `{ id: number; username: string; email: string; profile_picture: string \| null; } \| null` | Optionnel (Nullable)    | Schéma imbriqué (`MembershipUserSchema`). `nullable()`                   | Informations sur l'utilisateur associé. Est `null` si le `status` est `PENDING`. Le `profile_picture` est une URL absolue. |
| `invitedEmail`    | `string \| null`                                                             | Optionnel (Nullable)    | `.string().email().nullable().optional()`                                | Adresse email à laquelle l'invitation a été envoyée. N'est présent (non `null`) que si le `status` est `PENDING`.                    |

*Note : La fonction `mapToMembershipDto` est responsable de construire cet objet à partir d'une instance du modèle Sequelize `Membership` (qui peut inclure l'association `user`).*

### 6.6. `UpdateMembershipDto` (Requête)

Structure de données attendue dans le corps de la requête `PATCH /api/memberships/:membershipId` pour modifier le statut ou le rôle d'un membre.

| Nom du Champ | Type TypeScript                           | Obligatoire / Optionnel | Validation (Zod / Règles Spécifiques)                                                                                     | Description                                                                                                |
|--------------|-------------------------------------------|-------------------------|---------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| `status`     | `'ACTIVE' \| 'INACTIVE'` (enum `MembershipStatus`) | Optionnel               | `.nativeEnum(MembershipStatus).optional()` (Ne permet que ACTIVE/INACTIVE via PATCH)                                | Le nouveau statut souhaité pour le membre.                                                                   |
| `role`       | `'ADMIN' \| 'STAFF'` (enum `MembershipRole`)     | Optionnel               | `.nativeEnum(MembershipRole).optional()`                                                                                  | Le nouveau rôle souhaité pour le membre.                                                                     |
| *(Global)*   | -                                         | -                       | `.refine(...)`: Vérifie qu'au moins `status` ou `role` est fourni dans la requête pour qu'une mise à jour ait lieu. | -                                                                                                          |

### 6.7. `StaffAvailabilityDto` (Réponse)

Structure de données retournée par l'API pour représenter une règle de disponibilité (`rrule`) pour un membre Staff.

| Nom du Champ         | Type TypeScript | Obligatoire / Optionnel | Validation (Zod / Règles Spécifiques)                                | Description                                                                                             |
|----------------------|-----------------|-------------------------|----------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `id`                 | `number`        | Obligatoire             | `.number().int().positive()`                                         | Identifiant unique de la règle de disponibilité.                                                          |
| `membershipId`       | `number`        | Obligatoire             | `.number().int().positive()`                                         | Identifiant du `Membership` auquel cette règle appartient.                                                |
| `rruleString`        | `string`        | Obligatoire             | `.string().min(1)`                                                   | La règle de récurrence au format `rrule` (RFC 5545).                                                    |
| `durationMinutes`    | `number`        | Obligatoire             | `.number().int().positive()`                                         | Durée en minutes de chaque bloc de temps généré par la règle.                                             |
| `effectiveStartDate` | `string`        | Obligatoire             | `.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (ou `.coerce.date()` selon besoin) | Date (format `YYYY-MM-DD`) de début d'application de la règle.                                          |
| `effectiveEndDate`   | `string \| null` | Optionnel (Nullable)    | `.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()`       | Date (format `YYYY-MM-DD`) de fin d'application de la règle. `null` si indéfinie.                      |
| `isWorking`          | `boolean`       | Obligatoire             | `.boolean()`                                                         | `true` si la règle définit une période de travail (disponibilité), `false` pour une indisponibilité.     |
| `description`        | `string \| null` | Optionnel (Nullable)    | `.string().max(255).nullable().optional()`                           | Description textuelle optionnelle de la règle.                                                          |
| `createdAt`          | `Date`          | Obligatoire             | `.coerce.date()`                                                     | Date et heure (objet Date JS) de création.                                                              |
| `updatedAt`          | `Date`          | Obligatoire             | `.coerce.date()`                                                     | Date et heure (objet Date JS) de dernière mise à jour.                                                  |

### 6.8. `CreateStaffAvailabilityDto` (Requête)

Structure de données attendue dans le corps de la requête `POST /api/memberships/:membershipId/availabilities` pour créer une nouvelle règle de disponibilité.

| Nom du Champ         | Type TypeScript | Obligatoire / Optionnel | Validation (Zod / Règles Spécifiques)                 | Description                                                            |
|----------------------|-----------------|-------------------------|-------------------------------------------------------|------------------------------------------------------------------------|
| `rruleString`        | `string`        | Obligatoire             | `.string().min(1)`                                    | La règle `rrule` à enregistrer.                                        |
| `durationMinutes`    | `number`        | Obligatoire             | `.number().int().positive()`                          | Durée du bloc en minutes (> 0).                                        |
| `effectiveStartDate` | `string`        | Obligatoire             | `.string().regex(/^\d{4}-\d{2}-\d{2}$/)`              | Date de début (`YYYY-MM-DD`).                                          |
| `effectiveEndDate`   | `string \| null` | Optionnel (Nullable)    | `.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()` | Date de fin (`YYYY-MM-DD`).                                          |
| `isWorking`          | `boolean`       | Obligatoire             | `.boolean()`                                          | Période de travail ou d'indisponibilité.                               |
| `description`        | `string \| null` | Optionnel (Nullable)    | `.string().max(255).nullable().optional()`            | Description optionnelle.                                               |

### 6.9. `UpdateStaffAvailabilityDto` (Requête)

Structure de données attendue dans le corps de la requête `PUT /api/memberships/:membershipId/availabilities/:availabilityId` pour mettre à jour une règle de disponibilité existante. *Note: Pour une requête PUT (remplacement complet), tous les champs de `CreateStaffAvailabilityDto` seraient normalement requis. Si un PATCH est envisagé pour des mises à jour partielles, alors les champs deviendraient optionnels.* En supposant que le PUT nécessite tous les champs comme défini dans l'API :

| Nom du Champ         | Type TypeScript | Obligatoire / Optionnel | Validation (Zod / Règles Spécifiques)                 | Description                                                            |
|----------------------|-----------------|-------------------------|-------------------------------------------------------|------------------------------------------------------------------------|
| `rruleString`        | `string`        | Obligatoire             | `.string().min(1)`                                    | La nouvelle règle `rrule`.                                             |
| `durationMinutes`    | `number`        | Obligatoire             | `.number().int().positive()`                          | La nouvelle durée du bloc.                                             |
| `effectiveStartDate` | `string`        | Obligatoire             | `.string().regex(/^\d{4}-\d{2}-\d{2}$/)`              | La nouvelle date de début.                                             |
| `effectiveEndDate`   | `string \| null` | Obligatoire (Nullable) | `.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()`      | La nouvelle date de fin (peut être null).                              |
| `isWorking`          | `boolean`       | Obligatoire             | `.boolean()`                                          | Le nouveau statut de travail/indisponibilité.                         |
| `description`        | `string \| null` | Obligatoire (Nullable) | `.string().max(255).nullable()`                       | La nouvelle description (peut être null).                              |

*(Si la route était `PATCH` pour une mise à jour partielle, tous les champs ci-dessus deviendraient `.optional()` dans la validation Zod et la mention "Obligatoire" serait "Optionnel").*

## 7. Workflow d'Invitation et d'Acceptation (Pas à Pas Détaillé)

Cette section décrit de manière séquentielle et détaillée le processus complet par lequel un utilisateur est invité à rejoindre un établissement en tant que membre Staff et comment il accepte cette invitation. Elle illustre les interactions entre l'administrateur, l'utilisateur invité, l'interface frontend, l'API backend, les services métier et la base de données.

### 7.1. Étape 1: L'Admin initie l'invitation via l'UI.

*   L'administrateur de l'établissement, connecté à l'application d'administration, navigue vers la section de gestion des membres.
*   Il initie le processus d'invitation, généralement via un bouton "Inviter un Membre".
*   Un formulaire ou une modale apparaît, lui demandant de saisir l'adresse e-mail du futur membre et de sélectionner son rôle (actuellement limité à 'STAFF').
*   L'administrateur soumet le formulaire.
*   **`7.1.1. Frontend envoie POST /api/users/me/establishments/:establishmentId/memberships/invite.`** : Le frontend construit une requête HTTP POST vers l'endpoint d'invitation, en incluant l'`establishmentId` dans l'URL et l'`InviteMemberDto` (contenant l'email et le rôle) dans le corps de la requête. Le token JWT de l'administrateur est inclus dans l'en-tête `Authorization` et un token CSRF est également envoyé.

### 7.2. Étape 2: Backend (`MembershipService.inviteMember`)

*   **`7.2.1. Valide la requête, génère token, crée Membership (PENDING).`**
    *   L'API Backend reçoit la requête POST.
    *   Les middlewares `requireAuth`, `ensureMembership(['ADMIN'])` et `verifyCsrfToken` valident l'authenticité, l'autorisation de l'admin et la protection CSRF.
    *   Le `EstablishmentController` appelle `MembershipService.inviteMember`.
    *   Le `MembershipService` valide l'`InviteMemberDto` et vérifie qu'aucun membre actif/inactif ou invitation PENDING n'existe déjà pour cet email dans cet établissement.
    *   Si les validations réussissent, un token d'invitation unique et cryptographiquement sécurisé est généré, puis hashé (ex: SHA256). Une date d'expiration est calculée (ex: 7 jours).
    *   Un nouvel enregistrement est créé dans la table `Memberships` avec le `status`='PENDING', le `role`='STAFF', l'`invitedEmail`, le `invitationTokenHash`, et l'`invitationTokenExpiresAt`. Le champ `userId` reste `NULL`.
*   **`7.2.2. Appelle NotificationService.sendInvitationEmail.`**
    *   Le `MembershipService` appelle le `NotificationService` en lui passant l'adresse email de l'invité, le token d'invitation *en clair*, le nom de l'établissement et le nom de l'administrateur invitant.
    *   Le `NotificationService` formate et envoie l'email d'invitation.
*   L'API retourne une réponse `201 Created` au frontend, confirmant l'envoi de l'invitation et incluant potentiellement le DTO du `Membership` PENDING créé.

### 7.3. Étape 3: L'utilisateur reçoit l'email et clique sur le lien.

*   L'utilisateur invité reçoit l'email envoyé par le `NotificationService`.
*   L'email contient une description de l'invitation et un lien d'acceptation unique.
*   L'utilisateur clique sur ce lien.
*   **`7.3.1. Redirection vers FRONTEND_URL/accept-invitation/:plainToken.`** : Le navigateur de l'utilisateur ouvre l'URL spécifiée dans le lien, qui pointe vers une page dédiée de l'application frontend, en passant le token d'invitation en clair comme paramètre dans l'URL.

### 7.4. Étape 4: Page Frontend d'Acceptation

*   Le composant React correspondant à la route `/accept-invitation/[token]` se charge dans le navigateur de l'utilisateur invité.
*   **`7.4.1. Valide token via GET /api/memberships/invitation-details/:token.`**
    *   Le frontend extrait le `plainToken` de l'URL.
    *   Il effectue immédiatement un appel `GET` à l'endpoint public `/api/memberships/invitation-details/:plainToken` pour vérifier la validité du token côté serveur et récupérer l'email associé.
*   **`7.4.2. Affiche formulaire inscription (email pré-rempli) ou lien connexion.`**
    *   Si l'API backend retourne une réponse `200 OK` avec l'`InvitationDetailsDto`, cela confirme que le token est valide et l'email associé est récupéré.
    *   Le frontend affiche alors un formulaire d'inscription demandant un `username` et un `password`. Le champ `email` est pré-rempli avec l'`invitedEmail` reçu de l'API et est rendu non modifiable (read-only). Le `plainToken` est stocké dans un champ caché du formulaire.
    *   Un lien visible vers la page de connexion (`/login`) est également affiché, permettant aux utilisateurs qui possèdent déjà un compte sur la plateforme (avec cette adresse email ou une autre) de choisir de se connecter plutôt que de créer un nouveau compte.
    *   Si l'API backend retourne une erreur (ex: 404 Not Found pour token invalide/expiré), le frontend affiche un message d'erreur approprié à l'utilisateur, indiquant que l'invitation n'est plus valide.

### 7.5. Étape 5a: Inscription via Invitation

Ce scénario s'applique si l'utilisateur invité n'a pas de compte existant ou choisit de ne pas l'utiliser.

*   L'utilisateur remplit les champs `username` et `password` du formulaire d'inscription sur la page d'acceptation.
*   Il soumet le formulaire.
*   **`7.5.1. Frontend envoie POST /api/auth/register-via-invitation.`** : Le frontend envoie une requête POST à cet endpoint public, incluant le `username`, le `password` et le `plainToken` (du champ caché) dans le corps de la requête (`RegisterViaInvitationDto`).
*   **`7.5.2. Backend (AuthService.registerViaInvitation) crée User, active Membership, connecte user, notifie admins.`**
    *   Le `AuthController` reçoit la requête et appelle `AuthService.registerViaInvitation`.
    *   L'`AuthService` orchestre le processus :
        1.  Valide le `plainToken` via `MembershipService.getInvitationDetails` (récupérant `invitedEmail`).
        2.  Appelle `UserService.createUser` pour créer le nouvel enregistrement `User` (avec l'`invitedEmail`, `username`, `password` hashé). L'utilisateur est marqué comme actif.
        3.  Appelle `MembershipService.activateByToken` pour mettre à jour le `Membership` PENDING : lie le `userId` nouvellement créé, change le `status` en `ACTIVE`, et nettoie les informations du token.
        4.  Génère les tokens JWT (`accessToken`, `refreshToken`) pour le nouvel utilisateur et stocke le refresh token.
        5.  Appelle (asynchrone) `MembershipService.notifyAdminsMemberJoined`.
    *   L'API retourne une réponse `201 Created` contenant l'`accessToken` et le `MembershipDto` activé. Des cookies de session (`refreshToken`, CSRF) sont positionnés dans la réponse.
*   Le frontend reçoit la réponse, stocke l'`accessToken`, considère l'utilisateur comme connecté et le redirige vers une page appropriée (ex: le tableau de bord de l'établissement).

### 7.6. Étape 5b: Activation après Connexion

Ce scénario s'applique si l'utilisateur invité choisit de se connecter à un compte existant au lieu de s'inscrire.

*   Sur la page d'acceptation (Étape 4), l'utilisateur clique sur le lien "Se Connecter".
*   **`7.6.1. Utilisateur se connecte. Frontend détecte token d'invitation (stocké).`**
    *   Avant de rediriger vers `/login`, le frontend stocke le `plainToken` de l'invitation dans un espace de stockage temporaire côté client (ex: Local Storage ou Session Storage).
    *   L'utilisateur est redirigé vers la page `/login` et se connecte en utilisant le flux d'authentification standard (email/mdp, puis 2FA si activée).
    *   Après une connexion réussie, la logique du frontend (ex: dans un `useEffect` global ou un contexte d'authentification) vérifie la présence du token d'invitation stocké.
*   **`7.6.2. Frontend envoie POST /api/memberships/activate-after-login.`**
    *   Si un token est trouvé, le frontend envoie immédiatement une requête `POST` authentifiée (avec le JWT de l'utilisateur connecté) à l'endpoint `/api/memberships/activate-after-login`. Le corps de la requête contient l'`ActivateMembershipDto` avec le `plainToken`.
    *   Le frontend supprime le token stocké après avoir envoyé la requête (qu'elle réussisse ou échoue) pour éviter des activations répétées accidentelles.
*   **`7.6.3. Backend (MembershipService.activateByToken) active Membership, notifie admins.`**
    *   Le `MembershipController` reçoit la requête. Le middleware `requireAuth` valide la session de l'utilisateur connecté.
    *   Le contrôleur appelle `MembershipService.activateByToken`.
    *   Le `MembershipService` valide le `plainToken`, récupère le `userId` de l'utilisateur connecté, **vérifie que l'email de l'utilisateur connecté correspond à l'`invitedEmail`** associé au token. Si la vérification échoue, une erreur 400 est retournée.
    *   Si tout est valide, le `MembershipService` met à jour le `Membership` PENDING comme décrit dans l'étape 5a (lie `userId`, change `status` à `ACTIVE`, nettoie token).
    *   Le `MembershipService` appelle (asynchrone) `notifyAdminsMemberJoined`.
*   L'API retourne une réponse `200 OK` contenant un message de succès et le `MembershipDto` activé.
*   Le frontend reçoit la réponse et peut afficher une notification de succès ou simplement continuer vers le tableau de bord.

### 7.7. Étape 6: Notifications

*   **`7.7.1. L'Admin reçoit un email "Membre Rejoint".`**
    *   Suite à l'activation réussie d'un `Membership` (via l'étape 5a ou 5b), la méthode `MembershipService.notifyAdminsMemberJoined` est appelée en arrière-plan.
    *   Ce service identifie tous les utilisateurs ayant un `Membership` `ADMIN` et `ACTIVE` pour l'établissement concerné.
    *   Pour chaque administrateur trouvé, le `NotificationService` est appelé pour envoyer un email l'informant que le `newMemberUsername` a rejoint l'`establishmentName`.
    *   Cette notification permet aux administrateurs d'être au courant de l'arrivée de nouveaux membres dans leur équipe.

## 8. Gestion des Permissions et Sécurité

La sécurité et une gestion précise des permissions sont fondamentales pour le module "Gestion des Membres", car il touche directement à l'accès aux données et aux fonctionnalités de l'établissement. Cette section détaille les rôles définis, les mécanismes d'autorisation mis en place (middlewares), les logiques de protection spécifiques pour prévenir des états incohérents, et les mesures prises pour sécuriser le processus d'invitation.

### 8.1. Rôles au sein d'un Établissement

Deux rôles principaux sont définis au niveau du `Membership` pour contrôler l'accès aux fonctionnalités au sein d'un établissement donné :

| Action / Capacité                                     | Rôle ADMIN                  | Rôle STAFF                      | Notes                                                                  |
|-------------------------------------------------------|-----------------------------|---------------------------------|------------------------------------------------------------------------|
| **Invitations**                                       |                             |                                 |                                                                        |
| Inviter de nouveaux membres (Staff)                   | Oui                         | Non                             |                                                                        |
| **Gestion des Membres**                               |                             |                                 |                                                                        |
| Lister tous les membres de l'établissement           | Oui                         | Non                             |                                                                        |
| Voir les détails de n'importe quel membre            | Oui                         | Non                             |                                                                        |
| Voir ses propres détails de membership               | Oui                         | Oui                             |                                                                        |
| Modifier le statut (Active/Inactive) d'un membre    | Oui                         | Non                             | Inclut des protections pour le dernier admin.                          |
| Modifier le rôle (Admin/Staff) d'un membre         | Oui                         | Non                             | Inclut des protections pour le dernier admin et le propriétaire.      |
| Supprimer un membre / Révoquer une invitation PENDING | Oui                         | Non                             | Inclut des protections pour le dernier admin.                          |
| **Gestion des Disponibilités Staff**                 |                             |                                 |                                                                        |
| Lister les règles de disponibilité d'un membre       | Oui (pour n'importe quel membre) | Oui (pour soi-même uniquement) |                                                                        |
| Créer une règle de disponibilité pour un membre      | Oui (pour n'importe quel membre) | Oui (pour soi-même uniquement) |                                                                        |
| Modifier une règle de disponibilité d'un membre     | Oui (pour n'importe quel membre) | Oui (pour soi-même uniquement) |                                                                        |
| Supprimer une règle de disponibilité d'un membre    | Oui (pour n'importe quel membre) | Oui (pour soi-même uniquement) |                                                                        |
| **Autres Modules (Impacts typiques)**               |                             |                                 | *La granularité exacte dépend de l'implémentation de ces autres modules* |
| Voir toutes les réservations de l'établissement       | Oui                         | Non (ou limité aux siennes)     | Logique de permission fine dans le module Réservations requise.        |
| Modifier le statut de n'importe quelle réservation   | Oui                         | Non (ou limité aux siennes)     | Logique de permission fine dans le module Réservations requise.        |
| Assigner des membres aux services                     | Oui                         | Non                             | Géré dans le module Services.                                          |
| Modifier les détails de l'établissement             | Oui                         | Non                             |                                                                        |

### 8.2. Middlewares d'Autorisation Clés

Plusieurs middlewares Express sont utilisés pour sécuriser les endpoints API et s'assurer que les actions sont effectuées par des utilisateurs autorisés dans le bon contexte.

| Nom du Middleware                   | Routes Typiques d'Application                                                                           | Description Détaillée de la Vérification Effectuée                                                                                                                                                                                                 |
|-------------------------------------|---------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `requireAuth`                       | Toutes les routes nécessitant une authentification (sauf publiques comme login, register, invitation details). | Vérifie la présence et la validité d'un `accessToken` JWT dans l'en-tête `Authorization`. Rejette si invalide, expiré ou manquant (401). Attache les informations utilisateur (`id`, `username`, `email`, `roles`) à `req.user`.                       |
| `verifyCsrfToken`                   | Toutes les routes modifiant l'état (POST, PUT, PATCH, DELETE) nécessitant une session authentifiée.        | Vérifie la présence et la validité du token CSRF (`X-CSRF-Token` header) par rapport au secret stocké dans le cookie `csrfSecret`. Rejette si invalide ou manquant (403).                                                                              |
| `ensureMembership(requiredRoles)`   | Routes liées à un établissement spécifique où un rôle particulier est requis (ex: `GET /establishments/:id/memberships`). | Vérifie que `req.user` est défini (via `requireAuth`). Trouve le `Membership` actif de l'utilisateur (`req.user.id`) pour l'établissement (`req.params.establishmentId`). Vérifie que le `Membership` existe, est `ACTIVE`, et que son `role` est inclus dans `requiredRoles` (ex: `['ADMIN']`). Attache le `Membership` trouvé à `req.membership`. Gère le cas `SUPER_ADMIN`. Rejette avec 403 ou 404. |
| `ensureAdminOrSelfForMembership`    | Route pour voir les détails d'un membership (`GET /establishments/:id/memberships/:mid`).                   | Vérifie que `req.user` est défini. Trouve le `Membership` cible (`req.params.membershipId`) dans l'établissement (`req.params.establishmentId`). Trouve le `Membership` de l'acteur pour cet établissement. Autorise si l'acteur est `ADMIN` de l'établissement OU si l'`userId` de l'acteur correspond à l'`userId` du `Membership` cible. Gère `SUPER_ADMIN`. Rejette avec 403 ou 404. |
| `ensureAdminOfTargetMembership`     | Routes modifiant/supprimant un membership (`PATCH/DELETE /memberships/:mid`).                           | Vérifie que `req.user` est défini. Trouve le `Membership` cible (`req.params.membershipId`). Trouve le `Membership` de l'acteur pour l'établissement *du membre cible*. Vérifie que l'acteur est `ADMIN` actif de cet établissement. Gère `SUPER_ADMIN`. Attache `req.membership` (acteur) et `req.targetMembership`. Rejette avec 403 ou 404. |
| `ensureMembershipAccess`            | Routes CRUD pour les disponibilités Staff (`/memberships/:mid/availabilities/...`).                      | Vérifie que `req.user` est défini. Trouve le `Membership` cible (`req.params.membershipId`). Trouve le `Membership` de l'acteur pour l'établissement du membre cible. Autorise si l'acteur est `ADMIN` de cet établissement OU si l'`userId` de l'acteur correspond à l'`userId` du `Membership` cible. Gère `SUPER_ADMIN`. Rejette avec 403 ou 404. |

### 8.3. Logiques de Protection Spécifiques

En plus des middlewares, des vérifications métier sont implémentées dans les services pour prévenir des états indésirables ou des actions potentiellement bloquantes.

#### 8.3.1. "Dernier Admin Actif" (Mise à jour)
*   **Contexte:** Dans `MembershipService.updateMembership`.
*   **Protection:** Empêche un utilisateur de modifier son *propre* `Membership` (celui où `actorMembership.userId === targetMembership.userId`) pour :
    *   Changer son `role` de `ADMIN` à `STAFF`, **SI** il n'y a aucun autre membre `ADMIN` et `ACTIVE` dans le même établissement.
    *   Changer son `status` de `ACTIVE` à `INACTIVE`, **SI** il est le seul membre `ADMIN` et `ACTIVE` dans le même établissement.
*   **Objectif:** Garantir qu'il reste toujours au moins un administrateur actif capable de gérer l'établissement.
*   **Résultat si violé:** L'opération échoue avec une erreur `CannotUpdateLastAdminError` (résultant en une réponse API 400 Bad Request).

#### 8.3.2. "Propriétaire de l'Établissement" (Mise à jour)
*   **Contexte:** Dans `MembershipService.updateMembership`.
*   **Protection:** Empêche de changer le `role` d'un `Membership` de `ADMIN` à `STAFF` si le `userId` de ce `Membership` correspond à l'`owner_id` de l'`Establishment` associé.
*   **Objectif:** Assurer que le propriétaire désigné de l'établissement conserve toujours le rôle d'administrateur au sein de la plateforme.
*   **Résultat si violé:** L'opération échoue avec une erreur `CannotUpdateLastAdminError` (ou une erreur dédiée, résultant en 400 Bad Request).

#### 8.3.3. "Dernier Admin" (Suppression)
*   **Contexte:** Dans `MembershipService.deleteMembership`.
*   **Protection:** Empêche un utilisateur de supprimer son *propre* `Membership` si :
    *   Son rôle actuel est `ADMIN`.
    *   Il n'y a aucun autre membre (actif ou inactif) ayant le rôle `ADMIN` dans le même établissement.
*   **Objectif:** Garantir qu'il reste toujours au moins un administrateur (même inactif) associé à l'établissement, pour éviter de rendre l'établissement ingérable via l'interface.
*   **Résultat si violé:** L'opération échoue avec une erreur `CannotDeleteLastAdminError` (résultant en 400 Bad Request).

### 8.4. Sécurité des Tokens d'Invitation

Le processus d'invitation repose sur des tokens uniques envoyés par email. Plusieurs mesures sont prises pour sécuriser ce mécanisme :

#### 8.4.1. Génération (crypto, entropie)
*   Les tokens d'invitation en clair sont générés à l'aide de `crypto.randomBytes(32).toString('hex')`, produisant une chaîne hexadécimale de 64 caractères. Cela offre une entropie élevée (256 bits), rendant la devinette ou la force brute du token extrêmement improbable.

#### 8.4.2. Stockage (hashé)
*   Le token d'invitation **n'est jamais stocké en clair** dans la base de données.
*   Seul un hash cryptographique (SHA-256) du token (`invitationTokenHash`) est enregistré dans la table `Memberships`.
*   Lors de la validation, le token fourni par l'utilisateur est hashé de la même manière et comparé au hash stocké, évitant ainsi l'exposition du token brut en cas de compromission de la base de données.

#### 8.4.3. Expiration
*   Chaque token d'invitation a une date d'expiration (`invitationTokenExpiresAt`), typiquement définie à 7 jours après sa création.
*   Les services `getInvitationDetails` et `activateByToken` vérifient systématiquement que le token n'est pas expiré avant de le considérer comme valide.

#### 8.4.4. Nettoyage après utilisation
*   Lorsqu'une invitation est acceptée avec succès (via `activateByToken`), les champs `invitationTokenHash`, `invitationTokenExpiresAt`, et `invitedEmail` dans l'enregistrement `Membership` sont mis à `NULL`.
*   Cela empêche toute tentative de réutilisation du même token, même s'il n'avait pas encore techniquement expiré.

#### 8.4.5. Vérification de la correspondance email lors de l'activation
*   Lorsqu'un utilisateur *déjà connecté* tente d'activer une invitation via `POST /api/memberships/activate-after-login`, le service `MembershipService.activateByToken` vérifie impérativement que l'adresse email (`req.user.email`) de l'utilisateur authentifié correspond à l'adresse `invitedEmail` stockée dans le `Membership` PENDING associé au token.
*   Cette mesure empêche un utilisateur de capturer un lien d'invitation destiné à quelqu'un d'autre et de l'associer à son propre compte.

Absolument. Finalisons ce document de référence avec l'Annexe.

Voici le contenu Markdown pour la Section 9 :

## 9. Annexe

Cette section fournit des informations complémentaires utiles, telles que des exemples de payloads pour les requêtes API, une liste des variables d'environnement pertinentes pour la configuration du module, et quelques pistes pour des évolutions futures potentielles.

### 9.1. Exemples de Payloads JSON pour Requêtes API

Ces exemples illustrent le format JSON attendu dans le corps de certaines requêtes API clés du module.

#### 9.1.1. `InviteMemberDto`
Utilisé pour `POST /api/users/me/establishments/:establishmentId/memberships/invite`

```json
{
  "email": "nouveau.collaborateur@example.com",
  "role": "STAFF"
}
```

#### 9.1.2. `RegisterViaInvitationDto`
Utilisé pour `POST /api/auth/register-via-invitation`

```json
{
  "username": "nouveau_collaborateur",
  "password": "UnMotDePasseTresSecurise!123",
  "token": "b3a8f0e1c9a2b7d8e1f4a0c7...64_caracteres_token_brut...9d8c7b6a5f4e3d2c1b0a"
}
```

#### 9.1.3. `UpdateMembershipDto`
Utilisé pour `PATCH /api/memberships/:membershipId`

*Exemple 1: Mise à jour du statut uniquement (Désactiver un membre)*
```json
{
  "status": "INACTIVE"
}
```

*Exemple 2: Mise à jour du rôle uniquement (Promouvoir en Admin)*
```json
{
  "role": "ADMIN"
}
```

*Exemple 3: Mise à jour du statut et du rôle*
```json
{
  "status": "ACTIVE",
  "role": "STAFF"
}
```

#### 9.1.4. `CreateStaffAvailabilityDto`
Utilisé pour `POST /api/memberships/:membershipId/availabilities`

*Exemple: Définir une disponibilité tous les lundis et mercredis de 9h00 UTC à 12h00 UTC, à partir du 1er Septembre 2024*
```json
{
  "rruleString": "FREQ=WEEKLY;BYDAY=MO,WE;DTSTART=20240902T090000Z;INTERVAL=1",
  "durationMinutes": 180,
  "effectiveStartDate": "2024-09-01",
  "effectiveEndDate": null,
  "isWorking": true,
  "description": "Matinées Lundi & Mercredi"
}
```
*Exemple: Définir une indisponibilité (congé) pour une semaine spécifique*
```json
{
  "rruleString": "FREQ=DAILY;DTSTART=20241014T000000Z;COUNT=7",
  "durationMinutes": 1440, // 24 * 60 minutes pour couvrir toute la journée
  "effectiveStartDate": "2024-10-14",
  "effectiveEndDate": "2024-10-20",
  "isWorking": false,
  "description": "Congés d'automne"
}
```

### 9.2. Variables d'Environnement Pertinentes

Certaines configurations du module peuvent être ajustées via des variables d'environnement.

| Nom de la Variable                  | Description                                                                                                             | Exemple de Valeur / Configuration                                        |
|-------------------------------------|-------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| `FRONTEND_URL`                      | URL de base de l'application frontend. Utilisée pour construire les liens d'activation/invitation dans les emails.       | `"https://admin.myapp.com"` ou `"http://localhost:3000"` (en développement) |
| `INVITATION_TOKEN_EXPIRATION_DAYS`  | (Si implémenté comme variable) Durée de validité en jours d'un token d'invitation.                                       | `7` (Sinon, codé en dur à 7 jours dans `MembershipService`)               |
| *Variables Mailer* (`MAILER_HOST`, etc.) | Essentielles pour que le `NotificationService` puisse envoyer les emails d'invitation et de confirmation.             | (Voir configuration `NotificationService`)                               |
| *Variables JWT* (`JWT_SECRET`, etc.)   | Essentielles pour la génération et la validation des tokens de session lors de l'inscription ou de l'activation post-login. | (Voir configuration `AuthService`)                                       |

### 9.3. Considérations Futures / Améliorations Possibles

Ce module fournit une base solide pour la gestion des membres, mais plusieurs axes d'amélioration pourraient être envisagés dans de futures itérations.

#### 9.3.1. Gestion des permissions plus fine (au-delà de ADMIN/STAFF)
*   **Description:** Introduire des rôles plus granulaires (ex: "Manager", "Réceptionniste") ou un système basé sur des permissions spécifiques (ex: "Peut modifier toutes les réservations", "Peut gérer les disponibilités des autres Staffs") pour offrir un contrôle d'accès encore plus précis, adapté aux structures d'équipe plus complexes.

#### 9.3.2. Audit logs pour les actions sur les membres
*   **Description:** Mettre en place un système d'enregistrement (logs d'audit) pour tracer les actions importantes effectuées sur les memberships (invitations envoyées, rôles/statuts modifiés, membres supprimés), en indiquant quel administrateur a effectué l'action et quand. Cela améliorerait la traçabilité et la sécurité.

#### 9.3.3. Possibilité pour un membre de quitter un établissement
*   **Description:** Ajouter une fonctionnalité permettant à un membre Staff (ou même Admin, avec protections) de quitter volontairement un établissement auquel il est rattaché, sans nécessiter l'intervention d'un autre administrateur pour le supprimer. Cela impliquerait une gestion des conséquences (ex: réassignation des réservations futures).