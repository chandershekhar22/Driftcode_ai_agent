import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getPrisma } from "@driftcode/database";
import { createMessageSchema, createSessionSchema } from "@driftcode/shared";

import { validate } from "../lib/validator.ts";
import {
  serializeMessage,
  serializeSession,
  serializeSessionSummary,
} from "../lib/serialize.ts";
import { requireDatabase } from "../middleware/require-database.ts";

/** First line of a message, trimmed to something that fits a list row. */
function titleFrom(content: string): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) return "New session";
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 59)}...`;
}

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

    // One transaction: the list is ordered by updatedAt, so a stored message
    // whose session was not touched would sort the session to the wrong place.
    // The touch uses the message's own timestamp rather than a second clock
    // reading, so a session is never marked older than its newest message.
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          sessionId,
          role: input.role,
          content: input.content,
        },
      });

      await tx.session.update({
        where: { id: sessionId },
        data: {
          // The first user message names the session.
          ...(session.title === "New session" && input.role === "user"
            ? { title: titleFrom(input.content) }
            : {}),
          updatedAt: created.createdAt,
        },
      });

      return created;
    });

    return c.json(serializeMessage(message), 201);
  });
