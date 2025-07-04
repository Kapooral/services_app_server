// src/migrations/YYYYMMDDHHMMSS-add-member-management.ts

import {QueryInterface, DataTypes, Sequelize, Transaction} from 'sequelize';

export async function up(queryInterface: QueryInterface, sequelize: Sequelize) {
    const transaction: Transaction = await queryInterface.sequelize.transaction();
    try {
        // 2. Créer la table Memberships
        await queryInterface.createTable('memberships', {
            id: {
                type: DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            user_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            establishment_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {
                    model: 'establishments',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            role: {
                type: DataTypes.ENUM('ADMIN', 'STAFF'),
                allowNull: false,
                defaultValue: 'STAFF'
            },
            status: {
                type: DataTypes.ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'REVOKED'),
                allowNull: false,
                defaultValue: 'PENDING'
            },
            invited_email: {
                type: DataTypes.STRING(255),
                allowNull: true
            },
            invitation_token_hash: {
                type: DataTypes.STRING(255),
                allowNull: true,
                unique: true
            },
            invitation_token_expires_at: {
                type: DataTypes.DATE,
                allowNull: true
            },
            joined_at: {
                type: DataTypes.DATE,
                allowNull: true
            },
            created_at: {
                allowNull: false,
                type: DataTypes.DATE
            },
            updated_at: {
                allowNull: false,
                type: DataTypes.DATE
            }
        }, {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            transaction
        });

        // Ajouter les index et contraintes uniques pour Memberships
        await queryInterface.addIndex('memberships', ['user_id'], {transaction, name: 'idx_membership_user'});
        await queryInterface.addIndex('memberships', ['establishment_id'], {
            transaction,
            name: 'idx_membership_establishment'
        });
        // Index unique sur token déjà créé par unique:true
        await queryInterface.addIndex('memberships', ['status'], {transaction, name: 'idx_membership_status'});
        await queryInterface.addConstraint('memberships', {
            fields: ['user_id', 'establishment_id'],
            type: 'unique',
            name: 'unique_user_establishment',
            transaction
        });
        await queryInterface.addIndex('memberships', ['invited_email', 'establishment_id'], {
            name: 'idx_unique_pending_invited_email', // Donner un nom explicite à l'index
            unique: true,
            where: {status: 'PENDING'}, // Condition pour l'index partiel
            transaction
        });
        await queryInterface.addIndex('memberships', ['invitation_token_hash'], {
            name: 'idx_unique_invitation_token_hash', // Donner un nom explicite à l'index
            unique: true,
            transaction
        });

        // 4. Créer la table ServiceMemberAssignments
        await queryInterface.createTable('service_member_assignments', {
            id: {type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true},
            service_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {model: 'services', key: 'id'},
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            membership_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: {model: 'memberships', key: 'id'},
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            created_at: {
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                allowNull: false,
                type: DataTypes.DATE,
                defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
            }
        }, {transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci'});

        // Ajouter index et contrainte unique pour ServiceMemberAssignments
        await queryInterface.addIndex('service_member_assignments', ['service_id'], {
            transaction,
            name: 'idx_assignment_service'
        });
        await queryInterface.addIndex('service_member_assignments', ['membership_id'], {
            transaction,
            name: 'idx_assignment_membership'
        });
        await queryInterface.addConstraint('service_member_assignments', {
            fields: ['service_id', 'membership_id'],
            type: 'unique',
            name: 'unique_service_member_assignment',
            transaction
        });

        // 5. Modifier la table Bookings
        await queryInterface.addColumn('bookings', 'assigned_membership_id', {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            references: {model: 'memberships', key: 'id'},
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        }, {transaction});
        // Ajouter index pour la nouvelle colonne
        await queryInterface.addIndex('bookings', ['assigned_membership_id'], {
            transaction,
            name: 'idx_booking_assigned_member'
        });


        await transaction.commit();
        console.log("Add member management UP succeed.");
    } catch (e) {
        console.log("Add member management UP failed.");
        await transaction.rollback();
        console.log(e);
    }
}

export async function down(queryInterface: QueryInterface) {
    const transaction: Transaction = await queryInterface.sequelize.transaction();
    try {
        await queryInterface.removeColumn('bookings', 'assigned_membership_id', {transaction});
        await queryInterface.dropTable('service_member_assignments', {transaction});
        await queryInterface.dropTable('memberships', {transaction});

        if (queryInterface.sequelize.getDialect() === 'postgres') {
            await queryInterface.sequelize.query('DROP TYPE "enum_memberships_role";', {transaction});
            await queryInterface.sequelize.query('DROP TYPE "enum_memberships_status";', {transaction});
        }

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        console.error("Rollback failed:", error);
        throw error;
    }
}