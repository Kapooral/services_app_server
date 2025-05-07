import { Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin } from 'sequelize';
import Service from './Service';
import Membership from './Membership';

interface ServiceMemberAssignmentAttributes {
    id: number;
    serviceId: number;
    membershipId: number;
    createdAt?: Date;
    updatedAt?: Date;
}

// Tous les champs sauf ID, createdAt, updatedAt sont requis à la création
interface ServiceMemberAssignmentCreationAttributes extends Optional<ServiceMemberAssignmentAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class ServiceMemberAssignment extends Model<ServiceMemberAssignmentAttributes, ServiceMemberAssignmentCreationAttributes> implements ServiceMemberAssignmentAttributes {
    public id!: number;
    public serviceId!: number;
    public membershipId!: number;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins (Optionnel, mais peut être utile) ---
    public getService!: BelongsToGetAssociationMixin<Service>;
    public setService!: BelongsToGetAssociationMixin<Service>;
    public getMembership!: BelongsToGetAssociationMixin<Membership>;
    public setMembership!: BelongsToGetAssociationMixin<Membership>;

    // --- Associations (gérées par les modèles principaux via 'through') ---
    // Pas besoin de déclarer `readonly service?` ou `readonly membership?` ici
    // car c'est une table de jonction pure.
}

export const initServiceMemberAssignment = (sequelize: Sequelize) => {
    ServiceMemberAssignment.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            serviceId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'services', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            membershipId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'memberships', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
        },
        {
            sequelize,
            tableName: 'service_member_assignments',
            modelName: 'ServiceMemberAssignment',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['service_id'] },
                { fields: ['membership_id'] },
                // La contrainte unique est définie dans la migration
            ]
        }
    );
    return ServiceMemberAssignment;
};

export default ServiceMemberAssignment;
export type { ServiceMemberAssignmentAttributes, ServiceMemberAssignmentCreationAttributes };