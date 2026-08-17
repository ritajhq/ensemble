import { join } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import type { Context } from "../schema.ts";
import type { ContextFileReference } from "../expressions.ts";
import { createLocalGlobalLoader, createLocalLoader } from "./local.ts";
import { resolvePrivateKey } from "./secrets-crypto.ts";
import type { ContextLoader, LoadedValue } from "./types.ts";

export type { ContextLoader, LoadedValue } from "./types.ts";

export class ContextResolutionError extends Error {}

/** One resolved `context.variables` entry, addressable via `${{ context.variables.<key> }}` as an alternative to its `NAME`/`NAME_FILE` env vars. */
export interface ResolvedVariable {
  name: string;
  value: string;
  path: string;
}

export interface ResolvedContext {
  /** Every declared variable/secret's env vars: `NAME` (+ `NAME_FILE` once materialized). */
  env: Record<string, string>;
  /** `context.variables` only (not secrets), keyed by name, for `${{ context.variables.<key>.{name,value,path} }}` interpolation. */
  variables: Record<string, ResolvedVariable>;
  /** Every `contextFile("<filename>")` call statically found in the workflow, keyed by filename, resolved to a real path. */
  files: Record<string, string>;
  /** Every `contextSecretFile("<filename>")` call statically found in the workflow, keyed by filename, resolved to a real path. */
  secretFiles: Record<string, string>;
}

/** Wraps resolvePrivateKey so it's read/resolved at most once per resolveContext call, and only if an actual encrypted lookup needs it. */
function makeLazyPrivateKeyResolver(
  repoRoot: string | undefined,
): () => Promise<string> {
  let cached: Promise<string> | undefined;
  return () => {
    if (repoRoot === undefined) {
      return Promise.reject(
        new Error("Can't resolve a secrets private key without a repo root."),
      );
    }
    cached ??= resolvePrivateKey(repoRoot);
    return cached;
  };
}

/**
 * Builds the ordered list of loaders to try for a declared variable/secret
 * without an inline `value`: this workflow's own per-`--context` local
 * loader first, then the host-level global tier (`.ensemble/global/`,
 * shared by every workflow — see createLocalGlobalLoader) as a fallback, so
 * a frequently-needed value (e.g. registry credentials) can be provisioned
 * once instead of per-workflow.
 */
function selectLoaders(
  workflowDir: string,
  runDir: string,
  repoRoot: string | undefined,
): ContextLoader[] {
  const resolveKey = makeLazyPrivateKeyResolver(repoRoot);
  const perContext = [createLocalLoader(workflowDir, resolveKey, runDir)];
  const global = repoRoot !== undefined
    ? [createLocalGlobalLoader(repoRoot, resolveKey, runDir)]
    : [];
  return [...perContext, ...global];
}

/** Writes `scalar` out to its own file under `runDir`, for a value a loader supplied only as a scalar. */
async function materializeScalarToFile(
  runDir: string,
  key: string,
  scalar: string,
): Promise<string> {
  const dir = join(runDir, "context-files");
  await ensureDir(dir);
  const filePath = join(dir, key);
  await Deno.writeTextFile(filePath, scalar);
  return filePath;
}

interface ResolveOneOptions {
  key: string;
  value: string | undefined;
  default: string | undefined;
  /** The --context name (if any) to resolve per-context loaders against; passed through as "" when absent so the global loader (which ignores it) still gets a try. */
  contextName: string | undefined;
  loaders: ContextLoader[];
  load: (
    loader: ContextLoader,
    contextName: string,
    key: string,
  ) => Promise<LoadedValue | undefined>;
  runDir: string;
  missing: string[];
  env: Record<string, string>;
  /** Caller-supplied overrides (e.g. --env-file/-v, or a manual trigger's `variables`) — checked before any loader, same precedence the old secrets: had over Deno.env. */
  callerVars: Record<string, string>;
}

