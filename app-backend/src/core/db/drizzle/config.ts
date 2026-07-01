import "dotenv/config";

export const drizzleConfig = {
  databaseUrl: process.env.DATABASE_URL as string,
};