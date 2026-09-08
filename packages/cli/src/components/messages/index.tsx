import type { Message } from "../../providers/sessions/index.tsx";

import { AssistantMessage } from "./assistant-message.tsx";
import { UserMessage } from "./user-message.tsx";

/** Picks the right renderer for a message. Keeps the transcript a flat map. */
export function MessageView({ message }: { message: Message }) {
  if (message.role === "user") {
    return <UserMessage content={message.content} />;
  }

  return <AssistantMessage content={message.content} />;
}

export { AssistantMessage, UserMessage };
