import { withApi } from "@/lib/api/handler";
import { listLibraryFields, createField } from "@/lib/services/fields";
import { createFieldInput } from "@/lib/validation/settings";
import { fieldObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx }) => ({ data: (await listLibraryFields(ctx)).map(fieldObject), nextCursor: null }));

export const POST = withApi(async ({ ctx, body }) => fieldObject(await createField(ctx, createFieldInput.parse({ ...(await body()), projectId: null }))));
