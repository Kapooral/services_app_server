import {Sequelize} from 'sequelize';
import sequelizeInstance from '../config/database';

import {initUser} from './User';
import {initRefreshToken} from './RefreshToken';
import {initRole} from './Role';
import {initUserRole} from './UserRole';

import {initEstablishment} from './Establishment';
import {initService} from './Service';
import {initAvailabilityRule} from './AvailabilityRule';
import {initAvailabilityOverride} from './AvailabilityOverride';
import {initBooking} from './Booking';
import {initCountry} from './Country';
import {initTimezone} from './Timezone'

import {initMembership, MembershipRole, MembershipStatus} from './Membership';
import {initServiceMemberAssignment} from './ServiceMemberAssignment';
import {initTimeOffRequest} from './TimeOffRequest';

import {initDailyAdjustmentSlot} from './DailyAdjustmentSlot';
import {initRecurringPlanningModel} from './RecurringPlanningModel';
import {initRpmMemberAssignment} from './RecurringPlanningModelMemberAssignment';


const db: any = {};

db.Sequelize = Sequelize;
db.sequelize = sequelizeInstance;

db.User = initUser(sequelizeInstance);
db.RefreshToken = initRefreshToken(sequelizeInstance);
db.Role = initRole(sequelizeInstance);
db.UserRole = initUserRole(sequelizeInstance);

db.Establishment = initEstablishment(sequelizeInstance);
db.Service = initService(sequelizeInstance);
db.AvailabilityRule = initAvailabilityRule(sequelizeInstance);
db.AvailabilityOverride = initAvailabilityOverride(sequelizeInstance);
db.Booking = initBooking(sequelizeInstance);

db.Country = initCountry(sequelizeInstance);
db.Timezone = initTimezone(sequelizeInstance);

db.Membership = initMembership(sequelizeInstance);
db.ServiceMemberAssignment = initServiceMemberAssignment(sequelizeInstance);
db.TimeOffRequest = initTimeOffRequest(sequelizeInstance);

db.RecurringPlanningModel = initRecurringPlanningModel(sequelizeInstance);
db.RecurringPlanningModelMemberAssignment = initRpmMemberAssignment(sequelizeInstance);
db.DailyAdjustmentSlot = initDailyAdjustmentSlot(sequelizeInstance);


// Country <-> Timezone (1 Timezone principal pour 1 Country, 1 Timezone peut être pour N Countries)
// Un Pays (Country) appartient à un Fuseau Horaire (Timezone) principal/par défaut.
db.Country.belongsTo(db.Timezone, {
    foreignKey: 'timezoneId',
    as: 'defaultTimezone',
    constraints: true,
    onDelete: 'SET NULL',
});

// Un Fuseau Horaire (Timezone) peut être le fuseau par défaut de plusieurs Pays (Countries).
db.Timezone.hasMany(db.Country, {
    foreignKey: 'timezoneId',
    as: 'countriesWithThisDefaultTimezone',
    constraints: true
});

// User <-> RefreshToken (1:N)
db.User.hasMany(db.RefreshToken, {foreignKey: 'user_id', as: 'refreshTokens'});
db.RefreshToken.belongsTo(db.User, {foreignKey: 'user_id', as: 'user'});

// User <-> Role (N:M)
db.User.belongsToMany(db.Role, {through: db.UserRole, foreignKey: 'userId', otherKey: 'roleId', as: 'roles'});
db.Role.belongsToMany(db.User, {through: db.UserRole, foreignKey: 'roleId', otherKey: 'userId', as: 'users'});

// User <-> Establishment (1:N - Un User "owner" pour N Establishments)
// Note: L'association est définie par Establishment.owner_id -> User.id
// On peut définir les deux sens pour utiliser les mixins Sequelize
db.User.hasMany(db.Establishment, {foreignKey: 'owner_id', as: 'ownedEstablishments'});
db.Establishment.belongsTo(db.User, {foreignKey: 'owner_id', as: 'owner'});

// Establishment <-> Service (1:N)
db.Establishment.hasMany(db.Service, {foreignKey: 'establishment_id', as: 'services'});
db.Service.belongsTo(db.Establishment, {foreignKey: 'establishment_id', as: 'establishment'});

