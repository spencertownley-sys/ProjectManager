import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/current";
import { listProjects } from "@/lib/services/projects";
import { queryMyWork } from "@/lib/services/tasks";
import { defaultViewSpec } from "@/lib/validation/view-spec";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/misc";
import { HomeTaskList } from "@/components/home/home-task-list";
import { PageHeader } from "@/components/shell/page-header";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

const healthMeta: Record<string, { label: string; color: string }> = {
  on_track: { label: "On track", color: "green" },
  at_risk: { label: "At risk", color: "orange" },
  off_track: { label: "Off track", color: "red" },
  on_hold: { label: "On hold", color: "gray" },
  complete: { label: "Complete", color: "blue" },
};

export default async function HomePage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const today = format(new Date(), "yyyy-MM-dd");
  const [projects, mine] = await Promise.all([
    listProjects(session, { today }),
    queryMyWork(session, { ...defaultViewSpec(), showCompleted: "none", sorts: [{ field: "due_date", direction: "asc" }] }, today),
  ]);
  const dueToday = mine.rows.filter((r) => r.dueDate && r.dueDate <= today);
  const dueWeek = mine.rows.filter((r) => r.dueDate && r.dueDate > today && r.dueDate <= addDays(today, 7));
  const firstName = session.user.displayName.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title={`${greeting}, ${firstName}`} subtitle={format(new Date(), "EEEE, d MMMM yyyy")} />
      <div className="grid gap-6 p-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <section className="rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <h2 className="type-subtitle-2">Due today and overdue</h2>
              <Link href={`/w/${workspaceSlug}/my-work`} className="type-caption-1-strong text-brand hover:underline">
                View all in My work
              </Link>
            </div>
            <HomeTaskList rows={dueToday.slice(0, 8)} empty="Nothing is due today." />
          </section>
          <section className="rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <h2 className="type-subtitle-2">Due this week</h2>
            </div>
            <HomeTaskList rows={dueWeek.slice(0, 8)} empty="Nothing else is due this week." />
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="type-subtitle-2">Projects</h2>
              <Link href={`/w/${workspaceSlug}/projects`} className="type-caption-1-strong text-brand hover:underline">
                All projects
              </Link>
            </div>
            {projects.length === 0 ? (
              <div className="rounded-md border border-border bg-surface p-6">
                <p className="type-body-1-strong">Create your first project</p>
                <p className="type-body-1 text-fg-secondary">Start from a template or a blank list. Use the New button in the navigation.</p>
                <Link href={`/w/${workspaceSlug}/templates`} className="mt-3 inline-flex h-8 items-center rounded-sm bg-brand px-3 type-body-1 font-semibold text-fg-on-brand hover:bg-brand-hover">
                  Browse templates
                </Link>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {projects.slice(0, 8).map((p) => {
                  const h = p.latestHealth ? healthMeta[p.latestHealth] : null;
                  const owner = session.actor.userId === p.ownerId ? session.user : null;
                  return (
                    <Link key={p.id} href={`/w/${workspaceSlug}/projects/${p.key}`} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4 hover:bg-hover">
                      <div className="flex items-center gap-2">
                        <span data-color={p.color} className="h-3 w-3 rounded-full bg-item" />
                        <span className="truncate type-body-1-strong">{p.name}</span>
                        {h ? <Badge color={h.color} className="ml-auto">{h.label}</Badge> : null}
                      </div>
                      <ProgressBar value={p.doneCount} max={p.taskCount} color={p.color} />
                      <div className="flex items-center gap-2 type-caption-1 text-fg-secondary">
                        <span>
                          {p.doneCount} of {p.taskCount} done
                        </span>
                        {p.overdueCount ? <span className="text-danger">{p.overdueCount} overdue</span> : null}
                        {owner ? <span className="ml-auto"><Avatar name={owner.displayName} src={owner.avatarUrl} size="xs" /></span> : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          <section className="rounded-md border border-border bg-surface">
            <div className="border-b border-border px-4 py-2">
              <h2 className="type-subtitle-2">Upcoming milestones</h2>
            </div>
            <ul className="divide-y divide-border">
              {mine.rows.filter((r) => r.isMilestone && r.dueDate && r.dueDate >= today).slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-4 py-2 type-body-1">
                  <span className="truncate">{r.title}</span>
                  <span className="ml-auto shrink-0 type-caption-1 text-fg-secondary">{format(new Date(r.dueDate + "T00:00:00"), "d MMM")}</span>
                </li>
              ))}
              {mine.rows.filter((r) => r.isMilestone).length === 0 ? <li className="px-4 py-3 type-body-1 text-fg-secondary">No milestones assigned to you.</li> : null}
            </ul>
          </section>
          <section className="rounded-md border border-border bg-surface p-4">
            <h2 className="type-subtitle-2">Shortcuts</h2>
            <p className="mt-1 type-body-1 text-fg-secondary">Press Ctrl K to search or jump anywhere. Press ? for the full list.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}
