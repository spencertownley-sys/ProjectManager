"use server";

import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current";
import * as imports from "@/lib/services/imports";
import { createImportInput } from "@/lib/validation/import";
import { uuid } from "@/lib/validation/common";
import { run } from "./result";

const slug = z.string().min(1);

export async function createImportAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return imports.createImport(session, createImportInput.parse(input));
  });
}

export async function getImportAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return imports.getImport(session, uuid.parse(id));
  });
}

export async function listImportsAction(workspaceSlug: string, projectId: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return imports.listImports(session, uuid.parse(projectId));
  });
}
