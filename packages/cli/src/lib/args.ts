/**
 * Command-line arguments.
 *
 * Hand-rolled rather than pulling in a parser: the surface is four flags, and
 * a dependency here would be larger than the code it replaces.
 */

export interface ParsedArgs {
  /** Open the most recent session instead of the session list. */
  resume: boolean;
  /** Override the preferred model for this run. */
  model?: string;
  /** Override the theme for this run. */
  theme?: string;
  help: boolean;
  /** Flags that were not understood, reported rather than ignored. */
  unknown: string[];
}

export const HELP_TEXT = `
  drift - a terminal coding agent

  Usage
    drift [options]

  Options
    -r, --resume         Open the most recent session
    -m, --model <id>     Use this model for new sessions
    -t, --theme <name>   Use this theme (midnight, ember, paper)
    -h, --help           Show this message

  Preferences are remembered in ~/.drift/config.json; the flags above
  override them for one run.
`.trimEnd();

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { resume: false, help: false, unknown: [] };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === undefined) continue;

    // Support both "--model x" and "--model=x".
    const [flag, inlineValue] = arg.includes("=")
      ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
      : [arg, undefined];

    const takeValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[index + 1];
      // A following flag is not this flag's value.
      if (next === undefined || next.startsWith("-")) return undefined;
      index++;
      return next;
    };

    switch (flag) {
      case "-r":
      case "--resume":
        parsed.resume = true;
        break;

      case "-h":
      case "--help":
        parsed.help = true;
        break;

      case "-m":
      case "--model": {
        const value = takeValue();
        if (value) parsed.model = value;
        else parsed.unknown.push(`${flag} (no value given)`);
        break;
      }

      case "-t":
      case "--theme": {
        const value = takeValue();
        if (value) parsed.theme = value;
        else parsed.unknown.push(`${flag} (no value given)`);
        break;
      }

      default:
        parsed.unknown.push(arg);
    }
  }

  return parsed;
}
