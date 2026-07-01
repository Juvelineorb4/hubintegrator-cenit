import { eq, and, inArray } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import { tag } from "../../core/db/drizzle/schema/tag.schema";
import { systemEntity } from "../../core/db/drizzle/schema/system-entity.schema";
import { subSystem } from "../../core/db/drizzle/schema/sub-system.schema";

type CreateTagInput = typeof tag.$inferInsert;

const PRESSURE_CATEGORIES = ["PRESSURE_IN", "PRESSURE_OUT", "PRESSURE_IN_MAX", "PRESSURE_OUT_MAX"] as const;
const FLOW_CATEGORIES = ["FLOW_IN", "FLOW_OUT", "SELECTOR_S_E"] as const;
const VOLUME_CATEGORIES = ["VOLUME"] as const;

export class TagRepository {
  constructor(private db: DrizzleDB) { }

  findAll() {
    return this.db.select().from(tag);
  }

  findById(id: string) {
    return this.db.select().from(tag).where(eq(tag.id, id));
  }

  findPressureBySystemCode(systemCode: string) {
    return this.db
      .select({
        tagname: tag.tagname,
        category: tag.category,
        systemName: systemEntity.name,
        systemCode: systemEntity.code,
        subSystemName: subSystem.name,
        subSystemCode: subSystem.code,
      })
      .from(tag)
      .innerJoin(systemEntity, eq(tag.systemId, systemEntity.id))
      .leftJoin(subSystem, eq(tag.subSystemId, subSystem.id))
      .where(
        and(
          eq(systemEntity.code, systemCode),
          inArray(tag.category, [...PRESSURE_CATEGORIES])
        )
      );
  }

  findFlowBySystemCode(systemCode: string) {
    return this.db
      .select({
        tagname: tag.tagname,
        category: tag.category,
        systemName: systemEntity.name,
        systemCode: systemEntity.code,
        subSystemName: subSystem.name,
        subSystemCode: subSystem.code,
      })
      .from(tag)
      .innerJoin(systemEntity, eq(tag.systemId, systemEntity.id))
      .leftJoin(subSystem, eq(tag.subSystemId, subSystem.id))
      .where(
        and(
          eq(systemEntity.code, systemCode),
          inArray(tag.category, [...FLOW_CATEGORIES])
        )
      );
  }

  findVolumeBySystemCode(systemCode: string) {
    return this.db
      .select({
        tagname: tag.tagname,
        category: tag.category,
        systemName: systemEntity.name,
        systemCode: systemEntity.code,
        subSystemName: subSystem.name,
        subSystemCode: subSystem.code,
      })
      .from(tag)
      .innerJoin(systemEntity, eq(tag.systemId, systemEntity.id))
      .leftJoin(subSystem, eq(tag.subSystemId, subSystem.id))
      .where(
        and(
          eq(systemEntity.code, systemCode),
          inArray(tag.category, [...VOLUME_CATEGORIES])
        )
      );
  }

  create(data: CreateTagInput) {
    return this.db.insert(tag).values(data).returning();
  }
}