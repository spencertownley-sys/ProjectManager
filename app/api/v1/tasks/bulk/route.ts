import { z } from "zod";
import { withApi } from "@/lib/api/handler";
import { updateTask } from "@/lib/services/tasks";
import { updateTaskInput } from "@/lib/validation/task";
import { uuid } from "@/lib/validation/common";
import { toApiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const input = z.object({ operations: z.array(z.object({ id: uuid, patch: z.record(z.string(), z.unknown()) })).min(1).max(500) });

/** Applies each patch in order and reports per operation results instead of failing the whole batch. */
export const POST = withApi(async ({ ctx, body }) => {
  const raw = await body();
  const parsed = input.parse(Array.isArray(raw.value) ? { operations: raw.value } : raw);
  const results: Array<{ id: string; ok: boolean; version?: number; error?: { code: string; message: string } }> = [];
  for (const op of parsed.operations) {
    try {
      const updated = await updateTask(ctx, updateTaskInput.parse({ ...op.patch, id: op.id }));
      results.push({ id: op.id, ok: true, version: updated.version });
    } catch (error) {
      const e = toApiError(error);
      results.push({ id: op.id, ok: false, error: { code: e.code, message: e.message } });
    }
  }
  return { results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}, { status: 200 });
