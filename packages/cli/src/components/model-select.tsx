import type { CatalogModel } from "@driftcode/shared";

import { useTheme } from "../providers/theme/index.tsx";

/**
 * The model list, shared by the new-session and switch-model screens.
 *
 * Unavailable models stay on the list with their reason attached rather than
 * being hidden: "Opus 5 - needs ANTHROPIC_API_KEY" tells the user how to get
 * it, where a short list would just look like the model does not exist.
 */
export function ModelSelect({
  models,
  selectedId,
  onChoose,
}: {
  models: readonly CatalogModel[];
  selectedId?: string;
  onChoose: (model: CatalogModel) => void;
}) {
  const { theme } = useTheme();

  const options = models.map((model) => ({
    name: model.available ? model.label : `${model.label} (unavailable)`,
    description: model.available
      ? model.blurb
      : `${model.reason ?? "not configured"} - ${model.blurb}`,
    value: model.id,
  }));

  const selectedIndex = Math.max(
    models.findIndex((model) => model.id === selectedId),
    0,
  );

  return (
    <select
      flexGrow={1}
      focused
      options={options}
      showDescription
      selectedIndex={selectedIndex}
      backgroundColor={theme.panel}
      textColor={theme.text}
      descriptionColor={theme.muted}
      focusedTextColor={theme.accent}
      selectedTextColor={theme.accent}
      onSelect={(_index, option) => {
        const id = typeof option?.value === "string" ? option.value : null;
        const model = id ? models.find((entry) => entry.id === id) : undefined;
        if (model) onChoose(model);
      }}
    />
  );
}
