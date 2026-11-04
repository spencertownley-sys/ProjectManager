/*
  In-memory Postgres for unit and integration tests, built on PGlite.
  Applies the SQL migrations from supabase/migrations with the parts PGlite cannot run
  (auth.jwt based RLS helpers, realtime publication, pg_trgm) stripped out.
*/
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db/client";

function prepareMigration(sql: string): string {
  return sql
    .replace(/create extension if not exists "pg_trgm";/g, "")
    .replace(/create index on tasks using gin \(title gin_trgm_ops\);/g, "")
    .replace(/create or replace function current_clerk_user_id\(\)[\s\S]*$/m, "");
}

export async function createTestDb(): Promise<{ db: Database; client: PGlite }> {
  const client = new PGlite();
  const dir = path.resolve(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = prepareMigration(readFileSync(path.join(dir, file), "utf8"));
    await client.exec(sql);
  }
  const db = drizzle(client, { schema }) as unknown as Database;
  return { db, client };
}
