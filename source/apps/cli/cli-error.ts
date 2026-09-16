import { red } from "@std/fmt/colors";

/**
 * The one place every CLI error path renders through: `error: <msg>` in red,
 * with only the message — never a stack trace, regardless of how deep the
 * throw happened (a command's own action, or a detached background task like
 * a companion build watcher).
 */
export function printCliError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(red(`error: ${message}`));
}
