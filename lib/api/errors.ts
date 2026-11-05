import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/auth/permissions";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/services/context";

/** Error contract of the public API (docs/07 section 2). */

export type ApiErrorCode = "unauthorized" | "forbidden" | "not_found" | "validation_failed" | "conflict" | "rate_limited" | "dependency_cycle" | "internal";

const statusByCode: Record<ApiErrorCode, number> = { unauthorized: 401, forbidden: 403, not_found: 404, validation_failed: 422, conflict: 409, rate_limited: 429, dependency_cycle: 422, internal: 500 };

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details: Array<{ path: string; message: string }> = [],
    readonly headers: Record<string, string> = {},
    readonly current?: unknown,
  ) {
    super(message);
  }
  get status() {
    return statusByCode[this.code];
  }
}

export type ApiErrorBody = { error: { code: ApiErrorCode; message: string; details?: Array<{ path: string; message: string }>; request_id: string; current?: unknown } };

/** Maps anything thrown by a service or handler to the error contract. Unknown errors are logged and hidden. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) return new ApiError("validation_failed", "The request body or query is invalid.", error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  if (error instanceof ForbiddenError) return new ApiError("forbidden", error.message || "The key does not allow this.");
  if (error instanceof NotFoundError) return new ApiError("not_found", error.message);
  if (error instanceof ValidationError) {
    if (/loop|cycle|circular/i.test(error.message)) return new ApiError("dependency_cycle", error.message, error.details);
    return new ApiError("validation_failed", error.message, error.details);
  }
  if (error instanceof ConflictError) return new ApiError("conflict", error.message);
  console.error("[api]", error);
  return new ApiError("internal", "Something went wrong.");
}

export function errorResponse(error: ApiError, requestId: string): Response {
  const body: ApiErrorBody = { error: { code: error.code, message: error.message, request_id: requestId } };
  if (error.details.length) body.error.details = error.details;
  if (error.current !== undefined) body.error.current = error.current;
  return Response.json(body, { status: error.status, headers: { "content-type": "application/json; charset=utf-8", "x-request-id": requestId, ...error.headers } });
}
