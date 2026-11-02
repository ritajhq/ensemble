import { red } from "@std/fmt/colors";
import * as Core from "@ensemble/core";

/** What only a bug in `ens` throws: every error meant for the person is a plain `Error`, or names what failed in its own type. */
const BUG_TYPES = [TypeError, ReferenceError, RangeError, EvalError];

/**
 * What an error reads as: its message, since that's all a person acting on it
 * needs however deep it was thrown (a command's own action, or a detached
 * background task like a companion build watcher). A bug's message means
 * nothing without its stack, so a bug keeps it, as everything does under
 * `ENS_DEBUG` (which `--verbose` turns on), with a failed kit's command line.
 */
export function describeCliError(error: unknown, debug: boolean): string {
  if (!(error instanceof Error)) return String(error);
  const isBug = BUG_TYPES.some((type) => error instanceof type);
  if (!debug && !isBug) return error.message;
  const detail = error instanceof Core.KitFailure ? error.detail : undefined;
  return [error.stack ?? error.message, detail].filter(Boolean).join("\n");
}

/** The one place every CLI error path renders through: `error: <description>` in red. */
export function printCliError(error: unknown): void {
  const debug = Boolean(Deno.env.get("ENS_DEBUG"));
  console.error(red(`error: ${describeCliError(error, debug)}`));
}
