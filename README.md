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

## Commands

Type `/` at the prompt and the command menu opens under it, filtering as you
type. The session list has no prompt to type into, so there `/` opens the same
commands as a searchable dialog.

| Command | Does |
| ------- | ---- |
| `/new` | Start a new session |
| `/sessions` | Browse and search past sessions |
| `/models` | Choose the model |
| `/agents` | Switch between plan and build mode |
| `/theme` | Change the colour theme |
| `/login`, `/logout` | Sign in or out (only when auth is configured) |
| `/upgrade` | Buy more credits (only when billing is configured) |
| `/help` | Show the keyboard shortcuts |
| `/quit` | Exit |

Every dialog is the same searchable list: type to filter, arrows to move,
enter to choose, esc to close.

## Keybindings

| Key      | Where    | Action                                      |
| -------- | -------- | ------------------------------------------- |
| `/`      | anywhere | Open the command menu                       |
| `enter`  | anywhere | Select / send                               |
| `esc`    | session  | Back, close, or interrupt a reply           |
| `tab`    | session  | Switch between plan and build mode          |
| `d`      | list     | Delete the highlighted session (asks first) |
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

### Who gets a keypress

OpenTUI delivers every key to every subscriber, so a dialog and the screen
behind it would both act on the same `esc`. Rather than a registry of layers,
each subscriber is simply told whether it should be listening, using state its
own screen already has - the menu is only rendered when open, and a screen
knows a dialog is up because it reads the same context that opened it.

An earlier version did keep a stack of layers that components pushed on mount.
It did not work, for a reason worth knowing: **a `setState` issued from inside a
passive effect never re-renders in this reconciler.** The push ran, the state
never changed, and every component believed it had registered. The same
`setState` from an event handler or a promise is fine, which is why nothing
else in the app hit it.

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

## Accounts

Auth is optional, and the server behaves the same either way.

**Unconfigured** (the default): single-user. One implicit owner holds every
session, no sign-in exists, and `/login` is not even offered - an option that
can only fail is worse than no option.

**Configured**: people sign in through the browser, and each sees only their
own sessions. Set the Clerk values in `.env` and restart; see `.env.example`
for which ones and how to register the redirect URI.

### How sign-in works

The CLI is a public client - it ships to every machine that runs it, so it
cannot hold a secret. It uses PKCE, and the authorization code is redeemed by
the **server**, which is the only party holding the provider's client secret.

A redirect URI has to be registered with the provider in advance, but the CLI
picks its callback port at runtime. So the provider redirects to the server,
and the server bounces the browser on to whichever port the CLI is listening
on. The CLI then posts the code and its PKCE verifier to the server, which
exchanges it, upserts the account, and returns a signed token the CLI stores in
`~/.drift/auth.json`.

    CLI  --(challenge, port)-->  server  -->  authorize URL
    browser  -->  provider  -->  server /auth/callback  -->  127.0.0.1:port
    CLI  --(code, verifier)-->  server  -->  provider  -->  token

### Ownership

Every session belongs to a user. Queries filter on the owner, and a session
belonging to someone else reads as **not found** rather than forbidden - the
API should not confirm that an id it will not serve exists.

The `userId` column was added nullable so it needed no data migration; the
server adopts any orphaned sessions into the local user the first time it
resolves one.

## Credits

Billing is optional, and the default is off.

**Unconfigured**: nothing is metered, use is unlimited, no balance appears in
the status bar and `/upgrade` is not offered. `credits: null` means unlimited -
never zero, because a caller that confused the two would lock everyone out of
their own server.

**Configured**: each turn is charged against a balance, and `/upgrade` opens a
checkout to top it up. See `.env.example` for the Polar meter settings, which
have to match exactly.

### What a credit is

One cent of model spend, computed from the same rates the model registry
already carries:

    credits = ceil((inTok/1M * inRate + outTok/1M * outRate) / $0.01)

So an Opus turn costs visibly more than a Haiku one, because it does, and the
price list can never drift from the model list. Every turn costs at least one
credit - otherwise a loop of tiny requests would run free.

### When it charges, and when it refuses

The balance is checked **before** a turn runs, so someone out of credits gets a
clean refusal rather than a reply that stops halfway. Usage is reported
**after**, because charging for work that then failed is worse than
occasionally letting a turn finish on an empty balance.

If Polar itself is unreachable, the check **fails open**. An outage there
should not become an outage here; it costs at most a few unmetered turns.

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
