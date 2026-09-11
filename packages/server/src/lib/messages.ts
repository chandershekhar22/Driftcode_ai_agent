import type { Message, MessageRole } from "@driftcode/database";
import type { getPrisma } from "@driftcode/database";

type Prisma = ReturnType<typeof getPrisma>;

/** First line of a message, trimmed to something that fits a list row. */
export function titleFrom(content: string): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) return "New session";
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 59)}...`;
}

/**
 * Store a message and touch its session, atomically.
 *
 * The session list is ordered by updatedAt, so a stored message whose session
 * was not touched would sort the session to the wrong place. The touch uses the
 * message's own timestamp rather than a second clock reading, so a session is
 * never marked older than its newest message.
 *
 * Shared by the plain append route and the chat route, which stores two
 * messages per turn.
 */
export async function appendMessage(
  prisma: Prisma,
  sessionId: string,
  role: MessageRole,
  content: string,
): Promise<Message> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { title: true },
    });

    const created = await tx.message.create({
      data: { sessionId, role, content },
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
