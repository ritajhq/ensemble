import { Command, ValidationError } from "@cliffy/command";
import { Input, Secret, Select } from "@cliffy/prompt";
import {
  createWorkflowArchive,
  findRepoRoot,
  getRemoteProfile,
  getWorkflowByName,
  listWorkflowContexts,
  runWorkflowByName,
  setRemoteProfile,
} from "@ensemble/core";
import {
  emitWorkflowEvent,
  encryptValue,
  generateKeypair,
  isEncryptedMarker,
  SECRETS_PRIVATE_KEY_PATH,
  SECRETS_PUBLIC_KEY_PATH,
  type WorkflowEvent,
} from "@ensemble/workflow";
import { Delegate } from "@ritaj/event";
import {
  extractManualInputs,
  ManualInputError,
  manualTriggerClient,
  resolveJobInput,
  workflowRegistryClient,
} from "@ensemble/platform";
import { load as loadEnv } from "@std/dotenv";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import * as CliUtil from "./util.ts";

const remoteConfigureCommand = new Command()
  .description(
    "Create or update a remote profile (url + secret) for `ens workflow run --remote`/`upload`.",
  )
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
  .description(
    "Upload a locally defined workflow to a remote ensemble server, replacing whatever's there under the same name.",
  )
  .arguments("<name:string>")
  .option(
    "-r, --remote <profile:string>",
    "Remote profile to upload to (see `workflow remote configure`).",
    { required: true },
  )
  .action(async ({ remote }, name) => {
    const { workflowDir } = await getWorkflowByName(name);
    const profile = await getRemoteProfile(remote);
    const archive = await createWorkflowArchive(workflowDir);
    const client = workflowRegistryClient({
      baseUrl: profile.url,
      token: profile.secret,
    });
    const { success } = await client.actions.upload(name, archive);
    if (!success) Deno.exit(1);
    console.log(`Uploaded workflow "${name}" to remote "${remote}".`);
  });

const remoteCommand = new Command()
  .description("Manage remote profiles and remote workflow operations.")
  .command("configure", remoteConfigureCommand)
  .command("upload", remoteUploadCommand);

const runCommand = new Command()
  .description("Run a workflow from the workflows/ folder.")
  .arguments("<name:string>")
  .option(
    "-j, --job <job:string>",
    "Run only this job and its transitive dependencies. Repeatable, and/or comma-separated (-j a,b), to run several jobs (and their combined dependencies).",
    { collect: true },
  )
  .option(
    "-c, --concurrency <concurrency:number>",
    "Max number of jobs to run concurrently.",
  )
  .option(
    "--context <context:string>",
    "Deploy context name to resolve this workflow's declared context.variables/context.secrets against.",
  )
  .option(
    "-r, --remote <profile:string>",
    "Trigger this workflow on a remote ensemble server instead of running it locally (see `workflow remote configure`). The workflow must be deployed there already and declare a manual trigger. Blocks until the remote run finishes; remote logs aren't streamed back.",
  )
  .option(
    "-v, --var <var:string>",
    "Override a workflow variable (KEY=VALUE). Repeatable.",
    { collect: true },
  )
  .option(
    "--env-file <path:string>",
    "Load workflow variables from a .env file. Merged under -v/--var, so an explicit -v for the same key wins.",
  )
  .option(
    "-i, --input <input:string>",
    "Set a value for the workflow's declared manual trigger input (NAME=VALUE). VALUE is JSON-parsed when possible (e.g. -i replicas=3, -i enabled=true), else used as a plain string. Repeatable — repeating the same NAME collects its values into a list (e.g. -i job=server -i job=web) instead of the last one winning.",
    { collect: true },
  )
  .option(
    "--trigger-json <json:string>",
    "Internal: an already-resolved trigger object, used when this invocation is itself running inside a spawned runner container.",
    { hidden: true },
  )
  .option(
    "--emit-events",
    "Internal: print structured ##ENSEMBLE-EVENT## lines on stdout as jobs/steps start and finish, for a caller (the runner container's outer process) to reconstruct progress.",
    { hidden: true },
  )
  .action(
    async (
      {
        job,
        concurrency,
        context,
        remote,
        var: vars,
        envFile,
        input: inputs,
        triggerJson,
        emitEvents,
      },
      name,
    ) => {
      const fileVars = envFile
        ? await loadEnv({ envPath: envFile, export: false })
        : {};
      const overrides = {
        ...fileVars,
        ...CliUtil.parseVarOverrides(vars ?? []),
      };
      const inputOverrides = CliUtil.parseInputOverrides(inputs ?? []);
      const jobs = job?.flatMap((j) => j.split(","));
      if (remote) {
        const profile = await getRemoteProfile(remote);
        const client = manualTriggerClient({
          baseUrl: profile.url,
          token: profile.secret,
        });
        const { success } = await client.actions.trigger(name, {
          job: jobs,
          concurrency,
          context,
          variables: overrides,
          inputs: inputOverrides,
        });
        if (!success) Deno.exit(1);
        return;
      }

      let trigger: Record<string, unknown> | undefined;
      let resolvedJob: string | string[] | undefined = jobs;
      if (triggerJson !== undefined) {
        trigger = JSON.parse(triggerJson);
      } else {
        const { workflow } = await getWorkflowByName(name);
        const manualTrigger = workflow.on?.find((t) => t.manual)?.manual;
        if (manualTrigger) {
          const declaredInputs = manualTrigger.inputs ?? [];
          try {
            trigger = extractManualInputs(
              inputOverrides,
              declaredInputs,
              Object.keys(workflow.jobs),
            );
          } catch (error) {
            if (error instanceof ManualInputError) {
              throw new ValidationError(
                error.message,
              );
            }
            throw error;
          }
          trigger.type = "manual";
          resolvedJob ??= resolveJobInput(declaredInputs, trigger);
        }
      }

      const events = emitEvents ? new Delegate<[WorkflowEvent]>() : undefined;
      events?.Do((event) => emitWorkflowEvent(event));

      const { success } = await runWorkflowByName(name, {
        job: resolvedJob,
        concurrency,
        context,
        variables: overrides,
        trigger,
        events,
      });
      if (!success) Deno.exit(1);
    },
  );

