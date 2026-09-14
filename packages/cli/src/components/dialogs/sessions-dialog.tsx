import { useNavigate } from "react-router";

import { useSessions } from "../../providers/sessions/index.tsx";
import { DialogSearchList, type SearchItem } from "../dialog-search-list.tsx";

/** "3m ago" - precise enough for a session list, no dependency needed. */
function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000);

  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SessionsDialog({ onClose }: { onClose: () => void }) {
  const { sessions } = useSessions();
  const navigate = useNavigate();

  const items: SearchItem[] = sessions.map((session) => ({
    id: session.id,
    name: session.title,
    description: `${session.messageCount} message${
      session.messageCount === 1 ? "" : "s"
    } - ${session.model} - ${relativeTime(session.updatedAt)}`,
    // The model is searchable without cluttering the row.
    keywords: session.model,
  }));

  return (
    <DialogSearchList
      items={items}
      emptyLabel="No sessions yet. Use /new to start one."
      placeholder="Search sessions..."
      onClose={onClose}
      onSelect={(item) => {
        onClose();
        navigate(`/session/${item.id}`);
      }}
    />
  );
}
