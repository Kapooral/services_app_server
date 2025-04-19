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
    Country: CountryModel
};


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


export default db;