import { useCommands } from "../command-menu/commands.tsx";
import { DialogSearchList, type SearchItem } from "../dialog-search-list.tsx";

/**
 * The command menu, as a dialog.
 *
 * Screens with a prompt show the menu inline under what you are typing. The
 * session list has no prompt to type into, so there it opens here instead -
 * same commands, same filtering, just a different way in.
 */
export function CommandsDialog({ onClose }: { onClose: () => void }) {
  const commands = useCommands();

  const items: SearchItem[] = commands.map((command) => ({
    id: command.name,
    name: `/${command.name}`,
    description: command.description,
    keywords: command.keywords,
  }));

  return (
    <DialogSearchList
      items={items}
      placeholder="Search commands..."
      onClose={onClose}
      onSelect={(item) => {
        onClose();
        commands.find((command) => command.name === item.id)?.run();
      }}
    />
  );
}
