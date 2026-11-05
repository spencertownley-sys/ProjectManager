"use server";

import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current";
import * as apiKeys from "@/lib/services/api-keys";
import { createApiKeyInput } from "@/lib/validation/api-keys";
import { uuid } from "@/lib/validation/common";
import { run } from "./result";

const slug = z.string().min(1);

export async function createApiKeyAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return apiKeys.createApiKey(session, createApiKeyInput.parse(input));
  });
}

export async function revokeApiKeyAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return apiKeys.revokeApiKey(session, uuid.parse(id));
  });
}

export async function listApiKeysAction(workspaceSlug: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return apiKeys.listApiKeys(session);
  });
}
