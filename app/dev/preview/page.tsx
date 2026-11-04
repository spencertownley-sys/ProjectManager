import { notFound } from "next/navigation";
import { AppProviders } from "@/components/providers";
import { StaticAuthBridge } from "@/lib/client/auth-bridge";
import { AppShell } from "@/components/shell/app-shell";
import { ProjectWorkspace } from "@/components/project/project-workspace";
import {
  fixtureProject,
  fixtureRows,
  fixtureDependencies,
  fixturePeople,
  fixtureToday,
  fixtureNotifications,
  fixtureCycles,
  fixtureEvents,
  fixtureSearchResults,
  fixtureWorkspaceTemplates,
} from "@/lib/dev/fixtures";
import { CyclesPage } from "@/components/cycles/cycles-page";
import { SearchPage } from "@/components/search/search-page";
import { TemplatesGallery } from "@/components/templates/templates-gallery";
import { HelpPage } from "@/components/help/help-page";
import { cycleProgress } from "@/lib/client/cycles";
import { InboxView } from "@/components/inbox/inbox-view";
import { SettingsPreview, type SettingsPreviewPanel } from "@/components/settings/settings-preview";
import { defaultViewSpec, decodeViewSpec } from "@/lib/validation/view-spec";
import type { ViewType } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Visual preview of the project workspace with fixture data. Development only. */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; theme?: string; spec?: string; panel?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.TP_ENABLE_PREVIEW !== "1") notFound();
  const { view, spec, panel } = await searchParams;
  const rows = fixtureRows();
  const project = fixtureProject();
  const data = { rows, total: rows.length, truncated: false, dependencies: fixtureDependencies() };
  const viewType = (
    ["list", "board", "table", "gantt", "timeline", "calendar"].includes(view ?? "") ? view : "list"
  ) as ViewType;
  return (
    <StaticAuthBridge>
      <AppProviders
        workspace={{
          slug: "taskparty",
          workspace: {
            id: "w-1",
            name: "TaskParty",
            slug: "taskparty",
            logoUrl: null,
            estimateUnit: "points",
            cycleLabel: "Cycle",
            weekStartsOn: 1,
          },
          user: {
            id: "u-spencer",
            displayName: "Spencer Townley",
            email: "spencer@example.com",
            avatarUrl: null,
          },
          role: "owner",
          members: fixturePeople,
          today: fixtureToday,
        }}
      >
        <AppShell
          data={{
            projects: [
              {
                id: "p-1",
                key: "MKT",
                name: "Spring campaign",
                color: "berry",
                icon: null,
                archivedAt: null,
              },
              { id: "p-2", key: "WEB", name: "Website refresh", color: "blue", icon: null, archivedAt: null },
              {
                id: "p-3",
                key: "OPS",
                name: "Operations backlog",
                color: "teal",
                icon: null,
                archivedAt: null,
              },
            ],
            workspaces: [{ id: "w-1", slug: "taskparty", name: "TaskParty", logoUrl: null }],
            unreadCount: 3,
          }}
        >
          {view === "search" ? (
            <SearchPage projects={[{ id: "p-1", key: "MKT", name: "Spring campaign", color: "berry" }, { id: "p-2", key: "WEB", name: "Website refresh", color: "blue" }, { id: "p-3", key: "OPS", name: "Operations backlog", color: "teal" }]} staticResults={fixtureSearchResults()} />
          ) : view === "templates" ? (
            <TemplatesGallery workspaceTemplates={fixtureWorkspaceTemplates()} initialCategory={panel === "mine" ? "My templates" : "All"} />
          ) : view === "help" ? (
            <HelpPage />
          ) : view === "cycles" ? (
            <CyclesPage
              project={project}
              cycles={fixtureCycles.map((c) => {
                const p = cycleProgress(rows.map((r) => ({ id: r.id, estimate: r.estimate, cycleId: r.cycleId, completedAt: r.completedAt, createdAt: r.createdAt })), c.id);
                return { ...c, committed: p.committed, completed: p.completed, count: p.count, doneCount: p.doneCount };
              })}
              initialData={data}
              staticData={data}
              staticEvents={fixtureEvents()}
            />
          ) : view === "settings" ? (
            <SettingsPreview
              panel={(panel ?? "members") as SettingsPreviewPanel}
              members={fixturePeople.map((p, i) => ({ id: p.id, displayName: p.displayName, email: p.email ?? "", avatarUrl: p.avatarUrl, role: i === 0 ? "owner" : i === 1 ? "admin" : i === 9 ? "guest" : "member", weeklyCapacityHours: 40, joinedAt: "2026-09-15T09:00:00Z" }))}
              fields={[
                { id: "f-team", name: "Team", type: "single_select", config: { options: [{ id: "o1", name: "Web", color: "blue" }, { id: "o2", name: "Email", color: "teal" }] }, isRequired: false, position: 0, projectId: null },
                { id: "f-budget", name: "Budget", type: "currency", config: { currency: "USD", precision: 2 }, isRequired: true, position: 1, projectId: null },
                { id: "f-launch", name: "Launch region", type: "text", config: {}, isRequired: false, position: 2, projectId: null },
              ]}
              statuses={project.statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color, wipLimit: s.wipLimit }))}
              project={{ id: project.id, key: project.key, name: project.name, color: project.color, autoSchedule: project.autoSchedule }}
            />
          ) : view === "inbox" ? (
            <InboxView initialItems={fixtureNotifications()} staticItems={fixtureNotifications()} />
          ) : (
            <ProjectWorkspace
              project={project}
              viewType={viewType}
              savedViewId={null}
              initialData={data}
              staticData={data}
              initialSpec={spec ? decodeViewSpec(spec) : defaultViewSpec()}
            />
          )}
        </AppShell>
      </AppProviders>
    </StaticAuthBridge>
  );
}
