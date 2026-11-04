import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Transaction;

declare global {
   
  var __taskpartyPool: Pool | undefined;
   
  var __taskpartyDb: Database | undefined;
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  return new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
}

/** Lazily created, process-wide database handle. Server code only. */
export function getDb(): Database {
  if (!globalThis.__taskpartyDb) {
    globalThis.__taskpartyPool = globalThis.__taskpartyPool ?? createPool();
    globalThis.__taskpartyDb = drizzle(globalThis.__taskpartyPool, { schema });
  }
  return globalThis.__taskpartyDb;
}

export { schema };
