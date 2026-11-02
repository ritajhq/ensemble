import { parseArgs } from "@std/cli/parse-args";
import type {
  Invocation,
  Package,
  StampTarget,
} from "./ecosystem/ecosystem.ts";
import { requireFlag } from "./util.ts";

export type {
  Invocation,
  Link,
  Package,
  StampTarget,
} from "./ecosystem/ecosystem.ts";
export { ToolVersions } from "./ecosystem/tool-versions.ts";

/** An ecosystem kit's entry points, the same operations `ens` asks of any ecosystem. `repoRoot` is the project being acted on, which during `ens init` isn't a git repository yet. */
export interface Actions {
  initialize(repoRoot: string): Promise<void>;
  sync(repoRoot: string): Promise<void>;
  packageAt(repoRoot: string, directory: string): Promise<Package | undefined>;
  stamp(
    repoRoot: string,
    version: string,
    targets: readonly StampTarget[],
  ): Promise<string[]>;
  scaffoldLibrary(
    repoRoot: string,
    directory: string,
    name: string,
  ): Promise<void>;
  lockfiles(repoRoot: string): Promise<string[]>;
  invocation(
    repoRoot: string,
    tool: string,
    args: readonly string[],
  ): Promise<Invocation | undefined>;
  /** What a process's environment needs to run the versions the project pinned for this ecosystem. Should refuse what it can't honour, usually through `ToolVersions`. */
  environmentFor(
    repoRoot: string,
    versions: Readonly<Record<string, string>>,
  ): Promise<Record<string, string>>;
}

/**
 * Dispatches an ecosystem kit's `main.ts` to the operation named by its first
 * CLI argument, then prints `{ "result": ... }` as the last line of stdout —
 * the standard entrypoint every ecosystem kit's `main.ts` calls.
 */
export async function run(
  actions: Actions,
  args: string[] = Deno.args,
): Promise<void> {
  const [operation, ...rest] = args;
  const flags = parseArgs(rest, { string: ["repo-root", "request"] });
  const repoRoot = requireFlag(flags, "repo-root");
  const request = JSON.parse(requireFlag(flags, "request"));

  const handlers: Record<string, () => Promise<unknown>> = {
    initialize: () => actions.initialize(repoRoot),
    sync: () => actions.sync(repoRoot),
    packageAt: () => actions.packageAt(repoRoot, request.directory),
    stamp: () => actions.stamp(repoRoot, request.version, request.targets),
    scaffoldLibrary: () =>
      actions.scaffoldLibrary(repoRoot, request.directory, request.name),
    lockfiles: () => actions.lockfiles(repoRoot),
    invocation: () => actions.invocation(repoRoot, request.tool, request.args),
    environmentFor: () => actions.environmentFor(repoRoot, request.versions),
  };
  const handler = handlers[operation];
  if (!handler) {
    throw new Error(`Unknown ecosystem kit operation "${operation}".`);
  }
  console.log(JSON.stringify({ result: await handler() }));
}
