"use server";

import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current";
import { searchWorkspace } from "@/lib/services/search";
import { searchInput } from "@/lib/validation/search";
import { run } from "./result";

const slug = z.string().min(1);

export async function searchAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return searchWorkspace(session, searchInput.parse(input));
  });
}
