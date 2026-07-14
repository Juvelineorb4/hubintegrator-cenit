import { and, eq, asc, sql } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import { phdSubsystem, phdSystemEntity, phdSystemSubsystem } from "../../core/db/drizzle/schema/phd.schema";
import { HttpError } from "../../shared/errors/http-error";
import { mapPgErrorToHttp } from "../../shared/errors/pg-error";

export type CreateSubSystemPublicInput = {
  name: string;
  code: string;
  description?: string | null;
  nomenclature: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export type CreateRelationPublicInput = {
  systemId: string;
  subSystemId: string;
  displayOrder?: number;
};

export type UpdateSubSystemPublicInput = Partial<CreateSubSystemPublicInput> & {
  id?: never;
};

export type UpdateRelationPublicInput = {
  systemId?: string;
  subSystemId?: string;
  displayOrder?: number;
  id?: never;
};

export class SubSystemRepository {
  constructor(private db: DrizzleDB) {}

  private validateAllowedSubsystemPatchKeys(data: Record<string, unknown>) {
    const allowed = new Set(["name", "code", "description", "nomenclature", "latitude", "longitude"]);
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) {
        throw new HttpError(400, "Invalid subsystem payload");
      }
    }
  }

  private validateAllowedRelationPatchKeys(data: Record<string, unknown>) {
    const allowed = new Set(["systemId", "subSystemId", "displayOrder"]);
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) {
        throw new HttpError(400, "Invalid subsystem relation payload");
      }
    }
  }

  private normalizeNumeric(value: number | string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new HttpError(400, "Invalid subsystem payload");
      }
      return value.toString();
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (!Number.isFinite(Number(trimmed))) {
      throw new HttpError(400, "Invalid subsystem payload");
    }

    return trimmed;
  }

  findAll() {
    return this.db
      .select({
        id: phdSubsystem.id,
        name: phdSubsystem.name,
        code: phdSubsystem.code,
        description: phdSubsystem.description,
        latitude: phdSubsystem.latitude,
        longitude: phdSubsystem.longitude,
        createdAt: phdSubsystem.createdAt,
        updatedAt: phdSubsystem.updatedAt,
        systemId: phdSystemEntity.id,
        systemCode: phdSystemEntity.code,
        systemName: phdSystemEntity.name,
        subSystemId: phdSubsystem.id,
        subSystemCode: phdSubsystem.code,
        subSystemName: phdSubsystem.name,
        nomenclature: phdSubsystem.nomenclature,
        displayOrder: phdSystemSubsystem.displayOrder,
      })
      .from(phdSystemSubsystem)
      .innerJoin(phdSystemEntity, eq(phdSystemSubsystem.systemId, phdSystemEntity.id))
      .innerJoin(phdSubsystem, eq(phdSystemSubsystem.subsystemId, phdSubsystem.id))
      .orderBy(asc(phdSystemEntity.code), asc(phdSystemSubsystem.displayOrder));
  }

  findById(id: string) {
    return this.db.select().from(phdSubsystem).where(eq(phdSubsystem.id, id));
  }

  findByNomenclature(nomenclature: string) {
    return this.db.select().from(phdSubsystem).where(eq(phdSubsystem.nomenclature, nomenclature));
  }

  async create(data: CreateSubSystemPublicInput) {
    if (!data?.name || !data?.code || !data?.nomenclature) {
      throw new HttpError(400, "Invalid subsystem payload");
    }

    try {
      const insertValue: typeof phdSubsystem.$inferInsert = {
        name: data.name,
        code: data.code,
        description: data.description ?? null,
        nomenclature: data.nomenclature,
        latitude: this.normalizeNumeric(data.latitude),
        longitude: this.normalizeNumeric(data.longitude),
      };

      return await this.db
        .insert(phdSubsystem)
        .values(insertValue)
        .returning();
    } catch (error) {
      throw mapPgErrorToHttp(error, "Sub-system already exists");
    }
  }

  async createRelation(data: CreateRelationPublicInput) {
    if (!data?.systemId || !data?.subSystemId) {
      throw new HttpError(400, "Invalid subsystem relation payload");
    }

    const [system] = await this.db
      .select({ id: phdSystemEntity.id })
      .from(phdSystemEntity)
      .where(eq(phdSystemEntity.id, data.systemId))
      .limit(1);

    if (!system) {
      throw new HttpError(404, "System not found");
    }

    const [subSystem] = await this.db
      .select({ id: phdSubsystem.id })
      .from(phdSubsystem)
      .where(eq(phdSubsystem.id, data.subSystemId))
      .limit(1);

    if (!subSystem) {
      throw new HttpError(404, "Sub-system not found");
    }

    const [existing] = await this.db
      .select({ id: phdSystemSubsystem.id })
      .from(phdSystemSubsystem)
      .where(
        sql`${phdSystemSubsystem.systemId} = ${data.systemId} and ${phdSystemSubsystem.subsystemId} = ${data.subSystemId}`
      )
      .limit(1);

    if (existing) {
      throw new HttpError(409, "System/sub-system relation already exists");
    }

    const [maxDisplay] = await this.db
      .select({ maxDisplayOrder: sql<number>`coalesce(max(${phdSystemSubsystem.displayOrder}), 0)` })
      .from(phdSystemSubsystem)
      .where(eq(phdSystemSubsystem.systemId, data.systemId));

    const displayOrder = data.displayOrder ?? Number(maxDisplay?.maxDisplayOrder ?? 0) + 1;

    try {
      const [created] = await this.db
        .insert(phdSystemSubsystem)
        .values({
          systemId: data.systemId,
          subsystemId: data.subSystemId,
          displayOrder,
        })
        .returning({
          systemId: phdSystemSubsystem.systemId,
          subSystemId: phdSystemSubsystem.subsystemId,
          displayOrder: phdSystemSubsystem.displayOrder,
        });

      return [created];
    } catch (error) {
      throw mapPgErrorToHttp(error, "System/sub-system relation already exists");
    }
  }

  async updateById(id: string, data: UpdateSubSystemPublicInput) {
    if (!id || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new HttpError(400, "Invalid subsystem payload");
    }

    if (Object.prototype.hasOwnProperty.call(data, "id")) {
      throw new HttpError(400, "Invalid subsystem payload");
    }

    this.validateAllowedSubsystemPatchKeys(data as Record<string, unknown>);

    const [existing] = await this.db
      .select({ id: phdSubsystem.id })
      .from(phdSubsystem)
      .where(eq(phdSubsystem.id, id))
      .limit(1);

    if (!existing) {
      throw new HttpError(404, "Sub-system not found");
    }

    const patchData: Partial<typeof phdSubsystem.$inferInsert> = {};

    if (Object.prototype.hasOwnProperty.call(data, "name")) {
      if (!data.name) {
        throw new HttpError(400, "Invalid subsystem payload");
      }
      patchData.name = data.name;
    }

    if (Object.prototype.hasOwnProperty.call(data, "code")) {
      if (!data.code) {
        throw new HttpError(400, "Invalid subsystem payload");
      }
      patchData.code = data.code;
    }

    if (Object.prototype.hasOwnProperty.call(data, "description")) {
      patchData.description = data.description ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(data, "nomenclature")) {
      if (!data.nomenclature) {
        throw new HttpError(400, "Invalid subsystem payload");
      }
      patchData.nomenclature = data.nomenclature;
    }

    if (Object.prototype.hasOwnProperty.call(data, "latitude")) {
      patchData.latitude = this.normalizeNumeric(data.latitude);
    }

    if (Object.prototype.hasOwnProperty.call(data, "longitude")) {
      patchData.longitude = this.normalizeNumeric(data.longitude);
    }

    if (!Object.keys(patchData).length) {
      throw new HttpError(400, "Invalid subsystem payload");
    }

    patchData.updatedAt = new Date();

    try {
      return await this.db
        .update(phdSubsystem)
        .set(patchData)
        .where(eq(phdSubsystem.id, id))
        .returning();
    } catch (error) {
      throw mapPgErrorToHttp(error, "Sub-system already exists");
    }
  }

  async updateRelationById(id: string, data: UpdateRelationPublicInput) {
    if (!id || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new HttpError(400, "Invalid subsystem relation payload");
    }

    if (Object.prototype.hasOwnProperty.call(data, "id")) {
      throw new HttpError(400, "Invalid subsystem relation payload");
    }

    this.validateAllowedRelationPatchKeys(data as Record<string, unknown>);

    const [existing] = await this.db
      .select({
        id: phdSystemSubsystem.id,
        systemId: phdSystemSubsystem.systemId,
        subSystemId: phdSystemSubsystem.subsystemId,
        displayOrder: phdSystemSubsystem.displayOrder,
      })
      .from(phdSystemSubsystem)
      .where(eq(phdSystemSubsystem.id, id))
      .limit(1);

    if (!existing) {
      throw new HttpError(404, "System/sub-system relation not found");
    }

    const hasSystemId = Object.prototype.hasOwnProperty.call(data, "systemId");
    const hasSubSystemId = Object.prototype.hasOwnProperty.call(data, "subSystemId");
    const hasDisplayOrder = Object.prototype.hasOwnProperty.call(data, "displayOrder");

    if (!hasSystemId && !hasSubSystemId && !hasDisplayOrder) {
      throw new HttpError(400, "Invalid subsystem relation payload");
    }

    if (hasSystemId !== hasSubSystemId) {
      throw new HttpError(400, "systemId and subSystemId must be provided together");
    }

    let nextSystemId = existing.systemId;
    let nextSubSystemId = existing.subSystemId;

    if (hasSystemId && hasSubSystemId) {
      if (!data.systemId || !data.subSystemId) {
        throw new HttpError(400, "Invalid subsystem relation payload");
      }

      const [system] = await this.db
        .select({ id: phdSystemEntity.id })
        .from(phdSystemEntity)
        .where(eq(phdSystemEntity.id, data.systemId))
        .limit(1);

      if (!system) {
        throw new HttpError(404, "System not found");
      }

      const [subSystem] = await this.db
        .select({ id: phdSubsystem.id })
        .from(phdSubsystem)
        .where(eq(phdSubsystem.id, data.subSystemId))
        .limit(1);

      if (!subSystem) {
        throw new HttpError(404, "Sub-system not found");
      }

      nextSystemId = data.systemId;
      nextSubSystemId = data.subSystemId;

      const [duplicate] = await this.db
        .select({ id: phdSystemSubsystem.id })
        .from(phdSystemSubsystem)
        .where(
          and(
            eq(phdSystemSubsystem.systemId, nextSystemId),
            eq(phdSystemSubsystem.subsystemId, nextSubSystemId)
          )
        )
        .limit(1);

      if (duplicate && duplicate.id !== existing.id) {
        throw new HttpError(409, "System/sub-system relation already exists");
      }
    }

    const patchData: Partial<typeof phdSystemSubsystem.$inferInsert> = {};

    if (hasSystemId && hasSubSystemId) {
      patchData.systemId = nextSystemId;
      patchData.subsystemId = nextSubSystemId;
    }

    if (hasDisplayOrder) {
      if (typeof data.displayOrder !== "number" || !Number.isFinite(data.displayOrder)) {
        throw new HttpError(400, "Invalid subsystem relation payload");
      }
      patchData.displayOrder = Math.trunc(data.displayOrder);
    }

    patchData.updatedAt = new Date();

    try {
      const [updated] = await this.db
        .update(phdSystemSubsystem)
        .set(patchData)
        .where(eq(phdSystemSubsystem.id, id))
        .returning({
          id: phdSystemSubsystem.id,
          systemId: phdSystemSubsystem.systemId,
          subSystemId: phdSystemSubsystem.subsystemId,
          displayOrder: phdSystemSubsystem.displayOrder,
        });

      return [updated];
    } catch (error) {
      throw mapPgErrorToHttp(error, "System/sub-system relation already exists");
    }
  }
}
