import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);
export { pool };

/** Tipo del cliente Drizzle para inyección de dependencias en repositorios. */
export type DrizzleDB = typeof db;