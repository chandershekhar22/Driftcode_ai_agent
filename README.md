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

Run the API server and the CLI in two terminals:

    bun run dev:server
    bun run dev:cli

## Status

Under active development, built chapter by chapter. See the chapter list in the
project notes.
