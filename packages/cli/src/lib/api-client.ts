import { z } from "zod";
import {
  DEFAULT_API_URL,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  apiErrorSchema,
} from "@driftcode/shared";

export const apiUrl = process.env.DRIFT_API_URL ?? DEFAULT_API_URL;

/** Thrown for anything the CLI could not turn into a valid response: a
 *  non-2xx status, an unreachable server, or a body that failed its schema. */
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  /** Serialized as JSON. */
  body?: unknown;
}

/**
 * Fetch `path` and parse the body with `schema`.
 *
 * Everything the CLI receives goes through here so that a shape mismatch is
 * caught at the boundary, where we can name the route that broke, instead of
 * deep inside a component.
 */
export async function apiRequest<T extends z.ZodType>(
  path: string,
  schema: T,
  options: RequestOptions = {},
): Promise<z.infer<T>> {
  let response: Response;

  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        [PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiClientError(
      `Could not reach the driftcode server at ${apiUrl}. Is it running?`,
      "unreachable",
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiClientError(
      parsed.success ? parsed.data.error.message : response.statusText,
      parsed.success ? parsed.data.error.code : "unknown",
      response.status,
    );
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new ApiClientError(
      `The server's response to ${path} did not match what this client expects. ` +
        `You may need to update one side or the other.`,
      "schema_mismatch",
      response.status,
    );
  }

  return parsed.data;
}
