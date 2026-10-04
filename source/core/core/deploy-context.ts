import { basename, join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseEnvFile } from "@std/dotenv";
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
 * `.ensemble/deploy/<name>/secrets.env` — untracked (`.ensemble/.gitignore`
 * ignores `deploy/`), holding the values `variables.env` must not commit. Its
 * keys never reach `Deno.env` on their own: a secret is only exposed by a
 * `variables.env` entry interpolating it (`DB_PASSWORD=${db_password}`), so
 * `variables.env` stays the single declaration of what a deployment reads —
 * the seam a CI platform's secret store will later stand in for.
 */
export function secretsEnvPath(repoRoot: string, name: string): string {
  return join(repoRoot, ".ensemble", "deploy", name, "secrets.env");
}

async function readOptionalText(path: string): Promise<string> {
  if (!await exists(path, { isFile: true })) return "";
  return await Deno.readTextFile(path);
}

/**
 * The keys an env file declares, read without parsing it: @std/dotenv
 * expands values as it parses, and `KEY=${KEY}` recurses until the stack
 * overflows — so the shadowing check below has to run before any parse.
 */
function declaredKeys(text: string): string[] {
  const keys = text.matchAll(
    /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm,
  );
  return [...new Set([...keys].map(([, key]) => key))];
}

/**
 * @std/dotenv only expands `${KEY}`/`$KEY` in UNQUOTED values, looking up the
 * same file's keys and then `Deno.env` — and an unresolved one silently
 * becomes the string "undefined". So references are checked up front against
 * everything they could resolve to, failing loudly instead of deploying that.
 */
function assertReferencesResolve(
  variablesText: string,
  known: ReadonlySet<string>,
  secretsPath: string,
): void {
  const references = variablesText.matchAll(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}|(?<!\\)\$([A-Za-z_][A-Za-z0-9_]*)/g,
  );
  const missing = new Set<string>();
  for (const [reference, braced, bare] of references) {
    const key = braced ?? bare;
    if (reference.includes(":-")) continue;
    if (known.has(key) || Deno.env.get(key) !== undefined) continue;
    missing.add(key);
  }
  if (missing.size === 0) return;
  throw new Error(
    `variables.env references ${
      [...missing].join(", ")
    }, defined neither in it, in ${secretsPath}, nor in the environment`,
  );
}

/**
 * `ci/<name>/variables.env`, sibling to the manifest itself, is dev-only
 * DEFAULTS for `variables`/`secrets` declared `source: environment` — optional,
 * silently absent for any project that doesn't have one. Its values may
 * interpolate keys of the deployment's `secrets.env` (see `secretsEnvPath`).
 * A real pipeline exports its own real values before invoking `ens`, and
 * those must always win, so a key already present in `Deno.env` is never
 * overwritten here.
 */
export async function loadVariablesEnvDefaults(
  repoRoot: string,
  name: string,
): Promise<void> {
  const variablesText = await readOptionalText(
    join(repoRoot, "ci", name, "variables.env"),
  );
  if (variablesText === "") return;

  const secretsPath = secretsEnvPath(repoRoot, name);
  const secretsText = await readOptionalText(secretsPath);
  const secrets = parseEnvFile(secretsText);
  const ownKeys = declaredKeys(variablesText);
  // Same key in both would shadow the secret in the merged parse below, and
  // `KEY=${KEY}` then expands into itself forever inside @std/dotenv.
  const shadowed = ownKeys.filter((key) => Object.hasOwn(secrets, key));
  if (shadowed.length > 0) {
    throw new Error(
      `${
        shadowed.join(", ")
      } defined in both variables.env and ${secretsPath} — name the secret differently and interpolate it`,
    );
  }
  assertReferencesResolve(
    variablesText,
    new Set([...Object.keys(secrets), ...ownKeys]),
    secretsPath,
  );

  // Parsed as one file, secrets first, so @std/dotenv's own expansion sees
  // them as earlier keys; only variables.env's own keys are kept.
  const merged = parseEnvFile(`${secretsText}\n${variablesText}`);
  for (const key of ownKeys) {
    const envVar = environmentVariableName(key);
    if (Deno.env.get(envVar) === undefined) {
      Deno.env.set(envVar, merged[key]!);
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

  const workloadDir = join(repoRoot, "ci", name);
  const manifestPath = await new Deploy.Manifest.Locator().find(workloadDir);
  if (!manifestPath) {
    throw new Error(
      `Delivery manifest not found in ${workloadDir} (expected ${
        Deploy.Manifest.Locator.FILE_NAMES.join(" or ")
      })`,
    );
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
