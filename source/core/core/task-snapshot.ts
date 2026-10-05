import { dirname, join, relative } from "@std/path";
import { walk } from "@std/fs";
import * as Deploy from "./deploy/index.ts";
import type { WorkloadContext } from "./deploy-context.ts";

/** A task argument's value, as the process receives it before it's stringified. */
export type ArgumentValue = string | number | boolean;

/**
 * What the last deploy of a workload with one kit left for its tasks: every
 * task argument only a render can answer (a provisioner's output, a port, a
 * release), resolved against that deploy's render, and the artifact it was
 * presented as. Arguments the manifest itself answers (`variables`,
 * `external`, literals) and the deployment's name and root are not kept:
 * they cost nothing to resolve when the task runs — and a variable may hold
 * a secret, which must never be written down.
 *
 * `fingerprint` names what the render was made from (`DeploymentFingerprint`),
 * so a snapshot is used only while the manifest and the kit still say what
 * they said then.
 */
export interface TaskSnapshot {
  readonly version: 1;
  readonly fingerprint: string;
  readonly artifact: string;
  readonly arguments: Readonly<
    Record<string, Readonly<Record<string, ArgumentValue>>>
  >;
}

/** Reference categories a render can't answer, so a snapshot never holds them. */
const UNRENDERED = ["deployment", "variables", "external"];

/** Whether `raw` is an argument only a render can answer. */
export function isRenderedArgument(raw: unknown): boolean {
  const reference = new Deploy.ReferenceSyntax().parse(raw);
  return reference !== undefined && !UNRENDERED.includes(reference.category);
}

/**
 * Whether `raw` embeds, inside a larger string, a reference only a render can
 * answer. Such an argument is never kept: the string may also embed a
 * variable, which may hold a secret — so a task with one always renders.
 */
export function embedsRenderedReference(raw: unknown): boolean {
  return new Deploy.ReferenceSyntax().embedded(raw).some(({ reference }) =>
    !UNRENDERED.includes(reference.category)
  );
}

/**
 * Where a workload's task snapshot for one kit is kept:
 * `.ensemble/deploy/<workload>/<kit>.tasks.json`, next to the render cache
 * `plan` diffs against, and like it never committed. A missing or unreadable
 * file is no snapshot.
 */
export class TaskSnapshotFile {
  constructor(private readonly path: string) {}

  static for(repoRoot: string, name: string, kit: string): TaskSnapshotFile {
    return new TaskSnapshotFile(
      join(repoRoot, ".ensemble", "deploy", name, `${kit}.tasks.json`),
    );
  }

  async read(): Promise<TaskSnapshot | undefined> {
    try {
      const snapshot = JSON.parse(await Deno.readTextFile(this.path));
      return snapshot?.version === 1 ? snapshot : undefined;
    } catch {
      return undefined;
    }
  }

  async write(snapshot: TaskSnapshot): Promise<void> {
    await Deno.mkdir(dirname(this.path), { recursive: true });
    await Deno.writeTextFile(this.path, JSON.stringify(snapshot, null, 2));
  }
}

/** The kit's own files, not what running it leaves behind. */
const KIT_SKIP = [
  /\.test\.ts$/,
  /(^|\/)__snapshots__\//,
  /(^|\/)\.bin\//,
  /(^|\/)node_modules\//,
  // A `KitHost` wrapper, briefly there while a kit process starts.
  /^[0-9a-f]+\.ts$/,
];

/**
 * A digest of everything a render is made from, short of `ens`'s own
 * environment: the workload's declarations (tasks only as far as their
 * arguments), the deploy kit's files, and the workload's config for that kit.
 * Two renders with the same fingerprint produce the same outputs for the
 * same environment.
 */
export class DeploymentFingerprint {
  static async of(context: WorkloadContext): Promise<string> {
    const { tasks, ...declarations } = context.workload;
    const parts = [
      JSON.stringify(this.canonical({
        ...declarations,
        tasks: Object.fromEntries(
          Object.entries(tasks ?? {}).map((
            [name, task],
          ) => [name, task.arguments ?? {}]),
        ),
      })),
      ...await this.kitFiles(context.kitDir),
      `config\0${await this.readOptional(context.kitConfigPath) ?? ""}`,
    ];

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(parts.join("\0\0")),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  private static async kitFiles(kitDir: string): Promise<string[]> {
    const files: string[] = [];
    for await (const entry of walk(kitDir, { includeDirs: false })) {
      const path = relative(kitDir, entry.path);
      if (KIT_SKIP.some((skip) => skip.test(path))) continue;
      files.push(`${path}\0${await Deno.readTextFile(entry.path)}`);
    }
    return files.sort();
  }

  private static async readOptional(path: string): Promise<string | undefined> {
    try {
      return await Deno.readTextFile(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return undefined;
      throw error;
    }
  }

  /** `value` with every object's keys in order, so equal declarations always serialize the same. Recursive because declarations are nested data. */
  private static canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.canonical(item));
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [
        key,
        this.canonical((value as Record<string, unknown>)[key]),
      ]),
    );
  }
}

/**
 * Keeps a `TaskSnapshot` once a deployment is up (`Deploy.Terminations.DeployedState`):
 * resolves every task's render-only arguments against the render the
 * deployment was made from. An argument that doesn't resolve to a single
 * value (a target-deferred output) isn't kept — the task will render to
 * resolve it, and fail there saying why.
 */
export class TaskSnapshotRecorder implements Deploy.Terminations.DeployedState {
  constructor(
    private readonly file: TaskSnapshotFile,
    private readonly fingerprint: string,
    private readonly renderer: Deploy.Render.Renderer,
    private readonly workload: Deploy.Workload,
  ) {}

  async record(
    ledger: Deploy.Render.OutputsLedger,
    artifactPath: string,
  ): Promise<void> {
    const recorded: Record<string, Record<string, ArgumentValue>> = {};
    for (const [name, task] of Object.entries(this.workload.tasks ?? {})) {
      recorded[name] = await this.resolve(task, ledger);
    }

    await this.file.write({
      version: 1,
      fingerprint: this.fingerprint,
      artifact: artifactPath,
      arguments: recorded,
    });
  }

  private async resolve(
    task: Deploy.Task,
    ledger: Deploy.Render.OutputsLedger,
  ): Promise<Record<string, ArgumentValue>> {
    const resolved: Record<string, ArgumentValue> = {};
    for (const [argument, raw] of Object.entries(task.arguments ?? {})) {
      if (!isRenderedArgument(raw)) continue;
      const value = await this.renderer
        .resolveManifestValue(raw, ledger, this.workload)
        .catch(() => undefined);
      if (!this.isArgumentValue(value)) continue;
      resolved[argument] = value;
    }
    return resolved;
  }

  private isArgumentValue(value: unknown): value is ArgumentValue {
    return typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean";
  }
}
