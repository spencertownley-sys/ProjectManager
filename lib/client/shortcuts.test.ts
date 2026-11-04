import { describe, it, expect } from "vitest";
import { shortcutGroups, isShortcutSheetKey } from "./shortcuts";

describe("shortcuts", () => {
  it("lists every documented global and task key", () => {
    const labels = shortcutGroups.flatMap((g) => g.items.map((i) => i.keys.join("+")));
    for (const k of ["Ctrl+K", "N", "?", "[", "]", "G+H", "G+M", "G+I", "J", "K", "E", "A", "S", "D", "P", "C", "X", "Shift+X", "Delete"]) expect(labels).toContain(k);
    expect(new Set(shortcutGroups.map((g) => g.title)).size).toBe(shortcutGroups.length);
  });

  it("opens the sheet only for a bare question mark outside text inputs", () => {
    const outside = { key: "?", target: null, ctrlKey: false, metaKey: false, altKey: false };
    expect(isShortcutSheetKey(outside)).toBe(true);
    expect(isShortcutSheetKey({ ...outside, key: "/" })).toBe(false);
    expect(isShortcutSheetKey({ ...outside, ctrlKey: true })).toBe(false);
    const input = { closest: (sel: string) => (sel.includes("input") ? {} : null) } as unknown as EventTarget;
    expect(isShortcutSheetKey({ ...outside, target: input })).toBe(false);
  });
});
