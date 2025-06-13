// src/controllers/rpm-member-assignment.controller.ts
import { Request, Response, NextFunction } from 'express';
import { RpmMemberAssignmentService } from '../services/rpm-member-assignment.service';
import {
    CreateRpmMemberAssignmentSchema, CreateRpmMemberAssignmentDto,
    UpdateRpmMemberAssignmentSchema, UpdateRpmMemberAssignmentDto,
    ListRpmMemberAssignmentsQuerySchema, ListRpmMemberAssignmentsQueryDto,
    BulkAssignMembersToRpmSchema, BulkAssignMembersToRpmDto,
    BulkUnassignMembersFromRpmSchema, BulkUnassignMembersFromRpmDto
} from '../dtos/planning/rpm-member-assignment.validation';
import { MembershipAttributes } from '../models/Membership';
import { ForbiddenError } from '../errors/app.errors';
import { parseNumberId } from '../utils/parser.utils';

export class RpmMemberAssignmentController {
    constructor(private assignmentService: RpmMemberAssignmentService) {}

    private checkActorPermission(actor: MembershipAttributes, establishmentIdFromParams: number, next: NextFunction): boolean {
        if (actor.establishmentId !== establishmentIdFromParams) {
            next(new ForbiddenError('Actor does not belong to the target establishment or action is not permitted.'));
            return false;
        }
        return true;
    }

    public createAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const rpmIdFromParams = parseNumberId(req.params.rpmId, 'rpmId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedBody: CreateRpmMemberAssignmentDto = CreateRpmMemberAssignmentSchema.parse(req.body);

            const newAssignment = await this.assignmentService.createAssignment(
                validatedBody,
                rpmIdFromParams,
                establishmentIdFromParams // Contexte de l'établissement pour la validation interne
            );
            res.status(201).json(newAssignment);
        } catch (error) {
            next(error);
        }
    };

    public listAssignmentsForRpm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const rpmIdFromParams = parseNumberId(req.params.rpmId, 'rpmId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedQuery: ListRpmMemberAssignmentsQueryDto = ListRpmMemberAssignmentsQuerySchema.parse(req.query);
            // S'assurer que le filtre rpmId est bien celui de l'URL pour cet endpoint
            const queryForService = { ...validatedQuery, recurringPlanningModelId: rpmIdFromParams };

            const paginatedAssignments = await this.assignmentService.listAssignments(
                queryForService,
                establishmentIdFromParams
            );
            res.status(200).json(paginatedAssignments);
        } catch (error) {
            next(error);
        }
    };

    public updateAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            // const rpmIdFromParams = parseNumberId(req.params.rpmId, 'rpmId'); // Peut être utilisé pour contexte
            const assignmentId = parseNumberId(req.params.assignmentId, 'assignmentId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedBody: UpdateRpmMemberAssignmentDto = UpdateRpmMemberAssignmentSchema.parse(req.body);
            const updatedAssignment = await this.assignmentService.updateAssignment(
                assignmentId,
                validatedBody,
                establishmentIdFromParams
            );
            res.status(200).json(updatedAssignment);
        } catch (error) {
            next(error);
        }
    };

    public deleteAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            // const rpmIdFromParams = parseNumberId(req.params.rpmId, 'rpmId'); // Peut être utilisé pour contexte
            const assignmentId = parseNumberId(req.params.assignmentId, 'assignmentId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            await this.assignmentService.deleteAssignment(assignmentId, establishmentIdFromParams);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    };

    public bulkAssign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const rpmIdFromParams = parseNumberId(req.params.rpmId, 'rpmId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedBody: BulkAssignMembersToRpmDto = BulkAssignMembersToRpmSchema.parse(req.body);
            const result = await this.assignmentService.bulkAssignMembersToRpm(
                validatedBody,
                rpmIdFromParams,
                establishmentIdFromParams
            );
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    public bulkUnassign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const rpmIdFromParams = parseNumberId(req.params.rpmId, 'rpmId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedBody: BulkUnassignMembersFromRpmDto = BulkUnassignMembersFromRpmSchema.parse(req.body);
            const result = await this.assignmentService.bulkUnassignMembersFromRpm(
                validatedBody,
                rpmIdFromParams,
                establishmentIdFromParams
            );
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };
}