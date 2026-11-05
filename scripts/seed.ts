/*
  Reference dataset for performance testing (docs/06 section 8): 3 workspaces, 50 users, 20 projects, 10,000 tasks in
  the largest with 2,000 dependencies, 30 custom fields, and 100,000 events.

    pnpm seed            writes the dataset (refuses if it already exists)
    pnpm seed --reset    removes a previous run first
    pnpm seed --scale 0.1   a tenth of every count, for a quick local database

  Never run this against production: it exits when NODE_ENV or VERCEL_ENV is production.
*/
import { getDb } from "@/lib/db/client";
import { seedReference, resetReference, referenceExists } from "@/lib/dev/seed";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    console.error("Refusing to seed a production database.");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const scaleIndex = args.indexOf("--scale");
  const scale = scaleIndex >= 0 ? Number(args[scaleIndex + 1]) : 1;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
    console.error("--scale must be a number between 0 and 1.");
    process.exit(1);
  }
  const db = getDb();
  if (await referenceExists(db)) {
    if (!reset) {
      console.error("The reference dataset already exists. Run with --reset to replace it.");
      process.exit(1);
    }
    console.log("Removing the previous dataset");
    await resetReference(db);
  }
  const started = Date.now();
  const summary = await seedReference(db, { scale, log: (m) => console.log(`  ${m}`) });
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s`, summary);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
