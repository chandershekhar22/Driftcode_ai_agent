import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { env } from "./lib/env.ts";
import { healthRoute } from "./routes/health.ts";
import { indexRoute } from "./routes/index-route.ts";
import { sessionsRoute } from "./routes/sessions.ts";

const app = new Hono();

/** Single place every error funnels through, so the CLI only ever has to
 *  understand one error shape. */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: `http_${err.status}`, message: err.message } },
      err.status,
    );
  }

  console.error("Unhandled server error:", err);
  return c.json(
    { error: { code: "internal_error", message: "Something went wrong." } },
    500,
  );
});

app.notFound((c) =>
  c.json(
    { error: { code: "not_found", message: `No route for ${c.req.path}` } },
    404,
  ),
);

app.route("/", indexRoute);
app.route("/health", healthRoute);
app.route("/sessions", sessionsRoute);

console.log(`driftcode server listening on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};

export type AppType = typeof app;
