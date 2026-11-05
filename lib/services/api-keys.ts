import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { schema, type Database } from "@/lib/db/client";
import { assertCan, type Actor } from "@/lib/auth/permissions";
import { type ServiceContext, NotFoundError } from "./context";

/*
  API keys (docs/08 section 5.2): `tp_live_` plus 32 random characters, shown once, stored as a SHA-256 hash with the
  first 12 characters kept for display. A key acts as a synthetic workspace admin limited by its scopes.
*/

export type ApiScope = "read" | "write" | "admin";
export type ApiKeyRecord = { id: string; name: string; keyPrefix: string; scopes: ApiScope[]; createdBy: string; createdByName: string | null; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string };

const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateApiKey(): string {
  const bytes = randomBytes(32);
  let body = "";
  for (const b of bytes) body += alphabet[b % alphabet.length];
  return `tp_live_${body}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function toRecord(r: typeof schema.apiKeys.$inferSelect, createdByName: string | null = null): ApiKeyRecord {
  return { id: r.id, name: r.name, keyPrefix: r.keyPrefix, scopes: r.scopes as ApiScope[], createdBy: r.createdBy, createdByName, lastUsedAt: r.lastUsedAt?.toISOString() ?? null, expiresAt: r.expiresAt?.toISOString() ?? null, revokedAt: r.revokedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() };
}

export async function listApiKeys(ctx: ServiceContext): Promise<ApiKeyRecord[]> {
  const { db, actor } = ctx;
  assertCan(actor, "workspace.manage_integrations");
  const rows = await db
    .select({ key: schema.apiKeys, createdByName: schema.users.displayName })
    .from(schema.apiKeys)
    .leftJoin(schema.users, eq(schema.users.id, schema.apiKeys.createdBy))
    .where(eq(schema.apiKeys.workspaceId, actor.workspaceId))
    .orderBy(desc(schema.apiKeys.createdAt));
  return rows.map((r) => toRecord(r.key, r.createdByName));
}

/** Creates a key and returns the plain text once. Logged for the audit trail (docs/08 section 6). */
export async function createApiKey(ctx: ServiceContext, input: { name: string; scopes: ApiScope[]; expiresAt?: string | null }): Promise<{ key: string; record: ApiKeyRecord }> {
  const { db, actor } = ctx;
  assertCan(actor, "workspace.manage_integrations");
  const key = generateApiKey();
  const [row] = await db
    .insert(schema.apiKeys)
    .values({ workspaceId: actor.workspaceId, name: input.name, keyPrefix: key.slice(0, 12), keyHash: hashApiKey(key), scopes: input.scopes, createdBy: actor.userId, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null })
    .returning();
  console.info("[audit] api_key.created", { workspaceId: actor.workspaceId, actorId: actor.userId, keyId: row.id, scopes: input.scopes });
  return { key, record: toRecord(row) };
}

export async function revokeApiKey(ctx: ServiceContext, id: string): Promise<ApiKeyRecord> {
  const { db, actor } = ctx;
  assertCan(actor, "workspace.manage_integrations");
  const [row] = await db
    .update(schema.apiKeys)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.workspaceId, actor.workspaceId), isNull(schema.apiKeys.revokedAt)))
    .returning();
  if (!row) throw new NotFoundError("API key");
  console.info("[audit] api_key.revoked", { workspaceId: actor.workspaceId, actorId: actor.userId, keyId: row.id });
  return toRecord(row);
}

export type ResolvedApiKey = { actor: Actor; keyId: string; workspace: typeof schema.workspaces.$inferSelect };

/** Turns a bearer key into an actor, or null when the key is unknown, revoked, or expired. Updates last use at most every 5 minutes. */
export async function resolveApiKey(db: Database, rawKey: string): Promise<ResolvedApiKey | null> {
  if (!/^tp_live_[A-Za-z0-9]{32}$/.test(rawKey)) return null;
  const [row] = await db
    .select({ key: schema.apiKeys, workspace: schema.workspaces })
    .from(schema.apiKeys)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.apiKeys.workspaceId))
    .where(and(eq(schema.apiKeys.keyHash, hashApiKey(rawKey)), isNull(schema.apiKeys.revokedAt), or(isNull(schema.apiKeys.expiresAt), gt(schema.apiKeys.expiresAt, sql`now()`)), isNull(schema.workspaces.deletedAt)));
  if (!row) return null;
  const stale = !row.key.lastUsedAt || Date.now() - row.key.lastUsedAt.getTime() > 5 * 60_000;
  if (stale) await db.update(schema.apiKeys).set({ lastUsedAt: sql`now()` }).where(eq(schema.apiKeys.id, row.key.id));
  return { keyId: row.key.id, workspace: row.workspace, actor: { userId: row.key.createdBy, workspaceId: row.key.workspaceId, workspaceRole: "admin", scopes: row.key.scopes as ApiScope[] } };
}
