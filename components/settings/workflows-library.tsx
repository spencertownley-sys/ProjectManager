import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { workflowTemplates } from "@/lib/templates/workflows";
import { categoryLabel } from "@/lib/client/grouping";

/** Workflow templates (read only in v1) and a jump list to each project's editor. */
export function WorkflowsLibrary({ projects, base }: { projects: Array<{ id: string; key: string; name: string; color: string }>; base?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h2 className="type-subtitle-2">Templates</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(workflowTemplates).map(([key, t]) => (
            <div key={key} className="rounded-md border border-border bg-surface p-4">
              <p className="type-body-1-strong">{t.name}</p>
              <ol className="mt-2 flex flex-col gap-1">
                {t.statuses.map((s) => (
                  <li key={s.name} className="flex items-center gap-2 type-caption-1">
                    <Badge color={s.color} dot>
                      {s.name}
                    </Badge>
                    <span className="text-fg-tertiary">{categoryLabel(s.category)}</span>
                    {s.wipLimit ? <span className="text-fg-tertiary">WIP {s.wipLimit}</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="type-subtitle-2">Project workflows</h2>
        <p className="type-body-1 text-fg-secondary">Each project owns its statuses. Open a project to edit its workflow and fields.</p>
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          {projects.length === 0 ? <p className="p-4 type-body-1 text-fg-secondary">No projects yet.</p> : null}
          {projects.map((p) => (
            <Link key={p.id} href={`${base ?? ""}/projects/${p.key}/settings`} className="flex h-10 items-center gap-3 border-b border-border px-4 last:border-b-0 hover:bg-hover">
              <span data-color={p.color} className="h-2.5 w-2.5 rounded-full bg-item" aria-hidden />
              <span className="min-w-0 flex-1 truncate type-body-1">{p.name}</span>
              <span className="font-mono type-caption-1 text-fg-tertiary">{p.key}</span>
              <span className="type-caption-1-strong text-brand">Edit workflow</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
