import { randomBytes } from "node:crypto";
import { getDb, type Database } from "@/lib/db/client";
import type { ServiceContext } from "@/lib/services/context";
import { resolveApiKey, type ResolvedApiKey } from "@/lib/services/api-keys";
import { ApiError, toApiError, errorResponse } from "./errors";
import { toSnake, toCamel, RateLimiter, IdempotencyStore } from "./shape";

/*
  Route handler wrapper for /api/v1 (docs/07 section 2): bearer API key auth, rate limit headers, Idempotency-Key
  replay on POST, snake_case bodies in and out, and the error contract. Handlers get a ServiceContext and never
  touch the database directly.
*/

export type ApiRequest = {
  req: Request;
  ctx: ServiceContext;
  key: ResolvedApiKey;
  params: Record<string, string>;
  query: URLSearchParams;
  /** Parsed JSON body with camelCase keys, or an empty object. */
  body: () => Promise<Record<string, unknown>>;
  today: string;
  requestId: string;
  /** Absolute URL of the app for `url` fields. */
  appUrl: string;
};

export type ApiHandler = (r: ApiRequest) => Promise<unknown>;
type RouteContext = { params: Promise<Record<string, string>> | Record<string, string> };

/** Swappable for tests so routes can run against PGlite. */
export const apiDeps: { getDb: () => Database; now: () => Date } = { getDb: () => getDb(), now: () => new Date() };

const limiter = new RateLimiter(600, 100);
const idempotency = new IdempotencyStore();
const MAX_BODY_BYTES = 1_000_000;

function requestId() {
  return `req_${randomBytes(9).toString("base64url")}`;
}

function todayIso(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function withApi(handler: ApiHandler, options: { status?: number; auth?: boolean } = {}) {
  return async (req: Request, context?: RouteContext): Promise<Response> => {
    const id = requestId();
    const baseHeaders: Record<string, string> = { "content-type": "application/json; charset=utf-8", "x-request-id": id };
    try {
      const db = apiDeps.getDb();
      const params = context ? await context.params : {};
      const url = new URL(req.url);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;
      let key: ResolvedApiKey | null = null;
      if (options.auth !== false) {
        const header = req.headers.get("authorization") ?? "";
        const match = /^Bearer\s+(\S+)$/i.exec(header);
        if (!match) throw new ApiError("unauthorized", "Send an API key as Authorization: Bearer tp_live_...");
        key = await resolveApiKey(db, match[1]);
        if (!key) throw new ApiError("unauthorized", "The API key is unknown, revoked, or expired.");
        const rate = limiter.take(key.keyId);
        baseHeaders["x-ratelimit-limit"] = "600";
        baseHeaders["x-ratelimit-remaining"] = String(rate.remaining);
        baseHeaders["x-ratelimit-reset"] = String(rate.resetSeconds);
        if (!rate.allowed) throw new ApiError("rate_limited", "Slow down: 600 requests per minute per key.", [], { "retry-after": String(Math.max(1, rate.resetSeconds)), ...baseHeaders });
      }
      const idem = req.method === "POST" && key ? req.headers.get("idempotency-key") : null;
      const idemKey = idem && key ? `${key.keyId}:${idem}` : null;
      if (idemKey) {
        const stored = idempotency.get(idemKey);
        if (stored) return new Response(stored.body, { status: stored.status, headers: { ...baseHeaders, "idempotent-replayed": "true" } });
      }
      let bodyCache: Record<string, unknown> | null = null;
      const body = async () => {
        if (bodyCache) return bodyCache;
        const length = Number(req.headers.get("content-length") ?? 0);
        if (length > MAX_BODY_BYTES) throw new ApiError("validation_failed", "The body is larger than 1 MB.");
        const text = await req.text();
        if (!text.trim()) return (bodyCache = {});
        try {
          const parsed = toCamel(JSON.parse(text));
          bodyCache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed };
          return bodyCache;
        } catch {
          throw new ApiError("validation_failed", "The body is not valid JSON.");
        }
      };
      const now = apiDeps.now();
      const ctx: ServiceContext | null = key ? { db, actor: key.actor } : null;
      const result = await handler({ req, ctx: ctx as ServiceContext, key: key as ResolvedApiKey, params, query: url.searchParams, body, today: todayIso(now), requestId: id, appUrl });
      if (result instanceof Response) return result;
      const status = options.status ?? (req.method === "POST" ? 201 : result === null || result === undefined ? 204 : 200);
      const text = status === 204 ? "" : JSON.stringify(toSnake(result));
      if (idemKey && status < 500) idempotency.set(idemKey, status, text);
      return new Response(text || null, { status, headers: baseHeaders });
    } catch (error) {
      const apiError = toApiError(error);
      const res = errorResponse(apiError, id);
      for (const [k, v] of Object.entries(baseHeaders)) if (k.startsWith("x-ratelimit")) res.headers.set(k, v);
      return res;
    }
  };
}

/** Reads a required uuid path or query value. */
export function requireId(value: string | null | undefined, name: string): string {
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) throw new ApiError("validation_failed", `${name} must be a uuid.`, [{ path: name, message: "must be a uuid" }]);
  return value;
}
