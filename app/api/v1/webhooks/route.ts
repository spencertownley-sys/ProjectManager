import { withApi } from "@/lib/api/handler";
import { listWebhooks, createWebhook } from "@/lib/services/webhooks";
import { createWebhookInput } from "@/lib/validation/webhooks";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx }) => ({ data: await listWebhooks(ctx), nextCursor: null }));

/** Returns the secret once, alongside the webhook. */
export const POST = withApi(async ({ ctx, body }) => {
  const { webhook, secret } = await createWebhook(ctx, createWebhookInput.parse(await body()));
  return { ...webhook, secret };
});
