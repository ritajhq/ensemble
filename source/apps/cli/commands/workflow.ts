import { Command } from "@cliffy/command";
import { Input, Secret } from "@cliffy/prompt";
import { createWorkflowArchive, getRemoteProfile, getWorkflowByName, runWorkflowByName, setRemoteProfile } from "@ensemble/core";
import { httpTriggerClient, workflowRegistryClient } from "@ensemble/platform";

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
        "Bearer token for this remote (used for both --remote and upload — must be granted the relevant permission(s) in the server's .ensemble/tokens.json):",
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
    "-r, --remote <profile:string>",
    "Trigger this workflow on a remote ensemble server instead of running it locally (see `workflow remote configure`). The workflow must be deployed there already and declare an http trigger. Blocks until the remote run finishes; remote logs aren't streamed back.",
  )
  .action(async ({ job, concurrency, remote }, name) => {
    if (remote) {
      const profile = await getRemoteProfile(remote);
      const client = httpTriggerClient({ baseUrl: profile.url, token: profile.secret });
      const { success } = await client.actions.trigger(name, { job, concurrency });
      if (!success) Deno.exit(1);
      return;
    }
    const success = await runWorkflowByName(name, { job, concurrency });
    if (!success) Deno.exit(1);
  })
  .command("remote", remoteCommand);
