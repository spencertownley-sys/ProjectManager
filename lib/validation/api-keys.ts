import { z } from "zod";

export const apiScopeValue = z.enum(["read", "write", "admin"]);

export const createApiKeyInput = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(apiScopeValue).min(1).max(3),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeyInput>;
