/** Values both the CLI and the server need to agree on. */

/** Bumped independently of the npm version; sent on every request so the
 *  server can warn a client that has drifted too far behind. */
export const PROTOCOL_VERSION = 1;

export const DEFAULT_API_URL = "http://localhost:4000";

/** Header the CLI uses to announce its protocol version. */
export const PROTOCOL_HEADER = "x-drift-protocol";
