import { join } from "@std/path";
import * as Deploy from "./deploy/index.ts";
import {
  deploymentNameFor,
  loadWorkload,
  type WorkloadContext,
} from "./deploy-context.ts";
import {
  type ArgumentValue,
  DeploymentFingerprint,
  embedsRenderedReference,
  isRenderedArgument,
  type OperationSnapshot,
  OperationSnapshotFile,
} from "./operation-snapshot.ts";
import type { Instance } from "./instance.ts";
import type { RepoLocator } from "./ports.ts";
import type { EnvFiles } from "./env-files.ts";

/** Thrown when an operation name is asked for that the workload doesn't declare — an ordinary typo, named against the operations that *are* declared. */
export class UnknownOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownOperationError";
  }
}

/** Thrown when an operation's own `arguments` can't produce a value a process can be handed — an unresolvable `${deployment.*}` name, or a reference that resolves to something other than a single value. */
export class OperationArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationArgumentError";
  }
}

/** Thrown when the operation process itself exits non-zero. Deliberately its own error class: a failing operation is not a failing deployment (nothing else was touched), it's a failing *command*, and `ens` reports it as such and exits non-zero. */
export class OperationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationFailedError";
  }
}

export interface RunDeliveryOperationOptions {
  readonly artifacts: Deploy.ArtifactsSource;
  /** Only meaningful if an operation argument references `${release.<name>}` for published artifacts — same convention as `ens deploy --version`. */
  readonly version: string;
  /** Same as `RunDeployOptions.envFiles`. */
  readonly envFiles: EnvFiles;
  /** The instance of the workload whose deployment the operation acts on (`ens deploy --instance`); absent is its plain deployment. */
  readonly instance?: Instance;
}

/** What `${deployment.<name>}` may name (`./deploy/operation.ts` documents the set from the manifest's side). */
const DEPLOYMENT_VALUES = ["name", "artifact", "root"] as const;

/**
 * Runs one of a workload's declared operations (`ens operation <name>`). The kit is the caller's, and
 * names the folder (`ci/<name>/<kit>/operations/`) an operation's `script` is read from. See `./deploy/operation.ts` for
 * what an operation is and why it's invoked rather than fired by a deploy.
 *
 * The front half is `ens deploy explain`'s own — same manifest lookup, same
 * release locator, same render — because an operation argument may reference
 * anything a resource field may, and most of those are only knowable from a
 * completed render (`${databases.database.host}` is a provisioner's output,
 * not a declaration). To that the runner adds the one namespace a render
 * *can't* answer, because it isn't about resources at all: the deployment's
 * own identity (`${deployment.name}`, `${deployment.artifact}`,
 * `${deployment.root}`). That namespace is the point of the whole feature —
 * an operation greps what ens generated instead of hardcoding it — so it is resolved
 * here, where the deployment name, the artifact path the deploy writes to and
 * the workspace root are all in scope together.
 *
 * The operation process inherits `ens`'s own environment, which `loadWorkload`
 * has already filled from any `--env-file`, so a
 * `secrets`/`variables` value reaches an operation exactly as it reaches a deploy
 * and no secret has to travel through the manifest (G4) or through the
 * argument grammar.
 */
export async function runDeliveryOperation(
  name: string,
  requestedKit: string | undefined,
  operationName: string,
  operationArgs: readonly string[],
  options: RunDeliveryOperationOptions,
  repo: RepoLocator,
  gateway: Deploy.PackKitGateway,
  kitLoader: Deploy.KitLoader,
): Promise<void> {
  const context = await loadWorkload(name, requestedKit, repo, {
    envFiles: options.envFiles,
  });
  const { repoRoot, workload, kit } = context;

  const operations = workload.operations ?? {};

  const operation = operations[operationName];
  if (!operation) {
    const declared = Object.keys(operations);
    throw new UnknownOperationError(
      declared.length === 0
        ? `Workload "${name}" declares no operations.`
        : `No operation named "${operationName}" in workload "${name}". Declared: ${
          declared.join(", ")
        }.`,
    );
  }

  // Same scope `runDeploy` keeps the deployment's name and state under.
  const scope = options.instance ? options.instance.scope(name) : name;
  const deployment: Record<string, string> = {
    name: deploymentNameFor(repoRoot, scope),
    root: repoRoot,
  };

  const snapshot = await deployedSnapshot(
    context,
    name,
    scope,
    kit,
    operationName,
    operation,
  );
  const env = snapshot
    ? argumentsFromSnapshot(operation, operationName, snapshot, deployment, workload)
    : await argumentsFromRender(operation, context, deployment, scope, {
      options,
      gateway,
      kitLoader,
    });

  await runProcess(operation, {
    repoRoot,
    workload: name,
    kit,
    env,
    args: operationArgs,
  });
  console.log(`Ran operation "${operationName}" for "${name}".`);
}

