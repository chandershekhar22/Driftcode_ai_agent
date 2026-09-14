import { useParams } from "react-router";
import type { AgentMode } from "@driftcode/shared";

import { describeError, useSessions } from "../../providers/sessions/index.tsx";
import { useToast } from "../../providers/toast/index.tsx";
import { DialogSearchList, type SearchItem } from "../dialog-search-list.tsx";

/**
 * Pick what the agent is allowed to do.
 *
 * The same switch as shift+tab, reachable by name for anyone who would rather
 * read the difference than remember a keybinding.
 */
export function AgentsDialog({ onClose }: { onClose: () => void }) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { sessions, client, refresh } = useSessions();
  const { toast } = useToast();

  const current = sessions.find((session) => session.id === sessionId)?.mode;

  const items: SearchItem[] = [
    {
      id: "plan",
      name: current === "plan" ? "Plan (current)" : "Plan",
      description: "Read-only. Investigates and proposes, changes nothing.",
      keywords: "read only safe investigate",
    },
    {
      id: "build",
      name: current === "build" ? "Build (current)" : "Build",
      description:
        "Can write files and run commands. Each change asks before running.",
      keywords: "write edit run command execute",
    },
  ];

  const choose = async (item: SearchItem) => {
    onClose();

    if (!sessionId) {
      toast("Open a session first - the mode belongs to a session.", "warning");
      return;
    }

    try {
      await client.update(sessionId, { mode: item.id as AgentMode });
      await refresh();
      toast(`Switched to ${item.id} mode.`, "success");
    } catch (cause) {
      toast(describeError(cause), "danger");
    }
  };

  return (
    <DialogSearchList
      items={items}
      placeholder="Search modes..."
      onClose={onClose}
      onSelect={(item) => void choose(item)}
    />
  );
}
