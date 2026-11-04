"use client";

import * as React from "react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import type { Burndown, VelocityPoint } from "@/lib/client/cycles";
import { formatDateShort } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

/*
  Charts follow the design system: brand for the one measure, neutral reference lines for scope and the ideal path,
  recessive grid, text in text tokens, a legend for several series, and a table view for screen readers.
  Committed and completed on the velocity chart share the brand hue and differ by fill (outline vs solid).
*/

const axisTick = { fontSize: 11, fill: "var(--color-fg-tertiary)", fontFamily: "var(--font-sans)" };

function ChartTooltip({ active, payload, label, unitLabel, formatLabel }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string }>; label?: string; unitLabel: string; formatLabel: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 shadow-menu">
      <p className="type-caption-1-strong text-fg">{formatLabel(String(label))}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 type-caption-1 text-fg-secondary">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="text-fg">{p.value} {unitLabel}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: Array<{ label: string; color: string; dashed?: boolean; outline?: boolean }> }) {
  return (
    <ul className="flex flex-wrap gap-4 px-1 pt-2 type-caption-1 text-fg-secondary" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.outline ? <span className="inline-block h-2.5 w-2.5 rounded-xs border" style={{ borderColor: i.color }} aria-hidden /> : <span className="inline-block h-0.5 w-4" style={{ background: i.dashed ? "transparent" : i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : undefined }} aria-hidden />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function BurndownChart({ data, today, unitLabel }: { data: Burndown; today: string; unitLabel: string }) {
  const [table, setTable] = React.useState(false);
  const series = data.points.map((p) => ({ date: p.date, Remaining: p.future ? null : p.remaining, Scope: p.future ? null : p.scope, Ideal: p.ideal }));
  const tick = (d: string) => formatDateShort(d);
  return (
    <div>
      <div className="h-72 w-full" role="img" aria-label={`Burndown: ${data.points.filter((p) => !p.future).map((p) => `${tick(p.date)} remaining ${p.remaining} of ${p.scope}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="date" tickFormatter={tick} tick={axisTick} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} minTickGap={24} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
            <Tooltip content={<ChartTooltip unitLabel={unitLabel} formatLabel={tick} />} cursor={{ stroke: "var(--color-border-strong)", strokeDasharray: "3 3" }} />
            {today >= data.points[0]?.date && today <= data.points[data.points.length - 1]?.date ? <ReferenceLine x={today} stroke="var(--color-fg-tertiary)" strokeDasharray="2 4" /> : null}
            <Line type="linear" dataKey="Ideal" stroke="var(--color-fg-tertiary)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="Scope" stroke="var(--color-fg-secondary)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey="Remaining" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--color-surface)" }} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between">
        <Legend items={[{ label: "Remaining", color: "var(--color-brand)" }, { label: "Scope", color: "var(--color-fg-secondary)" }, { label: "Ideal", color: "var(--color-fg-tertiary)", dashed: true }]} />
        <button type="button" className="type-caption-1-strong text-brand hover:underline" onClick={() => setTable((t) => !t)} aria-expanded={table}>
          {table ? "Hide table" : "Show as table"}
        </button>
      </div>
      {table ? (
        <table className="mt-2 w-full border-collapse type-caption-1">
          <thead>
            <tr className="text-left text-fg-secondary">
              <th className="border-b border-border py-1 font-semibold">Day</th>
              <th className="border-b border-border py-1 text-right font-semibold">Scope</th>
              <th className="border-b border-border py-1 text-right font-semibold">Remaining</th>
              <th className="border-b border-border py-1 text-right font-semibold">Ideal</th>
            </tr>
          </thead>
          <tbody>
            {data.points.map((p) => (
              <tr key={p.date} className={cn(p.future && "text-fg-tertiary")}>
                <td className="border-b border-border py-1">{tick(p.date)}</td>
                <td className="border-b border-border py-1 text-right">{p.future ? "" : p.scope}</td>
                <td className="border-b border-border py-1 text-right">{p.future ? "" : p.remaining}</td>
                <td className="border-b border-border py-1 text-right">{p.ideal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function VelocityChart({ points, unitLabel }: { points: VelocityPoint[]; unitLabel: string }) {
  const data = points.map((p) => ({ name: p.name, Completed: p.completed, Committed: p.committed }));
  return (
    <div className="w-full">
      <div className="h-56 w-full" role="img" aria-label={`Velocity: ${points.map((p) => `${p.name} completed ${p.completed} of ${p.committed}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barCategoryGap="35%" barGap={2} maxBarSize={40}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="name" tick={axisTick} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
          <Tooltip content={<ChartTooltip unitLabel={unitLabel} formatLabel={(l) => l} />} cursor={{ fill: "var(--color-hover)" }} />
          <Bar dataKey="Committed" fill="var(--color-surface)" stroke="var(--color-brand)" strokeWidth={1.5} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Completed" fill="var(--color-brand)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      </div>
      <Legend items={[{ label: "Completed", color: "var(--color-brand)" }, { label: "Committed", color: "var(--color-brand)", outline: true }]} />
    </div>
  );
}
