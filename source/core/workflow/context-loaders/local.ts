import { join } from "@std/path";
import { exists } from "@std/fs/exists";
import type { ContextLoader, LoadedValue } from "./types.ts";

/** Parses a multi-line `.env` file (`KEY=value` per line, `#` comments, blank lines ignored, quoted values unwrapped) into a plain key/value map. */
function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** Reads one key out of a shared `.env` file (`contexts/<name>/variables.env` or `.../secrets.env`). Undefined if the file or the key is missing. */
async function loadFromEnvFile(path: string, key: string): Promise<LoadedValue | undefined> {
  if (!await exists(path, { isFile: true })) return undefined;
  const parsed = parseEnvFile(await Deno.readTextFile(path));
  return Object.hasOwn(parsed, key) ? { scalar: parsed[key] } : undefined;
}

/** Reads a raw file's content verbatim, no parsing — used by contextFile()/contextSecretFile(), which want a real path on disk, not a parsed value. */
async function loadFile(path: string): Promise<string | undefined> {
  return await exists(path, { isFile: true }) ? path : undefined;
}

/**
 * Reads variables/secrets from a folder convention next to the workflow's
 * own `workflow.yml`: every declared `context.variables`/`context.secrets`
 * entry is a `KEY=value` line in one shared `contexts/<name>/variables.env`
 * / `contexts/<name>/secrets.env` file — the same shape a developer can
 * create by hand to run a workflow locally with the same context data a
 * deployed run would use. `contextFile("NAME.ext")`/
 * `contextSecretFile("NAME.ext")` are a separate mechanism for raw file
 * content a tool needs verbatim (e.g. `terraform -var-file`, which needs a
 * real `.json` path) — those live as individually-named files under
 * `contexts/<name>/variables/`/`contexts/<name>/secrets/`, one file per
 * referenced filename, since a single shared `.env` can't hold arbitrary
 * binary/structured content.
 */
export function createLocalLoader(workflowDir: string): ContextLoader {
  const contextsRoot = join(workflowDir, "contexts");

  return {
    name: "local",
    async isAvailable(contextName: string): Promise<boolean> {
      return await exists(join(contextsRoot, contextName), { isDirectory: true });
    },
    loadVariable(contextName: string, key: string): Promise<LoadedValue | undefined> {
      return loadFromEnvFile(join(contextsRoot, contextName, "variables.env"), key);
    },
    loadSecret(contextName: string, key: string): Promise<LoadedValue | undefined> {
      return loadFromEnvFile(join(contextsRoot, contextName, "secrets.env"), key);
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
 * Same shared-`.env`-file convention as createLocalLoader, but rooted at
 * `<repoRoot>/.ensemble/global/` instead of a single workflow's own
 * `contexts/<name>/` — one shared place to provision a value every workflow
 * on this host needs (e.g. registry credentials), instead of copy-pasting it
 * into each workflow's own `contexts/<name>/secrets.env`. `contextName` is
 * accepted (to satisfy ContextLoader) but ignored: there's only one global
 * tier, not one per `--context` name — see resolve.ts's selectLoaders,
 * which appends this after the per-context loaders as a fallback tier.
 */
export function createLocalGlobalLoader(repoRoot: string): ContextLoader {
  const globalRoot = join(repoRoot, ".ensemble", "global");

  return {
    name: "local",
    async isAvailable(): Promise<boolean> {
      return await exists(globalRoot, { isDirectory: true });
    },
    loadVariable(_contextName: string, key: string): Promise<LoadedValue | undefined> {
      return loadFromEnvFile(join(globalRoot, "variables.env"), key);
    },
    loadSecret(_contextName: string, key: string): Promise<LoadedValue | undefined> {
      return loadFromEnvFile(join(globalRoot, "secrets.env"), key);
    },
    loadVariableFile(_contextName: string, filename: string): Promise<string | undefined> {
      return loadFile(join(globalRoot, "variables", filename));
    },
    loadSecretFile(_contextName: string, filename: string): Promise<string | undefined> {
      return loadFile(join(globalRoot, "secrets", filename));
    },
  };
}