// Establishment <-> AvailabilityRule (1:N)
db.Establishment.hasMany(db.AvailabilityRule, {foreignKey: 'establishment_id', as: 'availabilityRules'});
db.AvailabilityRule.belongsTo(db.Establishment, {foreignKey: 'establishment_id', as: 'establishment'});

// Establishment <-> AvailabilityOverride (1:N)
db.Establishment.hasMany(db.AvailabilityOverride, {foreignKey: 'establishment_id', as: 'availabilityOverrides'});
db.AvailabilityOverride.belongsTo(db.Establishment, {foreignKey: 'establishment_id', as: 'establishment'});

// User <-> Booking (1:N - Un User "client" pour N Bookings)
db.User.hasMany(db.Booking, {foreignKey: 'user_id', as: 'bookings'});
db.Booking.belongsTo(db.User, {foreignKey: 'user_id', as: 'client'});

// Establishment <-> Booking (1:N)
db.Establishment.hasMany(db.Booking, {foreignKey: 'establishment_id', as: 'bookings'});
db.Booking.belongsTo(db.Establishment, {foreignKey: 'establishment_id', as: 'establishment'});

// Service <-> Booking (1:N)
db.Service.hasMany(db.Booking, {foreignKey: 'service_id', as: 'bookings'});
db.Booking.belongsTo(db.Service, {foreignKey: 'service_id', as: 'service'});

// User <-> Membership (1:N)
db.User.hasMany(db.Membership, {foreignKey: 'userId', as: 'memberships'});
db.Membership.belongsTo(db.User, {foreignKey: 'userId', as: 'user'});

// Establishment <-> Membership (1:N)
db.Establishment.hasMany(db.Membership, {foreignKey: 'establishmentId', as: 'memberships'});
db.Membership.belongsTo(db.Establishment, {foreignKey: 'establishmentId', as: 'establishment'});

// Service <-> Membership (N:M via ServiceMemberAssignment)
db.Service.belongsToMany(db.Membership, {
    through: db.ServiceMemberAssignment,
    foreignKey: 'serviceId',
    otherKey: 'membershipId',
    as: 'assignedMembers' // Alias pour accéder aux memberships depuis un service
});
db.Membership.belongsToMany(db.Service, {
    through: db.ServiceMemberAssignment,
    foreignKey: 'membershipId',
    otherKey: 'serviceId',
    as: 'assignedServices' // Alias pour accéder aux services depuis un membership
});

// Membership <-> Booking (1:N pour le membre assigné)
db.Membership.hasMany(db.Booking, {foreignKey: 'assignedMembershipId', as: 'assignedBookings'});
db.Booking.belongsTo(db.Membership, {foreignKey: 'assignedMembershipId', as: 'assignedMember'});

// TimeOffRequest <-> Membership (Requesting Member)
// Une demande de congé appartient à un Membership (le demandeur)
db.TimeOffRequest.belongsTo(db.Membership, {
    foreignKey: 'membershipId', // Clé dans TimeOffRequest
    as: 'requestingMember',     // Alias pour l'association
    constraints: true,          // Assure que la FK est bien créée
    onDelete: 'CASCADE'         // Important: si le membre est supprimé, ses demandes aussi
});
// Un Membership peut avoir plusieurs TimeOffRequests
db.Membership.hasMany(db.TimeOffRequest, {
    foreignKey: 'membershipId', // Clé dans TimeOffRequest
    as: 'timeOffRequests',      // Alias
    constraints: true
});


// TimeOffRequest <-> Establishment
// Une demande de congé appartient à un Etablissement
db.TimeOffRequest.belongsTo(db.Establishment, {
    foreignKey: 'establishmentId',
    as: 'establishment',
    constraints: true,
    onDelete: 'CASCADE'
});
// Un Etablissement peut avoir plusieurs TimeOffRequests
db.Establishment.hasMany(db.TimeOffRequest, {
    foreignKey: 'establishmentId',
    as: 'timeOffRequests', // Peut être utile pour des admins voyant toutes les demandes
    constraints: true
});


