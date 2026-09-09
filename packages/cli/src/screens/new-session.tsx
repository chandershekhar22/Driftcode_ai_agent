import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useNavigate } from "react-router";
import { MODELS } from "@driftcode/shared";

import { Panel } from "../components/panel.tsx";
import { Spinner } from "../components/spinner.tsx";
import { useAppConfig } from "../providers/app-config/index.tsx";
import { useSessions } from "../providers/sessions/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

export function NewSessionScreen() {
  const { theme } = useTheme();
  const { cwd, cwdLabel, model: defaultModel } = useAppConfig();
  const { createSession } = useSessions();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);

  useKeyboard((key) => {
    if (key.name === "escape" && !creating) navigate("/");
  });

  const options = MODELS.map((spec) => ({
    name: spec.label,
    description:
      spec.id === defaultModel.id ? `${spec.blurb} (default)` : spec.blurb,
    value: spec.id,
  }));

  const start = async (_index: number, option: { value?: unknown } | null) => {
    const modelId = typeof option?.value === "string" ? option.value : null;
    if (!modelId || creating) return;

    setCreating(true);
    const session = await createSession({ model: modelId, cwd });
    setCreating(false);

    // A failure leaves us here with the error shown on the home screen's
    // banner; navigating to a session that does not exist would be worse.
    if (session) {
      navigate(`/session/${session.id}`, { replace: true });
    } else {
      navigate("/");
    }
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <box paddingX={1} paddingY={1} flexDirection="column">
        <text fg={theme.text}>New session</text>
        <text fg={theme.muted}>The agent will work in {cwdLabel}</text>
      </box>

      <Panel title=" Choose a model " flexGrow={1} focused>
        {creating ? (
          <Spinner label="Creating session..." />
        ) : (
          <select
            flexGrow={1}
            focused
            options={options}
            showDescription
            selectedIndex={MODELS.findIndex(
              (spec) => spec.id === defaultModel.id,
            )}
            backgroundColor={theme.panel}
            textColor={theme.text}
            descriptionColor={theme.muted}
            focusedTextColor={theme.accent}
            selectedTextColor={theme.accent}
            onSelect={start}
          />
        )}
      </Panel>
    </box>
  );
}
