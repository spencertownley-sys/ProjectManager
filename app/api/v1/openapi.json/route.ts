import { withApi } from "@/lib/api/handler";
import { buildOpenApi } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";

/** Public, no key needed. */
export const GET = withApi(async ({ req }) => {
  const url = new URL(req.url);
  return Response.json(buildOpenApi(`${process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`}/api/v1`), { headers: { "content-type": "application/json; charset=utf-8" } });
}, { auth: false });
