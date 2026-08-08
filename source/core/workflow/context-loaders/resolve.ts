import { join } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import type { Context } from "../schema.ts";
import { createLocalGlobalLoader, createLocalLoader } from "./local.ts";
import { createVaultLoader } from "./vault.ts";
import type { ContextLoader, LoadedValue } from "./types.ts";

export type { ContextLoader, LoadedValue } from "./types.ts";

export class ContextResolutionError extends Error {}

export type ContextSource = "local" | "vault";

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
}

/**
 * Builds the ordered list of loaders to try for a declared variable/secret
 * without an inline `value`: this workflow's own per-`--context` loader(s)
 * first, then the host-level global tier (`.ensemble/global/`, shared by
 * every workflow — see createLocalGlobalLoader) as a fallback, so a
 * frequently-needed value (e.g. registry credentials) can be provisioned
 * once instead of per-workflow. An explicit `source` restricts the
 * per-context loader to just that one — no falling through to the other —
 * since an explicit choice (a server forcing "vault", say) is a hard
 * constraint, not a preference: silently falling back to a local `contexts/`
 * folder that happens to exist on disk would defeat the point of forcing a
 * single source of truth. The global tier is always local-only for now
 * (no vault-backed global tier yet) and is always tried regardless of
 * `source`, since it's a separate concern from which per-context loader won.
 */
function selectLoaders(workflowDir: string, repoRoot: string | undefined, source: ContextSource | undefined): ContextLoader[] {
  const local = createLocalLoader(workflowDir);
  const vault = createVaultLoader();
  const perContext = source === "local" ? [local] : source === "vault" ? [vault] : [local, vault];
  const global = repoRoot !== undefined ? [createLocalGlobalLoader(repoRoot)] : [];
  return [...perContext, ...global];
}

/** Writes `scalar` out to its own file under `runDir`, for a value a loader supplied only as a scalar. */
async function materializeScalarToFile(runDir: string, key: string, scalar: string): Promise<string> {
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
  load: (loader: ContextLoader, contextName: string, key: string) => Promise<LoadedValue | undefined>;
  runDir: string;
  missing: string[];
  env: Record<string, string>;
  /** Caller-supplied overrides (e.g. --env-file/-v, or a manual trigger's `variables`) — checked before any loader, same precedence the old secrets: had over Deno.env. */
  callerVars: Record<string, string>;
}

async function resolveOne(options: ResolveOneOptions): Promise<void> {
  const { key, value, contextName, loaders, load, runDir, missing, env, callerVars } = options;

  if (value !== undefined) {
    env[key] = value;
    env[`${key}_FILE`] = await materializeScalarToFile(runDir, key, value);
    return;
  }

  if (callerVars[key] !== undefined) {
    env[key] = callerVars[key];
    env[`${key}_FILE`] = await materializeScalarToFile(runDir, key, callerVars[key]);
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
      env[`${key}_FILE`] = await materializeScalarToFile(runDir, key, options.default);
      return;
    }
    missing.push(key);
    return;
  }

  const scalar = found.scalar ?? (found.filePath !== undefined ? await Deno.readTextFile(found.filePath) : undefined);
  const filePath = found.filePath ?? (found.scalar !== undefined ? await materializeScalarToFile(runDir, key, found.scalar) : undefined);
  if (scalar !== undefined) env[key] = scalar;
  if (filePath !== undefined) env[`${key}_FILE`] = filePath;
}

/**
 * Resolves every entry under `context.variables`/`context.secrets` into env
 * vars, trying loaders in sequence for anything without an inline `value`.
 * Fails fast — before any job runs — with every unresolved name listed at
 * once, matching how `secrets:`/`contexts:` validation worked before this
 * (see run-workflow.ts's runWorkflow, which calls this once up front).
 */
export async function resolveContext(
  context: Context | undefined,
  contextName: string | undefined,
  workflowDir: string,
  runDir: string,
  source: ContextSource | undefined,
  callerVars: Record<string, string> = {},
  repoRoot: string | undefined = undefined,
): Promise<ResolvedContext> {
  const env: Record<string, string> = {};
  const variables: Record<string, ResolvedVariable> = {};
  if (context === undefined) return { env, variables };

  const loaders = selectLoaders(workflowDir, repoRoot, source);
  const missing: string[] = [];

  for (const [key, variable] of Object.entries(context.variables ?? {})) {
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

  for (const secret of context.secrets ?? []) {
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

  if (missing.length > 0) {
    throw new ContextResolutionError(
      `"context" declares ${missing.length === 1 ? "a variable/secret" : "variables/secrets"} with no value: ${
        missing.join(", ")
      }. Provide a "--context <name>" whose loader supplies ${
        missing.length === 1 ? "it" : "them"
      }, or set a "default".`,
    );
  }

  return { env, variables };
}
