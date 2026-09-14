export interface Command {
  /** Without the slash, e.g. "sessions". */
  name: string;
  description: string;
  /** Extra words that should match a query without being displayed. */
  keywords?: string;
  run: () => void;
}
