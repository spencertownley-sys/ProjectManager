import { describe, it, expect } from "vitest";
import { parseCsv, detectDelimiter, guessMapping, parseDate, parsePriority, coerceRow, summarize, splitTags } from "./csv";

const ctx = {
  statuses: [
    { id: "s1", name: "To do" },
    { id: "s2", name: "Done" },
  ],
  sections: [{ id: "sec1", name: "Planning" }],
  members: [{ id: "u1", displayName: "Jenny Park", email: "jenny@example.com" }],
  fields: [
    { id: "f-team", name: "Team", type: "single_select", config: { options: [{ id: "o1", name: "Web" }] } },
    { id: "f-budget", name: "Budget", type: "currency", config: {} },
  ],
};

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded newlines, CRLF, and a BOM", () => {
    const text = '﻿Title,Notes,Due\r\n"Launch, the big one","She said ""go""",2026-11-05\r\n"Multi\nline",,\r\n\r\n';
    const out = parseCsv(text);
    expect(out.headers).toEqual(["Title", "Notes", "Due"]);
    expect(out.rows).toEqual([
      ["Launch, the big one", 'She said "go"', "2026-11-05"],
      ["Multi\nline", "", ""],
    ]);
  });
  it("detects semicolons and tabs and pads short rows", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(parseCsv("a;b;c\n1;2").rows).toEqual([["1", "2", ""]]);
    expect(parseCsv("x,y\n1,2", { hasHeader: false }).headers).toEqual(["Column 1", "Column 2"]);
  });
});

describe("guessMapping", () => {
  it("maps common headers and custom field names, skipping the rest", () => {
    const m = guessMapping(["Task name", "Owner", "Deadline", "Team", "Mystery", "Labels"], ctx.fields);
    expect(m.map((c) => c.target)).toEqual(["title", "assignee", "dueDate", "field:f-team", "skip", "tags"]);
  });
});

describe("value parsers", () => {
  it("reads several date shapes", () => {
    expect(parseDate("2026-11-05")).toBe("2026-11-05");
    expect(parseDate("05/11/2026")).toBe("2026-11-05");
    expect(parseDate("11/05/2026", false)).toBe("2026-11-05");
    expect(parseDate("25/12/26")).toBe("2026-12-25");
    expect(parseDate("5 Nov 2026")).toBe("2026-11-05");
    expect(parseDate("November 5, 2026")).toBe("2026-11-05");
    expect(parseDate("soon")).toBeNull();
    expect(parseDate("2026-13-40")).toBeNull();
  });
  it("maps priority words and splits tags", () => {
    expect(parsePriority("Critical")).toBe("urgent");
    expect(parsePriority("P2")).toBe("medium");
    expect(parsePriority("whenever")).toBeNull();
    expect(splitTags("Email; Web, Paid ")).toEqual(["Email", "Web", "Paid"]);
  });
});

describe("coerceRow", () => {
  const mapping = [
    { column: 0, target: "title" },
    { column: 1, target: "status" },
    { column: 2, target: "assignee" },
    { column: 3, target: "dueDate" },
    { column: 4, target: "section" },
    { column: 5, target: "field:f-team" },
    { column: 6, target: "field:f-budget" },
    { column: 7, target: "priority" },
    { column: 8, target: "estimate" },
    { column: 9, target: "milestone" },
  ];
  it("resolves names to ids and reports every problem", () => {
    const good = coerceRow(["Write brief", "done", "jenny@example.com", "5 Nov 2026", "Planning", "web", "$1,200", "High", "3 pts", "yes"], mapping, ctx);
    expect(good.errors).toEqual([]);
    expect(good).toMatchObject({ title: "Write brief", statusId: "s2", assigneeId: "u1", dueDate: "2026-11-05", sectionId: "sec1", priority: "high", estimate: 3, isMilestone: true, customFields: { "f-team": "o1", "f-budget": 1200 } });
    const bad = coerceRow(["", "Blocked", "Nobody", "someday", "Launch", "Mobile", "lots", "meh", "x", ""], mapping, ctx);
    expect(bad.newSection).toBe("Launch");
    expect(bad.errors.map((e) => e.target).sort()).toEqual(["assignee", "dueDate", "estimate", "field:f-budget", "field:f-team", "priority", "status", "title"].sort());
  });
  it("flags a due date before the start date", () => {
    const c = coerceRow(["A", "2026-11-10", "2026-11-01"], [{ column: 0, target: "title" }, { column: 1, target: "startDate" }, { column: 2, target: "dueDate" }], ctx);
    expect(c.errors[0]?.target).toBe("dueDate");
  });
  it("summarizes rows, new sections, and new tags", () => {
    const rows = [
      ["A", "Launch", "Email, Web"],
      ["", "Planning", ""],
    ];
    const s = summarize(rows, [{ column: 0, target: "title" }, { column: 1, target: "section" }, { column: 2, target: "tags" }], ctx);
    expect(s).toEqual({ ready: 1, withProblems: 1, newSections: ["Launch"], newTags: ["Email", "Web"] });
  });
});
