import * as React from "react";
import { KeyCap } from "@/components/ui/badge";
import { shortcutGroups, type ShortcutGroup } from "@/lib/client/shortcuts";
import { cn } from "@/lib/utils";

/** The shortcut tables shared by the sheet and the help page. */
export function ShortcutList({ groups = shortcutGroups, columns = 2, className }: { groups?: ShortcutGroup[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <div className={cn("grid gap-x-8 gap-y-5", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3", className)}>
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="mb-1 type-caption-1-strong text-fg-secondary">{g.title}</h3>
          <dl className="divide-y divide-border">
            {g.items.map((s) => (
              <div key={s.label} className="flex h-8 items-center gap-3">
                <dt className="min-w-0 flex-1 truncate type-body-1">{s.label}</dt>
                <dd className="flex shrink-0 items-center gap-1">
                  {s.keys.map((k, i) => (
                    <React.Fragment key={k + i}>
                      {i > 0 ? <span className="type-caption-1 text-fg-tertiary">{s.sequence ? "then" : "+"}</span> : null}
                      <KeyCap>{k}</KeyCap>
                    </React.Fragment>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
