/*
  The first real workspace (docs/06 section 8): "TaskParty" with the ten beta members as placeholder users and a
  starter project. Each member's Clerk account is linked to their row by email on first sign in, so set the real
  addresses first:

    SEED_BETA_EMAILS='{"spencer":"...","jenny":"..."}' pnpm seed:beta

  Optional: CLERK_BETA_ORG_ID links the workspace to an existing Clerk organization instead of a placeholder id.
  Safe to run again; nothing is duplicated.
*/
import { getDb } from "@/lib/db/client";
import { seedBeta, rosterWithEmails } from "@/lib/dev/seed";

async function main() {
  let overrides: Record<string, string> | null = null;
  if (process.env.SEED_BETA_EMAILS) {
    try {
      overrides = JSON.parse(process.env.SEED_BETA_EMAILS) as Record<string, string>;
    } catch {
      console.error("SEED_BETA_EMAILS must be a JSON object of first name to email.");
      process.exit(1);
    }
  } else {
    console.warn("SEED_BETA_EMAILS is not set; members get placeholder addresses and will not link to Clerk accounts.");
  }
  const summary = await seedBeta(getDb(), { roster: rosterWithEmails(overrides), clerkOrgId: process.env.CLERK_BETA_ORG_ID || undefined, log: (m) => console.log(`  ${m}`) });
  console.log(summary.created ? "Seeded the TaskParty workspace" : "The TaskParty workspace already existed; members were refreshed", summary);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
