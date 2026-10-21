import { basename, join, normalize, relative } from "@std/path";
import { exists } from "@std/fs";
import * as Deploy from "./deploy/index.ts";
import type { RepoLocator } from "./ports.ts";
import { DeploymentEnvironment, type EnvFiles } from "./env-files.ts";
import { DeployKitChoice } from "./deploy-kit-choice.ts";

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

/** Thrown when a container's `files` entry names no readable file in the project. */
export class ContainerFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContainerFileError";
  }
}

/**
 * `container-orchestrated.v1`'s optional `files` param (see its contract
 * comment): each `{ source, path }` entry's project-relative `source` read
 * into `{ path, content }`, here for the same reason `init` paths are
 * resolved here — a provisioner has no filesystem of its own. A source
 * outside the project is refused: the manifest names the project's own files.
 */
export async function readContainerFiles(
  workload: Deploy.Workload,
  repoRoot: string,
): Promise<Deploy.Workload> {
  const compute = workload.compute;
  if (!compute) return workload;

  const resolved: Record<string, Deploy.ResourceDeclaration> = {};
  let changed = false;
  for (const [name, declaration] of Object.entries(compute)) {
    const files = declaration.params.files;
    if (
      declaration.type !== "container-orchestrated" || !Array.isArray(files)
    ) {
      resolved[name] = declaration;
      continue;
    }
    changed = true;
    resolved[name] = {
      ...declaration,
      params: {
        ...declaration.params,
        files: await Promise.all(
          files.map((entry) => readContainerFile(name, entry, repoRoot)),
        ),
      },
    };
  }
  return changed ? { ...workload, compute: resolved } : workload;
}

async function readContainerFile(
  compute: string,
  entry: unknown,
  repoRoot: string,
): Promise<{ path: string; content: string }> {
  const { source, path } = (entry ?? {}) as Record<string, unknown>;
  if (typeof source !== "string" || typeof path !== "string") {
    throw new ContainerFileError(
      `compute.${compute}.files: each entry is { source, path }, both strings.`,
    );
  }
  const within = relative(repoRoot, normalize(join(repoRoot, source)));
  if (within.startsWith("..")) {
    throw new ContainerFileError(
      `compute.${compute}.files: "${source}" is outside the project.`,
    );
  }
  try {
    return { path, content: await Deno.readTextFile(join(repoRoot, within)) };
  } catch (error) {
    throw new ContainerFileError(
      `compute.${compute}.files: can't read "${source}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** A workload as its manifest declares it, with where its deploy kit is — everything about a deployment short of loading the kit. */
export interface WorkloadContext {
  readonly repoRoot: string;
  readonly workload: Deploy.Workload;
  readonly registry: Deploy.Contracts.Registry;
  /** The deploy kit's name — the command's, else the project's configured one for this deployment (see `DeployKitChoice`). */
  readonly kit: string;
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

export interface WorkloadLoadOptions {
  /** Env files supplying values beneath the process environment — see `DeploymentEnvironment`. Empty for a real pipeline. */
  readonly envFiles: EnvFiles;
  /** Whether every value the manifest needs must be present in the environment (default). Off for what only reads the manifest — which kits can deploy it — and renders nothing. */
  readonly requireEnvironment?: boolean;
  /** The kit to use when neither the command nor `.ensemble/config.yaml` names one (`ens develop`'s compose). None: one of them has to. */
  readonly fallbackKit?: string;
}

/**
 * Everything about a deployment short of loading its kit: the repo, the
 * workload its manifest declares (with the given env files' values put into
 * the environment, and every value it needs confirmed present), and where its kit and the kit's config are.
 * For what needs the kit only sometimes (`ens delivery task`).
 */
export async function loadWorkload(
  name: string,
  requestedKit: string | undefined,
  repo: RepoLocator,
  options: WorkloadLoadOptions,
): Promise<WorkloadContext> {
  const repoRoot = await repo.findRepoRoot();
  const kit = await new DeployKitChoice(repoRoot).for(
    name,
    requestedKit,
    options.fallbackKit,
  );
  const environment = new DeploymentEnvironment(repoRoot);
  await environment.load(
    typeof options.envFiles === "function"
      ? options.envFiles(kit)
      : options.envFiles,
  );

  const workloadDir = join(repoRoot, "ci", name);
  const manifestPath = await new Deploy.Manifest.Locator().find(workloadDir);
  if (!manifestPath) {
    throw new Error(
      `Delivery manifest not found in ${workloadDir} (expected ${
        Deploy.Manifest.Locator.FILE_NAMES.join(" or ")
      })`,
    );
  }
  const workload = await readContainerFiles(
    resolveRelationalInitPaths(
      await new Deploy.Manifest.Loader(
        new Deploy.Manifest.Parser(),
      ).loadFile(manifestPath),
      repoRoot,
    ),
    repoRoot,
  );
  if (options.requireEnvironment !== false) {
    environment.assertComplete(workload);
  }

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
    kit,
    kitDir,
    kitConfigPath: join(repoRoot, "ci", name, `${kit}.config.yml`),
  };
}

/** Resolves a deployment's manifest and kit by name — the one place `ens deploy` and `ens deploy explain` share this lookup (`ci/<name>/delivery.yml`, `.ensemble/kits/deploy/<kit>/`), so the two commands can't drift on how a deployment is found. */
export async function loadDeployContext(
  name: string,
  kit: string | undefined,
  repo: RepoLocator,
  kitLoader: Deploy.KitLoader,
  options: WorkloadLoadOptions,
): Promise<DeployContext> {
  const context = await loadWorkload(name, kit, repo, options);
  const loaded = await kitLoader.load(context.kitDir, [context.kitConfigPath]);

  return {
    ...context,
    target: { kit: loaded.kit, runtime: loaded.runtime },
  };
}
