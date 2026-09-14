import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { User } from "@driftcode/database";
import { getPrisma } from "@driftcode/database";
import { chatRequestSchema, continueChatSchema } from "@driftcode/shared";

import { runChatTurn, toNdjsonStream } from "../lib/chat-stream.ts";
import { buildSafeHistory } from "../lib/history.ts";
import { appendMessage } from "../lib/messages.ts";
import { ModelUnavailableError, resolveLanguageModel } from "../lib/models.ts";
import { creditsForUsage } from "../lib/credits.ts";
import { recordUsage } from "../lib/polar.ts";
import { serializeMessage } from "../lib/serialize.ts";
import { validate } from "../lib/validator.ts";
import { requireAuth } from "../middleware/require-auth.ts";
import { requireCredits } from "../middleware/require-credits.ts";
import { requireDatabase } from "../middleware/require-database.ts";
import { buildSystemPrompt } from "../system-prompt.ts";

const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
  // Proxies that buffer would defeat the point of streaming.
  "x-accel-buffering": "no",
} as const;

/** Loads one of this user's sessions with its transcript, or 404s. */
async function loadSession(sessionId: string, userId: string) {
  const session = await getPrisma().session.findFirst({
    // Another user's session reads as missing rather than forbidden - the API
    // should not confirm an id it will not serve.
    where: { id: sessionId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) {
    throw new HTTPException(404, { message: "No session with that id." });
  }

  return session;
}

export const chatRoute = new Hono<{ Variables: { user: User } }>()
  .use("*", requireDatabase)
  .use("*", requireAuth)
  // Checked before the model runs, so an empty balance is a clean refusal
  // rather than a reply that stops halfway.
  .use("*", requireCredits)

  .post("/:id/chat", validate("json", chatRequestSchema), async (c) => {
    const sessionId = c.req.param("id");
    const { content } = c.req.valid("json");
    const prisma = getPrisma();

    const session = await loadSession(sessionId, c.get("user").id);

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
      onUsage: (usage) => {
        // After the turn, never before: charging for work that then failed is
        // worse than occasionally finishing a turn on an empty balance. Errors
        // are swallowed - a metering failure must not break a reply.
        void recordUsage(
          c.get("user"),
          creditsForUsage(resolved.spec, usage),
        ).catch(() => {});
      },
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

    const session = await loadSession(sessionId, c.get("user").id);

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
    const updated = await loadSession(sessionId, c.get("user").id);

    const events = runChatTurn({
      prisma,
      sessionId,
      model: resolved.model,
      spec: resolved.spec,
      mode: session.mode,
      system: buildSystemPrompt({ cwd: session.cwd, mode: session.mode }),
      messages: buildSafeHistory(updated.messages),
      onUsage: (usage) => {
        void recordUsage(
          c.get("user"),
          creditsForUsage(resolved.spec, usage),
        ).catch(() => {});
      },
      // No user message this time: the turn is a continuation, not a new ask.
    });

    return new Response(toNdjsonStream(events), { headers: NDJSON_HEADERS });
  });
