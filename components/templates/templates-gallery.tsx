"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { projectTemplates, type ProjectTemplate } from "@/lib/templates/projects";
import { workflowTemplates } from "@/lib/templates/workflows";
import type { WorkspaceTemplate } from "@/lib/services/projects";
import { useWorkspace } from "@/lib/client/workspace-context";
import { formatDateShort } from "@/lib/client/dates";
import { ViewIllustration } from "./view-illustration";
import { cn } from "@/lib/utils";

const categories = ["All", "Engineering", "Marketing", "Operations", "Planning", "Personal", "My templates"] as const;
type Category = (typeof categories)[number];

const viewLabel: Record<string, string> = { list: "List", board: "Board", table: "Table", gantt: "Gantt", timeline: "Timeline", calendar: "Calendar", workload: "Workload", dashboard: "Dashboard" };

/** Templates gallery (docs/10 section 12): category filter, cards with a view illustration, "Use template" pre-fills the create dialog. */
export function TemplatesGallery({ workspaceTemplates, initialCategory = "All" }: { workspaceTemplates: WorkspaceTemplate[]; initialCategory?: Category }) {
  const { role } = useWorkspace();
  const [category, setCategory] = React.useState<Category>(initialCategory);
  const [pick, setPick] = React.useState<{ templateId?: string; workspaceTemplate?: { id: string; name: string } } | null>(null);
  const canCreate = role !== "guest";
  const builtIn = category === "My templates" ? [] : projectTemplates.filter((t) => category === "All" || t.category === category);
  const mine = category === "All" || category === "My templates" ? workspaceTemplates : [];
  const counts: Record<string, number> = { All: projectTemplates.length + workspaceTemplates.length, "My templates": workspaceTemplates.length };
  for (const t of projectTemplates) counts[t.category] = (counts[t.category] ?? 0) + 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-6 py-4">
        <h1 className="type-title-3">Templates</h1>
        <p className="type-body-1 text-fg-secondary">Start a project with a workflow, sections, and views already in place. Save any project as a template from its menu.</p>
        <div role="tablist" aria-label="Category" className="mt-3 flex flex-wrap gap-1">
          {categories.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-3 type-body-1 text-fg-secondary hover:bg-hover", category === c && "border-brand bg-selected font-semibold text-fg")}
            >
              {c}
              <span className="type-caption-1 text-fg-tertiary">{counts[c] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {category === "My templates" && mine.length === 0 ? (
          <EmptyState title="No saved templates yet" description="Open a project, choose Save as template from its menu, and it will appear here for everyone in the workspace." className="mt-12" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mine.map((t) => (
              <TemplateCard
                key={t.id}
                name={t.name}
                category="My templates"
                description={t.description ?? `${t.sections.length} sections, ${t.taskCount} tasks. Saved ${formatDateShort(t.createdAt.slice(0, 10))}${t.createdBy ? ` by ${t.createdBy}` : ""}.`}
                view={t.defaultView}
                meta={t.sections.length ? t.sections.join(", ") : "No sections"}
                color={t.color}
                canCreate={canCreate}
                onUse={() => setPick({ workspaceTemplate: { id: t.id, name: t.name } })}
              />
            ))}
            {builtIn.map((t) => (
              <TemplateCard
                key={t.id}
                name={t.name}
                category={t.category}
                description={t.description}
                view={t.defaultView}
                meta={`${workflowTemplates[t.workflow].name} workflow, ${t.sections.length} ${t.sections.length === 1 ? "section" : "sections"}${t.tasks.length ? `, ${t.tasks.length} sample tasks` : ""}`}
                canCreate={canCreate}
                onUse={() => setPick({ templateId: t.id })}
              />
            ))}
          </div>
        )}
      </div>
      <NewProjectDialog open={pick !== null} onOpenChange={(o) => !o && setPick(null)} templateId={pick?.templateId} workspaceTemplate={pick?.workspaceTemplate} />
    </div>
  );
}

function TemplateCard({ name, category, description, view, meta, color, canCreate, onUse }: { name: string; category: ProjectTemplate["category"] | "My templates"; description: string; view: string; meta: string; color?: string; canCreate: boolean; onUse: () => void }) {
  return (
    <article className="flex flex-col rounded-md border border-border bg-surface" aria-label={name}>
      <div className="border-b border-border bg-subtle p-3">
        <ViewIllustration view={view} className="h-24 w-full" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          {color ? <span data-color={color} className="h-2.5 w-2.5 rounded-full bg-item" aria-hidden /> : null}
          <h2 className="min-w-0 flex-1 truncate type-body-1-strong">{name}</h2>
          <Badge color={category === "My templates" ? "purple" : "gray"}>{category}</Badge>
        </div>
        <p className="type-body-1 text-fg-secondary">{description}</p>
        <p className="mt-auto pt-1 type-caption-1 text-fg-tertiary">
          {viewLabel[view] ?? view} view. {meta}
        </p>
      </div>
      <div className="flex items-center justify-end border-t border-border px-3 py-2">
        <Button variant="primary" size="sm" onClick={onUse} disabled={!canCreate} aria-label={`Use template ${name}`}>
          Use template
        </Button>
      </div>
    </article>
  );
}
