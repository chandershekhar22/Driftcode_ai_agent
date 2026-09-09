import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/**
 * zValidator with our error shape.
 *
 * Its default handler returns a raw ZodError, which does not match
 * `apiErrorSchema` - the CLI would fail to parse it and report "unknown"
 * instead of telling the user what was actually wrong with their input.
 */
export function validate<T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (result.success) return;

    const issue = result.error.issues[0];
    const path = issue?.path.join(".");

    return c.json(
      {
        error: {
          code: "invalid_request",
          message: issue
            ? `${path ? `${path}: ` : ""}${issue.message}`
            : "The request body was not valid.",
        },
      },
      400,
    );
  });
}
