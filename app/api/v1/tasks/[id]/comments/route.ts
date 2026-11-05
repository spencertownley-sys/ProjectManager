import { withApi } from "@/lib/api/handler";
import { getTaskDetail, addComment, extractText } from "@/lib/services/tasks";
import { addCommentInput } from "@/lib/validation/task";
import { commentObject } from "@/lib/api/serialize";
import { resolveTaskId } from "@/lib/api/tasks";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params, today }) => {
  const detail = await getTaskDetail(ctx, params.id, today);
  return { data: detail.comments.map(commentObject), nextCursor: null };
});

/** Accepts a Tiptap `body` document or plain `text`. */
export const POST = withApi(async ({ ctx, params, body, today }) => {
  const taskId = await resolveTaskId(ctx, params.id);
  const raw = await body();
  const doc = raw.body ?? (typeof raw.text === "string" ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: raw.text }] }] } : undefined);
  const input = addCommentInput.parse({ ...raw, taskId, body: doc, bodyText: raw.bodyText ?? (doc ? extractText(doc) : "") });
  const created = await addComment(ctx, input);
  const detail = await getTaskDetail(ctx, taskId, today);
  const found = detail.comments.find((c) => c.id === (created as { id: string }).id);
  return found ? commentObject(found) : created;
});
