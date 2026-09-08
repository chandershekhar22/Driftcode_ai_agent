import { useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { ModelSpec } from "@driftcode/shared";

import { Header } from "./components/header.tsx";
import { InputBar } from "./components/input-bar.tsx";
import { Panel } from "./components/panel.tsx";
import { StatusBar, type ConnectionState } from "./components/status-bar.tsx";
import { RootLayout } from "./layouts/root-layout.tsx";
import { useTheme } from "./providers/theme/index.tsx";

const HINTS = [
  { key: "ctrl+t", label: "theme" },
  { key: "ctrl+c", label: "quit" },
] as const;

export interface AppProps {
  version: string;
  cwd: string;
  model: ModelSpec;
  connection: ConnectionState;
  serverDescription: string;
}

export function App({
  version,
  cwd,
  model,
  connection,
  serverDescription,
}: AppProps) {
  const renderer = useRenderer();
  const { theme, cycleTheme } = useTheme();

  // Echoed back for now. Chapter 5 replaces this with the model's reply.
  const [entries, setEntries] = useState<string[]>([]);

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      process.exit(0);
    }

    if (key.ctrl && key.name === "t") {
      cycleTheme();
    }
  });

  return (
    <RootLayout
      header={<Header cwd={cwd} version={version} />}
      footer={
        <StatusBar
          model={model.label}
          connection={connection}
          hints={HINTS}
        />
      }
    >
      <Panel title=" driftcode " flexGrow={1}>
        {entries.length === 0 ? (
          <box flexDirection="column">
            <text fg={theme.text}>Terminal UI is up.</text>
            <text> </text>
            <text fg={theme.muted}>{serverDescription}</text>
            <text fg={theme.muted}>
              Model: {model.label} - {model.blurb}
            </text>
            <text> </text>
            <text fg={theme.muted}>
              Type below and press enter. For now your input is echoed back;
            </text>
            <text fg={theme.muted}>
              the model gets wired in at chapter 5.
            </text>
          </box>
        ) : (
          <box flexDirection="column">
            {entries.map((entry, index) => (
              <text key={index}>
                <span fg={theme.accent}>{"> "}</span>
                <span fg={theme.text}>{entry}</span>
              </text>
            ))}
          </box>
        )}
      </Panel>

      <InputBar
        onSubmit={(value) => setEntries((current) => [...current, value])}
        disabled={connection === "offline"}
        placeholder={
          connection === "offline"
            ? "Server offline - start it with: bun run dev:server"
            : "Ask anything, or describe what to build..."
        }
      />
    </RootLayout>
  );
}
