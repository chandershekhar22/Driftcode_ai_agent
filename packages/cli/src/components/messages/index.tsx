import type { Message } from "@driftcode/shared";

import { AssistantMessage } from "./assistant-message.tsx";
import { ToolRunView } from "./tool-run.tsx";
import { UserMessage } from "./user-message.tsx";

/** Picks the right renderer for a message. Keeps the transcript a flat map. */
export function MessageView({ message }: { message: Message }) {
  if (message.role === "user") {
    return <UserMessage content={message.content} />;
  }

  // Tool results are already summarised live as the agent runs them; replaying
  // their full output when a transcript is reloaded would bury the reply.
  if (message.role === "tool") {
    return <ToolMessage name={message.toolName ?? "tool"} />;
  }

  return <AssistantMessage content={message.content} />;
}

function ToolMessage({ name }: { name: string }) {
  return (
    <box flexDirection="row" flexShrink={0}>
      <text>{`+ ${name}`}</text>
    </box>
  );
}

export { AssistantMessage, ToolRunView, UserMessage };
