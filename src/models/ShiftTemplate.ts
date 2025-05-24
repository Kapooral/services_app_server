import {
    Model, DataTypes, Optional, Sequelize, BelongsToGetAssociationMixin,
    HasManyGetAssociationsMixin, HasManyAddAssociationsMixin, HasManyAddAssociationMixin, HasManyCountAssociationsMixin,
    BelongsToSetAssociationMixin, HasManyCreateAssociationMixin, Association
} from 'sequelize';
import Establishment from './Establishment';
import Membership from './Membership';
// ShiftTemplateRule sera défini plus bas dans ce fichier

interface ShiftTemplateAttributes {
    id: number;
    establishmentId: number;
    name: string;
    description: string | null;
    createdByMembershipId: number; // Admin qui a créé/possède ce template
    createdAt?: Date;
    updatedAt?: Date;
}

interface ShiftTemplateCreationAttributes extends Optional<ShiftTemplateAttributes, 'id' | 'description' | 'createdAt' | 'updatedAt'> {}

class ShiftTemplate extends Model<ShiftTemplateAttributes, ShiftTemplateCreationAttributes> implements ShiftTemplateAttributes {
    public id!: number;
    public establishmentId!: number;
    public name!: string;
    public description!: string | null;
    public createdByMembershipId!: number;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins d'Association ---
    public getEstablishment!: BelongsToGetAssociationMixin<Establishment>;
    public setEstablishment!: BelongsToSetAssociationMixin<Establishment, number>;

    public getCreator!: BelongsToGetAssociationMixin<Membership>;
    public setCreator!: BelongsToSetAssociationMixin<Membership, number>;

    // Type pour les règles sera ShiftTemplateRule défini plus bas
    public getRules!: HasManyGetAssociationsMixin<ShiftTemplateRule>;
    public addRule!: HasManyAddAssociationMixin<ShiftTemplateRule, number>;
    public addRules!: HasManyAddAssociationsMixin<ShiftTemplateRule, number>;
    public countRules!: HasManyCountAssociationsMixin;
    public createRule!: HasManyCreateAssociationMixin<ShiftTemplateRule>;


    // --- Associations (définies dans index.ts ou via la fonction d'association) ---
    public readonly establishment?: Establishment;
    public readonly creator?: Membership;
    public readonly rules?: ShiftTemplateRule[]; // Tableau d'instances ShiftTemplateRule

    public static associations: {
        rules: Association<ShiftTemplate, ShiftTemplateRule>;
    };
}

export const initShiftTemplate = (sequelize: Sequelize): typeof ShiftTemplate => {
    ShiftTemplate.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            establishmentId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'establishments', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
                field: 'establishment_id',
            },
            name: { type: DataTypes.STRING(100), allowNull: false },
            description: { type: DataTypes.TEXT, allowNull: true },
            createdByMembershipId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'memberships', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT', // Empêche la suppression d'un membre s'il a créé des templates
                field: 'created_by_membership_id',
            },
        },
        {
            sequelize,
            tableName: 'shift_templates',
            modelName: 'ShiftTemplate',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['establishment_id'] },
                { fields: ['establishment_id', 'name'], unique: true },
            ],
        }
    );
    return ShiftTemplate;
};

// --- ShiftTemplateRule Model ---
interface ShiftTemplateRuleAttributes {
    id: number;
    shiftTemplateId: number;
    rruleString: string;
    durationMinutes: number;
    isWorking: boolean;
    ruleDescription: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface ShiftTemplateRuleCreationAttributes extends Optional<ShiftTemplateRuleAttributes, 'id' | 'ruleDescription' | 'createdAt' | 'updatedAt'> {}

class ShiftTemplateRule extends Model<ShiftTemplateRuleAttributes, ShiftTemplateRuleCreationAttributes> implements ShiftTemplateRuleAttributes {
    public id!: number;
    public shiftTemplateId!: number;
    public rruleString!: string;
    public durationMinutes!: number;
    public isWorking!: boolean;
    public ruleDescription!: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // --- Mixins d'Association ---
    public getShiftTemplate!: BelongsToGetAssociationMixin<ShiftTemplate>;
    public setShiftTemplate!: BelongsToSetAssociationMixin<ShiftTemplate, number>;

    // --- Associations ---
    public readonly shiftTemplate?: ShiftTemplate;
}

export const initShiftTemplateRule = (sequelize: Sequelize): typeof ShiftTemplateRule => {
    ShiftTemplateRule.init(
        {
            id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
            shiftTemplateId: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: 'shift_templates', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
                field: 'shift_template_id',
            },
            rruleString: {
                type: DataTypes.TEXT,
                allowNull: false,
                comment: 'RRule string, DTSTART time should be local to establishment (e.g., T090000)'
            },
            durationMinutes: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                field: 'duration_minutes',
            },
            isWorking: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                field: 'is_working',
            },
            ruleDescription: {
                type: DataTypes.STRING(255),
                allowNull: true,
                field: 'rule_description',
            },
        },
        {
            sequelize,
            tableName: 'shift_template_rules',
            modelName: 'ShiftTemplateRule',
            timestamps: true,
            underscored: true,
            indexes: [
                { fields: ['shift_template_id'] },
            ],
        }
    );
    return ShiftTemplateRule;
};

// Fonction pour définir les associations entre ShiftTemplate et ShiftTemplateRule
export const associateShiftTemplateModels = (ST: typeof ShiftTemplate, STR: typeof ShiftTemplateRule) => {
    ST.hasMany(STR, {
        sourceKey: 'id',
        foreignKey: 'shiftTemplateId',
        as: 'rules',
        onDelete: 'CASCADE',
    });
    STR.belongsTo(ST, {
        targetKey: 'id',
        foreignKey: 'shiftTemplateId',
        as: 'shiftTemplate',
    });
};

export { ShiftTemplate, ShiftTemplateRule };
export type { ShiftTemplateAttributes, ShiftTemplateCreationAttributes, ShiftTemplateRuleAttributes, ShiftTemplateRuleCreationAttributes };