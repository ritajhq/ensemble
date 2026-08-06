import { dirname, join, normalize, relative } from "@std/path";
import { exists, walk } from "@std/fs";
import { TarStream, type TarStreamInput } from "@std/tar";
import type { Delegate } from "@ritaj/event";
import { findRepoRoot } from "./repo.ts";
import { parseWorkflowFile, runWorkflow, type RunWorkflowResult, type Workflow, type WorkflowEvent } from "@ensemble/workflow";
import { trackedRunWorkflow } from "./runs.ts";
import { runWorkflowInContainer } from "./run-workflow-in-container.ts";
import { getLocalRepositoryOverrides, loadLocalConfig } from "./config.ts";

export interface RunWorkflowByNameOptions {
  /** Run only this job (or these jobs) and their transitive dependencies. */
  job?: string | string[];
  concurrency?: number;
  /** Extra variables merged on top of the process's own env vars for this run. */
  variables?: Record<string, string>;
  /**
   * Deploy context name (e.g. "development", "stage", "production"). Exposed
   * to every job/step as `context.name` and `context.path` (an absolute path
   * to "<repoRoot>/contexts/<name>", so steps can read files from it
   * regardless of their own cwd).
   */
  context?: string;
  /** Data from whatever triggered this run, made available as `trigger.*` in every job/step. */
  trigger?: Record<string, unknown>;
  /** Run inside a spawned runner container instead of in-process. Only set by server-side trigger call sites — local CLI runs stay in-process. */
  containerized?: boolean;
  /** Notified as jobs/steps start/finish. Only meaningful to a caller that wants to track progress itself (e.g. trackedRunWorkflowByName) — a plain local run has no need for it. */
  events?: Delegate<[WorkflowEvent]>;
}

export interface ResolvedWorkflow {
  name: string;
  workflow: Workflow;
  workflowDir: string;
}

/**
 * Encodes a workflow name into a URL-safe id. Names can contain "/" — e.g.
 * "ensemble/server", as landed by the git integration's nested layout — which
 * a raw URL path segment can't carry, so every route that identifies a
 * workflow works in terms of this id instead of the name directly.
 */
export function encodeWorkflowId(name: string): string {
  return btoa(name).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Inverse of encodeWorkflowId. Throws if `id` isn't validly-encoded base64url. */
export function decodeWorkflowId(id: string): string {
  const padded = id.replaceAll("-", "+").replaceAll("_", "/");
  const withPadding = padded + "=".repeat((4 - padded.length % 4) % 4);
  try {
    return atob(withPadding);
  } catch {
    throw new Error(`Invalid workflow id "${id}".`);
  }
}

/** Resolves a workflow by name (workflows/<name>/workflow.yml), parsing but not running it. */
export async function getWorkflowByName(name: string): Promise<ResolvedWorkflow> {
  const repoRoot = await findRepoRoot();

  const workflowDir = join(repoRoot, "workflows", name);
  const workflowFile = join(workflowDir, "workflow.yml");
  if (!await exists(workflowFile, { isFile: true })) {
    throw new Error(`Workflow "${name}" not found (expected ${workflowFile})`);
  }

  const workflow = await parseWorkflowFile(workflowFile);
  return { name, workflow, workflowDir };
}

/**
 * Resolves every workflow under workflows/, parsing each one. Searches at any
 * depth (not just the top level) so workflows nested under e.g.
 * workflows/<project>/<name>/workflow.yml — as landed by the git integration's
 * sparse checkout — are discovered too; the workflow's "name" is its
 * directory path relative to workflows/.
 */
export async function listWorkflows(): Promise<ResolvedWorkflow[]> {
  const repoRoot = await findRepoRoot();
  const workflowsDir = join(repoRoot, "workflows");

  const names: string[] = [];
  for await (const entry of walk(workflowsDir, { match: [/workflow\.yml$/], includeDirs: false })) {
    names.push(relative(workflowsDir, dirname(entry.path)).replaceAll("\\", "/"));
  }

  return await Promise.all(names.map((name) => getWorkflowByName(name)));
}

/**
 * Every resolved workflow whose name starts with `${projectName}/`, i.e. the
 * ones landed under workflows/<projectName>/ by the git integration. Names
 * are returned relative to the project (the "workflows/<projectName>/"
 * prefix stripped), matching the paths removeGitRepositoryWorkflow and
 * restoreGitRepositoryWorkflow expect.
 */
export async function listWorkflowsForProject(projectName: string): Promise<{ name: string; workflow: Workflow }[]> {
  const prefix = `${projectName}/`;
  const all = await listWorkflows();
  return all
    .filter(({ name }) => name.startsWith(prefix))
    .map(({ name, workflow }) => ({ name: name.slice(prefix.length), workflow }));
}

export interface WorkflowFileNode {
  /** Path relative to the workflow's own directory, e.g. "steps/build.ts". */
  path: string;
  type: "file" | "directory";
  children?: WorkflowFileNode[];
}

/** Rejects any relative path that (after normalizing "..") would escape its base directory. */
function assertWithinDir(relativePath: string): void {
  const normalized = normalize(relativePath);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Invalid path "${relativePath}" — must stay within the workflow's directory.`);
  }
}

