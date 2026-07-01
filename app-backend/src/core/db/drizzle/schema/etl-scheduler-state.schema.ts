import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";

export const etlSchedulerState = pgTable("etl_scheduler_state", {
  id: integer("id").primaryKey(),

  lastBatchExecuted: integer("last_batch_executed").notNull().default(0),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
