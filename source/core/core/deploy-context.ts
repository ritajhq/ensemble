import { basename, join } from "@std/path";
import { exists } from "@std/fs";
import { load as loadEnvFile } from "@std/dotenv";
import * as Deploy from "./deploy/index.ts";
import type { RepoLocator } from "./ports.ts";

/**
 * `relational.v1`'s optional `init` param (Section 6 of its own contract
 * comment) is a list of project-relative file paths — the only param on any
 * contract today that names a file rather than passing data through
 * untouched, so it's the only one needing repo-relative resolution. A
 * provisioner never receives `repoRoot` (G6: the render pass is pure, no
 * filesystem/environment context of its own), so this is resolved here
 * instead — the one place both the freshly parsed `workload` and `repoRoot`
 * are already in scope together, before either ever reaches the render
 * pipeline. Leaves every other resource, and every other param, untouched.
 */
export function resolveRelationalInitPaths(
  workload: Deploy.Workload,
  repoRoot: string,
): Deploy.Workload {
  const databases = workload.databases;
  if (!databases) return workload;

  const resolved: Record<string, Deploy.ResourceDeclaration> = {};
  let changed = false;
  for (const [name, declaration] of Object.entries(databases)) {
    const init = declaration.params.init;
    if (declaration.type !== "relational" || !Array.isArray(init)) {
      resolved[name] = declaration;
      continue;
    }
    changed = true;
    resolved[name] = {
      ...declaration,
      params: {
        ...declaration.params,
        init: init.map((path) =>
          typeof path === "string" ? join(repoRoot, path) : path
        ),
      },
    };
  }
  return changed ? { ...workload, databases: resolved } : workload;
}

/**
 * `variables`/`secrets` with `source: environment` are read straight off
 * `Deno.env` at render time (Renderer.resolveVariableReference,
 * composeSecretWiring) under an uppercase, dash-to-underscore name — so a
 * dev-only defaults file needs to apply that exact same transform before
 * setting anything, or a lowercase `frontend_base_url` key would sit in
 * `Deno.env` right next to the `FRONTEND_BASE_URL` the render pipeline
 * actually looks up and never be seen.
 */
function environmentVariableName(name: string): string {
  return name.toUpperCase().replace(/-/g, "_");
}

/**
 * `ci/<name>/variables.env`, sibling to the manifest itself, is dev-only
 * DEFAULTS for `variables`/`secrets` declared `source: environment` — optional,
 * silently absent for any project that doesn't have one. A real pipeline
 * exports its own real values before invoking `ens`, and those must always
 * win, so a key already present in `Deno.env` is never overwritten here.
 */
export async function loadVariablesEnvDefaults(
  repoRoot: string,
  name: string,
): Promise<void> {
  const envPath = join(repoRoot, "ci", name, "variables.env");
  if (!await exists(envPath, { isFile: true })) return;

  const fileVars = await loadEnvFile({ envPath, export: false });
  for (const [key, value] of Object.entries(fileVars)) {
    const envVar = environmentVariableName(key);
    if (Deno.env.get(envVar) === undefined) {
      Deno.env.set(envVar, value);
    }
  }
}

/** A workload as its manifest declares it, with where its deploy kit is — everything about a deployment short of loading the kit. */
export interface WorkloadContext {
  readonly repoRoot: string;
  readonly workload: Deploy.Workload;
  readonly registry: Deploy.Contracts.Registry;
  /** The vendored deploy kit's directory, `.ensemble/kits/deploy/<kit>/`. */
  readonly kitDir: string;
  /** The workload's own config for that kit, `ci/<name>/<kit>.config.yml`, which may not exist. */
  readonly kitConfigPath: string;
}

export interface DeployContext extends WorkloadContext {
  readonly target: Deploy.Target;
}

/**
 * The deployment's own scoping name, in the one shared namespace a target
 * cares about (a compose project name, a CloudFormation stack name):
 * `"<repo folder>-<workload>"`, not the bare workload name, so two repos — or
 * two worktrees of one — don't collide on a single host. Exported because
 * more than the deploy needs it: `${deployment.name}` in a task argument
 * (`./task.ts`) hands the same string to a script, which would otherwise
 * have to re-derive this rule and drift from it.
 */
export function deploymentNameFor(repoRoot: string, name: string): string {
  return `${basename(repoRoot)}-${name}`;
}

/**
 * Everything about a deployment short of loading its kit: the repo, the
 * workload its manifest declares (with `ci/<name>/variables.env`'s defaults
 * put into the environment), and where its kit and the kit's config are.
 * For what needs the kit only sometimes (`ens delivery task`).
 */
export async function loadWorkload(
  name: string,
  kit: string,
  repo: RepoLocator,
): Promise<WorkloadContext> {
  const repoRoot = await repo.findRepoRoot();
  await loadVariablesEnvDefaults(repoRoot, name);

  const manifestPath = join(repoRoot, "ci", name, "delivery.yml");
  if (!await exists(manifestPath, { isFile: true })) {
    throw new Error(`Delivery manifest not found at ${manifestPath}`);
  }
  const workload = resolveRelationalInitPaths(
    await new Deploy.Manifest.Loader(
      new Deploy.Manifest.Parser(),
    ).loadFile(manifestPath),
    repoRoot,
  );

  const kitDir = join(repoRoot, ".ensemble", "kits", "deploy", kit);
  if (!await exists(join(kitDir, "main.ts"), { isFile: true })) {
    throw new Error(
      `Deploy kit "${kit}" not found (expected ${kitDir}/main.ts)`,
    );
  }

  return {
    repoRoot,
    workload,
    registry: new Deploy.Contracts.Catalog(Deploy.Contracts.SEEDED),
    kitDir,
    kitConfigPath: join(repoRoot, "ci", name, `${kit}.config.yml`),
  };
}

/** Resolves a deployment's manifest and kit by name — the one place `ens deploy` and `ens deploy explain` share this lookup (`ci/<name>/delivery.yml`, `.ensemble/kits/deploy/<kit>/`), so the two commands can't drift on how a deployment is found. */
export async function loadDeployContext(
  name: string,
  kit: string,
  repo: RepoLocator,
  kitLoader: Deploy.KitLoader,
): Promise<DeployContext> {
  const context = await loadWorkload(name, kit, repo);
  const loaded = await kitLoader.load(context.kitDir, [context.kitConfigPath]);

  return {
    ...context,
    target: { kit: loaded.kit, runtime: loaded.runtime },
  };
}
