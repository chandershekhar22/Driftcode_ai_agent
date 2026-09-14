/** Every dialog the app can open. One union so the renderer is exhaustive. */
export type DialogKind =
  | "commands"
  | "sessions"
  | "models"
  | "agents"
  | "theme"
  | "help";

export interface DialogState {
  kind: DialogKind;
}
