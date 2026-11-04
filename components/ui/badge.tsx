import * as React from "react";
import { cn } from "@/lib/utils";

/** Tinted badge. Pass `color` from the palette (blue, teal, ...) or a semantic token name. */
export function Badge({ color, className, children, dot, ...props }: React.HTMLAttributes<HTMLSpanElement> & { color?: string; dot?: boolean }) {
  return (
    <span
      data-color={color}
      className={cn("inline-flex h-5 max-w-full items-center gap-1 rounded-sm bg-item-tint px-1.5 type-caption-1-strong text-fg", className)}
      {...props}
    >
      {dot ? <span className="h-2 w-2 shrink-0 rounded-full bg-item" aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return <span className={cn("inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 type-caption-2 font-semibold text-fg-on-brand", className)}>{count > 99 ? "99+" : count}</span>;
}

export function KeyCap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border bg-subtle px-1 font-sans type-caption-1 text-fg-secondary", className)}>{children}</kbd>;
}
