import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getPrisma } from "@driftcode/database";
import { chatRequestSchema, continueChatSchema } from "@driftcode/shared";

import { runChatTurn, toNdjsonStream } from "../lib/chat-stream.ts";
import { buildSafeHistory } from "../lib/history.ts";
import { appendMessage } from "../lib/messages.ts";
import { ModelUnavailableError, resolveLanguageModel } from "../lib/models.ts";
import { serializeMessage } from "../lib/serialize.ts";
import { validate } from "../lib/validator.ts";
import { requireDatabase } from "../middleware/require-database.ts";
import { buildSystemPrompt } from "../system-prompt.ts";

const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
  // Proxies that buffer would defeat the point of streaming.
  "x-accel-buffering": "no",
} as const;

/** Loads a session with its transcript, or 404s. */
async function loadSession(sessionId: string) {
  const session = await getPrisma().session.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) {
    throw new HTTPException(404, { message: "No session with that id." });
  }

  return session;
}

export const chatRoute = new Hono()
  .use("*", requireDatabase)

  .post("/:id/chat", validate("json", chatRequestSchema), async (c) => {
    const sessionId = c.req.param("id");
    const { content } = c.req.valid("json");
    const prisma = getPrisma();

    const session = await loadSession(sessionId);

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
      mode: session.mode,
      system: buildSystemPrompt({ cwd: session.cwd, mode: session.mode }),
      messages: [
        ...buildSafeHistory(session.messages),
        { role: "user", content },
      ],
      userMessage: serializeMessage(userMessage),
    });

    return new Response(toNdjsonStream(events), { headers: NDJSON_HEADERS });
  })

  /**
   * Continue a turn whose tool calls the CLI has now run.
   *
   * The results are stored first so that the history sent to the model
   * contains them, which is what lets the agent see what its own tools
   * returned instead of asking for them again.
   */
  .post("/:id/tools", validate("json", continueChatSchema), async (c) => {
    const sessionId = c.req.param("id");
    const { results } = c.req.valid("json");
    const prisma = getPrisma();

    const session = await loadSession(sessionId);

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

    for (const result of results) {
      await appendMessage(prisma, sessionId, "tool", result.output, {
        toolCallId: result.id,
        toolName: result.name,
      });
    }

    // Re-read so the history includes the results just written.
    const updated = await loadSession(sessionId);

    const events = runChatTurn({
      prisma,
      sessionId,
      model: resolved.model,
      spec: resolved.spec,
      mode: session.mode,
      system: buildSystemPrompt({ cwd: session.cwd, mode: session.mode }),
      messages: buildSafeHistory(updated.messages),
      // No user message this time: the turn is a continuation, not a new ask.
    });

    return new Response(toNdjsonStream(events), { headers: NDJSON_HEADERS });
  });
