import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useNavigate } from "react-router";
import type { CatalogModel } from "@driftcode/shared";

import { ModelSelect } from "../components/model-select.tsx";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import { Spinner } from "../components/spinner.tsx";
import {
  useAppConfig,
  useModelCatalog,
} from "../providers/app-config/index.tsx";
import { useConfig } from "../providers/config/index.tsx";
import { useSessions } from "../providers/sessions/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

export function NewSessionScreen() {
  const { theme } = useTheme();
  const { cwd, cwdLabel } = useAppConfig();
  const { config } = useConfig();
  const catalog = useModelCatalog();
  const { createSession } = useSessions();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  useKeyboard((key) => {
    if (key.name === "escape" && !creating) navigate("/");
  });

  const start = async (model: CatalogModel) => {
    if (creating) return;

    // Refuse rather than create a session that cannot answer.
    if (!model.available) {
      setBlocked(
        `${model.label} is not available on this server - ${model.reason ?? "not configured"}.`,
      );
      return;
    }

    setBlocked(null);
    setCreating(true);
    const session = await createSession({ model: model.id, cwd });
    setCreating(false);

    // A failure leaves the error on the home screen's banner; navigating to a
    // session that does not exist would be worse.
    navigate(session ? `/session/${session.id}` : "/", { replace: true });
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <box paddingX={1} paddingY={1} flexDirection="column">
        <text fg={theme.text} flexShrink={0}>
          New session
        </text>
        <text fg={theme.muted} flexShrink={0}>
          The agent will work in {cwdLabel}
        </text>
      </box>

      <Panel title=" Choose a model " flexGrow={1} focused>
        {creating ? (
          <Spinner label="Creating session..." />
        ) : (
          <ModelSelect
            models={catalog.models}
            selectedId={config.model}
            onChoose={start}
          />
        )}
      </Panel>

      {catalog.empty && (
        <Notice
          tone="warning"
          message="This server has no model provider configured."
          hint="Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env, then restart the server."
        />
      )}

      {blocked !== null && <Notice message={blocked} />}
    </box>
  );
}
