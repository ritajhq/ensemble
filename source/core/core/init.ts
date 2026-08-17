import { join } from "@std/path";
import { copy, ensureDir, exists } from "@std/fs";
import { $ } from "@david/dax";
import {
  generateKeypair,
  SECRETS_PRIVATE_KEY_PATH,
  SECRETS_PUBLIC_KEY_PATH,
} from "@ensemble/workflow";
import { resolveDenoExecutable } from "./deno-exe.ts";

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
  "workflows",
];

const GITIGNORE_TEMPLATE = `.ensemble/bin/
.ensemble/repository/
.ensemble/kits/**/.bin/
.ensemble/platform/tokens.json
${SECRETS_PRIVATE_KEY_PATH}
source/artifacts/
node_modules/
`;

/**
 * Scaffolds a new Ensemble project: vendors the ens tool itself by cloning
 * its own repository into .ensemble/repository, compiles it into
 * .ensemble/bin, copies its built-in kits, lays out the empty
 * source/workflows skeleton a new project needs to use build/pack/workflow,
 * and generates this project's own X25519 keypair for encrypting
 * context.secrets (see @ensemble/workflow's context-loaders/
 * secrets-crypto.ts) — the private key at .ensemble/secrets.key (gitignored,
 * never leaves this machine except when explicitly supplied while
 * registering this repo with a platform server), the public key at
 * .ensemble/secrets.key.pub (meant to be committed — it can only encrypt,
 * never decrypt).
 */
export async function runInit(options: RunInitOptions): Promise<void> {
  const projectDir = join(Deno.cwd(), options.name);
  if (await exists(projectDir)) {
    throw new Error(`"${projectDir}" already exists.`);
  }
  await ensureDir(projectDir);

  const ensembleDir = join(projectDir, ".ensemble");
  const repositoryDir = join(ensembleDir, "repository");
  await $`git clone ${ENSEMBLE_REPO_URL} ${repositoryDir}`;

  const denoExe = await resolveDenoExecutable();
  await $`${denoExe} task compile`.cwd(repositoryDir);

  const repoBinDir = join(repositoryDir, ".ensemble", "bin");
  const [compiledBinary] = await Array.fromAsync(Deno.readDir(repoBinDir));
  if (!compiledBinary) {
    throw new Error(
      `Expected a compiled ens binary in ${repoBinDir}, found none.`,
    );
  }

  const binDir = join(ensembleDir, "bin");
  await ensureDir(binDir);
  const linkTarget = join(
    "..",
    "repository",
    ".ensemble",
    "bin",
    compiledBinary.name,
  );
  const linkPath = join(binDir, compiledBinary.name);
  try {
    await Deno.symlink(linkTarget, linkPath);
  } catch {
    await copy(join(repoBinDir, compiledBinary.name), linkPath);
  }

  await copy(
    join(repositoryDir, ".ensemble", "kits"),
    join(ensembleDir, "kits"),
  );

  await Deno.writeTextFile(join(ensembleDir, "config.yaml"), CONFIG_TEMPLATE);

  for (const dir of SKELETON_DIRS) {
    await ensureDir(join(projectDir, dir));
  }

  await Deno.writeTextFile(
    join(projectDir, "deno.json"),
    JSON.stringify(
      { workspace: ["source/apps/**", "source/libs/**", ".ensemble/kits/**"] },
      null,
      2,
    ) + "\n",
  );

  await Deno.writeTextFile(join(projectDir, ".gitignore"), GITIGNORE_TEMPLATE);

  const keypair = await generateKeypair();
  await Deno.writeTextFile(
    join(projectDir, SECRETS_PRIVATE_KEY_PATH),
    keypair.privateKey + "\n",
  );
  await Deno.writeTextFile(
    join(projectDir, SECRETS_PUBLIC_KEY_PATH),
    keypair.publicKey + "\n",
  );

  await $`git init`.cwd(projectDir);
}
