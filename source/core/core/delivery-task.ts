import { join } from "@std/path";
import * as Deploy from "./deploy/index.ts";
import { deploymentNameFor, loadDeployContext } from "./deploy-context.ts";
import type { RepoLocator } from "./ports.ts";

/** Thrown when a task name is asked for that the workload doesn't declare — an ordinary typo, named against the tasks that *are* declared. */
export class UnknownTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownTaskError";
  }
}

/** Thrown when a task's own `arguments` can't produce a value a process can be handed — an unresolvable `${deployment.*}` name, or a reference that resolves to something other than a single value. */
export class TaskArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskArgumentError";
  }
}

/** Thrown when the task process itself exits non-zero. Deliberately its own error class: a failing task is not a failing deployment (nothing else was touched), it's a failing *command*, and `ens` reports it as such and exits non-zero. */
export class TaskFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskFailedError";
  }
}

export interface RunDeliveryTaskOptions {
  readonly artifacts: Deploy.ArtifactsSource;
  /** Only meaningful if a task argument references `${release.<name>}` for published artifacts — same convention as `ens deploy --version`. */
  readonly version: string;
}

/** What `${deployment.<name>}` may name (`./deploy/task.ts` documents the set from the manifest's side). */
const DEPLOYMENT_VALUES = ["name", "artifact", "root"] as const;

/**
 * Runs one of a workload's declared tasks (`ens delivery task`); with no task
 * named, lists what the workload declares instead. See `./deploy/task.ts` for
 * what a task is and why it's invoked rather than fired by a deploy.
 *
 * The front half is `ens deploy explain`'s own — same manifest lookup, same
 * release locator, same render — because a task argument may reference
 * anything a resource field may, and most of those are only knowable from a
 * completed render (`${databases.database.host}` is a provisioner's output,
 * not a declaration). To that the runner adds the one namespace a render
 * *can't* answer, because it isn't about resources at all: the deployment's
 * own identity (`${deployment.name}`, `${deployment.artifact}`,
 * `${deployment.root}`). That namespace is the point of the whole feature —
 * a task greps what ens generated instead of hardcoding it — so it is resolved
 * here, where the deployment name, the artifact path the deploy writes to and
 * the workspace root are all in scope together.
 *
 * The task process inherits `ens`'s own environment, which `loadDeployContext`
 * has already filled with `ci/<workload>/variables.env`'s defaults, so a
 * `secrets`/`variables` value reaches a task exactly as it reaches a deploy
 * and no secret has to travel through the manifest (G4) or through the
 * argument grammar.
 */
export async function runDeliveryTask(
  name: string,
  kit: string,
  taskName: string | undefined,
  taskArgs: readonly string[],
  options: RunDeliveryTaskOptions,
  repo: RepoLocator,
  gateway: Deploy.PackKitGateway,
  kitLoader: Deploy.KitLoader,
): Promise<void> {
  const { repoRoot, workload, target, registry } = await loadDeployContext(
    name,
    kit,
    repo,
    kitLoader,
  );

  const tasks = workload.tasks ?? {};
  if (taskName === undefined) {
    presentTasks(name, tasks);
    return;
  }

  const task = tasks[taskName];
  if (!task) {
    const declared = Object.keys(tasks);
    throw new UnknownTaskError(
      declared.length === 0
        ? `Workload "${name}" declares no tasks.`
        : `No task named "${taskName}" in workload "${name}". Declared: ${
          declared.join(", ")
        }.`,
    );
  }

  const locatorResolver = new Deploy.ReleaseLocatorResolver(gateway);
  const releaseLocator = new Deploy.PreresolvedReleaseLocator(
    await locatorResolver.resolveAll(
      workload,
      options.artifacts,
      options.version,
    ),
  );
  const renderer = new Deploy.Render.Renderer(
    new Deploy.Render.ReferenceResolver(await target.kit.realization()),
    releaseLocator,
    registry,
  );

  const resolution = await new Deploy.Resolve.WorkloadResolver(registry)
    .resolve(
      workload,
      target,
    );
  const graph = new Deploy.Resolve.DependencyGraphBuilder().build(workload);
  const { artifacts, ledger } = await renderer.renderWithLedger(
    workload,
    resolution.requests,
    resolution.selections,
    graph,
    options.artifacts,
  );

  // The path the *deploy* writes its document to, derived the same way
  // `runDeploy` derives it (the sink owns that convention) rather than assumed.
  const presented = await target.kit.present(artifacts, graph);
  const artifactPath = new Deploy.Terminations.FileArtifactSink(
    join(repoRoot, "source", "artifacts", "deploy", name),
  ).pathFor(presented);

  const deployment = {
    name: deploymentNameFor(repoRoot, name),
    artifact: artifactPath,
    root: repoRoot,
  };

  const env: Record<string, string> = {};
  for (const [argument, raw] of Object.entries(task.arguments ?? {})) {
    env[argument] = String(
      await resolveArgument(raw, { deployment, renderer, ledger, workload }),
    );
  }

  await runProcess(task, { repoRoot, workload: name, env, args: taskArgs });
  console.log(`Ran task "${taskName}" for "${name}".`);
}

