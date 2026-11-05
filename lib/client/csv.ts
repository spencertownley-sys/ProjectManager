import type { ImportMapping, ImportTarget } from "@/lib/validation/import";

/*
  CSV parsing and row coercion for the import dialog and the import job. Pure, no database access: the job and the
  preview share `coerceRow` so what the preview shows is what gets created.
*/

export type ParsedCsv = { headers: string[]; rows: string[][]; delimiter: string };

/** Picks the delimiter that splits the first line into the most columns. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const count = firstLine.split(d).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 parser: quoted fields, doubled quotes, embedded newlines, CRLF. Trailing empty lines are dropped. */
export function parseCsv(text: string, options: { delimiter?: string; hasHeader?: boolean } = {}): ParsedCsv {
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const hasHeader = options.hasHeader ?? true;
  const source = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    records.push(row);
  }
  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  const width = Math.max(0, ...nonEmpty.map((r) => r.length));
  const padded = nonEmpty.map((r) => [...r, ...Array.from({ length: width - r.length }, () => "")].map((v) => v.trim()));
  if (hasHeader) {
    const [headers = [], ...rows] = padded;
    return { headers: headers.map((h, i) => h || `Column ${i + 1}`), rows, delimiter };
  }
  return { headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`), rows: padded, delimiter };
}

const headerSynonyms: Array<[ImportTarget, RegExp]> = [
  ["title", /^(title|name|task|task name|summary|subject)$/i],
  ["description", /^(description|notes|details|body)$/i],
  ["section", /^(section|group|list|column|bucket)$/i],
  ["status", /^(status|state|stage)$/i],
  ["assignee", /^(assignee|assigned to|owner|responsible)$/i],
  ["startDate", /^(start|start date|starts|begin)$/i],
  ["dueDate", /^(due|due date|deadline|end|end date|finish)$/i],
  ["priority", /^(priority|importance)$/i],
  ["estimate", /^(estimate|points|story points|hours|effort|size)$/i],
  ["tags", /^(tags|labels|label)$/i],
  ["milestone", /^(milestone|is milestone)$/i],
  ["parent", /^(parent|parent task|epic)$/i],
];

/** Suggests a mapping from header names; custom fields match by name. Unmatched columns are skipped. */
export function guessMapping(headers: string[], fields: Array<{ id: string; name: string }> = []): ImportMapping {
  const used = new Set<string>();
  return headers.map((header, column) => {
    const h = header.trim();
    let target: string = "skip";
    for (const [t, re] of headerSynonyms) {
      if (re.test(h) && !used.has(t)) {
        target = t;
        break;
      }
    }
    if (target === "skip") {
      const field = fields.find((f) => f.name.toLowerCase() === h.toLowerCase());
      if (field && !used.has(`field:${field.id}`)) target = `field:${field.id}`;
    }
    if (target !== "skip") used.add(target);
    return { column, target };
  });
}

const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Accepts ISO dates, day first or month first numeric dates (ambiguous ones read as day first), and "5 Nov 2026". */
export function parseDate(raw: string, dayFirst = true): string | null {
  const s = raw.trim();
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const [d, mo] = a > 12 ? [a, b] : b > 12 ? [b, a] : dayFirst ? [a, b] : [b, a];
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/) ?? s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const dayFirstMatch = /^\d/.test(s);
    const d = Number(dayFirstMatch ? m[1] : m[2]);
    const name = (dayFirstMatch ? m[2] : m[1]).slice(0, 3).toLowerCase();
    const y = Number(m[3]);
    const mo = monthNames.indexOf(name) + 1;
    return mo && valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
}

const priorityWords: Record<string, "none" | "low" | "medium" | "high" | "urgent"> = { none: "none", "": "none", low: "low", lowest: "low", minor: "low", p3: "low", p4: "low", medium: "medium", normal: "medium", med: "medium", p2: "medium", high: "high", major: "high", important: "high", p1: "high", urgent: "urgent", critical: "urgent", highest: "urgent", blocker: "urgent", p0: "urgent" };

export function parsePriority(raw: string): "none" | "low" | "medium" | "high" | "urgent" | null {
  const key = raw.trim().toLowerCase();
  return key in priorityWords ? priorityWords[key] : null;
}

/** Reads "3 pts", "$1,200", or "12.5"; anything without digits is not a number. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.-]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseBoolean(raw: string): boolean {
  return /^(true|yes|y|1|x|milestone|on)$/i.test(raw.trim());
}

export function splitTags(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export type ImportContext = {
  statuses: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; name: string }>;
  members: Array<{ id: string; displayName: string; email?: string | null }>;
  fields: Array<{ id: string; name: string; type: string; config: unknown }>;
  dayFirst?: boolean;
};

export type CoercedRow = {
  title: string;
  description: string | null;
  sectionId: string | null;
  /** A section name that does not exist yet; the job creates it. */
  newSection: string | null;
  statusId: string | null;
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  priority: "none" | "low" | "medium" | "high" | "urgent" | null;
  estimate: number | null;
  tags: string[];
  isMilestone: boolean;
  parentTitle: string | null;
  customFields: Record<string, unknown>;
  errors: Array<{ target: string; message: string }>;
};

function byName<T extends { name: string }>(list: T[], raw: string): T | undefined {
  const key = raw.trim().toLowerCase();
  return list.find((x) => x.name.trim().toLowerCase() === key);
}

/** Turns one CSV row into task fields using the mapping. Problems are listed, never thrown. */
export function coerceRow(row: string[], mapping: ImportMapping, ctx: ImportContext): CoercedRow {
  const out: CoercedRow = { title: "", description: null, sectionId: null, newSection: null, statusId: null, assigneeId: null, startDate: null, dueDate: null, priority: null, estimate: null, tags: [], isMilestone: false, parentTitle: null, customFields: {}, errors: [] };
  const err = (target: string, message: string) => out.errors.push({ target, message });
  for (const { column, target } of mapping) {
    const raw = (row[column] ?? "").trim();
    if (target === "skip") continue;
    if (target.startsWith("field:")) {
      if (!raw) continue;
      const field = ctx.fields.find((f) => f.id === target.slice(6));
      if (!field) continue;
      const value = coerceFieldValue(field, raw, ctx);
      if (value.error) err(target, value.error);
      else out.customFields[field.id] = value.value;
      continue;
    }
    switch (target as ImportTarget) {
      case "title":
        out.title = raw.slice(0, 500);
        break;
      case "description":
        out.description = raw || null;
        break;
      case "section": {
        if (!raw) break;
        const s = byName(ctx.sections, raw);
        if (s) out.sectionId = s.id;
        else out.newSection = raw;
        break;
      }
      case "status": {
        if (!raw) break;
        const s = byName(ctx.statuses, raw);
        if (s) out.statusId = s.id;
        else err(target, `Unknown status "${raw}"`);
        break;
      }
      case "assignee": {
        if (!raw) break;
        const key = raw.toLowerCase();
        const m = ctx.members.find((x) => x.displayName.toLowerCase() === key || (x.email ?? "").toLowerCase() === key);
        if (m) out.assigneeId = m.id;
        else err(target, `No member named "${raw}"`);
        break;
      }
      case "startDate":
      case "dueDate": {
        if (!raw) break;
        const d = parseDate(raw, ctx.dayFirst ?? true);
        if (!d) err(target, `Unreadable date "${raw}"`);
        else if (target === "startDate") out.startDate = d;
        else out.dueDate = d;
        break;
      }
      case "priority": {
        if (!raw) break;
        const p = parsePriority(raw);
        if (p) out.priority = p;
        else err(target, `Unknown priority "${raw}"`);
        break;
      }
      case "estimate": {
        if (!raw) break;
        const n = parseNumber(raw);
        if (n !== null && n >= 0) out.estimate = n;
        else err(target, `Estimate "${raw}" is not a number`);
        break;
      }
      case "tags":
        out.tags = splitTags(raw);
        break;
      case "milestone":
        out.isMilestone = parseBoolean(raw);
        break;
      case "parent":
        out.parentTitle = raw || null;
        break;
      default:
        break;
    }
  }
  if (!out.title) err("title", "Title is empty");
  if (out.startDate && out.dueDate && out.startDate > out.dueDate) err("dueDate", "Due date is before the start date");
  return out;
}

function coerceFieldValue(field: ImportContext["fields"][number], raw: string, ctx: ImportContext): { value?: unknown; error?: string } {
  const config = (field.config ?? {}) as { options?: Array<{ id: string; name: string }> };
  switch (field.type) {
    case "number":
    case "currency":
    case "percent": {
      const n = parseNumber(raw);
      return n !== null ? { value: n } : { error: `"${raw}" is not a number for ${field.name}` };
    }
    case "date": {
      const d = parseDate(raw, ctx.dayFirst ?? true);
      return d ? { value: d } : { error: `Unreadable date "${raw}" for ${field.name}` };
    }
    case "checkbox":
      return { value: parseBoolean(raw) };
    case "single_select": {
      const opt = byName(config.options ?? [], raw);
      return opt ? { value: opt.id } : { error: `"${raw}" is not an option of ${field.name}` };
    }
    case "multi_select": {
      const names = splitTags(raw);
      const ids: string[] = [];
      for (const n of names) {
        const opt = byName(config.options ?? [], n);
        if (!opt) return { error: `"${n}" is not an option of ${field.name}` };
        ids.push(opt.id);
      }
      return { value: ids };
    }
    case "person": {
      const key = raw.toLowerCase();
      const m = ctx.members.find((x) => x.displayName.toLowerCase() === key || (x.email ?? "").toLowerCase() === key);
      return m ? { value: m.id } : { error: `No member named "${raw}" for ${field.name}` };
    }
    default:
      return { value: raw };
  }
}

export type ImportSummary = { ready: number; withProblems: number; newSections: string[]; newTags: string[] };

/** Counts rows that will import cleanly and the sections and tags the job will create. */
export function summarize(rows: string[][], mapping: ImportMapping, ctx: ImportContext): ImportSummary {
  const sections = new Set<string>();
  const tags = new Set<string>();
  let ready = 0;
  let withProblems = 0;
  for (const row of rows) {
    const c = coerceRow(row, mapping, ctx);
    if (c.errors.length) withProblems += 1;
    else ready += 1;
    if (c.newSection) sections.add(c.newSection);
    for (const t of c.tags) tags.add(t);
  }
  return { ready, withProblems, newSections: [...sections], newTags: [...tags] };
}

export const targetLabels: Record<ImportTarget, string> = {
  skip: "Do not import",
  title: "Title",
  description: "Description",
  section: "Section",
  status: "Status",
  assignee: "Assignee",
  startDate: "Start date",
  dueDate: "Due date",
  priority: "Priority",
  estimate: "Estimate",
  tags: "Tags",
  milestone: "Milestone",
  parent: "Parent task",
};
