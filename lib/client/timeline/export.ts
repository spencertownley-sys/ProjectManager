import type { DependencyRow } from "@/lib/query-engine/types";
import type { EngineRow } from "@/components/views/engine/types";
import { createScale, headerTicks, nonWorkingRanges, spanRect, taskSpan, dateToX, connectorPath, type DateRange, type Zoom } from "./scale";
import { formatDateShort } from "@/lib/client/dates";

/**
 * Builds a self contained SVG of a timeline for PNG and PDF export (docs/11 section 5). Colors are passed in
 * because the document is rendered outside the app's stylesheet; the view resolves them from the design tokens.
 */

export type ExportPalette = {
  surface: string;
  subtle: string;
  border: string;
  fg: string;
  fgSecondary: string;
  fgTertiary: string;
  brand: string;
  danger: string;
  bar: string;
  barEdge: string;
  fontFamily: string;
};

export type ExportOptions = {
  title: string;
  rows: EngineRow[];
  range: DateRange;
  zoom: Zoom;
  today: string;
  weekStartsOn: number;
  dependencies: DependencyRow[];
  leftWidth: number;
  rowHeight: number;
  barHeight: number;
  palette: ExportPalette;
  criticalIds?: Set<string> | null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildTimelineSvg(o: ExportOptions): { svg: string; width: number; height: number } {
  const scale = createScale(o.range.start, o.range.end, o.zoom);
  const headerH = 48;
  const titleH = 32;
  const width = o.leftWidth + scale.width;
  const height = titleH + headerH + o.rows.length * o.rowHeight;
  const ticks = headerTicks(scale, o.today, o.weekStartsOn);
  const parts: string[] = [];
  const p = o.palette;
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${p.surface}"/>`);
  parts.push(`<text x="12" y="21" font-size="14" font-weight="600" fill="${p.fg}">${esc(o.title)}</text>`);
  parts.push(`<text x="${width - 12}" y="21" font-size="11" text-anchor="end" fill="${p.fgSecondary}">${esc(`${formatDateShort(o.range.start)} to ${formatDateShort(o.range.end)}`)}</text>`);
  const top = titleH;
  // Non working shading and today line behind everything.
  for (const s of nonWorkingRanges(scale)) parts.push(`<rect x="${o.leftWidth + s.x}" y="${top + headerH}" width="${s.width}" height="${o.rows.length * o.rowHeight}" fill="${p.subtle}"/>`);
  // Header ticks.
  for (const t of ticks.top) parts.push(`<rect x="${o.leftWidth + t.x}" y="${top}" width="${t.width}" height="24" fill="none" stroke="${p.border}"/><text x="${o.leftWidth + t.x + 6}" y="${top + 16}" font-size="11" font-weight="600" fill="${p.fgSecondary}">${esc(t.label)}</text>`);
  for (const t of ticks.bottom) parts.push(`<rect x="${o.leftWidth + t.x}" y="${top + 24}" width="${t.width}" height="24" fill="${t.weekend ? p.subtle : "none"}" stroke="${p.border}"/><text x="${o.leftWidth + t.x + t.width / 2}" y="${top + 40}" font-size="10" text-anchor="middle" fill="${t.today ? p.brand : p.fgTertiary}">${esc(t.label)}</text>`);
  if (o.leftWidth) parts.push(`<text x="12" y="${top + 30}" font-size="11" font-weight="600" fill="${p.fgSecondary}">Task</text>`);
  // Rows.
  const boxes = new Map<string, { x: number; width: number; y: number; height: number }>();
  o.rows.forEach((row, i) => {
    const y = top + headerH + i * o.rowHeight;
    parts.push(`<line x1="0" y1="${y + o.rowHeight}" x2="${width}" y2="${y + o.rowHeight}" stroke="${p.border}"/>`);
    if (row.kind === "group") {
      parts.push(`<rect x="0" y="${y}" width="${width}" height="${o.rowHeight}" fill="${p.subtle}"/>`);
      if (o.leftWidth) parts.push(`<text x="12" y="${y + o.rowHeight / 2 + 4}" font-size="12" font-weight="600" fill="${p.fg}">${esc(row.label)} <tspan fill="${p.fgTertiary}" font-weight="400">${row.count}</tspan></text>`);
      if (row.summary) {
        const r = spanRect(scale, row.summary);
        parts.push(`<rect x="${o.leftWidth + r.x}" y="${y + o.rowHeight / 2 - 3}" width="${r.width}" height="6" fill="${p.fgSecondary}"/>`);
      }
      return;
    }
    const task = row.task;
    if (o.leftWidth) parts.push(`<text x="${12 + row.depth * 16}" y="${y + o.rowHeight / 2 + 4}" font-size="12" fill="${p.fg}">${esc(task.title.length > 40 ? `${task.title.slice(0, 39)}...` : task.title)}</text>`);
    const span = taskSpan(task);
    if (!span) return;
    const r = spanRect(scale, span);
    const by = y + (o.rowHeight - o.barHeight) / 2;
    const critical = o.criticalIds?.has(task.id);
    const dim = o.criticalIds && !critical ? ' opacity="0.4"' : "";
    if (span.kind === "milestone") {
      const cx = o.leftWidth + r.x + scale.pxPerDay / 2;
      const cy = by + o.barHeight / 2;
      const rad = o.barHeight / 2;
      parts.push(`<path d="M ${cx} ${cy - rad} L ${cx + rad} ${cy} L ${cx} ${cy + rad} L ${cx - rad} ${cy} Z" fill="${p.brand}"${dim}/>`);
      parts.push(`<text x="${cx + rad + 6}" y="${cy + 4}" font-size="11" fill="${p.fg}"${dim}>${esc(task.title)}</text>`);
      boxes.set(task.id, { x: o.leftWidth + r.x, width: o.barHeight, y: by, height: o.barHeight });
      return;
    }
    parts.push(`<rect x="${o.leftWidth + r.x}" y="${by}" width="${r.width}" height="${o.barHeight}" rx="3" fill="${critical ? p.brand : p.bar}" stroke="${critical ? p.brand : p.barEdge}"${dim}/>`);
    parts.push(`<rect x="${o.leftWidth + r.x}" y="${by}" width="4" height="${o.barHeight}" rx="2" fill="${critical ? p.brand : p.barEdge}"${dim}/>`);
    if (!o.leftWidth) {
      const inside = r.width >= task.title.length * 7 + 16;
      parts.push(`<text x="${o.leftWidth + r.x + (inside ? 10 : r.width + 8)}" y="${by + o.barHeight / 2 + 4}" font-size="11" fill="${critical && inside ? p.surface : p.fg}"${dim}>${esc(task.title)}</text>`);
    }
    if (task.status.category !== "done" && span.end < o.today) parts.push(`<rect x="${o.leftWidth + r.x + r.width - 3}" y="${by}" width="3" height="${o.barHeight}" fill="${p.danger}"/>`);
    boxes.set(task.id, { x: o.leftWidth + r.x, width: r.width, y: by, height: o.barHeight });
  });
  // Connectors.
  parts.push(`<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="${p.fgTertiary}"/></marker></defs>`);
  for (const d of o.dependencies) {
    const from = boxes.get(d.predecessorId);
    const to = boxes.get(d.successorId);
    if (!from || !to) continue;
    parts.push(`<path d="${connectorPath(from, to, d.type)}" fill="none" stroke="${p.fgTertiary}" stroke-width="1.25" marker-end="url(#arrow)"/>`);
  }
  // Today line.
  if (o.today >= scale.start && o.today <= scale.end) {
    const x = o.leftWidth + dateToX(scale, o.today) + scale.pxPerDay / 2;
    parts.push(`<line x1="${x}" y1="${top + headerH}" x2="${x}" y2="${height}" stroke="${p.brand}" stroke-width="2"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(p.fontFamily)}">${parts.join("")}</svg>`;
  return { svg, width, height };
}

/** Rasterizes an SVG string to a PNG blob at the given device pixel ratio. Browser only. */
export async function svgToPngBlob(svg: string, width: number, height: number, ratio = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("The image could not be rendered"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.scale(ratio, ratio);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be encoded"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens the SVG in a print window so the browser can save it as a PDF. */
export function printSvg(svg: string, title: string) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=1200,height=800");
  if (!w) throw new Error("The print window was blocked. Allow pop ups for this site.");
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>@page{size:landscape;margin:12mm}body{margin:0}svg{max-width:100%;height:auto}</style></head><body>${svg}</body></html>`);
  w.document.close();
  w.focus();
  w.setTimeout(() => w.print(), 250);
}