// TimeOffRequest <-> Membership (Processing Admin)
// Une demande peut avoir été traitée par un Membership (admin)
db.TimeOffRequest.belongsTo(db.Membership, {
    foreignKey: 'processedByMembershipId',
    as: 'processingAdmin',
    constraints: true,
    onDelete: 'SET NULL' // Si l'admin processeur est supprimé, on garde la trace de la demande
});
// Un Membership (admin) peut avoir traité plusieurs demandes
db.Membership.hasMany(db.TimeOffRequest, {
    foreignKey: 'processedByMembershipId',
    as: 'processedTimeOffRequests',
    constraints: true
});


// TimeOffRequest <-> Membership (Cancelling Actor)
// Une demande peut avoir été annulée par un Membership (membre ou admin)
db.TimeOffRequest.belongsTo(db.Membership, {
    foreignKey: 'cancelledByMembershipId',
    as: 'cancellingActor',
    constraints: true,
    onDelete: 'SET NULL' // Si l'acteur annulant est supprimé, on garde la trace
});
// Un Membership peut avoir annulé plusieurs demandes
db.Membership.hasMany(db.TimeOffRequest, {
    foreignKey: 'cancelledByMembershipId',
    as: 'cancelledTimeOffRequests',
    constraints: true
});

// RecurringPlanningModel Associations
db.Establishment.hasMany(db.RecurringPlanningModel, {
    foreignKey: 'establishmentId',
    as: 'recurringPlanningModels',
    onDelete: 'CASCADE', // Si l'établissement est supprimé, ses RPMs aussi
});
db.RecurringPlanningModel.belongsTo(db.Establishment, {
    foreignKey: 'establishmentId',
    as: 'establishment',
});

// RecurringPlanningModelMemberAssignment Associations (Table de liaison)
db.Membership.hasMany(db.RecurringPlanningModelMemberAssignment, {
    foreignKey: 'membershipId',
    as: 'rpmAssignments',
    onDelete: 'CASCADE',
});
db.RecurringPlanningModelMemberAssignment.belongsTo(db.Membership, {
    foreignKey: 'membershipId',
    as: 'member', // ou 'assignedMember'
});

db.RecurringPlanningModel.hasMany(db.RecurringPlanningModelMemberAssignment, {
    foreignKey: 'recurringPlanningModelId',
    as: 'memberAssignments', // ou 'assignments'
    onDelete: 'CASCADE', // Si le RPM est supprimé, ses affectations aussi
});
db.RecurringPlanningModelMemberAssignment.belongsTo(db.RecurringPlanningModel, {
    foreignKey: 'recurringPlanningModelId',
    as: 'recurringPlanningModel',
});

// DailyAdjustmentSlot Associations
db.Establishment.hasMany(db.DailyAdjustmentSlot, {
    foreignKey: 'establishmentId',
    as: 'dailyAdjustmentSlots',
    onDelete: 'CASCADE',
});
db.DailyAdjustmentSlot.belongsTo(db.Establishment, {
    foreignKey: 'establishmentId',
    as: 'establishment',
});

db.Membership.hasMany(db.DailyAdjustmentSlot, {
    foreignKey: 'membershipId',
    as: 'dailyAdjustmentSlots',
    onDelete: 'CASCADE',
});
db.DailyAdjustmentSlot.belongsTo(db.Membership, {
    foreignKey: 'membershipId',
    as: 'member',
});

db.RecurringPlanningModel.hasMany(db.DailyAdjustmentSlot, {
    foreignKey: 'sourceRpmId', // Nom de champ corrigé
    as: 'derivedAdjustmentSlots',
    onDelete: 'SET NULL', // Si le RPM source est supprimé, l'ajustement perd sa source mais reste
    constraints: false, // Peut être nécessaire si sourceRpmId peut être null et que la FK n'est pas stricte
});
db.DailyAdjustmentSlot.belongsTo(db.RecurringPlanningModel, {
    foreignKey: 'sourceRpmId', // Nom de champ corrigé
    as: 'sourceRecurringPlanningModel',
});


export default db;
export {MembershipRole, MembershipStatus};