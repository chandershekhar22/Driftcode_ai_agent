import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { CatalogModel } from "@driftcode/shared";

import { ModelSelect } from "../components/model-select.tsx";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import { Spinner } from "../components/spinner.tsx";
import { useModelCatalog } from "../providers/app-config/index.tsx";
import { useConfig } from "../providers/config/index.tsx";
import { describeError, useSessions } from "../providers/sessions/index.tsx";
import { useDialog } from "../providers/dialog/index.tsx";
import { useGatedKeyboard } from "../providers/keyboard-layer/index.tsx";
import { useTheme } from "../providers/theme/index.tsx";

/**
 * Change the model a session uses.
 *
 * The switch applies to this session on the server and also becomes the
 * preference for new sessions - picking a model once is almost always meant to
 * stick.
 */
export function ChangeModelScreen() {
  const { theme } = useTheme();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { sessions, client, refresh } = useSessions();
  const { config, setPreferredModel } = useConfig();
  const catalog = useModelCatalog();
  const navigate = useNavigate();
  const { isOpen: dialogOpen } = useDialog();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = () => navigate(`/session/${sessionId}`, { replace: true });

  useGatedKeyboard((key) => {
    if (key.name === "escape" && !saving) back();
  }, !dialogOpen);

  const current =
    sessions.find((session) => session.id === sessionId)?.model ?? config.model;

  const choose = async (model: CatalogModel) => {
    if (!sessionId || saving) return;

    if (!model.available) {
      setError(
        `${model.label} is not available on this server - ${model.reason ?? "not configured"}.`,
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await client.update(sessionId, { model: model.id });
      setPreferredModel(model.id);
      await refresh();
      back();
    } catch (cause) {
      setError(describeError(cause));
      setSaving(false);
    }
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <box paddingX={1} paddingY={1} flexDirection="column">
        <text fg={theme.text} flexShrink={0}>
          Switch model
        </text>
        <text fg={theme.muted} flexShrink={0}>
          Applies to this session, and becomes the default for new ones.
        </text>
      </box>

      <Panel title=" Models " flexGrow={1} focused>
        {saving ? (
          <Spinner label="Switching..." />
        ) : (
          <ModelSelect
            models={catalog.models}
            selectedId={current}
            onChoose={choose}
          />
        )}
      </Panel>

      {error !== null && <Notice message={error} />}
    </box>
  );
}
