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
  "source/core",
  "source/ship",
  "source/envs/build",
  "source/envs/pack",
  "source/libs",
  "source/artifacts",
];

const GITIGNORE_TEMPLATE = `.ensemble/kits/**/.bin/
.ensemble/publish.env
node_modules/
`;

const ARTIFACTS_GITIGNORE_TEMPLATE = `*
!.gitignore
!deploy
`;

const README_TEMPLATE = `# %NAME%

An Ensemble project — source code, build/pack/deploy config, and their outputs
each live in their own top-level folder. See \`ens --help\` for the full CLI.

## Workspace structure

- \`source/apps/<name>/\` — one self-contained app per folder. States which build
  kit it uses (\`.ensemble/config.yaml\`), never how that kit builds it.
- \`source/core/\` — shared code that speaks this project's business logic.
- \`source/libs/\` — shared code generic enough to reuse across projects.
- \`source/ship/\` — how apps are packaged for deployment (Dockerfiles, etc.).
- \`source/envs/build/<app>.env\` / \`source/envs/pack/<ship>.env\` — per-app
  default build/pack vars.
- \`source/artifacts/\` — build output (gitignored, except \`deploy/\`).
- \`.ensemble/kits/{build,pack,deploy}/\` — pluggable kits doing the actual work.
- \`.ensemble/config.yaml\` — which kit each app/ship uses (shared, git-tracked).
- \`.ensemble/config.local.yaml\` — personal default vars (gitignored).

## Getting started

\`\`\`sh
ens app create <kit> <name>   # scaffold a new app, e.g. \`ens app create react web\`
ens build <name>              # build it (-w to watch, -m production for prod)
ens pack <ship> <kit>         # package a built app into a deployable artifact
ens deploy <name> <kit>       # bring up a workload from its delivery manifest
ens develop <name>            # deploy the same manifest locally, watching for changes
\`\`\`

## Command reference

| Command | Purpose |
|---|---|
| \`ens app create <kit> <name> [--target <t>]\` | Scaffold \`source/apps/<name>\` from a build kit's template. |
| \`ens build <name> [-m development\\|production] [-w] [-v KEY=VALUE]\` | Build an app through its configured kit. |
| \`ens pack <ship> <kit> [-m <mode>] [-o <name>] [-w] [-v KEY=VALUE]\` | Pack a built app into a deployable artifact. |
| \`ens publish <ship> <kit> <target> [--version <v>] [-v KEY=VALUE]\` | Publish a packed artifact (e.g. push a Docker image). |
| \`ens deploy <name> <kit> [--eject\\|--plan] [--watch] [--version <v>]\` | Apply (or preview) a delivery manifest to a target. |
| \`ens develop <name> [-k <kit>]\` | \`deploy\` sugar for local dev: watches, emulates externals. |
| \`ens config set-build-kit\\|set-build-var\\|set-pack-var ...\` | Associate apps/ships with kits and default vars. |
| \`ens release next\\|set\\|undo\` | Compute/create/undo a semver git tag. |
| \`ens version [update\\|set]\` | Show or change the installed \`ens\` version. |

Run any command with \`--help\` for its full option list.
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
      { workspace: ["source/apps/**", "source/core/**", "source/libs/**", ".ensemble/kits/**"] },
      null,
      2,
    ) + "\n",
  );

  await Deno.writeTextFile(join(projectDir, ".gitignore"), GITIGNORE_TEMPLATE);
  await Deno.writeTextFile(
    join(projectDir, "source/artifacts", ".gitignore"),
    ARTIFACTS_GITIGNORE_TEMPLATE,
  );
  await Deno.writeTextFile(
    join(projectDir, "README.md"),
    README_TEMPLATE.replace("%NAME%", options.name),
  );

  await $`git init`.cwd(projectDir);
}
