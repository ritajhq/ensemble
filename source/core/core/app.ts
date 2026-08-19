import { join } from "@std/path";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { setAppBuildKit } from "./config.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";

const APP_NAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._\-/]*[a-zA-Z0-9])?$/;

export interface RunAppCreateOptions {
  kit: string;
  name: string;
}

/**
 * Scaffolds a new app at source/apps/<name> by running its chosen kit's
 * scaffold.ts (the same CLI contract build/pack kits use, see
 * @ensemble/kit-sdk's getScaffoldKitContext), then registers
 * build.<name>.kit in .ensemble/config.yaml via setAppBuildKit — so the app
 * is immediately buildable with `ens build <name>`.
 */
export async function runAppCreate(options: RunAppCreateOptions): Promise<void> {
  const name = options.name.trim();
  if (!APP_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid app name "${options.name}" — expected letters, digits, ".", "_", "-", or "/", ` +
        `not starting or ending with a separator.`,
    );
  }

  const repoRoot = await findRepoRoot();
  const kitDir = join(repoRoot, ".ensemble", "kits", "build", options.kit);
  const scaffoldEntry = join(kitDir, "scaffold.ts");
  if (!await exists(scaffoldEntry, { isFile: true })) {
    throw new Error(`Build kit "${options.kit}" has no scaffold.ts (expected ${scaffoldEntry})`);
  }

  const sourceDir = join(repoRoot, "source", "apps", name);
  if (await exists(sourceDir)) {
    throw new Error(`"${sourceDir}" already exists.`);
  }

  const denoExe = await resolveDenoExecutable();
  const result = await $`${denoExe} run -A -q ${scaffoldEntry} --dest ${sourceDir} --name ${name}`
    .cwd(kitDir)
    .noThrow();
  if (result.code !== 0) {
    throw new Error(`Scaffolding "${name}" with kit "${options.kit}" failed.`);
  }

  await setAppBuildKit(repoRoot, name, options.kit);
}
