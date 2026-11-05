import { withApi, requireId } from "@/lib/api/handler";
import { updateWebhook, deleteWebhook } from "@/lib/services/webhooks";
import { updateWebhookInput } from "@/lib/validation/webhooks";

export const dynamic = "force-dynamic";

export const PATCH = withApi(async ({ ctx, params, body }) => updateWebhook(ctx, updateWebhookInput.parse({ ...(await body()), id: requireId(params.id, "id") })));

export const DELETE = withApi(async ({ ctx, params }) => {
  await deleteWebhook(ctx, requireId(params.id, "id"));
  return null;
});
