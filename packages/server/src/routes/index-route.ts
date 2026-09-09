import { Hono } from "hono";

import { version } from "../../package.json" with { type: "json" };

/**
 * Service index. Not used by the CLI - it exists so that a human who opens the
 * server in a browser sees what this is and where to go, instead of a 404.
 */
export const indexRoute = new Hono().get("/", (c) =>
  c.json({
    service: "driftcode-server",
    version,
    message: "The API for the driftcode terminal agent. Nothing to see here - use the CLI.",
    routes: {
      "GET /health": "liveness, version, protocol and database check",
      "GET /sessions": "list recent sessions",
      "POST /sessions": "start a session",
      "GET /sessions/:id": "one session with its transcript",
      "DELETE /sessions/:id": "delete a session and its messages",
      "POST /sessions/:id/messages": "append a message",
    },
  }),
);
