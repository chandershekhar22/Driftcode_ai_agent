import { useEffect, useState } from "react";

import { useTheme } from "../providers/theme/index.tsx";

const FRAMES = ["|", "/", "-", "\\"] as const;
const FRAME_MS = 90;

/**
 * A running indicator for anything that takes long enough to notice. Owns its
 * own interval so callers only have to mount and unmount it.
 */
export function Spinner({ label }: { label?: string }) {
  const { theme } = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % FRAMES.length);
    }, FRAME_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <text>
      <span fg={theme.accent}>{FRAMES[frame]}</span>
      {label ? <span fg={theme.muted}> {label}</span> : null}
    </text>
  );
}
