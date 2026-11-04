import { redirect } from "next/navigation";
import { getUserWorkspaces } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function AppEntryPage() {
  const list = await getUserWorkspaces();
  if (list.length === 0) redirect("/onboarding");
  const last = list[0];
  redirect(`/w/${last.slug}/home`);
}
