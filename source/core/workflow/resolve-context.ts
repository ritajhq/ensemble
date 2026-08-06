import { isAbsolute, join, resolve } from "@std/path";
import { copy } from "@std/fs/copy";
import type { Contexts } from "./schema.ts";
import type { RunContext } from "./context.ts";

export class WorkflowContextError extends Error {}

/**
 * Picks which context name this run actually uses: the caller's explicit
 * name, falling back to `contexts.default`. Throws if a workflow declares
 * `contexts` but neither was supplied (a context is then mandatory), or if
 * the resolved name isn't a key under `contexts.entries`.
 */
function resolveContextName(contexts: Contexts | undefined, requested: string | undefined): string | undefined {
  if (contexts === undefined) return requested;

  const name = requested ?? contexts.default;
  if (name === undefined) {
    throw new WorkflowContextError(
      `This workflow declares "contexts" — a --context is required (no "contexts.default" is set either). ` +
        `Valid contexts: ${Object.keys(contexts.entries).join(", ")}.`,
    );
  }
  if (!Object.hasOwn(contexts.entries, name)) {
    throw new WorkflowContextError(
      `Unknown context "${name}". Valid contexts: ${Object.keys(contexts.entries).join(", ")}.`,
    );
  }
  return name;
}

/**
 * Resolves `--context <name>` (or `contexts.default`) into a RunContext,
 * preparing its on-disk folder under `runDir/contexts/<name>` when the
 * workflow declares `contexts` for that name — local's files (relative to
 * `workflowDir`) copied in first, then remote's cloned on top (same-path
 * files from remote win). A plain `--context <name>` with no matching
 * `contexts.entries` declaration (i.e. the workflow never declared
 * `contexts:` at all) falls back to today's behavior: `<repoRoot>/contexts/<name>`,
 * unresolved/unprepared by this function — `repoRoot` isn't this module's
 * concern, so that path is built by the caller instead (see run-workflow.ts).
 */
export async function resolveContext(
  contexts: Contexts | undefined,
  requested: string | undefined,
  workflowDir: string,
  runDir: string,
): Promise<RunContext | undefined> {
  const name = resolveContextName(contexts, requested);
  if (name === undefined) return undefined;

  const entry = contexts?.entries[name];
  if (entry === undefined) {
    // No `contexts:` declared at all — the caller (run-workflow.ts) builds
    // the legacy repoRoot-relative path for this case.
    return undefined;
  }

  const dest = join(runDir, "contexts", name);
  if (entry.local !== undefined) {
    const localSrc = isAbsolute(entry.local) ? entry.local : resolve(workflowDir, entry.local);
    await copy(localSrc, dest, { overwrite: true });
  }
  if (entry.remote !== undefined) {
    // Clone straight to `dest` only when nothing else needs to land there
    // first and the whole clone (no subdirectory extraction) is the result
    // — otherwise clone to a scratch dir and copy the relevant part into
    // `dest` afterward, since `copy`'s src/dest can't overlap.
    const cloneDirect = entry.local === undefined && entry.remote.path === undefined;
    const cloneDir = cloneDirect ? dest : join(runDir, "contexts-remote", name);

    const args = ["clone"];
    if (entry.remote.ref !== undefined) args.push("--branch", entry.remote.ref);
    args.push(entry.remote.url, cloneDir);

    const { success } = await new Deno.Command("git", { args, stdout: "inherit", stderr: "inherit" }).output();
    if (!success) {
      throw new WorkflowContextError(`Failed to check out context "${name}"'s remote (${entry.remote.url}).`);
    }

    if (!cloneDirect) {
      const remoteSrc = entry.remote.path !== undefined ? join(cloneDir, entry.remote.path) : cloneDir;
      await copy(remoteSrc, dest, { overwrite: true });
    }
  }

  return { name, path: dest };
}
