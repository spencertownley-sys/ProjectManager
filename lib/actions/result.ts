import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/auth/permissions";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/services/context";

export type ActionError = { code: "forbidden" | "not_found" | "validation_failed" | "conflict" | "internal"; message: string; details?: Array<{ path: string; message: string }> };
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  if (error instanceof ZodError) {
    return { ok: false, error: { code: "validation_failed", message: "Check the highlighted fields.", details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };
  }
  if (error instanceof ForbiddenError) return { ok: false, error: { code: "forbidden", message: "You do not have permission to do that." } };
  if (error instanceof NotFoundError) return { ok: false, error: { code: "not_found", message: error.message } };
  if (error instanceof ValidationError) return { ok: false, error: { code: "validation_failed", message: error.message, details: error.details } };
  if (error instanceof ConflictError) return { ok: false, error: { code: "conflict", message: error.message } };
  // Next.js redirect and notFound errors must propagate.
  if (error && typeof error === "object" && "digest" in error) throw error;
  console.error("[action]", error);
  return { ok: false, error: { code: "internal", message: "Something went wrong. Try again." } };
}

export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
}
