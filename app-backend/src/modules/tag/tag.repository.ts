import { eq, and, or } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import { derivePublicTagCategory, parsePublicTagCategory } from "../../shared/phd/tag-category";
import { phdSubsystem, phdSystemEntity, phdSystemSubsystem, phdTag } from "../../core/db/drizzle/schema/phd.schema";
import { HttpError } from "../../shared/errors/http-error";
import { mapPgErrorToHttp } from "../../shared/errors/pg-error";

const VALID_PHD_DATA_TYPES = new Set(["DOUBLE", "STRING", "BOOLEAN", "BINARY", "INTEGER", "FLOAT"]);

export type CreateTagPublicInput = {
  tagname: string;
  description?: string | null;
  category: string;
  phdTagno?: string | null;
  phdUnit?: string | null;
  phdDataTypeName?: string | null;
  phdAssetName?: string | null;
  phdDescription?: string | null;
  systemId: string;
  subSystemId: string;
};

export type UpdateTagPublicInput = Partial<CreateTagPublicInput> & {
  id?: never;
};

type TagReadRow = {
  id: string;
  tagname: string;
  description: string | null;
  measurementType: "FLOW" | "PRESSURE" | "LEVEL" | "VOLUME" | "SELECTOR";
  role: "NONE" | "IN" | "OUT" | "S_E";
  qualifier: "NORMAL" | "MAX";
  phdTagno: string | null;
  phdUnit: string | null;
  phdDataTypeName: "DOUBLE" | "STRING" | "BOOLEAN" | "BINARY" | "INTEGER" | "FLOAT" | null;
  phdAssetName: string | null;
  phdDescription: string | null;
  systemId: string;
  systemName: string;
  systemCode: string;
  subSystemId: string;
  subSystemName: string;
  subSystemCode: string;
};

type TagResponseRow = Omit<TagReadRow, "measurementType" | "role" | "qualifier"> & {
  category: string;
};

const TAG_READ_SELECT = {
  id: phdTag.id,
  tagname: phdTag.tagname,
  description: phdTag.description,
  measurementType: phdTag.measurementType,
  role: phdTag.role,
  qualifier: phdTag.qualifier,
  phdTagno: phdTag.phdTagNo,
  phdUnit: phdTag.phdUnit,
  phdDataTypeName: phdTag.phdDataType,
  phdAssetName: phdTag.phdAssetName,
  phdDescription: phdTag.phdDescription,
  systemId: phdSystemEntity.id,
  systemName: phdSystemEntity.name,
  systemCode: phdSystemEntity.code,
  subSystemId: phdSubsystem.id,
  subSystemName: phdSubsystem.name,
  subSystemCode: phdSubsystem.code,
} as const;

export class TagRepository {
  constructor(private db: DrizzleDB) { }