const secretsInitCommand = new Command()
  .description(
    "Regenerates the repo-wide X25519 keypair used to encrypt/decrypt context.secrets. `ens init` already generates this automatically for a new project — use this command only to rotate an existing keypair, or to generate one for a project created before this existed. The private key goes to .ensemble/secrets.key (gitignored — never commit this), the public key to .ensemble/secrets.key.pub (safe to commit). One keypair for the whole repo, not per-workflow.",
  )
  .option(
    "--force",
    "Overwrite an existing keypair. Dangerous: every secret encrypted with the old public key becomes permanently undecryptable.",
  )
  .action(async ({ force }) => {
    const repoRoot = await findRepoRoot();
    const privateKeyPath = join(repoRoot, SECRETS_PRIVATE_KEY_PATH);
    const publicKeyPath = join(repoRoot, SECRETS_PUBLIC_KEY_PATH);

    if (!force && await exists(privateKeyPath, { isFile: true })) {
      throw new ValidationError(
        `${SECRETS_PRIVATE_KEY_PATH} already exists. Re-run with --force to overwrite it — this will permanently break decryption of every secret encrypted with the current key.`,
      );
    }

    const keypair = await generateKeypair();
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    await Deno.writeTextFile(privateKeyPath, keypair.privateKey + "\n");
    await Deno.writeTextFile(publicKeyPath, keypair.publicKey + "\n");

    await ensureGitignored(repoRoot, SECRETS_PRIVATE_KEY_PATH);

    console.log(
      `Generated ${SECRETS_PRIVATE_KEY_PATH} (gitignored) and ${SECRETS_PUBLIC_KEY_PATH} (safe to commit).`,
    );
  });

/** Appends `pattern` to the repo's own .gitignore if it isn't already covered by some line in it — best-effort exact-line check, not a full gitignore-pattern matcher. */
async function ensureGitignored(
  repoRoot: string,
  pattern: string,
): Promise<void> {
  const gitignorePath = join(repoRoot, ".gitignore");
  const existing = await exists(gitignorePath, { isFile: true })
    ? await Deno.readTextFile(gitignorePath)
    : "";
  const lines = existing.split("\n").map((line) => line.trim());
  if (lines.includes(pattern)) return;

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await Deno.writeTextFile(
    gitignorePath,
    `${existing}${separator}${pattern}\n`,
    { append: false },
  );
}

