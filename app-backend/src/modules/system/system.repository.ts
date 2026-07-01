import { eq } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import { systemEntity } from "../../core/db/drizzle/schema/system-entity.schema";

type CreateSystemInput = typeof systemEntity.$inferInsert;

export class SystemRepository {
  constructor(private db: DrizzleDB) {}

  findAll() {
    return this.db.select().from(systemEntity);
  }

  findById(id: string) {
    return this.db.select().from(systemEntity).where(eq(systemEntity.id, id));
  }

  findByName(name: string) {
    return this.db.select().from(systemEntity).where(eq(systemEntity.name, name));
  }

  create(data: CreateSystemInput) {
    return this.db.insert(systemEntity).values(data).returning();
  }
}
