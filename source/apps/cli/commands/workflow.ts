import { Command, ValidationError } from "@cliffy/command";
import { Input, Secret } from "@cliffy/prompt";
import { createWorkflowArchive, getRemoteProfile, getWorkflowByName, runWorkflowByName, setRemoteProfile } from "@ensemble/core";
import { emitWorkflowEvent, type WorkflowEvent } from "@ensemble/workflow";
import { Delegate } from "@ritaj/event";
import { extractManualInputs, ManualInputError, manualTriggerClient, workflowRegistryClient } from "@ensemble/platform";
import * as CliUtil from "./util.ts";

const remoteConfigureCommand = new Command()
  .description("Create or update a remote profile (url + secret) for `ens workflow --remote`/`upload`.")
  .arguments("<profile:string>")
  .action(async (_options, profile) => {
    const url = await Input.prompt({
      message: "Remote URL:",
      validate: (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return "Must be a valid URL, e.g. https://example.com";
        }
      },
    });
    const secret = await Secret.prompt({
      message:
        "Bearer token for this remote (used for both --remote and upload — must be granted the relevant permission(s) in the server's .ensemble/platform/tokens.json):",
      validate: (value) => value.trim().length > 0 || "Token can't be empty.",
    });
    await setRemoteProfile(profile, { url, secret });
    console.log(`Saved remote profile "${profile}".`);
  });

const remoteUploadCommand = new Command()
  .description("Upload a locally defined workflow to a remote ensemble server, replacing whatever's there under the same name.")
  .arguments("<name:string>")
  .option("-r, --remote <profile:string>", "Remote profile to upload to (see `workflow remote configure`).", { required: true })
  .action(async ({ remote }, name) => {
    const { workflowDir } = await getWorkflowByName(name);
    const profile = await getRemoteProfile(remote);
    const archive = await createWorkflowArchive(workflowDir);
    const client = workflowRegistryClient({ baseUrl: profile.url, token: profile.secret });
    const { success } = await client.actions.upload(name, archive);
    if (!success) Deno.exit(1);
    console.log(`Uploaded workflow "${name}" to remote "${remote}".`);
  });

const remoteCommand = new Command()
  .description("Manage remote profiles and remote workflow operations.")
  .command("configure", remoteConfigureCommand)
  .command("upload", remoteUploadCommand);

export const workflowCommand = new Command()
  .name("workflow")
  .description("Run a workflow from the workflows/ folder.")
  .arguments("<name:string>")
  .option("-j, --job <job:string>", "Run only this job and its transitive dependencies.")
  .option("-c, --concurrency <concurrency:number>", "Max number of jobs to run concurrently.")
  .option(
    "--context <context:string>",
    "Deploy context to run with. Exposed to every job/step as context.name and context.path (an absolute path to contexts/<context>).",
  )
  .option(
    "-r, --remote <profile:string>",
    "Trigger this workflow on a remote ensemble server instead of running it locally (see `workflow remote configure`). The workflow must be deployed there already and declare a manual trigger. Blocks until the remote run finishes; remote logs aren't streamed back.",
  )
  .option("-v, --var <var:string>", "Override a workflow variable (KEY=VALUE). Repeatable.", { collect: true })
  .option(
    "-i, --input <input:string>",
    "Set a value for the workflow's declared manual trigger input (NAME=VALUE). VALUE is JSON-parsed when possible (e.g. -i replicas=3, -i enabled=true), else used as a plain string. Repeatable.",
    { collect: true },
  )
  .option("--trigger-json <json:string>", "Internal: an already-resolved trigger object, used when this invocation is itself running inside a spawned runner container.", { hidden: true })
  .option("--emit-events", "Internal: print structured ##ENSEMBLE-EVENT## lines on stdout as jobs/steps start and finish, for a caller (the runner container's outer process) to reconstruct progress.", { hidden: true })
  .action(async ({ job, concurrency, context, remote, var: vars, input: inputs, triggerJson, emitEvents }, name) => {
    const overrides = CliUtil.parseVarOverrides(vars ?? []);
    const inputOverrides = CliUtil.parseInputOverrides(inputs ?? []);
    if (remote) {
      const profile = await getRemoteProfile(remote);
      const client = manualTriggerClient({ baseUrl: profile.url, token: profile.secret });
      const { success } = await client.actions.trigger(name, {
        job,
        concurrency,
        context,
        variables: overrides,
        inputs: inputOverrides,
      });
      if (!success) Deno.exit(1);
      return;
    }

    let trigger: Record<string, unknown> | undefined;
    if (triggerJson !== undefined) {
      trigger = JSON.parse(triggerJson);
    } else {
      const { workflow } = await getWorkflowByName(name);
      const manualTrigger = workflow.on?.find((t) => t.manual)?.manual;
      if (manualTrigger) {
        try {
          trigger = extractManualInputs(inputOverrides, manualTrigger.inputs ?? []);
        } catch (error) {
          if (error instanceof ManualInputError) throw new ValidationError(error.message);
          throw error;
        }
        trigger.type = "manual";
      }
    }

    const events = emitEvents ? new Delegate<[WorkflowEvent]>() : undefined;
    events?.Do((event) => emitWorkflowEvent(event));

    const { success } = await runWorkflowByName(name, { job, concurrency, context, variables: overrides, trigger, events });
    if (!success) Deno.exit(1);
  })
  .command("remote", remoteCommand);
