import { useParams } from "react-router";

import { useModelCatalog } from "../../providers/app-config/index.tsx";
import { useConfig } from "../../providers/config/index.tsx";
import { describeError, useSessions } from "../../providers/sessions/index.tsx";
import { useToast } from "../../providers/toast/index.tsx";
import { DialogSearchList, type SearchItem } from "../dialog-search-list.tsx";

/**
 * Switch the model.
 *
 * Inside a session it changes that session and becomes the default for new
 * ones; outside a session it only sets the default, since there is nothing to
 * change yet.
 */
export function ModelsDialog({ onClose }: { onClose: () => void }) {
  const catalog = useModelCatalog();
  const { setPreferredModel } = useConfig();
  const { client, refresh, sessions } = useSessions();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { toast } = useToast();

  const current =
    sessions.find((session) => session.id === sessionId)?.model ?? undefined;

  const items: SearchItem[] = catalog.models.map((model) => ({
    id: model.id,
    name: model.id === current ? `${model.label} (current)` : model.label,
    description: model.blurb,
    keywords: `${model.id} ${model.provider}`,
    disabled: !model.available,
    disabledReason: model.reason,
  }));

  const choose = async (item: SearchItem) => {
    onClose();
    setPreferredModel(item.id);

    if (!sessionId) {
      toast(`New sessions will use ${item.name}.`, "success");
      return;
    }

    try {
      await client.update(sessionId, { model: item.id });
      await refresh();
      toast(`Switched to ${item.name}.`, "success");
    } catch (cause) {
      toast(describeError(cause), "danger");
    }
  };

  return (
    <DialogSearchList
      items={items}
      placeholder="Search models..."
      emptyLabel="No models match."
      onClose={onClose}
      onSelect={(item) => void choose(item)}
    />
  );
}
