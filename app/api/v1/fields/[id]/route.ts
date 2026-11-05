import { withApi, requireId } from "@/lib/api/handler";
import { updateField, deleteField } from "@/lib/services/fields";
import { updateFieldInput } from "@/lib/validation/settings";
import { fieldObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const PATCH = withApi(async ({ ctx, params, body }) => fieldObject(await updateField(ctx, updateFieldInput.parse({ ...(await body()), id: requireId(params.id, "id") }))));

export const DELETE = withApi(async ({ ctx, params }) => {
  await deleteField(ctx, requireId(params.id, "id"));
  return null;
});
