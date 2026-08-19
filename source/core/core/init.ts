import { join } from "@std/path";
import { copy, ensureDir, exists } from "@std/fs";
import { stringify as stringifyYaml } from "@std/yaml";
import { $ } from "@david/dax";
import {
  encryptValue,
  generateKeypair,
  SECRETS_PRIVATE_KEY_PATH,
  SECRETS_PUBLIC_KEY_PATH,
} from "@ensemble/workflow";

const ENSEMBLE_REPO_URL = "https://github.com/ritajhq/ensemble.git";

export interface RunInitOptions {
  name: string;
}

const CONFIG_TEMPLATE = `# Configure each app's build kit here, e.g.:
#
# build:
#   my-app:
#     kit: deno.bundle
`;

const SKELETON_DIRS = [
  "source/apps",
  "source/ship",
  "source/envs/build",
  "source/envs/pack",
  "source/libs",
  "source/artifacts",
];

const GITIGNORE_TEMPLATE = `.ensemble/kits/**/.bin/
.ensemble/platform/tokens.json
${SECRETS_PRIVATE_KEY_PATH}
source/artifacts/
node_modules/
`;

const TEST_WORKFLOW_TEMPLATE = `# yaml-language-server: $schema=https://raw.githubusercontent.com/ritajhq/ensemble/main/.ensemble/schemas/workflow.schema.json

on:
  - manual:
      inputs:
        - name: message
          display: Message
          type: string

context:
  secrets:
    variables:
      - name: TEST_SECRET

jobs:
  test:
    steps:
      - name: print_message
        run: |
          echo "\${{ trigger.message }}"

      - name: print_secret
        run: |
          echo "TEST_SECRET (decrypted from contexts/\${{ context.name }}/secrets.yml): $TEST_SECRET"

      - name: confirm_success
        run: echo "Test workflow completed successfully."
`;

/**
 * Fetches ensemble's built-in kits into destDir by sparse-checking-out just
 * .ensemble/kits from the ensemble repository into a scratch clone, copying
 * it out, and discarding the clone — so the project gets the kits without
 * vendoring the whole ensemble repository or its git history.
 */
async function fetchKits(destDir: string): Promise<void> {
  const scratchDir = await Deno.makeTempDir({ prefix: "ensemble-init-kits-" });
  try {
    await $`git init -q`.cwd(scratchDir);
    await $`git remote add origin ${ENSEMBLE_REPO_URL}`.cwd(scratchDir);
    await $`git sparse-checkout init --no-cone`.cwd(scratchDir);
    await $`git sparse-checkout set /.ensemble/kits/*`.cwd(scratchDir);
    await $`git pull --depth 1 origin main -q`.cwd(scratchDir);
    await copy(join(scratchDir, ".ensemble", "kits"), destDir);
  } finally {
    await Deno.remove(scratchDir, { recursive: true });
  }
}

/**
 * Scaffolds a new Ensemble project: lays out the source/workflows skeleton
 * a new project needs to use build/pack/workflow, fetches ensemble's
 * built-in kits into .ensemble/kits (via a throwaway sparse checkout, not a
 * vendored clone), adds an example workflows/test workflow (mirroring
 * ensemble's own workflows/demo) with an encrypted secret so
 * context.secrets works out of the box, and generates this project's own
 * X25519 keypair for encrypting context.secrets (see @ensemble/workflow's
 * context-loaders/secrets-crypto.ts) — the private key at
 * .ensemble/secrets.key (gitignored, never leaves this machine except when
 * explicitly supplied while registering this repo with a platform server),
 * the public key at .ensemble/secrets.key.pub (meant to be committed — it
 * can only encrypt, never decrypt).
 */
export async function runInit(options: RunInitOptions): Promise<void> {
  const projectDir = join(Deno.cwd(), options.name);
  if (await exists(projectDir)) {
    throw new Error(`"${projectDir}" already exists.`);
  }
  await ensureDir(projectDir);

  const ensembleDir = join(projectDir, ".ensemble");
  await ensureDir(ensembleDir);
  await Deno.writeTextFile(join(ensembleDir, "config.yaml"), CONFIG_TEMPLATE);
  await fetchKits(join(ensembleDir, "kits"));

  for (const dir of SKELETON_DIRS) {
    await ensureDir(join(projectDir, dir));
  }

  const keypair = await generateKeypair();
  await Deno.writeTextFile(
    join(projectDir, SECRETS_PRIVATE_KEY_PATH),
    keypair.privateKey + "\n",
  );
  await Deno.writeTextFile(
    join(projectDir, SECRETS_PUBLIC_KEY_PATH),
    keypair.publicKey + "\n",
  );

  const testWorkflowDir = join(projectDir, "workflows", "test");
  const testWorkflowContextDir = join(
    testWorkflowDir,
    "contexts",
    "development",
  );
  await ensureDir(testWorkflowContextDir);
  await Deno.writeTextFile(
    join(testWorkflowDir, "workflow.yml"),
    TEST_WORKFLOW_TEMPLATE,
  );
  const encryptedTestSecret = await encryptValue(
    keypair.publicKey,
    "hello from ens init",
  );
  await Deno.writeTextFile(
    join(testWorkflowContextDir, "secrets.yml"),
    stringifyYaml({ TEST_SECRET: encryptedTestSecret }),
  );

  await Deno.writeTextFile(
    join(projectDir, "deno.json"),
    JSON.stringify(
      { workspace: ["source/apps/**", "source/libs/**", ".ensemble/kits/**"] },
      null,
      2,
    ) + "\n",
  );

  await Deno.writeTextFile(join(projectDir, ".gitignore"), GITIGNORE_TEMPLATE);

  await $`git init`.cwd(projectDir);
}
