import { join } from "@std/path";
import { exists } from "@std/fs/exists";
import type { ContextLoader, LoadedValue } from "./types.ts";

/**
 * Reads a file's raw content verbatim, stripping a single trailing newline
 * (for editor-friendliness — files are commonly saved with one). No parsing:
 * a variable/secret's value is exactly the file's bytes, whether that's a
 * plain scalar or a JSON blob a `run:` step wants as-is.
 */
async function readRawFile(path: string): Promise<string | undefined> {
  if (!await exists(path, { isFile: true })) return undefined;
  const text = await Deno.readTextFile(path);
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

async function loadScalar(path: string): Promise<LoadedValue | undefined> {
  const scalar = await readRawFile(path);
  return scalar !== undefined ? { scalar } : undefined;
}

async function loadFile(path: string): Promise<string | undefined> {
  return await exists(path, { isFile: true }) ? path : undefined;
}

/**
 * Reads variables/secrets from a folder convention next to the workflow's
 * own `workflow.yml`: `contexts/<name>/variables/<filename>` and
 * `contexts/<name>/secrets/<filename>`, each holding raw content verbatim —
 * the same shape a developer can create by hand to run a workflow locally
 * with the same context data a deployed run would use. A declared
 * `context.variables`/`context.secrets` entry reads the file named after its
 * own key; `contextFile("NAME.ext")`/`contextSecretFile("NAME.ext")` reads
 * any explicitly-named file in the same folder (e.g. for a tool that needs a
 * real extension, like `terraform -var-file`).
 */
export function createLocalLoader(workflowDir: string): ContextLoader {
  const contextsRoot = join(workflowDir, "contexts");

  return {
    name: "local",
    async isAvailable(contextName: string): Promise<boolean> {
      return await exists(join(contextsRoot, contextName), { isDirectory: true });
    },
    loadVariable(contextName: string, key: string): Promise<LoadedValue | undefined> {
      return loadScalar(join(contextsRoot, contextName, "variables", key));
    },
    loadSecret(contextName: string, key: string): Promise<LoadedValue | undefined> {
      return loadScalar(join(contextsRoot, contextName, "secrets", key));
    },
    loadVariableFile(contextName: string, filename: string): Promise<string | undefined> {
      return loadFile(join(contextsRoot, contextName, "variables", filename));
    },
    loadSecretFile(contextName: string, filename: string): Promise<string | undefined> {
      return loadFile(join(contextsRoot, contextName, "secrets", filename));
    },
  };
}

/**
 * Same per-key-file convention as createLocalLoader, but rooted at
 * `<repoRoot>/.ensemble/global/` instead of a single workflow's own
 * `contexts/<name>/` — one shared place to provision a value every workflow
 * on this host needs (e.g. registry credentials), instead of copy-pasting it
 * into each workflow's own `contexts/<name>/secrets/` folder. `contextName`
 * is accepted (to satisfy ContextLoader) but ignored: there's only one
 * global tier, not one per `--context` name — see resolve.ts's
 * selectLoaders, which appends this after the per-context loaders as a
 * fallback tier.
 */
export function createLocalGlobalLoader(repoRoot: string): ContextLoader {
  const globalRoot = join(repoRoot, ".ensemble", "global");

  return {
    name: "local",
    async isAvailable(): Promise<boolean> {
      return await exists(globalRoot, { isDirectory: true });
    },
    loadVariable(_contextName: string, key: string): Promise<LoadedValue | undefined> {
      return loadScalar(join(globalRoot, "variables", key));
    },
    loadSecret(_contextName: string, key: string): Promise<LoadedValue | undefined> {
      return loadScalar(join(globalRoot, "secrets", key));
    },
    loadVariableFile(_contextName: string, filename: string): Promise<string | undefined> {
      return loadFile(join(globalRoot, "variables", filename));
    },
    loadSecretFile(_contextName: string, filename: string): Promise<string | undefined> {
      return loadFile(join(globalRoot, "secrets", filename));
    },
  };
}
