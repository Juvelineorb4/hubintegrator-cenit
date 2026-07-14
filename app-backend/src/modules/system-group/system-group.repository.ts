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
} from "./system-group.types";

export class SystemGroupRepository {
  constructor(private db: DrizzleDB) {}

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
}
