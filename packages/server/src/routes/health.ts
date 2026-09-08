import { Hono } from "hono";
import { PROTOCOL_VERSION, type Health } from "@driftcode/shared";

import { version } from "../../package.json" with { type: "json" };

const startedAt = Date.now();

export const healthRoute = new Hono().get("/", (c) => {
  const body: Health = {
    status: "ok",
    service: "driftcode-server",
    version,
    protocol: PROTOCOL_VERSION,
    uptime: Math.round((Date.now() - startedAt) / 1000),
  };

  return c.json(body);
});
