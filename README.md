# driftcode

A terminal-based AI coding agent. Plan, chat, and edit code inside your own
project from the command line, powered by Claude.

Built as a Bun workspace: a Hono API server owns the model conversation, and a
React/OpenTUI terminal client renders it and executes tools locally on your
machine - so file edits and shell commands never leave your computer.

## Stack

| Layer    | Choice                          |
| -------- | ------------------------------- |
| Runtime  | Bun                             |
| Terminal | OpenTUI + React                 |
| API      | Hono                            |
| Model    | Claude via the Vercel AI SDK    |
| Database | Postgres + Prisma               |
| Auth     | Clerk                           |
| Billing  | Polar                           |

## Packages

    packages/shared     types, zod schemas and the model catalog shared by both sides
    packages/database   Prisma schema and client
    packages/server     Hono API - owns model calls, sessions, auth, billing
    packages/cli        the terminal client - renders the UI, runs tools locally

## Getting started

    bun install
    cp .env.example .env      # then fill in the values

Set DATABASE_URL to a Postgres connection string (Neon has a free tier), then
create the tables:

    bun run --cwd packages/database db:migrate

Run the API server and the CLI in two terminals:

    bun run dev:server
    bun run dev:cli

## Status

Under active development, built chapter by chapter. See the chapter list in the
project notes.

## Keybindings

| Key      | Action              |
| -------- | ------------------- |
| `enter`  | Submit the prompt   |
| `ctrl+t` | Cycle the theme     |
| `ctrl+c` | Quit                |

## Themes

Three ship in the box - `midnight` (default), `ember`, and `paper`. Cycle with
`ctrl+t`, or pick one at startup:

    DRIFT_THEME=paper bun run dev:cli

Themes are plain colour maps in `packages/cli/src/theme.ts`; adding one is a
single entry in that file.

## Database

| Command | Description |
| ------- | ----------- |
| `bun run --cwd packages/database db:migrate` | Create and apply a migration |
| `bun run --cwd packages/database db:generate` | Regenerate the client after a schema edit |
| `bun run --cwd packages/database db:studio` | Browse the data |

Prisma 7 keeps the connection URL in `prisma.config.ts`, not in
`schema.prisma`. The runtime client gets it through the pg driver adapter.

## Tests

    bun test

`DRIFT_LIVE=1 bun test` additionally runs the tests that need a live server on
`localhost:4000`; without it those are skipped and the suite stays offline.

The CLI is tested against OpenTUI's headless renderer: each test mounts the app
in a fixed-size fake terminal, drives it with synthetic keystrokes, and asserts
on the captured character frame - so navigation, input handling and screen
content are all covered without a real terminal.

Two things worth knowing when writing more of these:

- A lone `esc` byte is held back by the parser until it can rule out a longer
  escape sequence, so give it ~60ms before asserting.
- Both the transcript and the prompt draw a `>` caret, so match the prompt row
  as the last one on screen, not the first.