/**
 * The snapshot the last deploy left for this operation (`./operation-snapshot.ts`),
 * when it still applies: the manifest, the kit and its config say what they
 * said at that deploy, and it holds every argument of this operation only a render
 * can answer. The deploy may have used other artifacts or another version
 * than this invocation asks for — the snapshot is what's running, which is
 * what an operation acts on. A snapshot gone stale is said so, once.
 */
async function deployedSnapshot(
  context: WorkloadContext,
  name: string,
  scope: string,
  kit: string,
  operationName: string,
  operation: Deploy.Operation,
): Promise<OperationSnapshot | undefined> {
  const snapshot = await OperationSnapshotFile.for(context.repoRoot, scope, kit)
    .read();
  if (!snapshot) return undefined;

  if (snapshot.fingerprint !== await DeploymentFingerprint.of(context)) {
    console.warn(
      `note: ci/${name}/delivery.yml or the "${kit}" kit changed since "${scope}" was last deployed with it — resolving the operation's arguments from the manifest as it is now, which may not be what's running.`,
    );
    return undefined;
  }

  const recorded = snapshot.arguments[operationName] ?? {};
  const complete = Object.entries(operation.arguments ?? {}).every((
    [argument, raw],
  ) =>
    (!isRenderedArgument(raw) || argument in recorded) &&
    !embedsRenderedReference(raw)
  );
  return complete ? snapshot : undefined;
}

/** Every argument resolved without a kit: rendered ones from the snapshot, the rest as the manifest and the environment say. */
function argumentsFromSnapshot(
  operation: Deploy.Operation,
  operationName: string,
  snapshot: OperationSnapshot,
  deployment: Readonly<Record<string, string>>,
  workload: Deploy.Workload,
): Record<string, string> {
  const context: SnapshotContext = {
    recorded: snapshot.arguments[operationName] ?? {},
    deployment: { ...deployment, artifact: snapshot.artifact },
    workload,
  };
  return Object.fromEntries(
    Object.entries(operation.arguments ?? {}).map(([argument, raw]) => [
      argument,
      String(snapshotArgument(argument, raw, context)),
    ]),
  );
}

interface SnapshotContext {
  readonly recorded: Readonly<Record<string, ArgumentValue>>;
  readonly deployment: Readonly<Record<string, string>>;
  readonly workload: Deploy.Workload;
}

function snapshotArgument(
  argument: string,
  raw: string | number | boolean,
  context: SnapshotContext,
): unknown {
  const syntax = new Deploy.ReferenceSyntax();
  const reference = syntax.parse(raw);
  if (!reference) {
    // Only references a render can't answer are embedded here: an argument
    // embedding one it can makes the snapshot incomplete (`deployedSnapshot`).
    return syntax.embedded(raw).reduce(
      (text, embedded) =>
        text.replace(
          embedded.text,
          String(
            snapshotReference(argument, embedded.reference, raw, context),
          ),
        ),
      String(raw),
    );
  }
  return snapshotReference(argument, reference, raw, context);
}

function snapshotReference(
  argument: string,
  reference: Deploy.Reference,
  raw: string | number | boolean,
  context: SnapshotContext,
): unknown {
  if (reference.category === "deployment") {
    return deploymentValue(reference, raw, context.deployment);
  }
  const declared = new Deploy.Render.DeclaredValues();
  if (declared.covers(reference)) {
    return declared.resolve(reference, context.workload);
  }
  return context.recorded[argument];
}

/**
 * Every argument resolved by rendering. Only `${deployment.artifact}` needs
 * the whole workload rendered (it names the file that render is presented
 * as); any other operation renders just the resources its arguments reference,
 * and what those depend on — for most operations a database, or nothing at all.
 */
