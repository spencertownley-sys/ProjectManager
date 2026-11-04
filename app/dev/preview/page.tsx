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
} from "@/lib/dev/fixtures";
import { InboxView } from "@/components/inbox/inbox-view";
import { defaultViewSpec, decodeViewSpec } from "@/lib/validation/view-spec";
import type { ViewType } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Visual preview of the project workspace with fixture data. Development only. */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; theme?: string; spec?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.TP_ENABLE_PREVIEW !== "1") notFound();
  const { view, spec } = await searchParams;
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
          {view === "inbox" ? (
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
