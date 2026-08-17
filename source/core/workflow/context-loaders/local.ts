import { join } from "@std/path";
import { exists } from "@std/fs/exists";
import { parse as parseYaml } from "@std/yaml";
import type { ContextLoader, LoadedValue } from "./types.ts";
import {
  decryptFile,
  decryptValue,
  isEncryptedMarker,
} from "./secrets-crypto.ts";

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

/** Reads one key out of a shared `.env` file (`contexts/<name>/variables.env`). Undefined if the file or the key is missing. */
async function loadFromEnvFile(
  path: string,
  key: string,
): Promise<LoadedValue | undefined> {
  if (!await exists(path, { isFile: true })) return undefined;
  const parsed = parseEnvFile(await Deno.readTextFile(path));
  return Object.hasOwn(parsed, key) ? { scalar: parsed[key] } : undefined;
}

/**
 * Parses `contexts/<name>/secrets.enc` — a YAML map whose keys stay
 * cleartext (readable diffs) and whose values are each either an
 * `ENC[X25519,...]` marker (see secrets-crypto.ts) or, tolerantly, a plain
 * string (treated as already-plaintext — lets a value be hand-edited/added
 * before the first `ens workflow secrets edit` encrypts it, rather than
 * hard-failing on a file that isn't fully encrypted yet).
 */
function parseSecretsFile(text: string): Record<string, string> {
  const parsed = parseYaml(text);
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("secrets.enc must be a YAML map of key: value pairs.");
  }
  const result: Record<string, string> = {};
  for (
    const [key, value] of Object.entries(parsed as Record<string, unknown>)
  ) {
    if (typeof value !== "string") {
      throw new Error(`secrets.enc's value for "${key}" must be a string.`);
    }
    result[key] = value;
  }
  return result;
}

/** Reads one key out of `contexts/<name>/secrets.enc`, decrypting its value if it's an ENC[...] marker. Undefined if the file or the key is missing. `privateKey` is resolved lazily by the caller — only actually needed once an ENC[...] value is found. */
async function loadFromSecretsFile(
  path: string,
  key: string,
  resolvePrivateKey: () => Promise<string>,
): Promise<LoadedValue | undefined> {
  if (!await exists(path, { isFile: true })) return undefined;
  const parsed = parseSecretsFile(await Deno.readTextFile(path));
  if (!Object.hasOwn(parsed, key)) return undefined;
  const raw = parsed[key];
  if (!isEncryptedMarker(raw)) return { scalar: raw };
  return { scalar: await decryptValue(await resolvePrivateKey(), raw) };
}

/** Reads a raw file's content verbatim, no parsing — used by contextFile(), which wants a real path on disk, not a parsed value. */
async function loadFile(path: string): Promise<string | undefined> {
  return await exists(path, { isFile: true }) ? path : undefined;
}

/** Decrypts `<filename>.enc` under a secrets/ directory into a temp file under `runDir`, returning its path — used by contextSecretFile(). Undefined if the encrypted file doesn't exist. */
async function loadEncryptedFile(
  dir: string,
  filename: string,
  runDir: string,
  resolvePrivateKey: () => Promise<string>,
): Promise<string | undefined> {
  const encryptedPath = join(dir, `${filename}.enc`);
  if (!await exists(encryptedPath, { isFile: true })) return undefined;
  const encryptedBytes = await Deno.readFile(encryptedPath);
  const decryptedBytes = await decryptFile(
    await resolvePrivateKey(),
    encryptedBytes,
  );
  const outDir = join(runDir, "context-files");
  await Deno.mkdir(outDir, { recursive: true });
  const outPath = join(outDir, filename);
  await Deno.writeFile(outPath, decryptedBytes);
  return outPath;
}

