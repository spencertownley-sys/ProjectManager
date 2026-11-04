import type { ActionResult } from "@/lib/actions/result";

/** Awaits a server action and turns a thrown error (network, redirect, unexpected) into a failed result so callers can toast it. */
export async function call<T>(promise: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong. Try again.";
    return { ok: false, error: { code: "internal", message: /NEXT_REDIRECT/.test(message) ? "Your session has expired. Sign in again." : message } };
  }
}