function buildFileTree(paths: string[]): WorkflowFileNode[] {
  interface MutableNode {
    path: string;
    type: "file" | "directory";
    children?: Map<string, MutableNode>;
  }

  const root = new Map<string, MutableNode>();

  for (const path of paths) {
    const segments = path.split("/");
    let level = root;
    let prefix = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      prefix = prefix ? `${prefix}/${segment}` : segment;
      const isLeaf = i === segments.length - 1;
      let node = level.get(segment);
      if (!node) {
        node = { path: prefix, type: isLeaf ? "file" : "directory" };
        level.set(segment, node);
      }
      if (!isLeaf) {
        node.children ??= new Map();
        level = node.children;
      }
    }
  }

  function toSorted(level: Map<string, MutableNode>): WorkflowFileNode[] {
    return [...level.values()]
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.path.localeCompare(b.path);
      })
      .map((node) => ({
        path: node.path,
        type: node.type,
        ...(node.children ? { children: toSorted(node.children) } : {}),
      }));
  }

  return toSorted(root);
}

/** Lists a workflow's own directory tree (e.g. workflow.yml, steps/*.ts) as a nested tree, sorted directories-first. */
export async function listWorkflowFiles(name: string): Promise<WorkflowFileNode[]> {
  const { workflowDir } = await getWorkflowByName(name);

  const paths: string[] = [];
  for await (const entry of walk(workflowDir, { includeDirs: false })) {
    paths.push(relative(workflowDir, entry.path).replaceAll("\\", "/"));
  }

  return buildFileTree(paths);
}

/** Reads one file's content from a workflow's directory. `relativePath` must stay within workflowDir. */
export async function readWorkflowFile(name: string, relativePath: string): Promise<string> {
  assertWithinDir(relativePath);
  const { workflowDir } = await getWorkflowByName(name);
  const filePath = join(workflowDir, relativePath);
  if (!await exists(filePath, { isFile: true })) {
    throw new Error(`File "${relativePath}" not found in workflow "${name}".`);
  }
  return await Deno.readTextFile(filePath);
}

/**
 * Packages a workflow's whole directory tree into a gzipped tar stream,
 * rooted at the workflow's own directory (e.g. "workflow.yml", "steps/build.ts"
 * — no name/ prefix) — the shape the platform's upload endpoint expects.
 */
export async function createWorkflowArchive(workflowDir: string): Promise<ReadableStream<Uint8Array>> {
  const entries: TarStreamInput[] = [];
  for await (const entry of walk(workflowDir, { includeDirs: false })) {
    const stat = await Deno.stat(entry.path);
    entries.push({
      type: "file",
      path: relative(workflowDir, entry.path).replaceAll("\\", "/"),
      size: stat.size,
      readable: (await Deno.open(entry.path)).readable,
    });
  }
  return ReadableStream.from(entries)
    .pipeThrough(new TarStream())
    .pipeThrough(new CompressionStream("gzip"));
}

/**
 * Resolves a workflow by name (workflows/<name>/workflow.yml) and runs it to
 * completion — in-process, or inside a spawned runner container when
 * `options.containerized` is set. Pure: no run tracking/KV/persistence here
 * — that's a platform-layer concern, added by wrapping this in
 * `trackedRunWorkflowByName` (below) rather than baked in here, so a plain
 * local `ens workflow` run (or the containerized run's own inner invocation)
 * never needs `.ensemble/platform/runs.kv` to exist at all.
 */
export async function runWorkflowByName(
  name: string,
  options: RunWorkflowByNameOptions,
): Promise<RunWorkflowResult> {
  if (options.containerized) {
    return await runWorkflowInContainer(name, {
      job: options.job,
      concurrency: options.concurrency,
      context: options.context,
      trigger: options.trigger,
      events: options.events,
    });
  }

  const repoRoot = await findRepoRoot();
  const { workflow, workflowDir } = await getWorkflowByName(name);
  const localConfig = await loadLocalConfig(repoRoot);
  return await runWorkflow(workflow, {
    workflowDir,
    job: options.job,
    concurrency: options.concurrency,
    variables: options.variables,
    trigger: options.trigger,
    context: options.context,
    repoRoot,
    localRepositoryOverrides: getLocalRepositoryOverrides(localConfig),
    events: options.events,
  });
}

/**
 * Runs a workflow the way every server-side trigger (manual/GitHub/dashboard)
 * needs: tracked in `.ensemble/platform/runs.kv` (so the dashboard/SSE can
 * follow progress) and containerized (the server itself doesn't carry the
 * workflow's own toolchain). `runWorkflowByName` stays plain/untracked so a
 * local CLI run, or the containerized run's own inner `ens workflow`
 * invocation, never touches KV at all.
 */
export async function trackedRunWorkflowByName(
  name: string,
  options: Omit<RunWorkflowByNameOptions, "containerized" | "events">,
): Promise<boolean> {
  return await trackedRunWorkflow(name, options.trigger, (events) =>
    runWorkflowByName(name, { ...options, containerized: true, events }));
}
