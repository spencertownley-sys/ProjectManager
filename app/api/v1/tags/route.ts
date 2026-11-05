import { withApi } from "@/lib/api/handler";
import { listTags, createTag } from "@/lib/services/workspaces";
import { tagInput } from "@/lib/validation/settings";
import { tagObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx }) => ({ data: (await listTags(ctx)).map(tagObject), nextCursor: null }));

export const POST = withApi(async ({ ctx, body }) => tagObject(await createTag(ctx, tagInput.parse(await body()))));
