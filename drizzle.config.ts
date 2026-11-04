import { defineConfig } from "drizzle-kit";

// Introspection only. Migrations are hand-written SQL in supabase/migrations.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/introspected",
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "" },
});
