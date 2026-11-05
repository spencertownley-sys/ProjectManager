"use server";

import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current";
import * as webhooks from "@/lib/services/webhooks";
import { createWebhookInput, updateWebhookInput } from "@/lib/validation/webhooks";
import { uuid } from "@/lib/validation/common";
import { run } from "./result";

const slug = z.string().min(1);

export async function listWebhooksAction(workspaceSlug: string) {
  return run(async () => webhooks.listWebhooks(await getCurrentSession(slug.parse(workspaceSlug))));
}

export async function createWebhookAction(workspaceSlug: string, input: unknown) {
  return run(async () => webhooks.createWebhook(await getCurrentSession(slug.parse(workspaceSlug)), createWebhookInput.parse(input)));
}

export async function updateWebhookAction(workspaceSlug: string, input: unknown) {
  return run(async () => webhooks.updateWebhook(await getCurrentSession(slug.parse(workspaceSlug)), updateWebhookInput.parse(input)));
}

export async function deleteWebhookAction(workspaceSlug: string, id: string) {
  return run(async () => webhooks.deleteWebhook(await getCurrentSession(slug.parse(workspaceSlug)), uuid.parse(id)));
}

export async function listDeliveriesAction(workspaceSlug: string, webhookId: string, before?: number | null) {
  return run(async () => webhooks.listDeliveries(await getCurrentSession(slug.parse(workspaceSlug)), uuid.parse(webhookId), { limit: 50, before: before ?? null }));
}

export async function replayDeliveryAction(workspaceSlug: string, webhookId: string, deliveryId: number) {
  return run(async () => webhooks.replayDelivery(await getCurrentSession(slug.parse(workspaceSlug)), uuid.parse(webhookId), z.number().int().positive().parse(deliveryId)));
}