async function argumentsFromRender(
  operation: Deploy.Operation,
  context: WorkloadContext,
  deployment: Record<string, string>,
  scope: string,
  deps: {
    readonly options: RunDeliveryOperationOptions;
    readonly gateway: Deploy.PackKitGateway;
    readonly kitLoader: Deploy.KitLoader;
  },
): Promise<Record<string, string>> {
  const { repoRoot, workload, registry } = context;
  const loaded = await deps.kitLoader.load(context.kitDir, [
    context.kitConfigPath,
  ]);
  const target: Deploy.Target = { kit: loaded.kit, runtime: loaded.runtime };

  const references = argumentReferences(operation);
  const needsArtifact = references.some((reference) =>
    reference.category === "deployment" && reference.name === "artifact"
  );
  const rendered = needsArtifact ? workload : scopeTo(workload, references);

  const locatorResolver = new Deploy.ReleaseLocatorResolver(
    deps.gateway,
    context.kit,
  );
  const releaseLocator = new Deploy.PreresolvedReleaseLocator(
    await locatorResolver.resolveAll(
      rendered,
      deps.options.artifacts,
      deps.options.version,
    ),
  );
  const renderer = new Deploy.Render.Renderer(
    new Deploy.Render.ReferenceResolver(
      await target.kit.realization(),
      deployment.name,
    ),
    releaseLocator,
    registry,
  );

  const resolution = await new Deploy.Resolve.WorkloadResolver(registry)
    .resolve(
      rendered,
      target,
    );
  const graph = new Deploy.Resolve.DependencyGraphBuilder().build(rendered);
  const { artifacts, ledger } = await renderer.renderWithLedger(
    rendered,
    resolution.requests,
    resolution.selections,
    graph,
    deps.options.artifacts,
  );

  // The path the *deploy* writes its document to, derived the same way
  // `runDeploy` derives it (the sink owns that convention) rather than assumed.
  if (needsArtifact) {
    const presented = await target.kit.present(artifacts, graph);
    deployment.artifact = new Deploy.Terminations.FileArtifactSink(
      join(repoRoot, "source", "artifacts", "deploy", scope),
    ).pathFor(presented);
  }

  const env: Record<string, string> = {};
  for (const [argument, raw] of Object.entries(operation.arguments ?? {})) {
    env[argument] = String(
      await resolveArgument(raw, {
        deployment,
        renderer,
        ledger,
        workload: rendered,
      }),
    );
  }
  return env;
}

/** Every reference among an operation's arguments; a literal argument references nothing. */
function argumentReferences(operation: Deploy.Operation): Deploy.Reference[] {
  const syntax = new Deploy.ReferenceSyntax();
  return Object.values(operation.arguments ?? {}).flatMap((raw) => {
    const reference = syntax.parse(raw);
    if (reference) return [reference];
    return syntax.embedded(raw).map((embedded) => embedded.reference);
  });
}

/** The categories a render provisions — every other one is data the render reads as it is, so it is kept whole. */
const PROVISIONED_CATEGORIES = [
  "compute",
  "storage",
  "databases",
  "messaging",
  "networking",
] as const;

/**
 * `workload` narrowed to what rendering `references` needs: the releases and
 * provisioned resources they name, and everything those depend on. Data
 * categories (`secrets`, `variables`, `external`) are kept whole, since a
 * provisioner may read them and rendering them costs nothing; operations are
 * dropped, since nothing renders them.
 */
function scopeTo(
  workload: Deploy.Workload,
  references: readonly Deploy.Reference[],
): Deploy.Workload {
  const graph = new Deploy.Resolve.DependencyGraphBuilder().build(workload);
  const needed = new Set<string>();
  const toVisit: Deploy.Resolve.ResourceId[] = references
    .filter((reference) => reference.category !== "deployment")
    .map((reference) =>
      ({
        category: reference.category,
        name: reference.name,
      }) as Deploy.Resolve.ResourceId
    );
  while (toVisit.length > 0) {
    const id = toVisit.pop()!;
    const key = `${id.category}.${id.name}`;
    if (needed.has(key)) continue;
    needed.add(key);
    toVisit.push(...graph.dependenciesOf(id));
  }

  const only = <T>(
    category: string,
    declared: Readonly<Record<string, T>> | undefined,
  ) =>
    Object.fromEntries(
      Object.entries(declared ?? {}).filter(([name]) =>
        needed.has(`${category}.${name}`)
      ),
    );

  const { operations: _operations, ...scoped } = workload;
  return {
    ...scoped,
    release: only("release", workload.release),
    ...Object.fromEntries(
      PROVISIONED_CATEGORIES.map((category) => [
        category,
        only(category, workload[category]),
      ]),
    ),
  };
}

