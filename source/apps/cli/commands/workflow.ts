import { Command } from "@cliffy/command";
import { runWorkflowByName } from "@ensemble/core";

export const workflowCommand = new Command()
  .name("workflow")
  .description("Run a workflow from the workflows/ folder.")
  .arguments("<name:string>")
  .option("-j, --job <job:string>", "Run only this job and its transitive dependencies.")
  .option("-c, --concurrency <concurrency:number>", "Max number of jobs to run concurrently.")
  .action(async ({ job, concurrency }, name) => {
    const success = await runWorkflowByName(name, { job, concurrency });
    if (!success) Deno.exit(1);
  });
