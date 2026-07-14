import { and, asc, eq, sql } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import {
  phdSystemEntity,
  phdSystemGroup,
  phdSystemGroupMember,
} from "../../core/db/drizzle/schema/phd.schema";
import { HttpError } from "../../shared/errors/http-error";
import { mapPgErrorToHttp } from "../../shared/errors/pg-error";
import {
  CreateSystemGroupInput,
  CreateSystemGroupMemberInput,
  SystemGroupDetail,
  SystemGroupListItem,
  SystemGroupMemberItem,
  SystemGroupSummaryItem,
  UpdateSystemGroupInput,
  UpdateSystemGroupMemberInput,
} from "./system-group.types";

export class SystemGroupRepository {
  constructor(private db: DrizzleDB) {}

  private validateAllowedGroupPatchKeys(data: Record<string, unknown>) {
    const allowed = new Set(["name", "description", "displayOrder"]);
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) {
        throw new HttpError(400, "Invalid system group payload");
      }
    }
  }

  private validateAllowedMemberPatchKeys(data: Record<string, unknown>) {
    const allowed = new Set(["systemId", "displayOrder"]);
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) {
        throw new HttpError(400, "Invalid system group member payload");
      }
    }
  }

  private async findGroupSummaryById(groupId: string): Promise<SystemGroupSummaryItem> {
    const [group] = await this.db
      .select({
        id: phdSystemGroup.id,
        name: phdSystemGroup.name,
        description: phdSystemGroup.description,
        displayOrder: phdSystemGroup.displayOrder,
        memberCount: sql<number>`count(${phdSystemGroupMember.id})::int`,
        createdAt: phdSystemGroup.createdAt,
        updatedAt: phdSystemGroup.updatedAt,
      })
      .from(phdSystemGroup)
      .leftJoin(phdSystemGroupMember, eq(phdSystemGroup.id, phdSystemGroupMember.systemGroupId))
      .where(eq(phdSystemGroup.id, groupId))
      .groupBy(phdSystemGroup.id)
      .limit(1);

    if (!group) {
      throw new HttpError(404, "System group not found");
    }

    return group;
  }

  async findAll(): Promise<SystemGroupListItem[]> {
    return this.db
      .select({
        id: phdSystemGroup.id,
        name: phdSystemGroup.name,
        description: phdSystemGroup.description,
        displayOrder: phdSystemGroup.displayOrder,
        memberCount: sql<number>`count(${phdSystemGroupMember.id})::int`,
        createdAt: phdSystemGroup.createdAt,
        updatedAt: phdSystemGroup.updatedAt,
      })
      .from(phdSystemGroup)
      .leftJoin(phdSystemGroupMember, eq(phdSystemGroup.id, phdSystemGroupMember.systemGroupId))
      .groupBy(phdSystemGroup.id)
      .orderBy(asc(phdSystemGroup.displayOrder), asc(phdSystemGroup.name));
  }

  async findMembersByGroupId(groupId: string): Promise<SystemGroupMemberItem[]> {
    const [group] = await this.db
      .select({ id: phdSystemGroup.id })
      .from(phdSystemGroup)
      .where(eq(phdSystemGroup.id, groupId))
      .limit(1);

    if (!group) {
      throw new HttpError(404, "System group not found");
    }

    return this.db
      .select({
        id: phdSystemGroupMember.id,
        systemGroupId: phdSystemGroupMember.systemGroupId,
        systemId: phdSystemGroupMember.systemId,
        systemName: phdSystemEntity.name,
        systemCode: phdSystemEntity.code,
        systemType: phdSystemEntity.type,
        displayOrder: phdSystemGroupMember.displayOrder,
        createdAt: phdSystemGroupMember.createdAt,
        updatedAt: phdSystemGroupMember.updatedAt,
      })
      .from(phdSystemGroupMember)
      .innerJoin(phdSystemEntity, eq(phdSystemGroupMember.systemId, phdSystemEntity.id))
      .where(eq(phdSystemGroupMember.systemGroupId, groupId))
      .orderBy(asc(phdSystemGroupMember.displayOrder));
  }

  async findById(groupId: string): Promise<SystemGroupDetail> {
    const [group] = await this.db
      .select({
        id: phdSystemGroup.id,
        name: phdSystemGroup.name,
        description: phdSystemGroup.description,
        displayOrder: phdSystemGroup.displayOrder,
        createdAt: phdSystemGroup.createdAt,
        updatedAt: phdSystemGroup.updatedAt,
      })
      .from(phdSystemGroup)
      .where(eq(phdSystemGroup.id, groupId))
      .limit(1);

    if (!group) {
      throw new HttpError(404, "System group not found");
    }

    const members = await this.findMembersByGroupId(groupId);

    return {
      ...group,
      members,
    };
  }

  async create(data: CreateSystemGroupInput) {
    if (!data?.name || typeof data.name !== "string") {
      throw new HttpError(400, "Invalid system group payload");
    }

    if (!Number.isInteger(data.displayOrder) || data.displayOrder <= 0) {
      throw new HttpError(400, "Invalid system group payload");
    }

    try {
      return await this.db
        .insert(phdSystemGroup)
        .values({
          name: data.name,
          description: data.description ?? null,
          displayOrder: data.displayOrder,
        })
        .returning();
    } catch (error) {
      throw mapPgErrorToHttp(error, "System group name already exists");
    }
  }

  async createMember(groupId: string, data: CreateSystemGroupMemberInput) {
    if (!groupId || !data?.systemId) {
      throw new HttpError(400, "Invalid system group member payload");
    }

    if (!Number.isInteger(data.displayOrder) || data.displayOrder <= 0) {
      throw new HttpError(400, "Invalid system group member payload");
    }

    const [group] = await this.db
      .select({ id: phdSystemGroup.id })
      .from(phdSystemGroup)
      .where(eq(phdSystemGroup.id, groupId))
      .limit(1);

    if (!group) {
      throw new HttpError(404, "System group not found");
    }

    const [system] = await this.db
      .select({
        id: phdSystemEntity.id,
        name: phdSystemEntity.name,
        code: phdSystemEntity.code,
        type: phdSystemEntity.type,
      })
      .from(phdSystemEntity)
      .where(eq(phdSystemEntity.id, data.systemId))
      .limit(1);

    if (!system) {
      throw new HttpError(404, "System not found");
    }

    const [existingSystem] = await this.db
      .select({ id: phdSystemGroupMember.id })
      .from(phdSystemGroupMember)
      .where(
        and(
          eq(phdSystemGroupMember.systemGroupId, groupId),
          eq(phdSystemGroupMember.systemId, data.systemId)
        )
      )
      .limit(1);

    if (existingSystem) {
      throw new HttpError(409, "System already exists in this group");
    }

    const [existingOrder] = await this.db
      .select({ id: phdSystemGroupMember.id })
      .from(phdSystemGroupMember)
      .where(
        and(
          eq(phdSystemGroupMember.systemGroupId, groupId),
          eq(phdSystemGroupMember.displayOrder, data.displayOrder)
        )
      )
      .limit(1);

    if (existingOrder) {
      throw new HttpError(409, "Display order already exists in this group");
    }

    try {
      const [member] = await this.db
        .insert(phdSystemGroupMember)
        .values({
          systemGroupId: groupId,
          systemId: data.systemId,
          displayOrder: data.displayOrder,
        })
        .returning({
          id: phdSystemGroupMember.id,
          systemGroupId: phdSystemGroupMember.systemGroupId,
          systemId: phdSystemGroupMember.systemId,
          displayOrder: phdSystemGroupMember.displayOrder,
          createdAt: phdSystemGroupMember.createdAt,
          updatedAt: phdSystemGroupMember.updatedAt,
        });

      return [
        {
          ...member,
          systemName: system.name,
          systemCode: system.code,
          systemType: system.type,
        },
      ];
    } catch (error) {
      throw mapPgErrorToHttp(error, "System group member conflict");
    }
  }

  async updateById(groupId: string, data: UpdateSystemGroupInput): Promise<SystemGroupSummaryItem> {
    if (!groupId || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new HttpError(400, "Invalid system group payload");
    }

    if (Object.prototype.hasOwnProperty.call(data, "id")) {
      throw new HttpError(400, "Invalid system group payload");
    }

    this.validateAllowedGroupPatchKeys(data as Record<string, unknown>);

    const [existing] = await this.db
      .select({ id: phdSystemGroup.id })
      .from(phdSystemGroup)
      .where(eq(phdSystemGroup.id, groupId))
      .limit(1);

    if (!existing) {
      throw new HttpError(404, "System group not found");
    }

    const patchData: Partial<typeof phdSystemGroup.$inferInsert> = {};

    if (Object.prototype.hasOwnProperty.call(data, "name")) {
      if (typeof data.name !== "string" || !data.name.trim()) {
        throw new HttpError(400, "Invalid system group payload");
      }
      patchData.name = data.name;
    }

    if (Object.prototype.hasOwnProperty.call(data, "description")) {
      patchData.description = data.description ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(data, "displayOrder")) {
      if (!Number.isInteger(data.displayOrder) || (data.displayOrder as number) <= 0) {
        throw new HttpError(400, "Invalid system group payload");
      }
      patchData.displayOrder = data.displayOrder;
    }

    if (!Object.keys(patchData).length) {
      throw new HttpError(400, "Invalid system group payload");
    }

    patchData.updatedAt = new Date();

    try {
      await this.db
        .update(phdSystemGroup)
        .set(patchData)
        .where(eq(phdSystemGroup.id, groupId));
    } catch (error) {
      throw mapPgErrorToHttp(error, "System group name already exists");
    }

    return this.findGroupSummaryById(groupId);
  }

  async updateMemberById(groupId: string, memberId: string, data: UpdateSystemGroupMemberInput): Promise<SystemGroupMemberItem> {
    if (!groupId || !memberId || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new HttpError(400, "Invalid system group member payload");
    }

    if (Object.prototype.hasOwnProperty.call(data, "groupId") || Object.prototype.hasOwnProperty.call(data, "memberId")) {
      throw new HttpError(400, "Invalid system group member payload");
    }

    this.validateAllowedMemberPatchKeys(data as Record<string, unknown>);

    const [group] = await this.db
      .select({ id: phdSystemGroup.id })
      .from(phdSystemGroup)
      .where(eq(phdSystemGroup.id, groupId))
      .limit(1);

    if (!group) {
      throw new HttpError(404, "System group not found");
    }

    const [member] = await this.db
      .select({
        id: phdSystemGroupMember.id,
        systemGroupId: phdSystemGroupMember.systemGroupId,
        systemId: phdSystemGroupMember.systemId,
        displayOrder: phdSystemGroupMember.displayOrder,
      })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.id, memberId))
      .limit(1);

    if (!member || member.systemGroupId !== groupId) {
      throw new HttpError(404, "System group member not found");
    }

    const hasSystemId = Object.prototype.hasOwnProperty.call(data, "systemId");
    const hasDisplayOrder = Object.prototype.hasOwnProperty.call(data, "displayOrder");

    if (!hasSystemId && !hasDisplayOrder) {
      throw new HttpError(400, "Invalid system group member payload");
    }

    const patchData: Partial<typeof phdSystemGroupMember.$inferInsert> = {};
    let targetSystemId = member.systemId;

    if (hasSystemId) {
      if (!data.systemId || typeof data.systemId !== "string") {
        throw new HttpError(400, "Invalid system group member payload");
      }

      const [system] = await this.db
        .select({ id: phdSystemEntity.id })
        .from(phdSystemEntity)
        .where(eq(phdSystemEntity.id, data.systemId))
        .limit(1);

      if (!system) {
        throw new HttpError(404, "System not found");
      }

      targetSystemId = data.systemId;
      patchData.systemId = data.systemId;
    }

    if (hasDisplayOrder) {
      if (!Number.isInteger(data.displayOrder) || (data.displayOrder as number) <= 0) {
        throw new HttpError(400, "Invalid system group member payload");
      }
      patchData.displayOrder = data.displayOrder;
    }

    if (targetSystemId !== member.systemId) {
      const [duplicateSystem] = await this.db
        .select({ id: phdSystemGroupMember.id })
        .from(phdSystemGroupMember)
        .where(
          and(
            eq(phdSystemGroupMember.systemGroupId, groupId),
            eq(phdSystemGroupMember.systemId, targetSystemId)
          )
        )
        .limit(1);

      if (duplicateSystem && duplicateSystem.id !== memberId) {
        throw new HttpError(409, "System already exists in this group");
      }
    }

    if (Object.prototype.hasOwnProperty.call(patchData, "displayOrder")) {
      const [duplicateOrder] = await this.db
        .select({ id: phdSystemGroupMember.id })
        .from(phdSystemGroupMember)
        .where(
          and(
            eq(phdSystemGroupMember.systemGroupId, groupId),
            eq(phdSystemGroupMember.displayOrder, patchData.displayOrder as number)
          )
        )
        .limit(1);

      if (duplicateOrder && duplicateOrder.id !== memberId) {
        throw new HttpError(409, "Display order already exists in this group");
      }
    }

    patchData.updatedAt = new Date();

    try {
      await this.db
        .update(phdSystemGroupMember)
        .set(patchData)
        .where(
          and(
            eq(phdSystemGroupMember.id, memberId),
            eq(phdSystemGroupMember.systemGroupId, groupId)
          )
        );
    } catch {
      throw new HttpError(409, "System group member conflict");
    }

    const [updated] = await this.db
      .select({
        id: phdSystemGroupMember.id,
        systemGroupId: phdSystemGroupMember.systemGroupId,
        systemId: phdSystemGroupMember.systemId,
        systemName: phdSystemEntity.name,
        systemCode: phdSystemEntity.code,
        systemType: phdSystemEntity.type,
        displayOrder: phdSystemGroupMember.displayOrder,
        createdAt: phdSystemGroupMember.createdAt,
        updatedAt: phdSystemGroupMember.updatedAt,
      })
      .from(phdSystemGroupMember)
      .innerJoin(phdSystemEntity, eq(phdSystemGroupMember.systemId, phdSystemEntity.id))
      .where(
        and(
          eq(phdSystemGroupMember.id, memberId),
          eq(phdSystemGroupMember.systemGroupId, groupId)
        )
      )
      .limit(1);

    if (!updated) {
      throw new HttpError(404, "System group member not found");
    }

    return updated;
  }

  async deleteMemberById(groupId: string, memberId: string): Promise<void> {
    const [group] = await this.db
      .select({ id: phdSystemGroup.id })
      .from(phdSystemGroup)
      .where(eq(phdSystemGroup.id, groupId))
      .limit(1);

    if (!group) {
      throw new HttpError(404, "System group not found");
    }

    const [member] = await this.db
      .select({ id: phdSystemGroupMember.id, systemGroupId: phdSystemGroupMember.systemGroupId })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.id, memberId))
      .limit(1);

    if (!member || member.systemGroupId !== groupId) {
      throw new HttpError(404, "System group member not found");
    }

    await this.db
      .delete(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.id, memberId));
  }

  async deleteById(groupId: string): Promise<void> {
    const [group] = await this.db
      .select({ id: phdSystemGroup.id })
      .from(phdSystemGroup)
      .where(eq(phdSystemGroup.id, groupId))
      .limit(1);

    if (!group) {
      throw new HttpError(404, "System group not found");
    }

    const [hasMembers] = await this.db
      .select({ id: phdSystemGroupMember.id })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.systemGroupId, groupId))
      .limit(1);

    if (hasMembers) {
      throw new HttpError(409, "System group has members");
    }

    await this.db
      .delete(phdSystemGroup)
      .where(eq(phdSystemGroup.id, groupId));
  }
}