/**
 * Prints what a workload declares under `operations:` (`ens operations <name>`): one line per operation, its name, a tab, then its description (empty
 * when it declares none). A tab rather than padding, so the output splits the
 * same way for a person and for `cut`.
 */
export async function listDeliveryOperations(
  name: string,
  kit: string | undefined,
  options: Pick<RunDeliveryOperationOptions, "envFiles">,
  repo: RepoLocator,
): Promise<void> {
  const { workload } = await loadWorkload(name, kit, repo, {
    envFiles: options.envFiles,
  });
  for (const [operationName, operation] of Object.entries(workload.operations ?? {})) {
    console.log(`${operationName}\t${operation.description ?? ""}`);
  }
}

interface ArgumentContext {
  readonly deployment: Readonly<Record<string, string>>;
  readonly renderer: Deploy.Render.Renderer;
  readonly ledger: Deploy.Render.OutputsLedger;
  readonly workload: Deploy.Workload;
}

/**
 * One declared argument as the string a process will actually receive.
 * `${deployment.<name>}` is answered here; everything else goes to the
 * renderer's own resolution, so an operation argument means exactly what the same
 * reference would mean inside a resource. Numbers and booleans are stringified
 * because that is what an environment variable *is* — the operation reads text.
 */
async function resolveArgument(
  raw: string | number | boolean,
  context: ArgumentContext,
): Promise<unknown> {
  const reference = new Deploy.ReferenceSyntax().parse(raw);
  if (reference?.category === "deployment") {
    return deploymentValue(reference, raw, context.deployment);
  }

  const value = await context.renderer.resolveManifestValue(
    raw,
    context.ledger,
    context.workload,
  );
  if (typeof value === "object" && value !== null) {
    throw new OperationArgumentError(
      `"${raw}" resolved to ${
        Array.isArray(value) ? "a list" : "an object"
      }, and an operation argument must be a single value — most often a reference to a target-deferred output, whose value only exists as the target's own wiring once the deploy has run.`,
    );
  }
  return value;
}

/** What `${deployment.<name>}` says, or a `OperationArgumentError` naming what it may say. */
function deploymentValue(
  reference: Deploy.Reference,
  raw: string | number | boolean,
  deployment: Readonly<Record<string, string>>,
): string {
  const value = deployment[reference.name];
  if (value === undefined) {
    throw new OperationArgumentError(
      `"${raw}" — the deployment namespace has only ${
        DEPLOYMENT_VALUES.map((known) => `\${deployment.${known}}`).join(", ")
      }.`,
    );
  }
  return value;
}

/**
 * Spawns the operation with `ens`'s own stdio inherited, so an operation that prompts
 * (a migration asking for confirmation, `sudo` asking for a password) works,
 * and with the resolved arguments layered onto the environment. Trailing
 * command-line arguments land as `$1..$n`: `sh` needs a `$0` for that, hence
 * the placeholder name.
 */
async function runProcess(
  operation: Deploy.Operation,
  context: {
    readonly repoRoot: string;
    readonly workload: string;
    readonly kit: string;
    readonly env: Readonly<Record<string, string>>;
    readonly args: readonly string[];
  },
): Promise<void> {
  const argv = operation.script
    ? [
      join(
        context.repoRoot,
        "ci",
        context.workload,
        context.kit,
        "operations",
        operation.script,
      ),
    ]
    : ["-c", operation.run!, "ens-delivery-operation"];

  const { success, code } = await new Deno.Command("sh", {
    args: [...argv, ...context.args],
    env: context.env,
  }).spawn().status;

  if (!success) {
    throw new OperationFailedError(`The operation exited with code ${code}.`);
  }
}
