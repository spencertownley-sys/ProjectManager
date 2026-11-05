import { z } from "zod";
import { withApi, requireId } from "@/lib/api/handler";
import { editComment, deleteComment, extractText } from "@/lib/services/tasks";
import { richText } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const patch = z.object({ body: richText.optional(), text: z.string().max(20000).optional() });

export const PATCH = withApi(async ({ ctx, params, body }) => {
  const id = requireId(params.id, "id");
  const input = patch.parse(await body());
  const doc = input.body ?? (input.text !== undefined ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: input.text }] }] } : undefined);
  if (!doc) return { id };
  return editComment(ctx, { id, body: doc, bodyText: extractText(doc) });
});

export const DELETE = withApi(async ({ ctx, params }) => {
  await deleteComment(ctx, requireId(params.id, "id"));
  return null;
});
