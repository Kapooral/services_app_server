import { Sequelize } from 'sequelize';
import sequelizeInstance from '../config/database';

import User, { initUser } from './User';
import RefreshToken, { initRefreshToken } from './RefreshToken';
import Role, { initRole } from './Role';
import UserRole, { initUserRole } from './UserRole';

import Establishment, { initEstablishment } from './Establishment';
import Service, { initService } from './Service';
import AvailabilityRule, { initAvailabilityRule } from './AvailabilityRule';
import AvailabilityOverride, { initAvailabilityOverride } from './AvailabilityOverride';
import Booking, { initBooking } from './Booking';
import Country, { initCountry } from './Country';
import Timezone, { initTimezone } from './Timezone'

import Membership, { initMembership, MembershipRole, MembershipStatus } from './Membership';
import StaffAvailability, { initStaffAvailability } from './StaffAvailability';
import ServiceMemberAssignment, { initServiceMemberAssignment } from './ServiceMemberAssignment';
import TimeOffRequest, { initTimeOffRequest } from './TimeOffRequest';


import {
    ShiftTemplate as ShiftTemplateModelClass, // Renommer pour éviter conflit avec l'export du type
    ShiftTemplateRule as ShiftTemplateRuleModelClass, // Renommer
    initShiftTemplate,
    initShiftTemplateRule,
    associateShiftTemplateModels
} from './ShiftTemplate';

const UserModel = initUser(sequelizeInstance);
const RefreshTokenModel = initRefreshToken(sequelizeInstance);
const RoleModel = initRole(sequelizeInstance);
const UserRoleModel = initUserRole(sequelizeInstance);

const EstablishmentModel = initEstablishment(sequelizeInstance);
const ServiceModel = initService(sequelizeInstance);
const AvailabilityRuleModel = initAvailabilityRule(sequelizeInstance);
const AvailabilityOverrideModel = initAvailabilityOverride(sequelizeInstance);
const BookingModel = initBooking(sequelizeInstance);

const CountryModel = initCountry(sequelizeInstance);
const TimezoneModel = initTimezone(sequelizeInstance);

const MembershipModel = initMembership(sequelizeInstance);
const StaffAvailabilityModel = initStaffAvailability(sequelizeInstance);
const ServiceMemberAssignmentModel = initServiceMemberAssignment(sequelizeInstance);
const TimeOffRequestModel = initTimeOffRequest(sequelizeInstance);


const ShiftTemplateModel = initShiftTemplate(sequelizeInstance);
const ShiftTemplateRuleModel = initShiftTemplateRule(sequelizeInstance);

const db = {
    sequelize: sequelizeInstance,
    Sequelize,
    User: UserModel,
    RefreshToken: RefreshTokenModel,
    Role: RoleModel,
    UserRole: UserRoleModel,
    Establishment: EstablishmentModel,
    Service: ServiceModel,
    AvailabilityRule: AvailabilityRuleModel,
    AvailabilityOverride: AvailabilityOverrideModel,
    Booking: BookingModel,
    Country: CountryModel,
    Timezone: TimezoneModel,
    Membership: MembershipModel,
    StaffAvailability: StaffAvailabilityModel,
    ServiceMemberAssignment: ServiceMemberAssignmentModel,
    TimeOffRequest: TimeOffRequestModel,
    ShiftTemplate: ShiftTemplateModel,
    ShiftTemplateRule: ShiftTemplateRuleModel,
};

// Country <-> Timezone (1 Timezone principal pour 1 Country, 1 Timezone peut être pour N Countries)
// Un Pays (Country) appartient à un Fuseau Horaire (Timezone) principal/par défaut.
CountryModel.belongsTo(TimezoneModel, {
    foreignKey: 'timezoneId',
    as: 'defaultTimezone',
    constraints: true,
    onDelete: 'SET NULL',
});

// Un Fuseau Horaire (Timezone) peut être le fuseau par défaut de plusieurs Pays (Countries).
TimezoneModel.hasMany(CountryModel, {
    foreignKey: 'timezoneId',
    as: 'countriesWithThisDefaultTimezone',
    constraints: true
});

// User <-> RefreshToken (1:N)
UserModel.hasMany(RefreshTokenModel, { foreignKey: 'user_id', as: 'refreshTokens' });
RefreshTokenModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'user' });

// User <-> Role (N:M)
UserModel.belongsToMany(RoleModel, { through: UserRoleModel, foreignKey: 'userId', otherKey: 'roleId', as: 'roles' });
RoleModel.belongsToMany(UserModel, { through: UserRoleModel, foreignKey: 'roleId', otherKey: 'userId', as: 'users' });

