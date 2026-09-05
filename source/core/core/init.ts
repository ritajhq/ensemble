import { join } from "@std/path";
import { copy, ensureDir, exists } from "@std/fs";
import { $ } from "@david/dax";

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
source/artifacts/
node_modules/
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
 * Scaffolds a new Ensemble project: lays out the source skeleton a new
 * project needs to use build/pack/deploy, and fetches ensemble's built-in
 * kits into .ensemble/kits (via a throwaway sparse checkout, not a vendored
 * clone).
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
