import { getCurrentSession } from "@/lib/auth/current";
import { queryMyWork } from "@/lib/services/tasks";
import { defaultViewSpec } from "@/lib/validation/view-spec";
import { MyWorkView } from "@/components/my-work/my-work-view";

export const dynamic = "force-dynamic";

export default async function MyWorkPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const data = await queryMyWork(session, { ...defaultViewSpec(), showCompleted: "none", subtasks: "flat", sorts: [{ field: "due_date", direction: "asc" }] }, today, "assigned");
  return <MyWorkView initialData={data} />;
}
