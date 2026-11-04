import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getDb } from "@/lib/db/client";
import { upsertUser, upsertWorkspace, upsertMembership, removeMembership } from "@/lib/services/workspaces";
import { schema } from "@/lib/db/client";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type UserData = { id: string; email_addresses: Array<{ id: string; email_address: string }>; primary_email_address_id: string | null; first_name: string | null; last_name: string | null; username: string | null; image_url: string | null };
type OrgData = { id: string; slug: string | null; name: string; image_url: string | null };
type MembershipData = { organization: { id: string }; public_user_data: { user_id: string }; role: string };
type ClerkEvent = { type: string; data: Record<string, unknown> };

function displayNameFor(d: UserData): string {
  const name = [d.first_name, d.last_name].filter(Boolean).join(" ").trim();
  return name || d.username || d.email_addresses[0]?.email_address?.split("@")[0] || "Member";
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 500 });
  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };
  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(payload, headers) as unknown as ClerkEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getDb();
  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const d = event.data as unknown as UserData;
      const primary = d.email_addresses.find((e) => e.id === d.primary_email_address_id) ?? d.email_addresses[0];
      await upsertUser(db, { clerkUserId: d.id, email: primary?.email_address ?? "", displayName: displayNameFor(d), avatarUrl: d.image_url ?? null });
      break;
    }
    case "user.deleted": {
      const d = event.data as unknown as { id: string };
      await db.delete(schema.users).where(eq(schema.users.clerkUserId, d.id));
      break;
    }
    case "organization.created":
    case "organization.updated": {
      const d = event.data as unknown as OrgData;
      await upsertWorkspace(db, { clerkOrgId: d.id, slug: d.slug ?? d.id.replace("org_", "").toLowerCase(), name: d.name, logoUrl: d.image_url ?? null });
      break;
    }
    case "organization.deleted": {
      const d = event.data as unknown as { id: string };
      await db.update(schema.workspaces).set({ deletedAt: sql`now()` }).where(eq(schema.workspaces.clerkOrgId, d.id));
      break;
    }
    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const d = event.data as unknown as MembershipData;
      await upsertMembership(db, d.organization.id, d.public_user_data.user_id, d.role);
      break;
    }
    case "organizationMembership.deleted": {
      const d = event.data as unknown as MembershipData;
      await removeMembership(db, d.organization.id, d.public_user_data.user_id);
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
