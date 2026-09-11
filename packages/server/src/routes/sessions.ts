import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getPrisma } from "@driftcode/database";
import {
  createMessageSchema,
  createSessionSchema,
  updateSessionSchema,
} from "@driftcode/shared";

import { appendMessage } from "../lib/messages.ts";
import { allModels } from "../lib/models.ts";
import { validate } from "../lib/validator.ts";
import {
  serializeMessage,
  serializeSession,
  serializeSessionSummary,
} from "../lib/serialize.ts";
import { requireDatabase } from "../middleware/require-database.ts";

export const sessionsRoute = new Hono()
  .use("*", requireDatabase)

  .get("/", async (c) => {
    const rows = await getPrisma().session.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { _count: { select: { messages: true } } },
    });

    return c.json({
      sessions: rows.map((row) =>
        serializeSessionSummary(row, row._count.messages),
      ),
    });
  })

  .post("/", validate("json", createSessionSchema), async (c) => {
    const input = c.req.valid("json");

    const session = await getPrisma().session.create({
      data: {
        model: input.model,
        cwd: input.cwd,
        ...(input.title ? { title: input.title } : {}),
      },
      include: { messages: true },
    });

    return c.json(serializeSession(session), 201);
  })

  .get("/:id", async (c) => {
    const session = await getPrisma().session.findUnique({
      where: { id: c.req.param("id") },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!session) {
      throw new HTTPException(404, { message: "No session with that id." });
    }

    return c.json(serializeSession(session));
  })


  .patch("/:id", validate("json", updateSessionSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    // Nothing to change is a no-op, not an error - the CLI sends whichever
    // fields the user actually touched.
    if (input.model === undefined && input.title === undefined) {
      const current = await getPrisma().session.findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });

      if (!current) {
        throw new HTTPException(404, { message: "No session with that id." });
      }

      return c.json(serializeSession(current));
    }

    if (
      input.model !== undefined &&
      !allModels().some((spec) => spec.id === input.model)
    ) {
      throw new HTTPException(400, {
        message: `"${input.model}" is not a model this server knows about.`,
      });
    }

    const updated = await getPrisma()
      .session.update({
        where: { id },
        data: {
          ...(input.model !== undefined ? { model: input.model } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
        },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
      .catch(() => null);

    if (!updated) {
      throw new HTTPException(404, { message: "No session with that id." });
    }

    return c.json(serializeSession(updated));
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");

    // Messages go with it - the relation is onDelete: Cascade.
    const deleted = await getPrisma()
      .session.delete({ where: { id } })
      .catch(() => null);

    if (!deleted) {
      throw new HTTPException(404, { message: "No session with that id." });
    }

    return c.json({ id, deleted: true as const });
  })

  .post("/:id/messages", validate("json", createMessageSchema), async (c) => {
    const sessionId = c.req.param("id");
    const input = c.req.valid("json");
    const prisma = getPrisma();

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, title: true },
    });

    if (!session) {
      throw new HTTPException(404, { message: "No session with that id." });
    }

    const message = await appendMessage(
      prisma,
      sessionId,
      input.role,
      input.content,
    );

    return c.json(serializeMessage(message), 201);
  });
