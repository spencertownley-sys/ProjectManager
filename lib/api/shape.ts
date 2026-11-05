/*
  Pure helpers for the public API: snake_case on the wire, camelCase inside (docs/07 section 2), cursor pagination,
  and the common list query shortcuts. No database access.
*/

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function isPlain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && Object.getPrototypeOf(v) === Object.prototype;
}

/** Deep key conversion. Keys that look like ids (uuids, field ids) are left alone; dates become ISO strings. */
export function toSnake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSnake);
  if (value instanceof Date) return value.toISOString();
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [isIdLike(k) ? k : snake(k), toSnake(v)]));
  return value;
}

export function toCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCamel);
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [isIdLike(k) ? k : camel(k), toCamel(v)]));
  return value;
}

function isIdLike(key: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(key) || key.startsWith("fld_") || key.startsWith("field:");
}

export type Page<T> = { data: T[]; next_cursor: string | null };

export function parseLimit(raw: string | null, fallback = 50, max = 200): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

/** Opaque offset cursors: enough for v1 (docs/07 says cursor based, and these stay stable for a given sort). */
export function decodeCursor(raw: string | null): number {
  if (!raw) return 0;
  try {
    const n = Number(Buffer.from(raw, "base64url").toString("utf8").replace(/^o:/, ""));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`, "utf8").toString("base64url");
}

export function paginate<T>(items: T[], limit: number, cursor: string | null): Page<T> {
  const start = decodeCursor(cursor);
  const slice = items.slice(start, start + limit);
  const next = start + limit < items.length ? encodeCursor(start + limit) : null;
  return { data: slice, next_cursor: next };
}

/** Keeps only the requested top level fields of each object (`fields=title,status`). Ids always stay. */
export function selectFields<T extends Record<string, unknown>>(item: T, fields: string[] | null): Partial<T> {
  if (!fields || fields.length === 0) return item;
  // Requested names arrive in wire case (due_date) while objects are still camelCase here.
  const keep = new Set(["id", ...fields.map((f) => camel(f))]);
  return Object.fromEntries(Object.entries(item).filter(([k]) => keep.has(k))) as Partial<T>;
}

export function parseFieldList(raw: string | null): string[] | null {
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

/** Token bucket per key: 600 per minute with a burst of 100 (docs/07). In memory per server instance. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();
  constructor(
    private readonly perMinute = 600,
    private readonly burst = 100,
  ) {}
  take(key: string, now = Date.now()): { allowed: boolean; remaining: number; resetSeconds: number } {
    const refillPerMs = this.perMinute / 60_000;
    const b = this.buckets.get(key) ?? { tokens: this.burst, updated: now };
    b.tokens = Math.min(this.burst, b.tokens + (now - b.updated) * refillPerMs);
    b.updated = now;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    this.buckets.set(key, b);
    const resetSeconds = allowed ? 0 : Math.ceil((1 - b.tokens) / refillPerMs / 1000);
    return { allowed, remaining: Math.floor(b.tokens), resetSeconds };
  }
}

/** Remembers POST responses by idempotency key for 24 hours (docs/07). In memory per server instance. */
export class IdempotencyStore {
  private entries = new Map<string, { expires: number; status: number; body: string }>();
  constructor(private readonly ttlMs = 24 * 60 * 60_000) {}
  get(key: string, now = Date.now()) {
    const e = this.entries.get(key);
    if (!e) return null;
    if (e.expires < now) {
      this.entries.delete(key);
      return null;
    }
    return e;
  }
  set(key: string, status: number, body: string, now = Date.now()) {
    if (this.entries.size > 10_000) this.entries.clear();
    this.entries.set(key, { expires: now + this.ttlMs, status, body });
  }
}