function presentTasks(
  name: string,
  tasks: Readonly<Record<string, Deploy.Task>>,
): void {
  const declared = Object.keys(tasks);
  if (declared.length === 0) {
    console.log(`Workload "${name}" declares no tasks.`);
    return;
  }

  console.log(`Tasks declared by "${name}":`);
  for (const taskName of declared) {
    const task = tasks[taskName];
    const what = task.script
      ? `sh ci/${name}/scripts/${task.script}`
      : task.run!;
    console.log(`  ${taskName}: ${what}`);
  }
  console.log(
    `\nRun one with: ens delivery task ${name} <kit> <task> [args...]`,
  );
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
 * renderer's own resolution, so a task argument means exactly what the same
 * reference would mean inside a resource. Numbers and booleans are stringified
 * because that is what an environment variable *is* — the task reads text.
 */
async function resolveArgument(
  raw: string | number | boolean,
  context: ArgumentContext,
): Promise<unknown> {
  const reference = new Deploy.ReferenceSyntax().parse(raw);
  if (reference?.category === "deployment") {
    const value = context.deployment[reference.name];
    if (value === undefined) {
      throw new TaskArgumentError(
        `"${raw}" — the deployment namespace has only ${
          DEPLOYMENT_VALUES.map((known) => `\${deployment.${known}}`).join(", ")
        }.`,
      );
    }
    return value;
  }

  const value = await context.renderer.resolveManifestValue(
    raw,
    context.ledger,
    context.workload,
  );
  if (typeof value === "object" && value !== null) {
    throw new TaskArgumentError(
      `"${raw}" resolved to ${
        Array.isArray(value) ? "a list" : "an object"
      }, and a task argument must be a single value — most often a reference to a target-deferred output, whose value only exists as the target's own wiring once the deploy has run.`,
    );
  }
  return value;
}

/**
 * Spawns the task with `ens`'s own stdio inherited, so a task that prompts
 * (a migration asking for confirmation, `sudo` asking for a password) works,
 * and with the resolved arguments layered onto the environment. Trailing
 * command-line arguments land as `$1..$n`: `sh` needs a `$0` for that, hence
 * the placeholder name.
 */
async function runProcess(
  task: Deploy.Task,
  context: {
    readonly repoRoot: string;
    readonly workload: string;
    readonly env: Readonly<Record<string, string>>;
    readonly args: readonly string[];
  },
): Promise<void> {
  const argv = task.script
    ? [join(context.repoRoot, "ci", context.workload, "scripts", task.script)]
    : ["-c", task.run!, "ens-delivery-task"];

  const { success, code } = await new Deno.Command("sh", {
    args: [...argv, ...context.args],
    env: context.env,
  }).spawn().status;

  if (!success) {
    throw new TaskFailedError(`The task exited with code ${code}.`);
  }
}
