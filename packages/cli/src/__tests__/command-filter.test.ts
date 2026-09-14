import { describe, expect, test } from "bun:test";

import {
  filterCommands,
  isCommandDraft,
  queryFromDraft,
} from "../components/command-menu/filter-commands.ts";
import type { Command } from "../components/command-menu/types.ts";
import { filterItems } from "../components/dialog-search-list.tsx";

const noop = () => {};

const COMMANDS: Command[] = [
  { name: "new", description: "Start a new session", run: noop },
  { name: "sessions", description: "Browse past sessions", run: noop },
  { name: "models", description: "Choose the model", keywords: "opus", run: noop },
  { name: "theme", description: "Change the colour theme", run: noop },
];

describe("isCommandDraft", () => {
  test("a leading slash opens the menu", () => {
    expect(isCommandDraft("/")).toBe(true);
    expect(isCommandDraft("/mod")).toBe(true);
  });

  test("ordinary text does not", () => {
    expect(isCommandDraft("")).toBe(false);
    expect(isCommandDraft("fix the bug")).toBe(false);
  });

  test("a slash mid-sentence does not", () => {
    expect(isCommandDraft("what is in /etc")).toBe(false);
  });

  test("a question that merely starts with a slash path does not stay open", () => {
    // Once there is a space it is prose, not a command.
    expect(isCommandDraft("/etc/hosts is what")).toBe(false);
  });

  test("queryFromDraft strips the slash", () => {
    expect(queryFromDraft("/models")).toBe("models");
    expect(queryFromDraft("/")).toBe("");
  });
});

describe("filterCommands", () => {
  test("an empty query lists everything", () => {
    expect(filterCommands(COMMANDS, "/")).toHaveLength(4);
  });

  test("a name match comes first, even when a description also matches", () => {
    // "/sess" also appears in "Start a new session", which is intended -
    // but the command actually named sessions has to lead.
    const names = filterCommands(COMMANDS, "/sess").map((c) => c.name);

    expect(names[0]).toBe("sessions");
    expect(names).toContain("new");
  });

  test("matches on description", () => {
    expect(filterCommands(COMMANDS, "/colour").map((c) => c.name)).toEqual([
      "theme",
    ]);
  });

  test("matches on hidden keywords", () => {
    expect(filterCommands(COMMANDS, "/opus").map((c) => c.name)).toEqual([
      "models",
    ]);
  });

  test("a name match outranks a description match", () => {
    // "new" is in the name of /new and the description of /sessions... make
    // sure the command actually called "new" comes first.
    const names = filterCommands(COMMANDS, "/new").map((c) => c.name);
    expect(names[0]).toBe("new");
  });

  test("no match returns nothing rather than everything", () => {
    expect(filterCommands(COMMANDS, "/zzzz")).toEqual([]);
  });

  test("matching ignores case", () => {
    expect(filterCommands(COMMANDS, "/MODELS").map((c) => c.name)).toEqual([
      "models",
    ]);
  });
});

describe("filterItems", () => {
  const items = [
    { id: "1", name: "Fix login", description: "3 messages", keywords: "opus" },
    { id: "2", name: "Refactor auth", description: "1 message" },
  ];

  test("an empty query keeps everything", () => {
    expect(filterItems(items, "")).toHaveLength(2);
  });

  test("searches name, description and keywords alike", () => {
    expect(filterItems(items, "login").map((i) => i.id)).toEqual(["1"]);
    expect(filterItems(items, "1 message").map((i) => i.id)).toEqual(["2"]);
    expect(filterItems(items, "opus").map((i) => i.id)).toEqual(["1"]);
  });

  test("whitespace alone is not a filter", () => {
    expect(filterItems(items, "   ")).toHaveLength(2);
  });
});
