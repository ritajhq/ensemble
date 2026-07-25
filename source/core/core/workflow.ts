import { join, relative } from "@std/path";
import { exists, walk } from "@std/fs";
import { TarStream, type TarStreamInput } from "@std/tar";
import { findRepoRoot } from "./repo.ts";
import { parseWorkflowFile, runWorkflow, type Workflow } from "@ensemble/workflow";

export interface RunWorkflowByNameOptions {
  job?: string;
  concurrency?: number;
  /** Extra variables merged on top of the process's own env vars for this run. */
  variables?: Record<string, string>;
  /** Data from whatever triggered this run, made available as `trigger.*` in every job/step. */
  trigger?: Record<string, unknown>;
}

export interface ResolvedWorkflow {
  name: string;
  workflow: Workflow;
  workflowDir: string;
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

/** Resolves every workflow under workflows/, parsing each one. */
export async function listWorkflows(): Promise<ResolvedWorkflow[]> {
  const repoRoot = await findRepoRoot();
  const workflowsDir = join(repoRoot, "workflows");

  const names: string[] = [];
  for await (const entry of Deno.readDir(workflowsDir)) {
    if (entry.isDirectory && await exists(join(workflowsDir, entry.name, "workflow.yml"), { isFile: true })) {
      names.push(entry.name);
    }
  }

  return await Promise.all(names.map((name) => getWorkflowByName(name)));
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

/** Resolves a workflow by name (workflows/<name>/workflow.yml) and runs it to completion. */
export async function runWorkflowByName(
  name: string,
  options: RunWorkflowByNameOptions,
): Promise<boolean> {
  const repoRoot = await findRepoRoot();
  const { workflow, workflowDir } = await getWorkflowByName(name);
  const { success } = await runWorkflow(workflow, {
    workflowDir,
    job: options.job,
    concurrency: options.concurrency,
    variables: options.variables && {
      ...Object.fromEntries(Object.entries(Deno.env.toObject())),
      ...options.variables,
    },
    trigger: options.trigger,
    repoRoot,
  });
  return success;
}
