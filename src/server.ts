// src/server.ts
import path from 'path';
import express, { Router } from 'express'; // Ajout de Router ici
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import http from 'http';
import cookieParser from 'cookie-parser';

import db from './models';
import { UserService } from './services/user.service';
import { ConsoleNotificationService, INotificationService } from './services/notification.service';
import { AuthService } from './services/auth.service';
import { BookingService } from './services/booking.service';
import { ServiceService } from './services/service.service';
import { EstablishmentService } from './services/establishment.service';
import { AvailabilityService } from './services/availability.service';
import { encryptionService } from './services/encryption.service'; // Implicitement utilisé par AuthService

// Import des fonctions créant les routeurs
import { createUserRouter } from './routes/user.routes';
import { createAuthRouter } from './routes/auth.routes';
import { createEstablishmentRouter } from './routes/establishment.routes';
import { createServiceRouter, ServiceRouters } from './routes/service.routes'; // L'interface ServiceRouters est déjà importée
import { createAvailabilityRouter } from './routes/availability.routes';
import { createBookingRouter } from './routes/booking.routes';
// createMyEstablishmentsRootRouter et createMyEstablishmentRouter sont utilisés DANS user.routes.ts, pas ici directement.

import errorMiddleware from './middlewares/error.middleware';
import { apiLimiter } from './middlewares/rateLimiter.middleware';

dotenv.config();
const app = express();

// Logique de synchronisation/authentification DB
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    db.sequelize.sync({ alter: false }) // Utiliser { force: true } pour reset en dev si besoin, mais alter: false est plus sûr
        .then(() => console.log('Database synchronized (alter: false)'))
        .catch(err => console.error('Database sync error:', err));
} else if (process.env.NODE_ENV !== 'test') {
    db.sequelize.authenticate()
        .then(() => console.log('Database connection verified.'))
        .catch(err => console.error('Unable to connect to the database:', err));
}

// Instanciation des services avec injection des dépendances
const notificationService: INotificationService = new ConsoleNotificationService();
const userService = new UserService(db.User, notificationService);
const authService = new AuthService(userService, notificationService, db.User, db.RefreshToken, encryptionService); // Injecter encryptionService
// Injecter les modèles nécessaires dans EstablishmentService
const establishmentService = new EstablishmentService(db.Establishment, db.User, db.Role, db.AvailabilityRule, db.AvailabilityOverride, db.Country); // Ajout db.Country
const availabilityService = new AvailabilityService();
const serviceService = new ServiceService(db.Service, establishmentService); // Modèle Service et EstablishmentService
const bookingService = new BookingService(db.Booking, db.Service, establishmentService, availabilityService, notificationService);

// Injection croisée (si nécessaire, comme pour la révocation des tokens)
userService.setAuthService(authService);

// Configuration CORS
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'];
const corsConfig = cors({
    origin: (origin, callback) => {
        // Permettre les requêtes sans origine (ex: Postman) ou depuis les origines autorisées
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS: Blocked origin ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Pre-2FA-Token', 'X-CSRF-Token'], // Assurez-vous que X-CSRF-Token est listé
    credentials: true,
    optionsSuccessStatus: 204
});

// Configuration Cookie Parser (DOIT être avant les middlewares CSRF et les routes)
const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
    console.error("FATAL ERROR: COOKIE_SECRET environment variable is not set.");
    process.exit(1);
}
app.use(cookieParser(cookieSecret)); // Initialiser avec le secret pour req.signedCookies

// Middlewares Globaux
app.use(corsConfig); // Appliquer CORS
app.use(helmet()); // Sécurité des headers HTTP
app.use(express.json()); // Parser JSON body
app.use(express.urlencoded({ extended: true })); // Parser URL-encoded body
if (process.env.NODE_ENV !== 'test') {
    app.use(apiLimiter); // Appliquer Rate Limiting (sauf en test)
}

// Servir les fichiers statiques (uploads)
// Assurez-vous que le chemin est correct par rapport à la structure de votre projet compilé (dist/)
app.use('/uploads', express.static(path.resolve(__dirname, '../public/uploads')));

// Création et Montage des Routeurs
// Note: createUserRouter doit maintenant recevoir toutes les dépendances nécessaires pour ses sous-routeurs
const userRouter = createUserRouter(
    userService,
    bookingService,
    establishmentService,
    serviceService,
    availabilityService
);
const authRouter = createAuthRouter(authService, userService);
const establishmentRouter = createEstablishmentRouter(establishmentService, serviceService, availabilityService); // Celui-ci gère /api/establishments (public)
const { servicesRootRouter } = createServiceRouter(serviceService, availabilityService); // Récupère le routeur pour /api/services/:id
const availabilityRouter = createAvailabilityRouter(establishmentService); // Gère /api/availability/...
const bookingRouter = createBookingRouter(bookingService); // Gère /api/bookings/...

// Montage des routes principales
app.use('/api/users', userRouter); // Monte /api/users/... ET /api/users/me/... (y compris /establishments)
app.use('/api/auth', authRouter);
app.use('/api/services', servicesRootRouter); // Monte /api/services/:serviceId/...
app.use('/api/availability', availabilityRouter); // Monte /api/availability/rules/:ruleId, /api/availability/overrides/:overrideId
app.use('/api/establishments', establishmentRouter); // Monte /api/establishments (public list/detail) ET /api/establishments/:id/services (public)
app.use('/api/bookings', bookingRouter);

// Middleware de Gestion des Erreurs (doit être le dernier)
app.use(errorMiddleware);

// Démarrage du serveur
const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// Ne pas démarrer le serveur pendant les tests Jest
if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        console.log(`🚀 Server ready and listening on port ${PORT}`);
        console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`   Access locally: http://localhost:${PORT}`);
        console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
    });
}

// Gestionnaires globaux pour les erreurs non interceptées
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    // En production, il peut être judicieux de quitter proprement après une unhandledRejection grave
    // process.exit(1);
});
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception thrown:', error);
    if (process.env.NODE_ENV === 'production') process.exit(1);
});

export { app, server };