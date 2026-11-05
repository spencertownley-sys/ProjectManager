import { describe, it, expect } from "vitest";
import { toSnake, toCamel, paginate, parseLimit, decodeCursor, encodeCursor, selectFields, parseFieldList, RateLimiter, IdempotencyStore } from "./shape";

describe("case conversion", () => {
  it("converts keys deeply, keeps id like keys, and serializes dates", () => {
    const out = toSnake({ dueDate: "2026-11-05", assignee: { displayName: "Jenny" }, customFields: { "0f1e2d3c-1111-2222-3333-444455556666": { type: "number" } }, createdAt: new Date("2026-11-05T10:00:00Z"), tags: [{ tagId: "t" }] });
    expect(out).toEqual({ due_date: "2026-11-05", assignee: { display_name: "Jenny" }, custom_fields: { "0f1e2d3c-1111-2222-3333-444455556666": { type: "number" } }, created_at: "2026-11-05T10:00:00.000Z", tags: [{ tag_id: "t" }] });
    expect(toCamel({ section_id: "s", custom_fields: { "0f1e2d3c-1111-2222-3333-444455556666": 1 }, items: [{ lag_days: 2 }] })).toEqual({ sectionId: "s", customFields: { "0f1e2d3c-1111-2222-3333-444455556666": 1 }, items: [{ lagDays: 2 }] });
  });
});

describe("pagination", () => {
  it("clamps limits and walks opaque cursors", () => {
    expect(parseLimit(null)).toBe(50);
    expect(parseLimit("1000")).toBe(200);
    expect(parseLimit("abc", 20)).toBe(20);
    const items = Array.from({ length: 7 }, (_, i) => i);
    const first = paginate(items, 3, null);
    expect(first.data).toEqual([0, 1, 2]);
    const second = paginate(items, 3, first.next_cursor);
    expect(second.data).toEqual([3, 4, 5]);
    const third = paginate(items, 3, second.next_cursor);
    expect(third).toEqual({ data: [6], next_cursor: null });
    expect(decodeCursor("garbage")).toBe(0);
    expect(decodeCursor(encodeCursor(12))).toBe(12);
  });
  it("selects fields but always keeps the id", () => {
    expect(selectFields({ id: "1", title: "t", status: "s" }, parseFieldList("title"))).toEqual({ id: "1", title: "t" });
    expect(parseFieldList(" , ")).toBeNull();
  });
});

describe("rate limiting and idempotency", () => {
  it("allows a burst then refills over time", () => {
    const rl = new RateLimiter(600, 3);
    const t0 = 1_000_000;
    expect(rl.take("k", t0).allowed).toBe(true);
    expect(rl.take("k", t0).allowed).toBe(true);
    expect(rl.take("k", t0).allowed).toBe(true);
    const blocked = rl.take("k", t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetSeconds).toBeGreaterThan(0);
    expect(rl.take("k", t0 + 200).allowed).toBe(true);
    expect(rl.take("other", t0).allowed).toBe(true);
  });
  it("replays stored responses until they expire", () => {
    const store = new IdempotencyStore(1000);
    store.set("a", 201, "{}", 0);
    expect(store.get("a", 500)?.status).toBe(201);
    expect(store.get("a", 2000)).toBeNull();
  });
});