// User <-> Establishment (1:N - Un User "owner" pour N Establishments)
// Note: L'association est définie par Establishment.owner_id -> User.id
// On peut définir les deux sens pour utiliser les mixins Sequelize
UserModel.hasMany(EstablishmentModel, { foreignKey: 'owner_id', as: 'ownedEstablishments' });
EstablishmentModel.belongsTo(UserModel, { foreignKey: 'owner_id', as: 'owner' });

// Establishment <-> Service (1:N)
EstablishmentModel.hasMany(ServiceModel, { foreignKey: 'establishment_id', as: 'services' });
ServiceModel.belongsTo(EstablishmentModel, { foreignKey: 'establishment_id', as: 'establishment' });

// Establishment <-> AvailabilityRule (1:N)
EstablishmentModel.hasMany(AvailabilityRuleModel, { foreignKey: 'establishment_id', as: 'availabilityRules' });
AvailabilityRuleModel.belongsTo(EstablishmentModel, { foreignKey: 'establishment_id', as: 'establishment' });

// Establishment <-> AvailabilityOverride (1:N)
EstablishmentModel.hasMany(AvailabilityOverrideModel, { foreignKey: 'establishment_id', as: 'availabilityOverrides' });
AvailabilityOverrideModel.belongsTo(EstablishmentModel, { foreignKey: 'establishment_id', as: 'establishment' });

// User <-> Booking (1:N - Un User "client" pour N Bookings)
UserModel.hasMany(BookingModel, { foreignKey: 'user_id', as: 'bookings' });
BookingModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'client' });

// Establishment <-> Booking (1:N)
EstablishmentModel.hasMany(BookingModel, { foreignKey: 'establishment_id', as: 'bookings' });
BookingModel.belongsTo(EstablishmentModel, { foreignKey: 'establishment_id', as: 'establishment' });

// Service <-> Booking (1:N)
ServiceModel.hasMany(BookingModel, { foreignKey: 'service_id', as: 'bookings' });
BookingModel.belongsTo(ServiceModel, { foreignKey: 'service_id', as: 'service' });

// User <-> Membership (1:N)
UserModel.hasMany(MembershipModel, { foreignKey: 'userId', as: 'memberships' });
MembershipModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });

// Establishment <-> Membership (1:N)
EstablishmentModel.hasMany(MembershipModel, { foreignKey: 'establishmentId', as: 'memberships' });
MembershipModel.belongsTo(EstablishmentModel, { foreignKey: 'establishmentId', as: 'establishment' });

// Membership <-> StaffAvailability (1:N)
MembershipModel.hasMany(StaffAvailabilityModel, { foreignKey: 'membershipId', as: 'staffAvailabilities' });
StaffAvailabilityModel.belongsTo(MembershipModel, { foreignKey: 'membershipId', as: 'membership' });

// Service <-> Membership (N:M via ServiceMemberAssignment)
ServiceModel.belongsToMany(MembershipModel, {
    through: ServiceMemberAssignmentModel,
    foreignKey: 'serviceId',
    otherKey: 'membershipId',
    as: 'assignedMembers' // Alias pour accéder aux memberships depuis un service
});
MembershipModel.belongsToMany(ServiceModel, {
    through: ServiceMemberAssignmentModel,
    foreignKey: 'membershipId',
    otherKey: 'serviceId',
    as: 'assignedServices' // Alias pour accéder aux services depuis un membership
});

// Membership <-> Booking (1:N pour le membre assigné)
MembershipModel.hasMany(BookingModel, { foreignKey: 'assignedMembershipId', as: 'assignedBookings' });
BookingModel.belongsTo(MembershipModel, { foreignKey: 'assignedMembershipId', as: 'assignedMember' });

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


// ShiftTemplate <-> Establishment
db.Establishment.hasMany(db.ShiftTemplate, { foreignKey: 'establishmentId', as: 'shiftTemplates' });
db.ShiftTemplate.belongsTo(db.Establishment, { foreignKey: 'establishmentId', as: 'establishment' });

// ShiftTemplate <-> Membership (Creator)
db.Membership.hasMany(db.ShiftTemplate, { foreignKey: 'createdByMembershipId', as: 'createdShiftTemplates' });
db.ShiftTemplate.belongsTo(db.Membership, { foreignKey: 'createdByMembershipId', as: 'creator' });

// ShiftTemplate <-> ShiftTemplateRule (appel de la fonction d'association dédiée)
associateShiftTemplateModels(db.ShiftTemplate, db.ShiftTemplateRule);


export default db;
export { MembershipRole, MembershipStatus };