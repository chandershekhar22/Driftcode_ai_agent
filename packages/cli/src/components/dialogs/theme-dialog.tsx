import { THEMES } from "../../theme.ts";
import { useTheme } from "../../providers/theme/index.tsx";
import { useToast } from "../../providers/toast/index.tsx";
import { DialogSearchList, type SearchItem } from "../dialog-search-list.tsx";

export function ThemeDialog({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const items: SearchItem[] = THEMES.map((entry) => ({
    id: entry.name,
    name: entry.name === theme.name ? `${entry.label} (current)` : entry.label,
    description:
      entry.name === "paper"
        ? "Light. For bright rooms and light terminals."
        : "Dark.",
  }));

  return (
    <DialogSearchList
      items={items}
      placeholder="Search themes..."
      onClose={onClose}
      onSelect={(item) => {
        setTheme(item.id);
        onClose();
        toast(`Theme: ${item.id}.`, "success");
      }}
    />
  );
}
