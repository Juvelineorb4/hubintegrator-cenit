import { eq } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import { subSystem } from "../../core/db/drizzle/schema/sub-system.schema";
import { systemSubSystem } from "../../core/db/drizzle/schema/system-sub-system.schema";

type CreateSubSystemInput = typeof subSystem.$inferInsert;
type CreateRelationInput  = typeof systemSubSystem.$inferInsert;

export class SubSystemRepository {
  constructor(private db: DrizzleDB) {}

  findAll() {
    return this.db.select().from(subSystem);
  }

  findById(id: string) {
    return this.db.select().from(subSystem).where(eq(subSystem.id, id));
  }

  findByNomenclature(nomenclature: string) {
    return this.db.select().from(subSystem).where(eq(subSystem.nomenclature, nomenclature));
  }

  create(data: CreateSubSystemInput) {
    return this.db.insert(subSystem).values(data).returning();
  }

  createRelation(data: CreateRelationInput) {
    return this.db.insert(systemSubSystem).values(data).returning();
  }
}
