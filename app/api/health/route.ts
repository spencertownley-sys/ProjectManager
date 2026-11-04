import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error" | "skipped"> = { database: "skipped" };
  try {
    if (process.env.DATABASE_URL) {
      await getDb().execute(sql`select 1`);
      checks.database = "ok";
    }
  } catch {
    checks.database = "error";
  }
  const healthy = Object.values(checks).every((v) => v !== "error");
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks, version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { status: healthy ? 200 : 503 });
}
