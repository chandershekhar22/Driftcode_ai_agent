import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getPrisma } from "@driftcode/database";
import { chatRequestSchema } from "@driftcode/shared";

import { runChatTurn, toNdjsonStream } from "../lib/chat-stream.ts";
import { appendMessage } from "../lib/messages.ts";
import { ModelUnavailableError, resolveLanguageModel } from "../lib/models.ts";
import { serializeMessage } from "../lib/serialize.ts";
import { validate } from "../lib/validator.ts";
import { requireDatabase } from "../middleware/require-database.ts";
import { buildSystemPrompt } from "../system-prompt.ts";

export const chatRoute = new Hono()
  .use("*", requireDatabase)

  .post("/:id/chat", validate("json", chatRequestSchema), async (c) => {
    const sessionId = c.req.param("id");
    const { content } = c.req.valid("json");
    const prisma = getPrisma();

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!session) {
      throw new HTTPException(404, { message: "No session with that id." });
    }

    // Resolved before anything is stored, so a missing key is an ordinary
    // error response rather than an error event inside a 200 stream - and the
    // user's message is not saved for a turn that could never run.
    let resolved;
    try {
      resolved = resolveLanguageModel(session.model);
    } catch (error) {
      if (error instanceof ModelUnavailableError) {
        return c.json(
          { error: { code: error.code, message: error.message } },
          400,
        );
      }
      throw error;
    }

    // Stored before streaming: if the model call fails, the user's message is
    // still in the transcript rather than silently lost.
    const userMessage = await appendMessage(prisma, sessionId, "user", content);

    const events = runChatTurn({
      prisma,
      sessionId,
      model: resolved.model,
      spec: resolved.spec,
      system: buildSystemPrompt({ cwd: session.cwd }),
      messages: [
        ...session.messages.map((message) => ({
          // The transcript has no system messages today; if one appears,
          // showing it to the model as assistant text is the safe reading.
          role: message.role === "user" ? ("user" as const) : ("assistant" as const),
          content: message.content,
        })),
        { role: "user" as const, content },
      ],
      userMessage: serializeMessage(userMessage),
    });

    return new Response(toNdjsonStream(events), {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        // Proxies that buffer would defeat the point of streaming.
        "x-accel-buffering": "no",
      },
    });
  });
