import { withApi, requireId } from "@/lib/api/handler";
import { listProjectFields, createField, attachField } from "@/lib/services/fields";
import { createFieldInput } from "@/lib/validation/settings";
import { fieldObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params }) => {
  const { attached, library } = await listProjectFields(ctx, requireId(params.id, "id"));
  return { data: attached.map((f) => ({ ...fieldObject(f), position: f.position })), library: library.map(fieldObject), nextCursor: null };
});

export const POST = withApi(async ({ ctx, params, body }) => {
  const projectId = requireId(params.id, "id");
  const input = await body();
  if (typeof input.fieldId === "string") {
    await attachField(ctx, projectId, requireId(input.fieldId, "field_id"));
    const { attached } = await listProjectFields(ctx, projectId);
    const field = attached.find((f) => f.id === input.fieldId);
    return field ? fieldObject(field) : { id: input.fieldId };
  }
  const field = await createField(ctx, createFieldInput.parse({ ...input, projectId }));
  return fieldObject(field);
});
