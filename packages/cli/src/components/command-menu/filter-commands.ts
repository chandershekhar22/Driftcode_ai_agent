import type { Command } from "./types.ts";

/**
 * Matching for the command menu.
 *
 * Deliberately simple substring matching rather than fuzzy scoring: with a
 * handful of commands, fuzzy matching mostly surprises people by ranking
 * something unexpected first.
 */

/** Strips the leading slash and whitespace from what the user typed. */
export function queryFromDraft(draft: string): string {
  return draft.startsWith("/") ? draft.slice(1).trimStart() : draft.trimStart();
}

export function filterCommands(
  commands: readonly Command[],
  draft: string,
): Command[] {
  const needle = queryFromDraft(draft).toLowerCase();
  if (needle.length === 0) return [...commands];

  const matches = commands.filter((command) =>
    `${command.name} ${command.description} ${command.keywords ?? ""}`
      .toLowerCase()
      .includes(needle),
  );

  // A name that starts with the query is what the user meant; anything else
  // matched on its description and belongs below.
  return matches.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;

    return aStarts - bStarts;
  });
}

/** True when the draft should open the menu at all. */
export function isCommandDraft(draft: string): boolean {
  // Only a leading slash, and only before a space - "/new" is a command,
  // "what does /etc do" is a question.
  return draft.startsWith("/") && !queryFromDraft(draft).includes(" ");
}
