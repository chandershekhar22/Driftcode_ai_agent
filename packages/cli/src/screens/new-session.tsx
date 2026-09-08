import { useKeyboard } from "@opentui/react";
import { useNavigate } from "react-router";
import { MODELS, type ModelId } from "@driftcode/shared";

import { Panel } from "../components/panel.tsx";
import { useAppConfig } from "../providers/app-config/index.tsx";
import { useSessions } from "../providers/sessions/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

export function NewSessionScreen() {
  const { theme } = useTheme();
  const { cwd, model: defaultModel } = useAppConfig();
  const { createSession } = useSessions();
  const navigate = useNavigate();

  useKeyboard((key) => {
    if (key.name === "escape") navigate("/");
  });

  const options = MODELS.map((spec) => ({
    name: spec.label,
    description:
      spec.id === defaultModel.id ? `${spec.blurb} (default)` : spec.blurb,
    value: spec.id,
  }));

  const start = (_index: number, option: { value?: unknown } | null) => {
    const modelId = option?.value as ModelId | undefined;
    if (!modelId) return;

    const session = createSession(modelId);
    navigate(`/session/${session.id}`, { replace: true });
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <box paddingX={1} paddingY={1} flexDirection="column">
        <text fg={theme.text}>New session</text>
        <text fg={theme.muted}>The agent will work in {cwd}</text>
      </box>

      <Panel title=" Choose a model " flexGrow={1} focused>
        <select
          flexGrow={1}
          focused
          options={options}
          showDescription
          selectedIndex={MODELS.findIndex((s) => s.id === defaultModel.id)}
          backgroundColor={theme.panel}
          textColor={theme.text}
          descriptionColor={theme.muted}
          focusedTextColor={theme.accent}
          selectedTextColor={theme.accent}
          onSelect={start}
        />
      </Panel>
    </box>
  );
}
