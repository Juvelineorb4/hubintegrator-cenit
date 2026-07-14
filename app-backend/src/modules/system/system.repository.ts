import { eq } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import { phdSystemEntity, phdSystemGroupMember, phdSystemSubsystem } from "../../core/db/drizzle/schema/phd.schema";
import { HttpError } from "../../shared/errors/http-error";
import { mapPgErrorToHttp } from "../../shared/errors/pg-error";

type PublicSystemType = "OLEODUCTO" | "POLIDUCTO" | "OIL_PIPELINE" | "PRODUCT_PIPELINE";

export type CreateSystemPublicInput = {
  name: string;
  code: string;
  description?: string | null;
  distance?: number | string | null;
  type?: PublicSystemType | null;
};

export type UpdateSystemPublicInput = Partial<CreateSystemPublicInput> & {
  id?: never;
};

const SYSTEM_TYPE_MAP: Record<Exclude<PublicSystemType, "OIL_PIPELINE" | "PRODUCT_PIPELINE">, "OIL_PIPELINE" | "PRODUCT_PIPELINE"> = {
  OLEODUCTO: "OIL_PIPELINE",
  POLIDUCTO: "PRODUCT_PIPELINE",
};

export class SystemRepository {
  constructor(private db: DrizzleDB) {}

  private normalizeNumeric(value: number | string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new HttpError(400, "Invalid system payload");
      }
      return value.toString();
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (!Number.isFinite(Number(trimmed))) {
      throw new HttpError(400, "Invalid system payload");
    }

    return trimmed;
  }

  private mapSystemType(type: PublicSystemType | null | undefined): "OIL_PIPELINE" | "PRODUCT_PIPELINE" | null {
    if (!type) {
      return null;
    }

    if (type === "OIL_PIPELINE" || type === "PRODUCT_PIPELINE") {
      return type;
    }

    return SYSTEM_TYPE_MAP[type] ?? null;
  }

  private validateAllowedPatchKeys(data: Record<string, unknown>) {
    const allowed = new Set(["name", "code", "description", "distance", "type"]);
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) {
        throw new HttpError(400, "Invalid system payload");
      }
    }
  }

  findAll() {
    return this.db.select().from(phdSystemEntity);
  }

  findById(id: string) {
    return this.db.select().from(phdSystemEntity).where(eq(phdSystemEntity.id, id));
  }

  findByName(name: string) {
    return this.db.select().from(phdSystemEntity).where(eq(phdSystemEntity.name, name));
  }

  async create(data: CreateSystemPublicInput) {
    if (!data?.name || !data?.code) {
      throw new HttpError(400, "Invalid system payload");
    }

    const mappedType = this.mapSystemType(data.type);
    if (data.type && !mappedType) {
      throw new HttpError(400, "Invalid system type");
    }

    try {
      const insertValue: typeof phdSystemEntity.$inferInsert = {
        name: data.name,
        code: data.code,
        description: data.description ?? null,
        distance: this.normalizeNumeric(data.distance),
        type: mappedType,
      };

      return await this.db
        .insert(phdSystemEntity)
        .values(insertValue)
        .returning();
    } catch (error) {
      throw mapPgErrorToHttp(error, "System already exists");
    }
  }

  async updateById(id: string, data: UpdateSystemPublicInput) {
    if (!id) {
      throw new HttpError(400, "Invalid system payload");
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new HttpError(400, "Invalid system payload");
    }

    if (Object.prototype.hasOwnProperty.call(data, "id")) {
      throw new HttpError(400, "Invalid system payload");
    }

    this.validateAllowedPatchKeys(data as Record<string, unknown>);

    const [existing] = await this.db
      .select({ id: phdSystemEntity.id })
      .from(phdSystemEntity)
      .where(eq(phdSystemEntity.id, id))
      .limit(1);

    if (!existing) {
      throw new HttpError(404, "System not found");
    }

    const patchData: Partial<typeof phdSystemEntity.$inferInsert> = {};

    if (Object.prototype.hasOwnProperty.call(data, "name")) {
      if (!data.name) {
        throw new HttpError(400, "Invalid system payload");
      }
      patchData.name = data.name;
    }

    if (Object.prototype.hasOwnProperty.call(data, "code")) {
      if (!data.code) {
        throw new HttpError(400, "Invalid system payload");
      }
      patchData.code = data.code;
    }

    if (Object.prototype.hasOwnProperty.call(data, "description")) {
      patchData.description = data.description ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(data, "distance")) {
      patchData.distance = this.normalizeNumeric(data.distance);
    }

    if (Object.prototype.hasOwnProperty.call(data, "type")) {
      const mappedType = this.mapSystemType(data.type);
      if (data.type && !mappedType) {
        throw new HttpError(400, "Invalid system type");
      }
      patchData.type = mappedType;
    }

    if (!Object.keys(patchData).length) {
      throw new HttpError(400, "Invalid system payload");
    }

    patchData.updatedAt = new Date();

    try {
      return await this.db
        .update(phdSystemEntity)
        .set(patchData)
        .where(eq(phdSystemEntity.id, id))
        .returning();
    } catch (error) {
      throw mapPgErrorToHttp(error, "System already exists");
    }
  }

  async deleteById(id: string) {
    const [existing] = await this.db
      .select({ id: phdSystemEntity.id })
      .from(phdSystemEntity)
      .where(eq(phdSystemEntity.id, id))
      .limit(1);

    if (!existing) {
      throw new HttpError(404, "System not found");
    }

    const [hasSubSystems] = await this.db
      .select({ id: phdSystemSubsystem.id })
      .from(phdSystemSubsystem)
      .where(eq(phdSystemSubsystem.systemId, id))
      .limit(1);

    if (hasSubSystems) {
      throw new HttpError(409, "System has related sub-systems");
    }

    const [hasGroupMembership] = await this.db
      .select({ id: phdSystemGroupMember.id })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.systemId, id))
      .limit(1);

    if (hasGroupMembership) {
      throw new HttpError(409, "System belongs to one or more groups");
    }

    await this.db.delete(phdSystemEntity).where(eq(phdSystemEntity.id, id));
  }
}