/**
 * Reads variables/secrets from a folder convention next to the workflow's
 * own `workflow.yml`: every declared `context.variables` entry is a
 * `KEY=value` line in `contexts/<name>/variables.env`, while every declared
 * `context.secrets` entry is a `KEY: value` line in `contexts/<name>/
 * secrets.enc` (a YAML map — keys stay cleartext for readable diffs, values
 * are `ENC[X25519,...]` markers decrypted with the resolved private key; see
 * secrets-crypto.ts). `contextFile("NAME.ext")` is a separate mechanism for
 * raw plaintext file content a tool needs verbatim (e.g. `terraform
 * -var-file`) — those live as individually-named files directly under
 * `contexts/<name>/` (so avoid naming one `variables.env` or `secrets.enc` —
 * those two names are already taken by the mechanisms above, and `secrets/`
 * by the one below). `contextSecretFile("NAME.ext")` is the same idea but
 * encrypted whole-file: `contexts/<name>/secrets/NAME.ext.enc`, decrypted to
 * a temp path under `runDir` at resolve time.
 */
export function createLocalLoader(
  workflowDir: string,
  resolvePrivateKey: () => Promise<string>,
  runDir: string,
): ContextLoader {
  const contextsRoot = join(workflowDir, "contexts");

  return {
    name: "local",
    async isAvailable(contextName: string): Promise<boolean> {
      return await exists(join(contextsRoot, contextName), {
        isDirectory: true,
      });
    },
    loadVariable(
      contextName: string,
      key: string,
    ): Promise<LoadedValue | undefined> {
      return loadFromEnvFile(
        join(contextsRoot, contextName, "variables.env"),
        key,
      );
    },
    loadSecret(
      contextName: string,
      key: string,
    ): Promise<LoadedValue | undefined> {
      return loadFromSecretsFile(
        join(contextsRoot, contextName, "secrets.enc"),
        key,
        resolvePrivateKey,
      );
    },
    loadVariableFile(
      contextName: string,
      filename: string,
    ): Promise<string | undefined> {
      return loadFile(join(contextsRoot, contextName, filename));
    },
    loadSecretFile(
      contextName: string,
      filename: string,
    ): Promise<string | undefined> {
      return loadEncryptedFile(
        join(contextsRoot, contextName, "secrets"),
        filename,
        runDir,
        resolvePrivateKey,
      );
    },
  };
}

/**
 * Same shared-file convention as createLocalLoader, but rooted at
 * `<repoRoot>/.ensemble/global/` instead of a single workflow's own
 * `contexts/<name>/` — one shared place to provision a value every workflow
 * on this host needs (e.g. registry credentials), instead of copy-pasting it
 * into each workflow's own `contexts/<name>/secrets.enc`. `contextName` is
 * accepted (to satisfy ContextLoader) but ignored: there's only one global
 * tier, not one per `--context` name — see resolve.ts's selectLoaders,
 * which appends this after the per-context loader as a fallback tier.
 */
export function createLocalGlobalLoader(
  repoRoot: string,
  resolvePrivateKey: () => Promise<string>,
  runDir: string,
): ContextLoader {
  const globalRoot = join(repoRoot, ".ensemble", "global");

  return {
    name: "local",
    async isAvailable(): Promise<boolean> {
      return await exists(globalRoot, { isDirectory: true });
    },
    loadVariable(
      _contextName: string,
      key: string,
    ): Promise<LoadedValue | undefined> {
      return loadFromEnvFile(join(globalRoot, "variables.env"), key);
    },
    loadSecret(
      _contextName: string,
      key: string,
    ): Promise<LoadedValue | undefined> {
      return loadFromSecretsFile(
        join(globalRoot, "secrets.enc"),
        key,
        resolvePrivateKey,
      );
    },
    loadVariableFile(
      _contextName: string,
      filename: string,
    ): Promise<string | undefined> {
      return loadFile(join(globalRoot, filename));
    },
    loadSecretFile(
      _contextName: string,
      filename: string,
    ): Promise<string | undefined> {
      return loadEncryptedFile(
        join(globalRoot, "secrets"),
        filename,
        runDir,
        resolvePrivateKey,
      );
    },
  };
}
