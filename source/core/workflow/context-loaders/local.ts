import { join } from "@std/path";
import { exists } from "@std/fs/exists";
import type { ContextLoader, LoadedValue } from "./types.ts";

/**
 * Parses a single-value `.env` file: the first non-blank `KEY=value` line's
 * value, ignoring the key itself (the file's own name, not its declared key,
 * is what maps it to a variable/secret — see readEnvFile).
 */
function parseEnvValue(text: string): string | undefined {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

/**
 * Reads one `.env`-style file into a scalar value. No `filePath` on the
 * result — the `.env` file itself holds `KEY=value` syntax, not the bare
 * value a `_FILE` companion should contain, so the engine materializes that
 * companion from the parsed scalar instead (see context-loaders/resolve.ts).
 */
async function readEnvFile(path: string): Promise<LoadedValue | undefined> {
  if (!await exists(path, { isFile: true })) return undefined;
  const text = await Deno.readTextFile(path);
  const scalar = parseEnvValue(text);
  return scalar !== undefined ? { scalar } : undefined;
}

/**
 * Reads variables/secrets from a folder convention next to the workflow's
 * own `workflow.yml`: `contexts/<name>/variables/<key>.env` and
 * `contexts/<name>/secrets/<key>.env`, each a one-line `KEY=value` file —
 * the same shape a developer can create by hand to run a workflow locally
 * with the same context data a deployed run would use.
 */
export function createLocalLoader(workflowDir: string): ContextLoader {
  const contextsRoot = join(workflowDir, "contexts");

  return {
    name: "local",
    async isAvailable(contextName: string): Promise<boolean> {
      return await exists(join(contextsRoot, contextName), { isDirectory: true });
    },
    loadVariable(contextName: string, key: string): Promise<LoadedValue | undefined> {
      return readEnvFile(join(contextsRoot, contextName, "variables", `${key}.env`));
    },
    loadSecret(contextName: string, key: string): Promise<LoadedValue | undefined> {
      return readEnvFile(join(contextsRoot, contextName, "secrets", `${key}.env`));
    },
  };
}

/**
 * Same `.env`-per-key convention as createLocalLoader, but rooted at
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
      return readEnvFile(join(globalRoot, "variables", `${key}.env`));
    },
    loadSecret(_contextName: string, key: string): Promise<LoadedValue | undefined> {
      return readEnvFile(join(globalRoot, "secrets", `${key}.env`));
    },
  };
}