  private validateAllowedPatchKeys(data: Record<string, unknown>) {
    const allowed = new Set([
      "tagname",
      "description",
      "category",
      "phdTagno",
      "phdUnit",
      "phdDataTypeName",
      "phdAssetName",
      "phdDescription",
      "systemId",
      "subSystemId",
    ]);

    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) {
        throw new HttpError(400, "Invalid tag payload");
      }
    }
  }

  private toPublicTagRow(row: TagReadRow): TagResponseRow {
    return {
      id: row.id,
      tagname: row.tagname,
      description: row.description,
      category: derivePublicTagCategory(row.measurementType, row.role, row.qualifier),
      phdTagno: row.phdTagno,
      phdUnit: row.phdUnit,
      phdDataTypeName: row.phdDataTypeName,
      phdAssetName: row.phdAssetName,
      phdDescription: row.phdDescription,
      systemId: row.systemId,
      systemName: row.systemName,
      systemCode: row.systemCode,
      subSystemId: row.subSystemId,
      subSystemName: row.subSystemName,
      subSystemCode: row.subSystemCode,
    };
  }

  private baseReadQuery() {
    return this.db
      .select(TAG_READ_SELECT)
      .from(phdTag)
      .innerJoin(phdSystemSubsystem, eq(phdTag.systemSubsystemId, phdSystemSubsystem.id))
      .innerJoin(phdSystemEntity, eq(phdSystemSubsystem.systemId, phdSystemEntity.id))
      .innerJoin(phdSubsystem, eq(phdSystemSubsystem.subsystemId, phdSubsystem.id));
  }

  async findAll() {
    const rows = await this.baseReadQuery();
    return rows.map((row) => this.toPublicTagRow(row));
  }

  async findById(id: string) {
    const rows = await this.baseReadQuery().where(eq(phdTag.id, id));
    return rows.map((row) => this.toPublicTagRow(row));
  }

  async findPressureBySystemCode(systemCode: string) {
    const rows = await this.baseReadQuery().where(
      and(
        eq(phdSystemEntity.code, systemCode),
        eq(phdTag.measurementType, "PRESSURE"),
        or(
          and(eq(phdTag.role, "IN"), eq(phdTag.qualifier, "NORMAL")),
          and(eq(phdTag.role, "OUT"), eq(phdTag.qualifier, "NORMAL")),
          and(eq(phdTag.role, "IN"), eq(phdTag.qualifier, "MAX")),
          and(eq(phdTag.role, "OUT"), eq(phdTag.qualifier, "MAX"))
        )
      )
    );

    return rows.map((row) => this.toPublicTagRow(row));
  }

  async findFlowBySystemCode(systemCode: string) {
    const rows = await this.baseReadQuery().where(
      and(
        eq(phdSystemEntity.code, systemCode),
        or(
          and(eq(phdTag.measurementType, "FLOW"), eq(phdTag.role, "IN"), eq(phdTag.qualifier, "NORMAL")),
          and(eq(phdTag.measurementType, "FLOW"), eq(phdTag.role, "OUT"), eq(phdTag.qualifier, "NORMAL")),
          and(eq(phdTag.measurementType, "SELECTOR"), eq(phdTag.role, "S_E"), eq(phdTag.qualifier, "NORMAL"))
        )
      )
    );

    return rows.map((row) => this.toPublicTagRow(row));
  }

  async findSelectorBySystemCode(systemCode: string) {
    const rows = await this.baseReadQuery().where(
      and(
        eq(phdSystemEntity.code, systemCode),
        eq(phdTag.measurementType, "SELECTOR"),
        eq(phdTag.role, "S_E"),
        eq(phdTag.qualifier, "NORMAL")
      )
    );

    return rows.map((row) => this.toPublicTagRow(row));
  }

  async findVolumeBySystemCode(systemCode: string) {
    const rows = await this.baseReadQuery().where(
      and(
        eq(phdSystemEntity.code, systemCode),
        eq(phdTag.measurementType, "VOLUME"),
        eq(phdTag.role, "NONE"),
        eq(phdTag.qualifier, "NORMAL")
      )
    );

    return rows.map((row) => this.toPublicTagRow(row));
  }

  async create(data: CreateTagPublicInput) {
    if (!data?.tagname || !data?.category || !data?.systemId || !data?.subSystemId) {
      throw new HttpError(400, "Invalid tag payload");
    }

    const parsedCategory = (() => {
      try {
        return parsePublicTagCategory(data.category);
      } catch {
        throw new HttpError(400, "Invalid tag category");
      }
    })();

    const phdDataType = data.phdDataTypeName?.trim() ? data.phdDataTypeName.trim().toUpperCase() : null;
    if (phdDataType && !VALID_PHD_DATA_TYPES.has(phdDataType)) {
      throw new HttpError(400, "Invalid phdDataTypeName");
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

    const [relation] = await this.db
      .select({ id: phdSystemSubsystem.id })
      .from(phdSystemSubsystem)
      .where(
        and(
          eq(phdSystemSubsystem.systemId, data.systemId),
          eq(phdSystemSubsystem.subsystemId, data.subSystemId)
        )
      )
      .limit(1);

    if (!relation) {
      throw new HttpError(404, "System/sub-system relation not found");
    }

    try {
      const [inserted] = await this.db
        .insert(phdTag)
        .values({
          tagname: data.tagname,
          description: data.description ?? null,
          measurementType: parsedCategory.measurementType,
          role: parsedCategory.role,
          qualifier: parsedCategory.qualifier,
          phdTagNo: data.phdTagno?.trim() ? data.phdTagno.trim() : null,
          phdUnit: data.phdUnit ?? null,
          phdDataType: phdDataType as "DOUBLE" | "STRING" | "BOOLEAN" | "BINARY" | "INTEGER" | "FLOAT" | null,
          phdAssetName: data.phdAssetName ?? null,
          phdDescription: data.phdDescription ?? null,
          systemSubsystemId: relation.id,
        })
        .returning({ id: phdTag.id });

      const rows = await this.baseReadQuery().where(eq(phdTag.id, inserted.id));
      return rows.map((row) => this.toPublicTagRow(row));
    } catch (error) {
      throw mapPgErrorToHttp(error, "Tag already exists");
    }
  }

  async updateById(id: string, data: UpdateTagPublicInput) {
    if (!id || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new HttpError(400, "Invalid tag payload");
    }

    if (Object.prototype.hasOwnProperty.call(data, "id")) {
      throw new HttpError(400, "Invalid tag payload");
    }

    this.validateAllowedPatchKeys(data as Record<string, unknown>);

    const [existing] = await this.db
      .select({ id: phdTag.id })
      .from(phdTag)
      .where(eq(phdTag.id, id))
      .limit(1);

    if (!existing) {
      throw new HttpError(404, "Tag not found");
    }

    const hasSystem = Object.prototype.hasOwnProperty.call(data, "systemId");
    const hasSubSystem = Object.prototype.hasOwnProperty.call(data, "subSystemId");

    if (hasSystem !== hasSubSystem) {
      throw new HttpError(400, "systemId and subSystemId must be provided together");
    }

    const patchData: Partial<typeof phdTag.$inferInsert> = {};

    if (Object.prototype.hasOwnProperty.call(data, "tagname")) {
      if (!data.tagname) {
        throw new HttpError(400, "Invalid tag payload");
      }
      patchData.tagname = data.tagname;
    }

    if (Object.prototype.hasOwnProperty.call(data, "description")) {
      patchData.description = data.description ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(data, "phdTagno")) {
      patchData.phdTagNo = data.phdTagno?.trim() ? data.phdTagno.trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(data, "phdUnit")) {
      patchData.phdUnit = data.phdUnit ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(data, "phdAssetName")) {
      patchData.phdAssetName = data.phdAssetName ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(data, "phdDescription")) {
      patchData.phdDescription = data.phdDescription ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(data, "category")) {
      if (!data.category) {
        throw new HttpError(400, "Invalid tag payload");
      }

      const parsedCategory = (() => {
        try {
          return parsePublicTagCategory(data.category as string);
        } catch {
          throw new HttpError(400, "Invalid tag category");
        }
      })();

      patchData.measurementType = parsedCategory.measurementType;
      patchData.role = parsedCategory.role;
      patchData.qualifier = parsedCategory.qualifier;
    }

    if (Object.prototype.hasOwnProperty.call(data, "phdDataTypeName")) {
      const phdDataType = data.phdDataTypeName?.trim() ? data.phdDataTypeName.trim().toUpperCase() : null;
      if (phdDataType && !VALID_PHD_DATA_TYPES.has(phdDataType)) {
        throw new HttpError(400, "Invalid phdDataTypeName");
      }
      patchData.phdDataType = phdDataType as "DOUBLE" | "STRING" | "BOOLEAN" | "BINARY" | "INTEGER" | "FLOAT" | null;
    }

    if (hasSystem && hasSubSystem) {
      if (!data.systemId || !data.subSystemId) {
        throw new HttpError(400, "Invalid tag payload");
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

      const [relation] = await this.db
        .select({ id: phdSystemSubsystem.id })
        .from(phdSystemSubsystem)
        .where(
          and(
            eq(phdSystemSubsystem.systemId, data.systemId),
            eq(phdSystemSubsystem.subsystemId, data.subSystemId)
          )
        )
        .limit(1);

      if (!relation) {
        throw new HttpError(404, "Sub-system relation not found");
      }

      patchData.systemSubsystemId = relation.id;
    }

    if (!Object.keys(patchData).length) {
      throw new HttpError(400, "Invalid tag payload");
    }

    patchData.updatedAt = new Date();

    try {
      const [updatedRef] = await this.db
        .update(phdTag)
        .set(patchData)
        .where(eq(phdTag.id, id))
        .returning({ id: phdTag.id });

      if (!updatedRef) {
        return [];
      }

      const [updated] = await this.baseReadQuery().where(eq(phdTag.id, updatedRef.id));

      return updated ? [this.toPublicTagRow(updated)] : [];
    } catch (error) {
      throw mapPgErrorToHttp(error, "Tag already exists");
    }
  }

  async deleteById(id: string) {
    const [existing] = await this.db
      .select({ id: phdTag.id })
      .from(phdTag)
      .where(eq(phdTag.id, id))
      .limit(1);

    if (!existing) {
      throw new HttpError(404, "Tag not found");
    }

    await this.db.delete(phdTag).where(eq(phdTag.id, id));
  }
}
