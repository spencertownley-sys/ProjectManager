import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions, className, children }: { title: string; subtitle?: string; actions?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("flex shrink-0 flex-col border-b border-border bg-surface px-6", className)}>
      <div className="flex min-h-14 items-center gap-3 py-2">
        <div className="min-w-0">
          <h1 className="truncate type-title-3 text-fg">{title}</h1>
          {subtitle ? <p className="type-caption-1 text-fg-secondary">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
