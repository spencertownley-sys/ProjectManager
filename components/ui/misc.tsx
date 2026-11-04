import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-hover", className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-2 p-6", className)}>
      {icon ? <span className="text-fg-tertiary [&>svg]:h-6 [&>svg]:w-6">{icon}</span> : null}
      <p className="type-body-1-strong text-fg">{title}</p>
      {description ? <p className="type-body-1 text-fg-secondary">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function Divider({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div className={cn(vertical ? "h-5 w-px self-center bg-border" : "h-px w-full bg-border", className)} aria-hidden />;
}

export function ProgressBar({ value, max = 100, className, color }: { value: number; max?: number; className?: string; color?: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-hover", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div data-color={color} className={cn("h-full rounded-full", color ? "bg-item" : "bg-brand")} style={{ width: `${pct}%` }} />
    </div>
  );
}
