"use client";

import * as React from "react";
import { useShellState } from "@/lib/client/view-state";
import { cn } from "@/lib/utils";

type Theme = "system" | "light" | "dark";

function readTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const t = localStorage.getItem("tp-theme");
    return t === "dark" || t === "light" ? t : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem("tp-theme");
    else localStorage.setItem("tp-theme", theme);
  } catch {
    // ignore
  }
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

const densities = [
  { value: "compact", label: "Compact", description: "28 px rows" },
  { value: "default", label: "Default", description: "36 px rows" },
  { value: "comfortable", label: "Comfortable", description: "44 px rows" },
] as const;

export function AppearanceSettings() {
  const [theme, setTheme] = React.useState<Theme>(readTheme);
  const { density, setDensity } = useShellState();
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <h2 className="type-subtitle-2">Theme</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => { setTheme(t); applyTheme(t); }} className={cn("flex h-16 flex-col items-start justify-end rounded-sm border border-border p-2 text-left type-body-1 hover:bg-hover", theme === t && "border-brand bg-selected")}>
              <span className="font-semibold">{t === "system" ? "Match system" : t === "light" ? "Light" : "Dark"}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <h2 className="type-subtitle-2">Density</h2>
        <p className="type-caption-1 text-fg-secondary">Row height in List, Table, and Gantt.</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Density">
          {densities.map((d) => (
            <button key={d.value} type="button" role="radio" aria-checked={density === d.value} onClick={() => setDensity(d.value)} className={cn("flex h-16 flex-col items-start justify-end rounded-sm border border-border p-2 text-left hover:bg-hover", density === d.value && "border-brand bg-selected")}>
              <span className="type-body-1-strong">{d.label}</span>
              <span className="type-caption-1 text-fg-secondary">{d.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