async function resolveOne(options: ResolveOneOptions): Promise<void> {
  const {
    key,
    value,
    contextName,
    loaders,
    load,
    runDir,
    missing,
    env,
    callerVars,
  } = options;

  if (value !== undefined) {
    env[key] = value;
    env[`${key}_FILE`] = await materializeScalarToFile(runDir, key, value);
    return;
  }

  if (callerVars[key] !== undefined) {
    env[key] = callerVars[key];
    env[`${key}_FILE`] = await materializeScalarToFile(
      runDir,
      key,
      callerVars[key],
    );
    return;
  }

  // Every loader gets tried with contextName ?? "": a per-context loader
  // naturally reports no match for an empty/absent name (its folder
  // convention is keyed by --context name), while the global loader ignores
  // the name argument entirely (see createLocalGlobalLoader) — so it's still
  // worth trying even when no --context was given.
  let found: LoadedValue | undefined;
  for (const loader of loaders) {
    found = await load(loader, contextName ?? "", key);
    if (found !== undefined) break;
  }

  if (found === undefined) {
    if (options.default !== undefined) {
      env[key] = options.default;
      env[`${key}_FILE`] = await materializeScalarToFile(
        runDir,
        key,
        options.default,
      );
      return;
    }
    missing.push(key);
    return;
  }

  const scalar = found.scalar ??
    (found.filePath !== undefined
      ? await Deno.readTextFile(found.filePath)
      : undefined);
  const filePath = found.filePath ??
    (found.scalar !== undefined
      ? await materializeScalarToFile(runDir, key, found.scalar)
      : undefined);
  if (scalar !== undefined) env[key] = scalar;
  if (filePath !== undefined) env[`${key}_FILE`] = filePath;
}

async function resolveFile(
  filename: string,
  contextName: string | undefined,
  loaders: ContextLoader[],
  load: (
    loader: ContextLoader,
    contextName: string,
    filename: string,
  ) => Promise<string | undefined>,
  missing: string[],
  out: Record<string, string>,
): Promise<void> {
  for (const loader of loaders) {
    const path = await load(loader, contextName ?? "", filename);
    if (path !== undefined) {
      out[filename] = path;
      return;
    }
  }
  missing.push(filename);
}

/**
 * Resolves every entry under `context.variables`/`context.secrets` into env
 * vars, trying loaders in sequence for anything without an inline `value` —
 * plus every `contextFile("<filename>")`/`contextSecretFile("<filename>")`
 * call statically found anywhere in `fileRefs` (see
 * parse.ts's findContextFileReferences), independent of whether the
 * workflow declares a `context:` block at all. Fails fast — before any job
 * runs — with every unresolved name/filename listed at once, matching how
 * `secrets:`/`contexts:` validation worked before this (see
 * run-workflow.ts's runWorkflow, which calls this once up front).
 */
export async function resolveContext(
  context: Context | undefined,
  fileRefs: ContextFileReference[],
  contextName: string | undefined,
  workflowDir: string,
  runDir: string,
  callerVars: Record<string, string> = {},
  repoRoot: string | undefined = undefined,
): Promise<ResolvedContext> {
  const env: Record<string, string> = {};
  const variables: Record<string, ResolvedVariable> = {};
  const files: Record<string, string> = {};
  const secretFiles: Record<string, string> = {};
  if (context === undefined && fileRefs.length === 0) {
    return { env, variables, files, secretFiles };
  }

  const loaders = selectLoaders(workflowDir, runDir, repoRoot);
  const missing: string[] = [];

  for (const variable of context?.variables ?? []) {
    const key = variable.name;
    await resolveOne({
      key,
      value: variable.value,
      default: variable.default,
      contextName,
      loaders,
      load: (loader, name, k) => loader.loadVariable(name, k),
      runDir,
      missing,
      env,
      callerVars,
    });
    if (env[key] !== undefined) {
      variables[key] = { name: key, value: env[key], path: env[`${key}_FILE`] };
    }
  }

  for (const secret of context?.secrets ?? []) {
    await resolveOne({
      key: secret.name,
      value: undefined,
      default: secret.default,
      contextName,
      loaders,
      load: (loader, name, k) => loader.loadSecret(name, k),
      runDir,
      missing,
      env,
      callerVars,
    });
  }

  const missingFiles: string[] = [];
  for (const ref of fileRefs) {
    if (ref.kind === "file") {
      await resolveFile(
        ref.filename,
        contextName,
        loaders,
        (loader, name, f) => loader.loadVariableFile(name, f),
        missingFiles,
        files,
      );
    } else {
      await resolveFile(
        ref.filename,
        contextName,
        loaders,
        (loader, name, f) => loader.loadSecretFile(name, f),
        missingFiles,
        secretFiles,
      );
    }
  }

  if (missing.length > 0) {
    throw new ContextResolutionError(
      `"context" declares ${
        missing.length === 1 ? "a variable/secret" : "variables/secrets"
      } with no value: ${
        missing.join(", ")
      }. Provide a "--context <name>" whose loader supplies ${
        missing.length === 1 ? "it" : "them"
      }, or set a "default".`,
    );
  }

  if (missingFiles.length > 0) {
    throw new ContextResolutionError(
      `workflow references ${
        missingFiles.length === 1 ? "a context file" : "context files"
      } no loader could find: ${
        missingFiles.join(", ")
      }. Provide a "--context <name>" whose loader supplies ${
        missingFiles.length === 1 ? "it" : "them"
      }.`,
    );
  }

  return { env, variables, files, secretFiles };
}
