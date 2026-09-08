import type { ReactNode } from "react";

import { useTheme } from "../providers/theme/index.tsx";

/**
 * The frame every screen renders inside: a fixed header, a body that takes all
 * remaining height, and a fixed footer. Screens only ever fill the body, so
 * they never have to think about the chrome around them.
 */
export function RootLayout({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { theme } = useTheme();

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.bg}
    >
      {header}
      <box flexGrow={1} flexDirection="column" paddingX={1} paddingBottom={1}>
        {children}
      </box>
      {footer}
    </box>
  );
}
