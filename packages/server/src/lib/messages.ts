import type { Message, MessageRole } from "@driftcode/database";
import type { getPrisma } from "@driftcode/database";
import type { ToolCall } from "@driftcode/shared";

type Prisma = ReturnType<typeof getPrisma>;

/** First line of a message, trimmed to something that fits a list row. */
export function titleFrom(content: string): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) return "New session";
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 59)}...`;
}

export interface AppendOptions {
  /** On an assistant message: the tool calls it made. */
  toolCalls?: ToolCall[];
  /** On a tool message: which call it answers. */
  toolCallId?: string;
  toolName?: string;
}

/**
 * Store a message and touch its session, atomically.
 *
 * The session list is ordered by updatedAt, so a stored message whose session
 * was not touched would sort the session to the wrong place. The touch uses the
 * message's own timestamp rather than a second clock reading, so a session is
 * never marked older than its newest message.
 */
export async function appendMessage(
  prisma: Prisma,
  sessionId: string,
  role: MessageRole,
  content: string,
  options: AppendOptions = {},
): Promise<Message> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { title: true },
    });

    const created = await tx.message.create({
      data: {
        sessionId,
        role,
        content,
        // Prisma types Json loosely; the shape is re-validated when read back.
        ...(options.toolCalls && options.toolCalls.length > 0
          ? { toolCalls: options.toolCalls as never }
          : {}),
        ...(options.toolCallId ? { toolCallId: options.toolCallId } : {}),
        ...(options.toolName ? { toolName: options.toolName } : {}),
      },
    });

    await tx.session.update({
      where: { id: sessionId },
      data: {
        // The first user message names the session.
        ...(session?.title === "New session" && role === "user"
          ? { title: titleFrom(content) }
          : {}),
        updatedAt: created.createdAt,
      },
    });

    return created;
  });
}
