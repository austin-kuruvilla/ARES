import type { JsonObject } from "@/lib/arc-memory";

export class ArcHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function readBoundedJson(request: Request, maxBytes = 16_384): Promise<JsonObject> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ArcHttpError(413, `Request body must be ${maxBytes} bytes or smaller`);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ArcHttpError(413, `Request body must be ${maxBytes} bytes or smaller`);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ArcHttpError(400, "Request body must be valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ArcHttpError(400, "Request body must be a JSON object");
  }
  return value as JsonObject;
}

export function boundedString(
  value: unknown,
  field: string,
  options: { required?: boolean; min?: number; max: number; pattern?: RegExp },
) {
  if (value == null && !options.required) return "";
  if (typeof value !== "string") throw new ArcHttpError(400, `${field} must be a string`);
  const trimmed = value.trim();
  const min = options.min ?? (options.required ? 1 : 0);
  if (trimmed.length < min || trimmed.length > options.max) {
    throw new ArcHttpError(
      400,
      `${field} must contain between ${min} and ${options.max} characters`,
    );
  }
  if (options.pattern && !options.pattern.test(trimmed)) {
    throw new ArcHttpError(400, `${field} contains unsupported characters`);
  }
  return trimmed;
}

export function boundedTags(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 12) {
    throw new ArcHttpError(400, "tags must be an array containing at most 12 items");
  }
  return [
    ...new Set(
      value.map((tag, index) =>
        boundedString(tag, `tags[${index}]`, {
          required: true,
          max: 40,
          pattern: /^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/,
        }).toLowerCase(),
      ),
    ),
  ];
}

export function asJsonObject(value: unknown, field = "value"): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ArcHttpError(500, `${field} is not a valid object`);
  }
  return value as JsonObject;
}

export function assertValidDecisionBundle(
  bundle: unknown,
  validate: (candidate: unknown) => { valid: boolean; errors?: string[]; warnings?: string[] },
): JsonObject {
  const object = asJsonObject(bundle, "DecisionBundle");
  const validation = validate(object);
  if (!validation?.valid) {
    throw new ArcHttpError(
      422,
      "DecisionBundle failed evidence and citation validation",
      validation?.errors ?? ["Unknown validation error"],
    );
  }
  return object;
}

export function jsonError(error: unknown) {
  if (error instanceof ArcHttpError) {
    return Response.json(
      { error: error.message, details: error.details ?? undefined },
      { status: error.status },
    );
  }

  const declaredStatus =
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number" &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : null;
  if (declaredStatus) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "ARES request was rejected",
      },
      { status: declaredStatus },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected ARES service error";
  const status =
    message === "action_not_found"
      ? 404
      : message === "idempotency_key_conflict" ||
          message === "action_selection_conflict" ||
          message === "action_completion_conflict" ||
          message === "run_id_conflict"
        ? 409
        : 500;
  const publicMessage =
    status === 500 ? "ARES could not complete this request" : message.replaceAll("_", " ");
  return Response.json({ error: publicMessage }, { status });
}

export const safeIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
