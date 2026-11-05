import { withApi, requireId } from "@/lib/api/handler";
import { replayDelivery } from "@/lib/services/webhooks";
import { ApiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export const POST = withApi(async ({ ctx, params }) => {
  const deliveryId = Number(params.deliveryId);
  if (!Number.isInteger(deliveryId) || deliveryId <= 0) throw new ApiError("validation_failed", "deliveryId must be a positive integer.");
  return replayDelivery(ctx, requireId(params.id, "id"), deliveryId);
}, { status: 202 });
