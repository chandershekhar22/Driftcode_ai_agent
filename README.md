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

## Usage

    drift [options]

| Flag | Effect |
| ---- | ------ |
| `-r, --resume` | Open the most recent session |
| `-m, --model <id>` | Use this model for new sessions, and remember it |
| `-t, --theme <name>` | Use this theme for one run |
| `-h, --help` | Show usage |

## Keybindings

| Key      | Where    | Action                                      |
| -------- | -------- | ------------------------------------------- |
| `enter`  | anywhere | Select / send                               |
| `esc`    | session  | Back, or interrupt a reply in progress      |
| `d`      | list     | Delete the highlighted session (asks first) |
| `shift+tab` | session | Switch between plan and build mode        |
| `alt+m`  | session  | Switch model                                |
| `ctrl+t` | anywhere | Cycle the theme                             |
| `ctrl+c` | anywhere | Quit                                        |

Choosing keys for a terminal app is more constrained than it looks:

- `ctrl+m`, `ctrl+i`, `ctrl+j` and `ctrl+h` are the ASCII codes for enter, tab,
  linefeed and backspace. A terminal cannot tell them apart from those keys, so
  they can never be bound.
- `ctrl+p`, `ctrl+b`, `ctrl+k` and friends are taken by editors. Run inside the
  VS Code integrated terminal and `ctrl+p` opens Quick Open; the CLI never sees
  it. `alt`-based bindings survive both.
- `ctrl+d` means EOF by convention, which is a poor fit for a destructive
  action, so deleting a session uses plain `d` plus a confirmation.

## Preferences

Model, theme, and the last session opened are remembered in
`~/.drift/config.json`. It is written atomically, and a file that is missing,
corrupt, or written by a newer version falls back to defaults rather than
stopping the CLI - preferences are a convenience, never a dependency.

## Themes

Three ship in the box - `midnight` (default), `ember`, and `paper`. Cycle with
`ctrl+t` (the choice is remembered), or pick one for a single run:

    bun run dev:cli -- --theme paper

Themes are plain colour maps in `packages/cli/src/theme.ts`; adding one is a
single entry in that file.

## Models

Set `ANTHROPIC_API_KEY` in `.env` and restart the server. Models are declared
in `packages/shared/src/models.ts`; the server maps each entry's `provider` to
an AI SDK provider, so adding an OpenAI model is one entry there plus
`OPENAI_API_KEY` - no server change.

### How the picker knows what is usable

`GET /models` reports what the server can actually run. Models it cannot run
stay in the list, greyed out with the reason ("needs ANTHROPIC_API_KEY"), and
the picker refuses to start a session on one. Hiding them would leave the user
wondering where a model went; naming the missing key tells them how to fix it.

### Streaming

Replies stream over newline-delimited JSON (`POST /sessions/:id/chat`). One
event per line: `start`, then `delta` per chunk, then `done` or `error`. The
user message is stored before the model runs, and whatever streamed before a
failure is kept rather than discarded.

## Modes and tools

Every session is in one of two modes, shown in the status bar and switched with
`shift+tab`. The mode is stored on the session, so it survives a restart.

| Mode | Tools | For |
| ---- | ----- | --- |
| `plan` | `read_file`, `list_dir`, `glob`, `grep` | Investigating and proposing work |
| `build` | plan's tools plus `write_file`, `edit_file`, `run_command` | Carrying it out |

Sessions open in **plan**: the safe default is the one that cannot damage
anything. The system prompt is generated from the same definitions the model is
given, so the two can never drift apart, and in plan mode it is told explicitly
never to claim a change it was unable to make.

### Where tools run

On your machine, in the CLI - never on the server. The server describes the
tools to the model and receives the calls, but the files are local, so the
calls travel back to the CLI, run there, and the results are posted to
`POST /sessions/:id/tools`, which continues the turn. A tool that executed
server-side would be reading the server's filesystem instead of your project.

One message from you can therefore mean several round trips: answer, tool,
answer again. The loop is capped at 8 rounds so a confused model cannot spend
your money in a circle.

### Approval

Read-only tools run unattended - an agent that needs permission to look at a
file is not worth using. Anything that changes something asks first:

    Allow: write src/app.tsx?
    y to allow, n to decline

Declining is reported back to the agent as a refusal, so it proposes something
else instead of retrying the same call.

### Safety

`packages/cli/src/lib/local-tools.ts` is the only place that touches your
filesystem on the agent's behalf, and it is deliberately paranoid:

- Every path is resolved and checked to be inside the project directory.
  Absolute paths and `..` escapes are refused, not obeyed - a model will
  occasionally send both.
- Outputs are capped, so one `grep` cannot fill the model's context.
- `node_modules`, `.git`, `dist` and `build` are never searched.
- `edit_file` refuses text that appears zero or many times rather than guessing
  which occurrence was meant, and changes nothing when it refuses.
- Every failure is a result the agent can read, never a crash - an exception
  there would abandon a turn you are watching.

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
