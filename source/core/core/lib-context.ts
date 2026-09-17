import { parseArgs } from "@std/cli/parse-args";
import { requireFlag } from "./util.ts";

/** The parameters `ens` passes to a lib kit's `main.ts` invocation. */
export interface Context {
  /** Absolute path to the library's directory (a `source/libs/<name>` or core library). */
  libRoot: string;
  /** The package name to publish under (an entry's `package` under `publish.libs` for a `source/libs/<name>` lib, `publish.core` for a core lib — both in `.ensemble/config.yaml`). */
  package: string;
  /** Version to publish this library under. */
  version: string;
  /** The named destination within this kit's own publish surface (the declaration's `publish[].target`) — present only for a kit with more than one. */
  target?: string;
}

/** Parses the standard lib kit CLI contract. Call this from a lib kit's `main.ts` entry point. */
export function getContext(args: string[] = Deno.args): Context {
  const flags = parseArgs(args, {
    string: ["lib-root", "package", "version", "target"],
  });

  const target = typeof flags.target === "string" && flags.target.length > 0
    ? flags.target
    : undefined;

  return {
    libRoot: requireFlag(flags, "lib-root"),
    package: requireFlag(flags, "package"),
    version: requireFlag(flags, "version"),
    target,
  };
}

/** A lib kit's two entry points: `stamp` writes the resolved version into the library's manifest (no network); `publish` pushes it to the registry, assuming the manifest is already correct and committed. */
export interface Actions {
  stamp(context: Context): Promise<void>;
  publish(context: Context): Promise<void>;
}

/**
 * Dispatches a lib kit's `main.ts` to `stamp` or `publish` based on its first
 * CLI argument — the standard entrypoint every lib kit's `main.ts` calls, so
 * the stamp/publish split (and the CLI contract for reaching it) lives once
 * here rather than being hand-rolled per kit.
 */
export async function run(actions: Actions, args: string[] = Deno.args): Promise<void> {
  const [mode, ...rest] = args;
  const handlers: Record<string, (context: Context) => Promise<void>> = {
    stamp: actions.stamp,
    publish: actions.publish,
  };
  const handler = handlers[mode];
  if (!handler) {
    throw new Error(`Unknown lib kit mode "${mode}" (expected "stamp" or "publish")`);
  }
  await handler(getContext(rest));
}
