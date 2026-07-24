import { dirname, join } from "@std/path";
import { exists } from "@std/fs";
import { findRepoRoot } from "./repo.ts";
import { parseWorkflowFile, runWorkflow } from "@ensemble/workflow";

export interface RunWorkflowByNameOptions {
  job?: string;
  concurrency?: number;
  /** Extra variables merged on top of the process's own env vars for this run. */
  variables?: Record<string, string>;
}

/** Resolves a workflow by name (workflows/<name>/workflow.yml) and runs it to completion. */
export async function runWorkflowByName(
  name: string,
  options: RunWorkflowByNameOptions,
): Promise<boolean> {
  const repoRoot = await findRepoRoot();

  const workflowDir = join(repoRoot, "workflows", name);
  const workflowFile = join(workflowDir, "workflow.yml");
  if (!await exists(workflowFile, { isFile: true })) {
    throw new Error(`Workflow "${name}" not found (expected ${workflowFile})`);
  }

  const workflow = await parseWorkflowFile(workflowFile);
  const { success } = await runWorkflow(workflow, {
    workflowDir: dirname(workflowFile),
    job: options.job,
    concurrency: options.concurrency,
    variables: options.variables && {
      ...Object.fromEntries(Object.entries(Deno.env.toObject())),
      ...options.variables,
    },
  });
  return success;
}