async function resolveContextName(
  workflowName: string,
  provided: string | undefined,
): Promise<string> {
  if (provided) return provided;
  const { workflowDir } = await getWorkflowByName(workflowName);
  const knownContexts = await listWorkflowContexts(workflowDir);
  if (knownContexts.length === 0) {
    return await Input.prompt({
      message: "Context name (no existing contexts/ subdirectories found):",
    });
  }
  return await Select.prompt({ message: "Context:", options: knownContexts });
}

async function readSecretsFile(path: string): Promise<Record<string, string>> {
  if (!await exists(path, { isFile: true })) return {};
  const parsed = parseYaml(await Deno.readTextFile(path));
  if (parsed === null || parsed === undefined) return {};
  return parsed as Record<string, string>;
}

const secretsEditCommand = new Command()
  .description(
    "Interactively add, replace, or remove one context's secrets (contexts/<context>/secrets.enc) for a workflow, encrypting each value with the repo's public key.",
  )
  .arguments("<name:string> [context:string]")
  .action(async (_options, name, context) => {
    const { workflowDir } = await getWorkflowByName(name);
    const repoRoot = await findRepoRoot();
    const contextName = await resolveContextName(name, context);
    const contextDir = join(workflowDir, "contexts", contextName);
    const secretsPath = join(contextDir, "secrets.enc");

    const publicKeyPath = join(repoRoot, SECRETS_PUBLIC_KEY_PATH);
    if (!await exists(publicKeyPath, { isFile: true })) {
      throw new ValidationError(
        `No ${SECRETS_PUBLIC_KEY_PATH} found. Run "ens workflow secrets init" first.`,
      );
    }
    const publicKey = (await Deno.readTextFile(publicKeyPath)).trim();

    const current = await readSecretsFile(secretsPath);
    const keys = Object.keys(current).sort();
    console.log(
      `\n${name} / ${contextName} — ${
        keys.length === 0 ? "no secrets set yet" : `${keys.length} secret(s):`
      }`,
    );
    for (const key of keys) console.log(`  ${key}`);

    const action = await Select.prompt({
      message: "What would you like to do?",
      options: [
        { name: "Add or replace a secret", value: "set" },
        { name: "Remove a secret", value: "delete" },
        { name: "Done", value: "done" },
      ],
    });

    if (action === "done") return;

    if (action === "delete") {
      if (keys.length === 0) {
        console.log("Nothing to remove.");
        return;
      }
      const key = await Select.prompt({
        message: "Which secret?",
        options: keys,
      });
      delete current[key];
      await Deno.mkdir(contextDir, { recursive: true });
      await Deno.writeTextFile(secretsPath, stringifyYaml(current));
      console.log(`Removed "${key}". Re-run to make another change.`);
      return;
    }

    const key = await Input.prompt({
      message: "Secret name:",
      validate: (value) => value.trim().length > 0 || "Name can't be empty.",
    });
    const value = await Secret.prompt({
      message: `Value for "${key}":`,
      // Never pre-fills or echoes back an existing value — same principle
      // as the dashboard never round-tripping a stored secret.
    });
    current[key] = await encryptValue(publicKey, value);

    await Deno.mkdir(contextDir, { recursive: true });
    await Deno.writeTextFile(secretsPath, stringifyYaml(current));
    console.log(
      `Saved "${key}" to ${contextName}/secrets.enc. Re-run to make another change.`,
    );
  });

/** Reports whether every secret in a context's secrets.enc is actually encrypted, e.g. to catch a hand-added plaintext value that was never run through `secrets edit`. Not currently wired to a subcommand — kept here as the natural place to add `secrets check` if that's wanted later. */
export async function findUnencryptedKeys(
  secretsPath: string,
): Promise<string[]> {
  const parsed = await readSecretsFile(secretsPath);
  return Object.entries(parsed).filter(([, value]) => !isEncryptedMarker(value))
    .map(([key]) => key);
}

const secretsCommand = new Command()
  .description(
    "Manage a repo's encrypted context.secrets (contexts/<name>/secrets.enc, contexts/<name>/secrets/<file>.enc).",
  )
  .command("init", secretsInitCommand)
  .command("edit", secretsEditCommand);

export const workflowCommand = new Command()
  .name("workflow")
  .description("Run workflows and manage their secrets.")
  .command("run", runCommand)
  .command("secrets", secretsCommand)
  .command("remote", remoteCommand);
